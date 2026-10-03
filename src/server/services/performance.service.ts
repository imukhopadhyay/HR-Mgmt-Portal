import type { GoalStatus, GoalType } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertEmployee, assertPermission, canAccessEmployee } from "@/lib/auth/rbac";
import { dateKeyToDb } from "@/lib/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { notifyEmployees } from "@/lib/notifications";

export async function listCycles() {
  return db.performanceCycle.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { reviews: true } }, reviews: { select: { status: true } } },
  });
}

export async function saveCycle(actor: Actor, input: { id?: string; name: string; startDate: string; endDate: string; selfReviewDue: string; managerReviewDue: string }) {
  assertPermission(actor, "performance:manage");
  if (input.endDate <= input.startDate) throw new ValidationError("End date must be after the start date.", { endDate: ["After start"] });
  if (input.managerReviewDue < input.selfReviewDue) throw new ValidationError("Manager review is due after self review.", { managerReviewDue: ["After self review due"] });
  const data = { name: input.name, startDate: dateKeyToDb(input.startDate), endDate: dateKeyToDb(input.endDate), selfReviewDue: dateKeyToDb(input.selfReviewDue), managerReviewDue: dateKeyToDb(input.managerReviewDue) };
  return db.$transaction(async (tx) => {
    const c = input.id ? await tx.performanceCycle.update({ where: { id: input.id }, data }) : await tx.performanceCycle.create({ data });
    await writeAudit(tx, actor, { action: input.id ? "cycle.update" : "cycle.create", entityType: "PerformanceCycle", entityId: c.id, summary: c.name });
    return c;
  });
}

/** Activate a cycle: create a review for every active employee, reviewed by their manager. */
export async function activateCycle(actor: Actor, cycleId: string) {
  assertPermission(actor, "performance:manage");
  const cycle = await db.performanceCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new NotFoundError("Cycle");
  if (cycle.status !== "DRAFT") throw new ConflictError("Only draft cycles can be activated.");
  const emps = await db.employee.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "ON_NOTICE"] }, dateOfJoining: { lte: cycle.endDate } }, select: { id: true, managerId: true } });
  await db.$transaction(async (tx) => {
    await tx.performanceCycle.update({ where: { id: cycleId }, data: { status: "ACTIVE" } });
    await tx.performanceReview.createMany({ data: emps.map((e) => ({ cycleId, employeeId: e.id, reviewerId: e.managerId })), skipDuplicates: true });
    await writeAudit(tx, actor, { action: "cycle.activate", entityType: "PerformanceCycle", entityId: cycleId, summary: `${cycle.name}: ${emps.length} reviews created` });
  });
  await notifyEmployees(emps.map((e) => e.id), { type: "performance.cycle", title: `Performance cycle started: ${cycle.name}`, body: "Complete your self-assessment from Goals & reviews.", link: "/performance" }, { email: true });
}

export async function closeCycle(actor: Actor, cycleId: string) {
  assertPermission(actor, "performance:manage");
  const res = await db.performanceCycle.updateMany({ where: { id: cycleId, status: "ACTIVE" }, data: { status: "CLOSED" } });
  if (res.count !== 1) throw new ConflictError("Only active cycles can be closed.");
  await db.$transaction((tx) => writeAudit(tx, actor, { action: "cycle.close", entityType: "PerformanceCycle", entityId: cycleId }));
}

export async function myReviews(employeeId: string) {
  return db.performanceReview.findMany({
    where: { employeeId },
    include: { cycle: true, reviewer: { select: { firstName: true, lastName: true } } },
    orderBy: { cycle: { startDate: "desc" } },
  });
}

export async function reviewsToGive(actor: Actor) {
  if (!actor.employeeId) return [];
  return db.performanceReview.findMany({
    where: { reviewerId: actor.employeeId, cycle: { status: "ACTIVE" } },
    include: { cycle: true, employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: { select: { title: true } } } } },
    orderBy: [{ status: "asc" }, { employee: { firstName: "asc" } }],
  });
}

export async function reviewDetail(actor: Actor, id: string) {
  const r = await db.performanceReview.findUnique({
    where: { id },
    include: {
      cycle: true,
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: { select: { title: true } } } },
      reviewer: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!r) throw new NotFoundError("Review");
  const isSelf = r.employeeId === actor.employeeId;
  const isReviewer = !!r.reviewerId && r.reviewerId === actor.employeeId;
  if (!isSelf && !isReviewer && !actor.permissions.has("performance:manage")) throw new ForbiddenError();
  const goals = await db.goal.findMany({ where: { employeeId: r.employeeId, deletedAt: null, OR: [{ cycleId: r.cycleId }, { cycleId: null }] }, orderBy: { createdAt: "asc" } });
  return { review: r, goals, isSelf, isReviewer };
}

export async function submitSelfReview(actor: Actor, input: { id: string; selfRating: number; selfComments: string }) {
  const employeeId = assertEmployee(actor);
  const r = await db.performanceReview.findUnique({ where: { id: input.id }, include: { cycle: true } });
  if (!r || r.employeeId !== employeeId) throw new NotFoundError("Review");
  if (r.cycle.status !== "ACTIVE") throw new ConflictError("This cycle is not active.");
  if (r.status !== "SELF_REVIEW") throw new ConflictError("Your self-assessment has already been submitted.");
  await db.$transaction(async (tx) => {
    await tx.performanceReview.update({ where: { id: r.id }, data: { selfRating: input.selfRating, selfComments: input.selfComments, selfSubmittedAt: new Date(), status: "MANAGER_REVIEW" } });
    await writeAudit(tx, actor, { action: "review.self_submit", entityType: "PerformanceReview", entityId: r.id });
  });
  await notifyEmployees([r.reviewerId], { type: "performance.self_submitted", title: "Self-assessment submitted", body: `${actor.name} submitted their self-assessment for ${r.cycle.name}.`, link: `/performance/reviews/${r.id}` });
}

