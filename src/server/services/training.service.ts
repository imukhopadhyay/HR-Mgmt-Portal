import type { EnrollmentStatus, Prisma, TrainingMode, TrainingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertEmployee, assertPermission } from "@/lib/auth/rbac";
import { dateKeyToDb, todayKey } from "@/lib/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { notifyEmployees } from "@/lib/notifications";

export async function listTrainings(filters: { status?: TrainingStatus; q?: string } = {}) {
  return db.training.findMany({
    where: { deletedAt: null, ...(filters.status ? { status: filters.status } : {}), ...(filters.q ? { title: { contains: filters.q, mode: "insensitive" } } : {}) },
    include: { enrollments: { select: { status: true, feedbackRating: true, employeeId: true } } },
    orderBy: { startDate: "desc" },
  });
}

export interface TrainingInput {
  id?: string;
  title: string;
  description?: string;
  category: string;
  trainer?: string;
  mode: TrainingMode;
  location?: string;
  startDate: string;
  endDate: string;
  capacity?: number;
  providesCertification: boolean;
  skill?: string;
  status: TrainingStatus;
}

export async function saveTraining(actor: Actor, input: TrainingInput) {
  assertPermission(actor, "training:manage");
  if (input.endDate < input.startDate) throw new ValidationError("End date must be on or after the start date.", { endDate: ["After start"] });
  const { id, startDate, endDate, ...rest } = input;
  const data = { ...rest, description: rest.description ?? null, trainer: rest.trainer ?? null, location: rest.location ?? null, capacity: rest.capacity ?? null, skill: rest.skill ?? null, startDate: dateKeyToDb(startDate), endDate: dateKeyToDb(endDate) };
  return db.$transaction(async (tx) => {
    const t = id ? await tx.training.update({ where: { id }, data }) : await tx.training.create({ data });
    await writeAudit(tx, actor, { action: id ? "training.update" : "training.create", entityType: "Training", entityId: t.id, summary: t.title });
    return t;
  });
}

async function capacityCheck(tx: Prisma.TransactionClient, trainingId: string, adding: number) {
  const t = await tx.training.findFirst({ where: { id: trainingId, deletedAt: null } });
  if (!t) throw new NotFoundError("Training");
  if (["COMPLETED", "CANCELLED"].includes(t.status)) throw new ConflictError("This programme is closed for enrolment.");
  if (t.capacity) {
    const n = await tx.trainingEnrollment.count({ where: { trainingId, status: { not: "CANCELLED" } } });
    if (n + adding > t.capacity) throw new ConflictError(`Only ${Math.max(0, t.capacity - n)} seat(s) left.`);
  }
  return t;
}

export async function selfEnroll(actor: Actor, trainingId: string) {
  const employeeId = assertEmployee(actor);
  await db.$transaction(async (tx) => {
    const t = await capacityCheck(tx, trainingId, 1);
    if (t.status !== "PLANNED") throw new ConflictError("Self-enrolment is open only for planned programmes.");
    const existing = await tx.trainingEnrollment.findUnique({ where: { trainingId_employeeId: { trainingId, employeeId } } });
    if (existing && existing.status !== "CANCELLED") throw new ConflictError("You are already enrolled.");
    if (existing) await tx.trainingEnrollment.update({ where: { id: existing.id }, data: { status: "ENROLLED" } });
    else await tx.trainingEnrollment.create({ data: { trainingId, employeeId } });
    await writeAudit(tx, actor, { action: "training.enroll", entityType: "Training", entityId: trainingId, summary: "Self-enrolled" });
  }, { isolationLevel: "Serializable" });
}

export async function cancelEnrollment(actor: Actor, enrollmentId: string) {
  const e = await db.trainingEnrollment.findUnique({ where: { id: enrollmentId } });
  if (!e) throw new NotFoundError("Enrolment");
  if (e.employeeId !== actor.employeeId && !actor.permissions.has("training:manage")) throw new ForbiddenError();
  if (e.status !== "ENROLLED") throw new ConflictError("Only active enrolments can be cancelled.");
  await db.$transaction(async (tx) => {
    await tx.trainingEnrollment.update({ where: { id: enrollmentId }, data: { status: "CANCELLED" } });
    await writeAudit(tx, actor, { action: "training.unenroll", entityType: "TrainingEnrollment", entityId: enrollmentId });
  });
}

export async function enrollEmployees(actor: Actor, trainingId: string, employeeIds: string[]) {
  assertPermission(actor, "training:manage");
  const ids = [...new Set(employeeIds)];
  const added = await db.$transaction(async (tx) => {
    const existing = await tx.trainingEnrollment.findMany({ where: { trainingId, employeeId: { in: ids } } });
    const fresh = ids.filter((id) => !existing.some((e) => e.employeeId === id && e.status !== "CANCELLED"));
    const t = await capacityCheck(tx, trainingId, fresh.length);
    for (const id of fresh) {
      await tx.trainingEnrollment.upsert({ where: { trainingId_employeeId: { trainingId, employeeId: id } }, update: { status: "ENROLLED" }, create: { trainingId, employeeId: id } });
    }
    await writeAudit(tx, actor, { action: "training.enroll_bulk", entityType: "Training", entityId: trainingId, summary: `${fresh.length} enrolled in ${t.title}` });
    return { fresh, title: t.title };
  }, { isolationLevel: "Serializable" });
  await notifyEmployees(added.fresh, { type: "training.enrolled", title: "You have been enrolled in a training", body: added.title, link: "/training" }, { email: true });
  return { added: added.fresh.length };
}

