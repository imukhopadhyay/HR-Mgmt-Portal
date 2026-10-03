import type { Prisma, LeaveRequest, LeaveStatus } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import {
  assertEmployee,
  assertPermission,
  canAccessEmployee,
  employeeScopeWhere,
} from "@/lib/auth/rbac";
import { addDaysKey, dateKeyToDb, dbDateToKey, todayKey } from "@/lib/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { availableBalance, countLeaveDays, validateLeaveApplication } from "@/lib/leave-rules";
import { notifyEmployees, notifyUsers, usersWithPermission } from "@/lib/notifications";
import { toNumber } from "@/lib/utils";
import { computeEntitlement, ensureLeaveBalances } from "./leave-entitlement";

const OPEN_STATUSES: LeaveStatus[] = ["PENDING", "APPROVED", "MODIFICATION_REQUESTED"];

export interface LeaveInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay?: "FIRST_HALF" | "SECOND_HALF";
  reason: string;
}

async function weeklyOffsFor(tx: Tx, employeeId: string): Promise<number[]> {
  const e = await tx.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { shift: { select: { weeklyOffs: true, deletedAt: true } } },
  });
  if (e.shift && !e.shift.deletedAt) return e.shift.weeklyOffs;
  const def = await tx.shift.findFirst({
    where: { isDefault: true, deletedAt: null },
    select: { weeklyOffs: true },
  });
  return def?.weeklyOffs ?? [0, 6];
}

async function holidaySet(tx: Tx, start: string, end: string) {
  const hs = await tx.holiday.findMany({
    where: { date: { gte: dateKeyToDb(start), lte: dateKeyToDb(end) }, type: "PUBLIC" },
    select: { date: true },
  });
  return new Set(hs.map((h) => dbDateToKey(h.date)));
}

export async function previewLeaveDays(
  employeeId: string,
  startKey: string,
  endKey: string,
  halfDay: boolean,
) {
  if (endKey < startKey) return 0;
  const [offs, hols] = await Promise.all([
    weeklyOffsFor(db, employeeId),
    holidaySet(db, startKey, endKey),
  ]);
  return countLeaveDays(startKey, endKey, halfDay, offs, hols);
}

async function getBalance(tx: Tx, employeeId: string, leaveTypeId: string, year: number) {
  await ensureLeaveBalances(tx, employeeId, year, todayKey());
  return tx.leaveBalance.findUniqueOrThrow({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  });
}

function balanceNumbers(b: {
  entitled: Prisma.Decimal;
  carriedForward: Prisma.Decimal;
  adjusted: Prisma.Decimal;
  used: Prisma.Decimal;
  pending: Prisma.Decimal;
}) {
  return {
    entitled: toNumber(b.entitled),
    carriedForward: toNumber(b.carriedForward),
    adjusted: toNumber(b.adjusted),
    used: toNumber(b.used),
    pending: toNumber(b.pending),
  };
}

