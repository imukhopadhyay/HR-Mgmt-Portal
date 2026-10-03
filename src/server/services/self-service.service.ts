import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertEmployee, assertPermission } from "@/lib/auth/rbac";
import { dateKeyToDb, todayKey } from "@/lib/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { notifyEmployees, notifyUsers, usersWithPermission } from "@/lib/notifications";

const PROFILE_FIELDS = ["phone", "personalEmail", "addressLine1", "addressLine2", "city", "state", "postalCode"] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

export async function submitProfileUpdate(actor: Actor, input: Partial<Record<ProfileField, string>> & { reason?: string }) {
  const employeeId = assertEmployee(actor);
  const pending = await db.profileUpdateRequest.count({ where: { employeeId, status: "PENDING" } });
  if (pending) throw new ConflictError("You already have a pending profile update request.");
  const current = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
  const changes: Record<string, { from: string | null; to: string | null }> = {};
  for (const f of PROFILE_FIELDS) {
    if (input[f] !== undefined && input[f] !== (current[f] ?? undefined)) changes[f] = { from: current[f] ?? null, to: input[f] ?? null };
  }
  if (!Object.keys(changes).length) throw new ValidationError("No changes detected.");
  const req = await db.$transaction(async (tx) => {
    const r = await tx.profileUpdateRequest.create({ data: { employeeId, changes: { fields: changes, reason: input.reason ?? null } as Prisma.InputJsonValue } });
    await writeAudit(tx, actor, { action: "profile_update.submit", entityType: "ProfileUpdateRequest", entityId: r.id, summary: `Fields: ${Object.keys(changes).join(", ")}` });
    return r;
  });
  await notifyUsers(await usersWithPermission("request:manage"), { type: "profile_update.submitted", title: "Profile update request", body: `${actor.name} requested changes to ${Object.keys(changes).join(", ")}.`, link: "/approvals?tab=profile" });
  return req;
}

export async function reviewProfileUpdate(actor: Actor, input: { id: string; approve: boolean; comment?: string }) {
  assertPermission(actor, "request:manage");
  const req = await db.profileUpdateRequest.findUnique({ where: { id: input.id } });
  if (!req) throw new NotFoundError("Request");
  if (req.status !== "PENDING") throw new ConflictError("This request has already been processed.");
  if (req.employeeId === actor.employeeId) throw new ForbiddenError("You cannot approve your own request.");
  if (!input.approve && !input.comment) throw new ValidationError("Provide a reason for rejection.", { comment: ["Required when rejecting"] });
  const { fields } = req.changes as { fields: Record<string, { from: string | null; to: string | null }> };
  await db.$transaction(async (tx) => {
    // Optimistic concurrency: only transition from PENDING.
    const updated = await tx.profileUpdateRequest.updateMany({
      where: { id: req.id, status: "PENDING" },
      data: { status: input.approve ? "APPROVED" : "REJECTED", reviewerId: actor.employeeId, reviewedAt: new Date(), reviewComment: input.comment ?? null },
    });
    if (updated.count !== 1) throw new ConflictError("This request has already been processed.");
    if (input.approve) {
      const data: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(fields)) if ((PROFILE_FIELDS as readonly string[]).includes(k)) data[k] = v.to;
      await tx.employee.update({ where: { id: req.employeeId }, data });
      await tx.employmentHistory.create({ data: { employeeId: req.employeeId, changeType: "PROFILE_UPDATE", effectiveDate: dateKeyToDb(todayKey()), details: { fields: Object.keys(fields) }, createdById: actor.id } });
    }
    await writeAudit(tx, actor, { action: input.approve ? "profile_update.approve" : "profile_update.reject", entityType: "Employee", entityId: req.employeeId, summary: `Profile update ${input.approve ? "approved" : "rejected"}` });
  });
  await notifyEmployees([req.employeeId], { type: "profile_update.reviewed", title: `Profile update ${input.approve ? "approved" : "rejected"}`, body: input.comment ?? (input.approve ? "Your profile has been updated." : "Your request was rejected."), link: "/profile" }, { email: true });
}

export async function pendingProfileUpdates(actor: Actor) {
  assertPermission(actor, "request:manage");
  return db.profileUpdateRequest.findMany({
    where: { status: "PENDING" },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createTicket(actor: Actor, input: { category: string; subject: string; description: string; priority: "LOW" | "MEDIUM" | "HIGH" }) {
  const requesterId = assertEmployee(actor);
  const t = await db.$transaction(async (tx) => {
    const t = await tx.supportTicket.create({ data: { ...input, requesterId } });
    await writeAudit(tx, actor, { action: "ticket.create", entityType: "SupportTicket", entityId: t.id, summary: input.subject });
    return t;
  });
  await notifyUsers(await usersWithPermission("request:manage"), { type: "ticket.created", title: `New HR request: ${input.category}`, body: input.subject, link: `/help-desk?ticket=${t.id}` });
  return t;
}

export async function updateTicket(actor: Actor, input: { id: string; status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"; assigneeId?: string; resolution?: string }) {
  const t = await db.supportTicket.findUnique({ where: { id: input.id } });
  if (!t) throw new NotFoundError("Ticket");
  const isRequester = t.requesterId === actor.employeeId;
  const isAgent = actor.permissions.has("request:manage");
  // Requesters may only close or re-open their own ticket.
  if (!isAgent && !(isRequester && (input.status === "CLOSED" || input.status === "OPEN"))) throw new ForbiddenError();
  if (isAgent && input.status === "RESOLVED" && !input.resolution && !t.resolution) {
    throw new ValidationError("Add a resolution note before resolving.", { resolution: ["Required to resolve"] });
  }
  await db.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id: t.id },
      data: {
        status: input.status,
        ...(isAgent ? { assigneeId: input.assigneeId ?? t.assigneeId, resolution: input.resolution ?? t.resolution } : {}),
        resolvedAt: input.status === "RESOLVED" ? new Date() : input.status === "OPEN" ? null : t.resolvedAt,
      },
    });
    await writeAudit(tx, actor, { action: "ticket.update", entityType: "SupportTicket", entityId: t.id, summary: `${t.status} → ${input.status}` });
  });
  if (!isRequester) {
    await notifyEmployees([t.requesterId], { type: "ticket.updated", title: `HR request ${input.status.replace("_", " ").toLowerCase()}`, body: t.subject, link: `/help-desk?ticket=${t.id}` }, { email: input.status === "RESOLVED" });
  }
}

export async function listTickets(actor: Actor, opts: { scope: "mine" | "all"; status?: string }) {
  if (opts.scope === "all") assertPermission(actor, "request:manage");
  const where: Prisma.SupportTicketWhereInput = {
    ...(opts.scope === "mine" ? { requesterId: actor.employeeId ?? "__none__" } : {}),
    ...(opts.status ? { status: opts.status as Prisma.EnumTicketStatusFilter["equals"] } : {}),
  };
  return db.supportTicket.findMany({
    where,
    include: { requester: { select: { id: true, firstName: true, lastName: true, employeeCode: true } }, assignee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
}