export async function submitManagerReview(actor: Actor, input: { id: string; managerRating: number; managerComments: string; strengths?: string; improvements?: string; finalRating: number }) {
  const r = await db.performanceReview.findUnique({ where: { id: input.id }, include: { cycle: true } });
  if (!r) throw new NotFoundError("Review");
  const isReviewer = !!actor.employeeId && r.reviewerId === actor.employeeId && actor.permissions.has("performance:review");
  if (!isReviewer && !actor.permissions.has("performance:manage")) throw new ForbiddenError();
  if (r.employeeId === actor.employeeId) throw new ForbiddenError("You cannot review yourself.");
  if (r.cycle.status !== "ACTIVE") throw new ConflictError("This cycle is not active.");
  if (r.status !== "MANAGER_REVIEW") throw new ConflictError(r.status === "SELF_REVIEW" ? "Waiting for the employee's self-assessment." : "This review is already completed.");
  await db.$transaction(async (tx) => {
    await tx.performanceReview.update({
      where: { id: r.id },
      data: { managerRating: input.managerRating, managerComments: input.managerComments, strengths: input.strengths ?? null, improvements: input.improvements ?? null, finalRating: input.finalRating, status: "COMPLETED", completedAt: new Date() },
    });
    await writeAudit(tx, actor, { action: "review.manager_submit", entityType: "PerformanceReview", entityId: r.id, summary: `Final rating ${input.finalRating}` });
  });
  await notifyEmployees([r.employeeId], { type: "performance.completed", title: "Performance review completed", body: `Your ${r.cycle.name} review is complete.`, link: `/performance/reviews/${r.id}` }, { email: true });
}

// ─── Goals & development plans ──────────────────────────────────────────────

async function assertGoalOwnerAccess(actor: Actor, employeeId: string) {
  if (actor.employeeId === employeeId) return;
  if (actor.permissions.has("performance:manage")) return;
  if (actor.permissions.has("performance:review") && (await canAccessEmployee(actor, "employee", employeeId))) return;
  throw new ForbiddenError();
}

export interface GoalInput {
  id?: string;
  employeeId: string;
  cycleId?: string;
  type: GoalType;
  title: string;
  description?: string;
  kpi?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  weight: number;
  progress: number;
  status: GoalStatus;
  dueDate?: string;
}

export async function saveGoal(actor: Actor, input: GoalInput) {
  await assertGoalOwnerAccess(actor, input.employeeId);
  if (input.type === "PERFORMANCE" && input.cycleId) {
    const others = await db.goal.aggregate({ where: { employeeId: input.employeeId, cycleId: input.cycleId, type: "PERFORMANCE", deletedAt: null, id: input.id ? { not: input.id } : undefined, status: { not: "CANCELLED" } }, _sum: { weight: true } });
    if ((others._sum.weight ?? 0) + input.weight > 100) throw new ValidationError("Total weight of goals in a cycle cannot exceed 100%.", { weight: [`Remaining: ${100 - (others._sum.weight ?? 0)}%`] });
  }
  const { id, dueDate, ...rest } = input;
  const data = {
    ...rest,
    cycleId: rest.cycleId ?? null,
    description: rest.description ?? null,
    kpi: rest.kpi ?? null,
    targetValue: rest.targetValue ?? null,
    currentValue: rest.currentValue ?? null,
    unit: rest.unit ?? null,
    dueDate: dueDate ? dateKeyToDb(dueDate) : null,
    status: rest.progress >= 100 && rest.status !== "CANCELLED" ? ("COMPLETED" as const) : rest.status,
  };
  const g = await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.goal.findFirst({ where: { id, deletedAt: null } });
      if (!before || before.employeeId !== input.employeeId) throw new NotFoundError("Goal");
    }
    const g = id ? await tx.goal.update({ where: { id }, data }) : await tx.goal.create({ data: { ...data, createdById: actor.id } });
    await writeAudit(tx, actor, { action: id ? "goal.update" : "goal.create", entityType: "Goal", entityId: g.id, summary: `${g.title} (${g.progress}%)` });
    return g;
  });
  if (input.employeeId !== actor.employeeId && !id) {
    await notifyEmployees([input.employeeId], { type: "goal.assigned", title: "New goal assigned", body: input.title, link: "/performance" });
  }
  return g;
}

export async function deleteGoal(actor: Actor, id: string) {
  const g = await db.goal.findFirst({ where: { id, deletedAt: null } });
  if (!g) throw new NotFoundError("Goal");
  await assertGoalOwnerAccess(actor, g.employeeId);
  await db.$transaction(async (tx) => {
    await tx.goal.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit(tx, actor, { action: "goal.delete", entityType: "Goal", entityId: id, summary: g.title });
  });
}

export async function goalsFor(actor: Actor, employeeId: string) {
  await assertGoalOwnerAccess(actor, employeeId);
  return db.goal.findMany({ where: { employeeId, deletedAt: null }, include: { cycle: { select: { name: true } } }, orderBy: [{ type: "asc" }, { createdAt: "desc" }] });
}