/** Validate dates/policy/balance/overlap and compute chargeable days (within a transaction). */
async function prepare(
  tx: Tx,
  employeeId: string,
  input: LeaveInput,
  opts: { excludeRequestId?: string; currentReservation?: number; isAdminEntry?: boolean },
) {
  // Serialise all leave applications/modifications for this employee so overlap
  // and balance checks cannot race (READ COMMITTED + row lock).
  await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${employeeId} FOR UPDATE`;
  const type = await tx.leaveType.findFirst({ where: { id: input.leaveTypeId, isActive: true } });
  if (!type)
    throw new ValidationError("Select a valid leave type.", {
      leaveTypeId: ["Invalid leave type"],
    });
  const emp = await tx.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { status: true, dateOfJoining: true, exitDate: true },
  });
  if (emp.status === "EXITED") throw new ForbiddenError("Exited employees cannot apply for leave.");
  if (input.startDate < dbDateToKey(emp.dateOfJoining))
    throw new ValidationError("Leave cannot start before the joining date.", {
      startDate: ["Before joining date"],
    });
  if (emp.exitDate && input.endDate > dbDateToKey(emp.exitDate))
    throw new ValidationError("Leave cannot extend past the last working day.", {
      endDate: ["After exit date"],
    });
  const [offs, hols] = await Promise.all([
    weeklyOffsFor(tx, employeeId),
    holidaySet(tx, input.startDate, input.endDate),
  ]);
  const days = countLeaveDays(input.startDate, input.endDate, !!input.halfDay, offs, hols);
  const year = Number(input.startDate.slice(0, 4));
  const bal = await getBalance(tx, employeeId, type.id, year);
  const available = availableBalance(balanceNumbers(bal)) + (opts.currentReservation ?? 0);
  const errors = validateLeaveApplication({
    startKey: input.startDate,
    endKey: input.endDate,
    halfDay: !!input.halfDay,
    todayKey: todayKey(),
    days,
    available,
    isAdminEntry: opts.isAdminEntry,
    policy: {
      allowHalfDay: type.allowHalfDay,
      maxConsecutiveDays: type.maxConsecutiveDays,
      minNoticeDays: type.minNoticeDays,
      allowNegativeBalance: type.allowNegativeBalance,
    },
  });
  if (Object.keys(errors).length) {
    throw new ValidationError(
      Object.values(errors)[0],
      Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])),
    );
  }
  const overlap = await tx.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { in: OPEN_STATUSES },
      id: opts.excludeRequestId ? { not: opts.excludeRequestId } : undefined,
      startDate: { lte: dateKeyToDb(input.endDate) },
      endDate: { gte: dateKeyToDb(input.startDate) },
    },
  });
  if (overlap) {
    const bothHalf =
      overlap.halfDay &&
      input.halfDay &&
      overlap.halfDay !== input.halfDay &&
      dbDateToKey(overlap.startDate) === input.startDate;
    if (!bothHalf)
      throw new ConflictError(
        `Overlaps an existing ${overlap.status.toLowerCase().replace("_", " ")} request (${dbDateToKey(overlap.startDate)} – ${dbDateToKey(overlap.endDate)}).`,
      );
  }
  return { type, days, year };
}

/** Level-1 approver is the reporting manager; requests without one go straight to HR. */
async function notifyApprovers(
  req: Pick<LeaveRequest, "id" | "employeeId" | "currentLevel">,
  applicantName: string,
  typeName: string,
  range: string,
) {
  const emp = await db.employee.findUniqueOrThrow({
    where: { id: req.employeeId },
    select: { managerId: true },
  });
  const n = {
    type: "leave.submitted",
    title: "Leave request awaiting approval",
    body: `${applicantName} applied for ${typeName} (${range}).`,
    link: "/approvals?tab=leave",
  };
  if (req.currentLevel === 1 && emp.managerId)
    await notifyEmployees([emp.managerId], n, { email: true });
  else
    await notifyUsers((await usersWithPermission("leave:read:all")).filter(Boolean), n, {
      email: true,
    });
}

export async function applyLeave(actor: Actor, input: LeaveInput) {
  const employeeId = assertEmployee(actor);
  const req = await db.$transaction(async (tx) => {
    const { type, days, year } = await prepare(tx, employeeId, input, {});
    const req = await tx.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: type.id,
        startDate: dateKeyToDb(input.startDate),
        endDate: dateKeyToDb(input.endDate),
        halfDay: input.halfDay ?? null,
        days,
        reason: input.reason,
        requiredLevels: Math.max(1, type.approvalLevels),
      },
    });
    await tx.leaveBalance.update({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: type.id, year } },
      data: { pending: { increment: days } },
    });
    await writeAudit(tx, actor, {
      action: "leave.apply",
      entityType: "LeaveRequest",
      entityId: req.id,
      summary: `${type.code} ${input.startDate}→${input.endDate} (${days}d)`,
    });
    return { req, typeName: type.name };
  });
  await notifyApprovers(
    req.req,
    actor.name,
    req.typeName,
    `${input.startDate} to ${input.endDate}`,
  );
  return req.req;
}

/** Can this actor act on the request at its current level? */
export async function canDecide(
  actor: Actor,
  req: Pick<LeaveRequest, "employeeId" | "currentLevel" | "status">,
): Promise<boolean> {
  if (!actor.permissions.has("leave:approve")) return false;
  if (req.employeeId === actor.employeeId) return false;
  if (req.status !== "PENDING") return false;
  const isHr = actor.permissions.has("leave:read:all");
  if (req.currentLevel >= 2) return isHr;
  if (isHr) return true;
  const emp = await db.employee.findUnique({
    where: { id: req.employeeId },
    select: { managerId: true },
  });
  if (emp?.managerId && emp.managerId === actor.employeeId) return true;
  // Department heads may act for their department.
  return (
    actor.permissions.has("leave:read:department") &&
    (await canAccessEmployee(actor, "leave", req.employeeId))
  );
}

export type LeaveDecision = "APPROVE" | "REJECT" | "REQUEST_MODIFICATION";

export async function decideLeave(
  actor: Actor,
  input: { id: string; decision: LeaveDecision; comment?: string },
) {
  if (!actor.employeeId) throw new ForbiddenError("Approvers must have an employee profile.");
  const req = await db.leaveRequest.findUnique({
    where: { id: input.id },
    include: { leaveType: true, employee: { select: { firstName: true, lastName: true } } },
  });
  if (!req) throw new NotFoundError("Leave request");
  if (req.employeeId === actor.employeeId)
    throw new ForbiddenError("You cannot act on your own leave request.");
  if (!(await canDecide(actor, req)))
    throw new ForbiddenError("You are not the approver for this request at its current stage.");
  if (input.decision !== "APPROVE" && !input.comment)
    throw new ValidationError("A comment is required.", { comment: ["Required"] });
  const year = req.startDate.getUTCFullYear();
  const result = await db.$transaction(async (tx) => {
    // Guard against concurrent decisions: transition only from the expected state.
    const claim = await tx.leaveRequest.updateMany({
      where: { id: req.id, status: "PENDING", currentLevel: req.currentLevel },
      data: { updatedAt: new Date() },
    });
    if (claim.count !== 1)
      throw new ConflictError("This request was updated by someone else. Refresh and try again.");
    await tx.leaveApproval.create({
      data: {
        leaveRequestId: req.id,
        level: req.currentLevel,
        approverId: actor.employeeId!,
        action:
          input.decision === "APPROVE"
            ? "APPROVED"
            : input.decision === "REJECT"
              ? "REJECTED"
              : "MODIFICATION_REQUESTED",
        comment: input.comment ?? null,
      },
    });
    const balWhere = {
      employeeId_leaveTypeId_year: {
        employeeId: req.employeeId,
        leaveTypeId: req.leaveTypeId,
        year,
      },
    };
    let outcome: "ESCALATED" | LeaveStatus;
    if (input.decision === "APPROVE" && req.currentLevel < req.requiredLevels) {
      await tx.leaveRequest.update({
        where: { id: req.id },
        data: { currentLevel: req.currentLevel + 1 },
      });
      outcome = "ESCALATED";
    } else if (input.decision === "APPROVE") {
      await tx.leaveRequest.update({
        where: { id: req.id },
        data: { status: "APPROVED", decidedAt: new Date() },
      });
      await tx.leaveBalance.update({
        where: balWhere,
        data: { pending: { decrement: req.days }, used: { increment: req.days } },
      });
      outcome = "APPROVED";
    } else if (input.decision === "REJECT") {
      await tx.leaveRequest.update({
        where: { id: req.id },
        data: { status: "REJECTED", decidedAt: new Date() },
      });
      await tx.leaveBalance.update({ where: balWhere, data: { pending: { decrement: req.days } } });
      outcome = "REJECTED";
    } else {
      await tx.leaveRequest.update({
        where: { id: req.id },
        data: { status: "MODIFICATION_REQUESTED" },
      });
      outcome = "MODIFICATION_REQUESTED";
    }
    await writeAudit(tx, actor, {
      action: `leave.${input.decision.toLowerCase()}`,
      entityType: "LeaveRequest",
      entityId: req.id,
      summary: `Level ${req.currentLevel}: ${outcome}${input.comment ? ` — ${input.comment}` : ""}`,
    });
    return outcome;
  });
  const range = `${dbDateToKey(req.startDate)} to ${dbDateToKey(req.endDate)}`;
  if (result === "ESCALATED") {
    await notifyApprovers(
      { ...req, currentLevel: req.currentLevel + 1 },
      `${req.employee.firstName} ${req.employee.lastName}`,
      req.leaveType.name,
      range,
    );
    await notifyEmployees([req.employeeId], {
      type: "leave.progress",
      title: "Leave approved by manager",
      body: `Your ${req.leaveType.name} (${range}) is now awaiting HR approval.`,
      link: "/leave",
    });
  } else {
    const label =
      result === "APPROVED"
        ? "approved"
        : result === "REJECTED"
          ? "rejected"
          : "returned for changes";
    await notifyEmployees(
      [req.employeeId],
      {
        type: `leave.${String(result).toLowerCase()}`,
        title: `Leave ${label}`,
        body: `Your ${req.leaveType.name} (${range}) was ${label}${input.comment ? `: ${input.comment}` : "."}`,
        link: "/leave",
      },
      { email: true },
    );
  }
  return result;
}

/** Applicant edits a request that is pending (no approvals yet) or returned for modification. */
export async function modifyLeave(actor: Actor, id: string, input: LeaveInput) {
  const employeeId = assertEmployee(actor);
  const req = await db.leaveRequest.findUnique({ where: { id }, include: { approvals: true } });
  if (!req || req.employeeId !== employeeId) throw new NotFoundError("Leave request");
  const editable =
    req.status === "MODIFICATION_REQUESTED" ||
    (req.status === "PENDING" && req.approvals.length === 0);
  if (!editable) throw new ConflictError("This request can no longer be edited.");
  await db.$transaction(async (tx) => {
    const sameType =
      req.leaveTypeId === input.leaveTypeId &&
      req.startDate.getUTCFullYear() === Number(input.startDate.slice(0, 4));
    const { type, days, year } = await prepare(tx, employeeId, input, {
      excludeRequestId: id,
      currentReservation: sameType ? toNumber(req.days) : 0,
    });
    const oldYear = req.startDate.getUTCFullYear();
    await tx.leaveBalance.update({
      where: {
        employeeId_leaveTypeId_year: { employeeId, leaveTypeId: req.leaveTypeId, year: oldYear },
      },
      data: { pending: { decrement: req.days } },
    });
    await tx.leaveBalance.update({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: type.id, year } },
      data: { pending: { increment: days } },
    });
    const claim = await tx.leaveRequest.updateMany({
      where: { id, status: req.status },
      data: {
        leaveTypeId: type.id,
        startDate: dateKeyToDb(input.startDate),
        endDate: dateKeyToDb(input.endDate),
        halfDay: input.halfDay ?? null,
        days,
        reason: input.reason,
        status: "PENDING",
        currentLevel: 1,
        requiredLevels: Math.max(1, type.approvalLevels),
      },
    });
    if (claim.count !== 1) throw new ConflictError("This request was updated by someone else.");
    await writeAudit(tx, actor, {
      action: "leave.modify",
      entityType: "LeaveRequest",
      entityId: id,
      summary: `${type.code} ${input.startDate}→${input.endDate} (${days}d)`,
    });
  });
  const t = await db.leaveType.findUniqueOrThrow({ where: { id: input.leaveTypeId } });
  await notifyApprovers(
    { id, employeeId, currentLevel: 1 },
    actor.name,
    t.name,
    `${input.startDate} to ${input.endDate}`,
  );
}

/** Withdraw (pending) or cancel (approved, not yet started; HR may cancel any approved leave). */
export async function cancelLeave(actor: Actor, id: string, reason?: string) {
  const req = await db.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: true,
      employee: { select: { managerId: true, firstName: true, lastName: true } },
    },
  });
  if (!req) throw new NotFoundError("Leave request");
  const own = req.employeeId === actor.employeeId;
  const isHr = actor.permissions.has("leave:manage") || actor.permissions.has("leave:read:all");
  if (!own && !isHr) throw new ForbiddenError();
  const today = todayKey();
  const started = dbDateToKey(req.startDate) <= today;
  let newStatus: LeaveStatus;
  if (req.status === "PENDING" || req.status === "MODIFICATION_REQUESTED") newStatus = "WITHDRAWN";
  else if (req.status === "APPROVED") {
    if (started && !isHr)
      throw new ConflictError("Leave that has already started can only be cancelled by HR.");
    newStatus = "CANCELLED";
  } else throw new ConflictError("This request cannot be cancelled.");
  const year = req.startDate.getUTCFullYear();
  await db.$transaction(async (tx) => {
    const claim = await tx.leaveRequest.updateMany({
      where: { id, status: req.status },
      data: { status: newStatus, cancelledAt: new Date() },
    });
    if (claim.count !== 1) throw new ConflictError("This request was updated by someone else.");
    const field = req.status === "APPROVED" ? "used" : "pending";
    await tx.leaveBalance.update({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: req.employeeId,
          leaveTypeId: req.leaveTypeId,
          year,
        },
      },
      data: { [field]: { decrement: req.days } },
    });
    if (req.status === "APPROVED") {
      // Remove system-generated ON_LEAVE attendance for future days.
      await tx.attendance.deleteMany({
        where: {
          employeeId: req.employeeId,
          status: "ON_LEAVE",
          source: "SYSTEM",
          date: { gte: dateKeyToDb(addDaysKey(today, 1)), lte: req.endDate },
        },
      });
    }
    await writeAudit(tx, actor, {
      action: `leave.${newStatus.toLowerCase()}`,
      entityType: "LeaveRequest",
      entityId: id,
      summary: reason ?? undefined,
    });
  });
  const range = `${dbDateToKey(req.startDate)} to ${dbDateToKey(req.endDate)}`;
  if (own && req.employee.managerId) {
    await notifyEmployees([req.employee.managerId], {
      type: "leave.cancelled",
      title: `Leave ${newStatus.toLowerCase()}`,
      body: `${req.employee.firstName} ${req.employee.lastName} ${newStatus.toLowerCase()} ${req.leaveType.name} (${range}).`,
      link: "/leave/calendar",
    });
  } else if (!own) {
    await notifyEmployees(
      [req.employeeId],
      {
        type: "leave.cancelled",
        title: "Leave cancelled by HR",
        body: `Your ${req.leaveType.name} (${range}) was cancelled${reason ? `: ${reason}` : "."}`,
        link: "/leave",
      },
      { email: true },
    );
  }
}

export async function balancesFor(employeeId: string, year: number) {
  await db.$transaction((tx) => ensureLeaveBalances(tx, employeeId, year, todayKey()));
  const rows = await db.leaveBalance.findMany({
    where: { employeeId, year, leaveType: { isActive: true } },
    include: { leaveType: true },
    orderBy: { leaveType: { code: "asc" } },
  });
  return rows.map((b) => {
    const n = balanceNumbers(b);
    return { id: b.id, leaveType: b.leaveType, ...n, available: availableBalance(n) };
  });
}

export async function myRequests(employeeId: string, year?: number) {
  return db.leaveRequest.findMany({
    where: {
      employeeId,
      ...(year
        ? { startDate: { gte: dateKeyToDb(`${year}-01-01`), lte: dateKeyToDb(`${year}-12-31`) } }
        : {}),
    },
    include: {
      leaveType: { select: { name: true, code: true, color: true } },
      approvals: {
        include: { approver: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { startDate: "desc" },
    take: 200,
  });
}

/** Requests the actor can act on right now. */
export async function approvalQueue(actor: Actor) {
  if (!actor.permissions.has("leave:approve")) return [];
  const scope = await employeeScopeWhere(actor, "leave");
  const isHr = actor.permissions.has("leave:read:all");
  const candidates = await db.leaveRequest.findMany({
    where: {
      status: "PENDING",
      employee: { AND: [scope, { id: { not: actor.employeeId ?? "" } }] },
      ...(isHr ? {} : { currentLevel: 1 }),
    },
    include: {
      leaveType: { select: { name: true, code: true, color: true } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          managerId: true,
          department: { select: { name: true } },
        },
      },
      approvals: { include: { approver: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { startDate: "asc" },
    take: 300,
  });
  const out = [];
  for (const r of candidates) if (await canDecide(actor, r)) out.push(r);
  return out;
}

/** Approved + pending leave overlapping a window, within the actor's leave scope. */
export async function teamCalendar(
  actor: Actor,
  startKey: string,
  endKey: string,
  departmentId?: string,
) {
  assertPermission(actor, "leave:read:all", "leave:read:department", "leave:read:team");
  const scope = await employeeScopeWhere(actor, "leave");
  return db.leaveRequest.findMany({
    where: {
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: dateKeyToDb(endKey) },
      endDate: { gte: dateKeyToDb(startKey) },
      employee: { AND: [scope, departmentId ? { departmentId } : {}] },
    },
    include: {
      leaveType: { select: { name: true, code: true, color: true } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { startDate: "asc" },
  });
}

export async function leaveReport(
  actor: Actor,
  filters: { year: number; departmentId?: string; status?: LeaveStatus; leaveTypeId?: string },
) {
  assertPermission(actor, "leave:read:all", "leave:read:department", "leave:read:team");
  const scope = await employeeScopeWhere(actor, "leave");
  const rows = await db.leaveRequest.findMany({
    where: {
      startDate: {
        gte: dateKeyToDb(`${filters.year}-01-01`),
        lte: dateKeyToDb(`${filters.year}-12-31`),
      },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.leaveTypeId ? { leaveTypeId: filters.leaveTypeId } : {}),
      employee: {
        AND: [scope, filters.departmentId ? { departmentId: filters.departmentId } : {}],
      },
    },
    include: {
      leaveType: { select: { name: true, code: true } },
      employee: {
        select: {
          employeeCode: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { startDate: "desc" },
    take: 5000,
  });
  return rows;
}

// ─── Policy administration ───────────────────────────────────────────────────

export interface LeaveTypeInput {
  id?: string;
  code: string;
  name: string;
  description?: string;
  color: string;
  annualEntitlement: number;
  accrual: "ANNUAL_UPFRONT" | "MONTHLY" | "NONE";
  carryForwardLimit: number;
  isPaid: boolean;
  allowHalfDay: boolean;
  allowNegativeBalance: boolean;
  maxConsecutiveDays?: number;
  minNoticeDays: number;
  documentRequiredAfterDays?: number;
  approvalLevels: number;
  isActive: boolean;
}

export async function saveLeaveType(actor: Actor, input: LeaveTypeInput) {
  assertPermission(actor, "leave:manage");
  const { id, ...rest } = input;
  const data = {
    ...rest,
    description: rest.description ?? null,
    maxConsecutiveDays: rest.maxConsecutiveDays ?? null,
    documentRequiredAfterDays: rest.documentRequiredAfterDays ?? null,
  };
  return db.$transaction(async (tx) => {
    const before = id ? await tx.leaveType.findUnique({ where: { id } }) : null;
    const t = id
      ? await tx.leaveType.update({ where: { id }, data })
      : await tx.leaveType.create({ data });
    await writeAudit(tx, actor, {
      action: id ? "leave_type.update" : "leave_type.create",
      entityType: "LeaveType",
      entityId: t.id,
      before,
      after: data,
    });
    return t;
  });
}

export async function adjustBalance(
  actor: Actor,
  input: { employeeId: string; leaveTypeId: string; year: number; delta: number; reason: string },
) {
  assertPermission(actor, "leave:manage");
  if (input.employeeId === actor.employeeId)
    throw new ForbiddenError("You cannot adjust your own balance.");
  if (input.delta === 0)
    throw new ValidationError("Adjustment cannot be zero.", { delta: ["Cannot be zero"] });
  await db.$transaction(async (tx) => {
    await ensureLeaveBalances(tx, input.employeeId, input.year, todayKey());
    const b = await tx.leaveBalance.update({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          year: input.year,
        },
      },
      data: { adjusted: { increment: input.delta } },
    });
    await writeAudit(tx, actor, {
      action: "leave_balance.adjust",
      entityType: "LeaveBalance",
      entityId: b.id,
      summary: `${input.delta > 0 ? "+" : ""}${input.delta} day(s): ${input.reason}`,
      after: input,
    });
  });
  await notifyEmployees([input.employeeId], {
    type: "leave.balance_adjusted",
    title: "Leave balance adjusted",
    body: `${input.delta > 0 ? "+" : ""}${input.delta} day(s): ${input.reason}`,
    link: "/leave",
  });
}

/** Re-compute `entitled` for monthly-accrual types (idempotent; run monthly or on demand). */
export async function runMonthlyAccrual(year: number, asOfKey = todayKey()) {
  const types = await db.leaveType.findMany({ where: { isActive: true, accrual: "MONTHLY" } });
  let updated = 0;
  for (const t of types) {
    const balances = await db.leaveBalance.findMany({
      where: { leaveTypeId: t.id, year },
      include: { employee: { select: { dateOfJoining: true } } },
    });
    for (const b of balances) {
      const ent = computeEntitlement(
        { annualEntitlement: toNumber(t.annualEntitlement), accrual: t.accrual },
        year,
        dbDateToKey(b.employee.dateOfJoining),
        asOfKey,
      );
      if (ent !== toNumber(b.entitled)) {
        await db.leaveBalance.update({ where: { id: b.id }, data: { entitled: ent } });
        updated++;
      }
    }
  }
  return { updated };
}

/** Year-end rollover: carry forward unused balance (capped per type) into the next year. Guarded against re-runs. */
export async function yearEndRollover(actor: Actor, fromYear: number) {
  assertPermission(actor, "leave:manage");
  const key = `leave.rollover.${fromYear}`;
  const done = await db.setting.findUnique({ where: { key } });
  if (done) throw new ConflictError(`Rollover for ${fromYear} has already been run.`);
  const toYear = fromYear + 1;
  const balances = await db.leaveBalance.findMany({
    where: { year: fromYear },
    include: { leaveType: true, employee: { select: { status: true, deletedAt: true } } },
  });
  let carried = 0;
  await db.$transaction(
    async (tx) => {
      for (const b of balances) {
        if (b.employee.status === "EXITED" || b.employee.deletedAt) continue;
        const limit = toNumber(b.leaveType.carryForwardLimit);
        if (limit <= 0) continue;
        const available = availableBalance(balanceNumbers(b));
        const cf = Math.max(0, Math.min(limit, available));
        await ensureLeaveBalances(tx, b.employeeId, toYear, `${toYear}-01-01`);
        await tx.leaveBalance.update({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: b.employeeId,
              leaveTypeId: b.leaveTypeId,
              year: toYear,
            },
          },
          data: { carriedForward: cf },
        });
        carried++;
      }
      await tx.setting.create({
        data: {
          key,
          value: { runAt: new Date().toISOString(), by: actor.id, balances: carried },
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, actor, {
        action: "leave.year_end_rollover",
        entityType: "LeaveBalance",
        summary: `${fromYear} → ${toYear}: ${carried} balances carried forward`,
      });
    },
    { timeout: 60_000 },
  );
  return { carried };
}

export async function leaveTypes(activeOnly = true) {
  return db.leaveType.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { code: "asc" },
  });
}
