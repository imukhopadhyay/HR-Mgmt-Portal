import type { DocumentCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { canAccessEmployee } from "@/lib/auth/rbac";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { deleteObject, readObject, storeObject } from "@/lib/storage";
import { IMAGE_TYPES, validateUpload, type AllowedMime } from "@/lib/storage/validation";
import { notifyEmployees } from "@/lib/notifications";

/** Who may manage (upload for / verify / delete) an employee's documents. */
async function canManageFor(actor: Actor, employeeId: string) {
  return actor.permissions.has("document:manage") && (await canAccessEmployee(actor, "employee", employeeId));
}

/** Who may view an employee's documents. Confidential docs: owner + document managers only. */
async function canView(actor: Actor, doc: { employeeId: string | null; candidateId: string | null; isConfidential: boolean }) {
  if (doc.candidateId) return actor.permissions.has("recruitment:manage") || actor.permissions.has("recruitment:read");
  if (!doc.employeeId) return false;
  if (actor.employeeId === doc.employeeId) return true;
  if (await canManageFor(actor, doc.employeeId)) return true;
  if (doc.isConfidential) return false;
  return actor.permissions.has("employee:read:all");
}

export async function uploadDocument(
  actor: Actor,
  input: { employeeId?: string; candidateId?: string; category: DocumentCategory; isConfidential: boolean; file: File; allowed?: readonly AllowedMime[] },
) {
  if (input.employeeId) {
    const self = actor.employeeId === input.employeeId;
    if (!self && !(await canManageFor(actor, input.employeeId))) throw new ForbiddenError();
    if (self && ["PAYSLIP", "OFFER_LETTER", "CONTRACT"].includes(input.category) && !actor.permissions.has("document:manage")) {
      throw new ForbiddenError("Only HR can upload this document type.");
    }
  } else if (input.candidateId) {
    if (!actor.permissions.has("recruitment:manage")) throw new ForbiddenError();
  } else throw new ValidationError("A document must belong to an employee or a candidate.");

  const buf = Buffer.from(await input.file.arrayBuffer());
  const check = validateUpload({ name: input.file.name, size: buf.length }, buf.subarray(0, 16), input.allowed);
  if (!check.ok) throw new ValidationError(check.error, { file: [check.error] });
  const stored = await storeObject(input.employeeId ? `employees/${input.employeeId}` : `candidates/${input.candidateId}`, buf, check.mime);
  try {
    return await db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          employeeId: input.employeeId ?? null,
          candidateId: input.candidateId ?? null,
          category: input.category,
          name: check.filename,
          storageKey: stored.key,
          mimeType: check.mime,
          sizeBytes: stored.sizeBytes,
          checksumSha256: stored.checksumSha256,
          isConfidential: input.isConfidential,
          uploadedById: actor.id,
          verificationStatus: actor.permissions.has("document:manage") && actor.employeeId !== input.employeeId ? "VERIFIED" : "PENDING",
          verifiedById: actor.permissions.has("document:manage") && actor.employeeId !== input.employeeId ? actor.id : null,
          verifiedAt: actor.permissions.has("document:manage") && actor.employeeId !== input.employeeId ? new Date() : null,
        },
      });
      await writeAudit(tx, actor, { action: "document.upload", entityType: "Document", entityId: doc.id, summary: `${input.category}: ${check.filename}`, after: { employeeId: input.employeeId, candidateId: input.candidateId, category: input.category, sizeBytes: stored.sizeBytes } });
      return doc;
    });
  } catch (err) {
    await deleteObject(stored.key).catch(() => undefined);
    throw err;
  }
}

export async function uploadProfilePhoto(actor: Actor, employeeId: string, file: File) {
  if (actor.employeeId !== employeeId && !actor.permissions.has("employee:update")) throw new ForbiddenError();
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 2 * 1024 * 1024) throw new ValidationError("Photo must be 2 MB or smaller.", { file: ["Max 2 MB"] });
  const check = validateUpload({ name: file.name, size: buf.length }, buf.subarray(0, 16), IMAGE_TYPES);
  if (!check.ok) throw new ValidationError(check.error, { file: [check.error] });
  const stored = await storeObject(`photos/${employeeId}`, buf, check.mime);
  const before = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { photoKey: true } });
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employeeId }, data: { photoKey: stored.key } });
    await writeAudit(tx, actor, { action: "employee.photo_update", entityType: "Employee", entityId: employeeId });
  });
  if (before.photoKey) await deleteObject(before.photoKey).catch(() => undefined);
}

export async function readProfilePhoto(actor: Actor, employeeId: string) {
  if (!actor.permissions.has("directory:read") && actor.employeeId !== employeeId) throw new ForbiddenError();
  const e = await db.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { photoKey: true } });
  if (!e?.photoKey) throw new NotFoundError("Photo");
  return readObject(e.photoKey);
}

export async function listEmployeeDocuments(actor: Actor, employeeId: string) {
  const docs = await db.document.findMany({ where: { employeeId, deletedAt: null }, orderBy: { createdAt: "desc" } });
  const out = [];
  for (const d of docs) if (await canView(actor, d)) out.push(d);
  return out;
}

export async function getDocumentForDownload(actor: Actor, id: string) {
  const doc = await db.document.findFirst({ where: { id, deletedAt: null } });
  if (!doc) throw new NotFoundError("Document");
  if (!(await canView(actor, doc))) throw new ForbiddenError();
  const body = await readObject(doc.storageKey);
  await db.$transaction((tx) => writeAudit(tx, actor, { action: "document.download", entityType: "Document", entityId: doc.id, summary: doc.name }));
  return { doc, body };
}

export async function verifyDocument(actor: Actor, id: string, status: "VERIFIED" | "REJECTED", note?: string) {
  const doc = await db.document.findFirst({ where: { id, deletedAt: null } });
  if (!doc || !doc.employeeId) throw new NotFoundError("Document");
  if (!(await canManageFor(actor, doc.employeeId)) || actor.employeeId === doc.employeeId) throw new ForbiddenError();
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { verificationStatus: status, verifiedById: actor.id, verifiedAt: new Date(), verificationNote: note ?? null } });
    await writeAudit(tx, actor, { action: `document.${status.toLowerCase()}`, entityType: "Document", entityId: id, summary: `${doc.name}${note ? `: ${note}` : ""}` });
  });
  await notifyEmployees([doc.employeeId], { type: "document.verified", title: `Document ${status.toLowerCase()}`, body: `${doc.name} was ${status.toLowerCase()}${note ? `: ${note}` : "."}`, link: "/profile?tab=documents" });
}

export async function deleteDocument(actor: Actor, id: string) {
  const doc = await db.document.findFirst({ where: { id, deletedAt: null } });
  if (!doc) throw new NotFoundError("Document");
  const own = doc.employeeId === actor.employeeId && doc.uploadedById === actor.id && doc.verificationStatus !== "VERIFIED";
  const manager = doc.employeeId ? await canManageFor(actor, doc.employeeId) : actor.permissions.has("recruitment:manage");
  if (!own && !manager) throw new ForbiddenError();
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit(tx, actor, { action: "document.delete", entityType: "Document", entityId: id, summary: doc.name });
  });
}

/** HR document queue: pending verifications in scope. */
export async function pendingVerifications(actor: Actor) {
  if (!actor.permissions.has("document:manage")) throw new ForbiddenError();
  return db.document.findMany({
    where: { deletedAt: null, verificationStatus: "PENDING", employeeId: { not: null } },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}