/** Record attendance/completion. Completion of a certifying programme issues a certificate and records the skill. */
export async function recordCompletion(actor: Actor, input: { enrollmentId: string; status: EnrollmentStatus; attendancePercent?: number; score?: number }) {
  assertPermission(actor, "training:manage");
  const e = await db.trainingEnrollment.findUnique({ where: { id: input.enrollmentId }, include: { training: true } });
  if (!e) throw new NotFoundError("Enrolment");
  await db.$transaction(async (tx) => {
    const completed = input.status === "COMPLETED";
    await tx.trainingEnrollment.update({
      where: { id: e.id },
      data: {
        status: input.status,
        attendancePercent: input.attendancePercent ?? null,
        score: input.score ?? null,
        completedAt: completed ? (e.completedAt ?? new Date()) : null,
        certificateIssuedAt: completed && e.training.providesCertification ? (e.certificateIssuedAt ?? new Date()) : null,
      },
    });
    if (completed && e.training.skill) {
      await tx.employeeSkill.upsert({
        where: { employeeId_name: { employeeId: e.employeeId, name: e.training.skill } },
        update: { certifiedAt: e.training.providesCertification ? new Date() : undefined, source: `TRAINING:${e.trainingId}` },
        create: { employeeId: e.employeeId, name: e.training.skill, level: 2, certifiedAt: e.training.providesCertification ? new Date() : null, source: `TRAINING:${e.trainingId}` },
      });
    }
    await writeAudit(tx, actor, { action: "training.completion", entityType: "TrainingEnrollment", entityId: e.id, summary: `${input.status}${input.score !== undefined ? ` score ${input.score}` : ""}` });
  });
}

export async function submitTrainingFeedback(actor: Actor, input: { enrollmentId: string; rating: number; feedback?: string }) {
  const e = await db.trainingEnrollment.findUnique({ where: { id: input.enrollmentId } });
  if (!e || e.employeeId !== actor.employeeId) throw new NotFoundError("Enrolment");
  if (!["ATTENDED", "COMPLETED"].includes(e.status)) throw new ConflictError("Feedback can be given after attending the programme.");
  await db.trainingEnrollment.update({ where: { id: e.id }, data: { feedbackRating: input.rating, feedback: input.feedback ?? null } });
}

export async function trainingDetail(id: string) {
  const t = await db.training.findFirst({
    where: { id, deletedAt: null },
    include: { enrollments: { include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } } },
  });
  if (!t) throw new NotFoundError("Training");
  return t;
}

export async function myLearning(employeeId: string) {
  const [enrollments, skills] = await Promise.all([
    db.trainingEnrollment.findMany({ where: { employeeId }, include: { training: true }, orderBy: { training: { startDate: "desc" } } }),
    db.employeeSkill.findMany({ where: { employeeId }, orderBy: { name: "asc" } }),
  ]);
  return { enrollments, skills };
}

export async function saveSkill(actor: Actor, input: { name: string; level: number }) {
  const employeeId = assertEmployee(actor);
  await db.employeeSkill.upsert({ where: { employeeId_name: { employeeId, name: input.name } }, update: { level: input.level }, create: { employeeId, name: input.name, level: input.level, source: "SELF" } });
}

export async function deleteSkill(actor: Actor, id: string) {
  const s = await db.employeeSkill.findUnique({ where: { id } });
  if (!s || s.employeeId !== actor.employeeId) throw new NotFoundError("Skill");
  if (s.source?.startsWith("TRAINING:") && s.certifiedAt) throw new ConflictError("Certified skills cannot be removed.");
  await db.employeeSkill.delete({ where: { id } });
}

/** Effectiveness metrics per programme. */
export async function trainingReport() {
  const ts = await listTrainings();
  return ts.map((t) => {
    const active = t.enrollments.filter((e) => e.status !== "CANCELLED");
    const completed = active.filter((e) => e.status === "COMPLETED").length;
    const noShow = active.filter((e) => e.status === "NO_SHOW").length;
    const ratings = active.map((e) => e.feedbackRating).filter((r): r is number => r !== null);
    return {
      id: t.id,
      title: t.title,
      category: t.category,
      status: t.status,
      startDate: t.startDate,
      enrolled: active.length,
      completed,
      noShow,
      completionRate: active.length ? Math.round((completed / active.length) * 100) : null,
      avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    };
  });
}

export function isUpcoming(t: { startDate: Date }) {
  return t.startDate >= dateKeyToDb(todayKey());
}
