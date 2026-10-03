import { Prisma, type EmployeeStatus } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertPermission, canAccessEmployee, employeeScopeWhere, reportingTreeIds } from "@/lib/auth/rbac";
import { syncDerivedRoles } from "@/lib/auth/role-sync";
import { OFFBOARDING_TEMPLATE, ONBOARDING_TEMPLATE } from "@/lib/checklists";
import { addDaysKey, dateKeyToDb, dbDateToKey, todayKey } from "@/lib/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { formatCode, nextSequence } from "@/lib/sequence";
import { notifyEmployees } from "@/lib/notifications";
import { fullName } from "@/lib/utils";
import type { EmployeeCreateInput, EmployeeUpdateInput } from "@/lib/validation/employee";
import { ensureLeaveBalances } from "./leave-entitlement";
import { placeholderPasswordHash, sendAccountInvite } from "./auth.service";

export interface EmployeeListFilters {
  q?: string;
  departmentId?: string;
  status?: EmployeeStatus;
  employmentType?: Prisma.EmployeeWhereInput["employmentType"];
  page: number;
  pageSize: number;
}

const listSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  middleName: true,
  lastName: true,
  workEmail: true,
  phone: true,
  status: true,
  employmentType: true,
  workLocation: true,
  dateOfJoining: true,
  photoKey: true,
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, title: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeSelect;

export type EmployeeListRow = Prisma.EmployeeGetPayload<{ select: typeof listSelect }>;

function searchWhere(f: Pick<EmployeeListFilters, "q" | "departmentId" | "status" | "employmentType">): Prisma.EmployeeWhereInput {
  const and: Prisma.EmployeeWhereInput[] = [{ deletedAt: null }];
  if (f.q) {
    const terms = f.q.split(/\s+/).filter(Boolean).slice(0, 4);
    for (const t of terms) {
      and.push({
        OR: [
          { firstName: { contains: t, mode: "insensitive" } },
          { lastName: { contains: t, mode: "insensitive" } },
          { employeeCode: { contains: t, mode: "insensitive" } },
          { workEmail: { contains: t, mode: "insensitive" } },
        ],
      });
    }
  }
  if (f.departmentId) and.push({ departmentId: f.departmentId });
  if (f.status) and.push({ status: f.status });
  else and.push({ status: { not: "EXITED" } });
  if (f.employmentType) and.push({ employmentType: f.employmentType });
  return { AND: and };
}

/**
 * Directory listing. Users with full employee scope see all filters; everyone
 * with `directory:read` sees the same limited columns for active staff.
 */
export async function listEmployees(actor: Actor, f: EmployeeListFilters) {
  assertPermission(actor, "directory:read", "employee:read:all", "employee:read:team", "employee:read:department");
  // The directory exposes current staff to everyone; ex-employees only within the actor's scope.
  const directoryOnly = actor.permissions.has("directory:read") && f.status !== "EXITED";
  const scope = directoryOnly ? {} : await employeeScopeWhere(actor, "employee");
  const where: Prisma.EmployeeWhereInput = { AND: [searchWhere(f), scope] };
  const [rows, total] = await Promise.all([
    db.employee.findMany({
      where,
      select: listSelect,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    db.employee.count({ where }),
  ]);
  return { rows, total };
}

/** Rows for CSV/XLSX export — restricted to the actor's full-access scope. */
export async function exportEmployees(actor: Actor, f: Omit<EmployeeListFilters, "page" | "pageSize">) {
  assertPermission(actor, "report:export");
  const scope = await employeeScopeWhere(actor, "employee");
  const rows = await db.employee.findMany({
    where: { AND: [searchWhere(f), scope] },
    select: listSelect,
    orderBy: { employeeCode: "asc" },
    take: 10000,
  });
  return rows.map((r) => ({
    "Employee ID": r.employeeCode,
    Name: fullName(r),
    "Work email": r.workEmail,
    Phone: r.phone ?? "",
    Department: r.department?.name ?? "",
    Designation: r.designation?.title ?? "",
    Manager: r.manager ? `${r.manager.firstName} ${r.manager.lastName}` : "",
    "Employment type": r.employmentType,
    Status: r.status,
    Location: r.workLocation ?? "",
    "Date of joining": dbDateToKey(r.dateOfJoining),
  }));
}

export interface ProfileAccess {
  full: boolean; // job details, history, documents, attendance links
  personal: boolean; // DOB, address, personal contacts, emergency contacts
  financial: boolean; // PAN/UAN/bank
  canEdit: boolean;
  canOffboard: boolean;
  isSelf: boolean;
}

export async function profileAccess(actor: Actor, employeeId: string): Promise<ProfileAccess> {
  const isSelf = actor.employeeId === employeeId;
  const full = isSelf || (await canAccessEmployee(actor, "employee", employeeId));
  const p = actor.permissions;
  return {
    full,
    personal: isSelf || p.has("employee:read:all") || p.has("employee:sensitive:read"),
    financial: isSelf || p.has("employee:sensitive:read"),
    canEdit: p.has("employee:update"),
    canOffboard: p.has("employee:archive"),
    isSelf,
  };
}

export async function getEmployeeProfile(actor: Actor, id: string) {
  const access = await profileAccess(actor, id);
  if (!access.full && !actor.permissions.has("directory:read")) throw new ForbiddenError();
  const e = await db.employee.findFirst({
    where: { id, deletedAt: null },
    include: {
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, title: true, level: true } },
      manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      shift: { select: { id: true, name: true } },
      directReports: {
        where: { deletedAt: null, status: { not: "EXITED" } },
        select: { id: true, firstName: true, lastName: true, designation: { select: { title: true } } },
      },
      emergencyContacts: access.personal ? { orderBy: { isPrimary: "desc" } } : false,
      financialInfo: access.financial,
      user: { select: { id: true, isActive: true, lastLoginAt: true, roles: { select: { role: { select: { key: true, name: true } } } } } },
    },
  });
  if (!e) throw new NotFoundError("Employee");
  if (!access.full && e.status === "EXITED") throw new ForbiddenError();
  if (!access.personal) {
    // Strip personal fields for viewers without personal-data access.
    Object.assign(e, { dateOfBirth: null, addressLine1: null, addressLine2: null, postalCode: null, personalEmail: null, bio: e.bio });
  }
  return { employee: e, access };
}

async function assertRefs(tx: Tx, input: { departmentId?: string; designationId?: string; managerId?: string; shiftId?: string }) {
  if (input.departmentId && !(await tx.department.findFirst({ where: { id: input.departmentId, deletedAt: null } })))
    throw new ValidationError("Department not found.", { departmentId: ["Select a valid department"] });
  if (input.designationId && !(await tx.designation.findFirst({ where: { id: input.designationId, deletedAt: null } })))
    throw new ValidationError("Designation not found.", { designationId: ["Select a valid designation"] });
  if (input.managerId && !(await tx.employee.findFirst({ where: { id: input.managerId, deletedAt: null, status: { not: "EXITED" } } })))
    throw new ValidationError("Manager not found.", { managerId: ["Select an active employee"] });
  if (input.shiftId && !(await tx.shift.findFirst({ where: { id: input.shiftId, deletedAt: null } })))
    throw new ValidationError("Shift not found.", { shiftId: ["Select a valid shift"] });
}

export async function createEmployee(actor: Actor, input: EmployeeCreateInput) {
  assertPermission(actor, "employee:create");
  const emailTaken = await db.employee.findUnique({ where: { workEmail: input.workEmail } });
  const userTaken = input.createAccount ? await db.user.findUnique({ where: { email: input.workEmail } }) : null;
  if (emailTaken || userTaken) throw new ValidationError("Work email is already in use.", { workEmail: ["Work email is already in use"] });

  const passwordHash = input.createAccount ? await placeholderPasswordHash() : null;
  const today = todayKey();
  const result = await db.$transaction(async (tx) => {
    await assertRefs(tx, input);
    const defaultShift = input.shiftId ? null : await tx.shift.findFirst({ where: { isDefault: true, deletedAt: null } });
    const code = formatCode("EMP", await nextSequence(tx, "employee"));
    let userId: string | null = null;
    if (passwordHash) {
      const role = await tx.role.findUniqueOrThrow({ where: { key: "EMPLOYEE" } });
      const user = await tx.user.create({
        data: { email: input.workEmail, passwordHash, mustChangePassword: true, roles: { create: { roleId: role.id } } },
      });
      userId = user.id;
    }
    const { createAccount: _c, dateOfBirth, dateOfJoining, probationEndsOn, ...rest } = input;
    const emp = await tx.employee.create({
      data: {
        ...rest,
        employeeCode: code,
        userId,
        shiftId: input.shiftId ?? defaultShift?.id ?? null,
        dateOfBirth: dateOfBirth ? dateKeyToDb(dateOfBirth) : null,
        dateOfJoining: dateKeyToDb(dateOfJoining),
        probationEndsOn: probationEndsOn ? dateKeyToDb(probationEndsOn) : dateKeyToDb(addDaysKey(dateOfJoining, 180)),
        status: "ONBOARDING",
      },
    });
    await tx.employmentHistory.create({
      data: {
        employeeId: emp.id,
        changeType: "JOINED",
        effectiveDate: dateKeyToDb(dateOfJoining),
        details: { departmentId: input.departmentId ?? null, designationId: input.designationId ?? null, managerId: input.managerId ?? null },
        createdById: actor.id,
      },
    });
    if (input.managerId) {
      await tx.reportingRelationship.create({ data: { employeeId: emp.id, managerId: input.managerId, startDate: dateKeyToDb(dateOfJoining) } });
    }
    await tx.checklistItem.createMany({
      data: ONBOARDING_TEMPLATE.map((t, i) => ({
        employeeId: emp.id,
        type: "ONBOARDING" as const,
        title: t.title,
        category: t.category,
        owner: t.owner,
        sortOrder: i,
        dueDate: dateKeyToDb(addDaysKey(dateOfJoining, t.dueInDays)),
      })),
    });
    const year = Number(today.slice(0, 4));
    await ensureLeaveBalances(tx, emp.id, Math.max(year, Number(dateOfJoining.slice(0, 4))), today);
    await syncDerivedRoles(tx, [input.managerId]);
    await writeAudit(tx, actor, {
      action: "employee.create",
      entityType: "Employee",
      entityId: emp.id,
      summary: `Created ${code} ${input.firstName} ${input.lastName}`,
      after: { ...rest, employeeCode: code, dateOfJoining },
    });
    return { id: emp.id, employeeCode: code, userId };
  });
  if (result.userId) await sendAccountInvite(result.userId, input.firstName);
  if (input.managerId) {
    await notifyEmployees([input.managerId], {
      type: "employee.new_report",
      title: "New team member",
      body: `${input.firstName} ${input.lastName} (${result.employeeCode}) will report to you from ${input.dateOfJoining}.`,
      link: `/employees/${result.id}`,
    });
  }
  return result;
}

/** Throws if assigning `managerId` to `employeeId` would create a reporting cycle. */
export async function assertNoReportingCycle(employeeId: string, managerId: string | undefined | null) {
  if (!managerId) return;
  if (managerId === employeeId) throw new ValidationError("An employee cannot report to themselves.", { managerId: ["Cannot report to self"] });
  const subtree = await reportingTreeIds(employeeId);
  if (subtree.includes(managerId)) {
    throw new ValidationError("This would create a circular reporting line.", { managerId: ["Selected manager reports to this employee"] });
  }
}

export async function updateEmployee(actor: Actor, input: EmployeeUpdateInput) {
  assertPermission(actor, "employee:update");
  const before = await db.employee.findFirst({ where: { id: input.id, deletedAt: null } });
  if (!before) throw new NotFoundError("Employee");
  if (input.status === "EXITED" && before.status !== "EXITED") {
    throw new ValidationError("Use the offboarding workflow to exit an employee.", { status: ["Use offboarding to exit an employee"] });
  }
  await assertNoReportingCycle(input.id, input.managerId);
  if (input.workEmail !== before.workEmail) {
    const clash = await db.employee.findFirst({ where: { workEmail: input.workEmail, id: { not: input.id } } });
    const userClash = await db.user.findFirst({ where: { email: input.workEmail, id: { not: before.userId ?? "" } } });
    if (clash || userClash) throw new ValidationError("Work email is already in use.", { workEmail: ["Work email is already in use"] });
  }
  const today = todayKey();
  await db.$transaction(async (tx) => {
    await assertRefs(tx, input);
    const { id, changeRemarks, dateOfBirth, dateOfJoining, probationEndsOn, ...rest } = input;
    const data = {
      ...rest,
      departmentId: input.departmentId ?? null,
      designationId: input.designationId ?? null,
      managerId: input.managerId ?? null,
      shiftId: input.shiftId ?? null,
      middleName: input.middleName ?? null,
      personalEmail: input.personalEmail ?? null,
      phone: input.phone ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      workLocation: input.workLocation ?? null,
      bio: input.bio ?? null,
      dateOfBirth: dateOfBirth ? dateKeyToDb(dateOfBirth) : null,
      dateOfJoining: dateKeyToDb(dateOfJoining),
      probationEndsOn: probationEndsOn ? dateKeyToDb(probationEndsOn) : null,
    };
    const after = await tx.employee.update({ where: { id }, data });
    await recordJobChanges(tx, actor, before, after, today, changeRemarks);
    if (before.userId && before.workEmail !== after.workEmail) {
      await tx.user.update({ where: { id: before.userId }, data: { email: after.workEmail } });
    }
    await syncDerivedRoles(tx, [before.managerId, after.managerId]);
    await writeAudit(tx, actor, {
      action: "employee.update",
      entityType: "Employee",
      entityId: id,
      summary: `Updated ${before.employeeCode}`,
      before: diffObject(before, after).before,
      after: diffObject(before, after).after,
    });
  });
}

type EmpRow = Prisma.EmployeeGetPayload<object>;

function diffObject(a: Record<string, unknown>, b: Record<string, unknown>) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of Object.keys(b)) {
    if (k === "updatedAt") continue;
    const av = a[k] instanceof Date ? (a[k] as Date).toISOString() : a[k];
    const bv = b[k] instanceof Date ? (b[k] as Date).toISOString() : b[k];
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      before[k] = av;
      after[k] = bv;
    }
  }
  return { before, after };
}

/** Writes EmploymentHistory + ReportingRelationship rows for job-related changes. */
async function recordJobChanges(tx: Tx, actor: Actor, before: EmpRow, after: EmpRow, effectiveKey: string, remarks?: string) {
  const effectiveDate = dateKeyToDb(effectiveKey);
  const base = { employeeId: after.id, effectiveDate, remarks: remarks ?? null, createdById: actor.id };
  if (before.departmentId !== after.departmentId) {
    await tx.employmentHistory.create({ data: { ...base, changeType: "TRANSFER", details: { fromDepartmentId: before.departmentId, toDepartmentId: after.departmentId } } });
  }
  if (before.designationId !== after.designationId) {
    const [from, to] = await Promise.all([
      before.designationId ? tx.designation.findUnique({ where: { id: before.designationId } }) : null,
      after.designationId ? tx.designation.findUnique({ where: { id: after.designationId } }) : null,
    ]);
    const promotion = !!from && !!to && to.level > from.level;
    await tx.employmentHistory.create({
      data: { ...base, changeType: promotion ? "PROMOTION" : "DESIGNATION_CHANGE", details: { from: from?.title ?? null, to: to?.title ?? null } },
    });
  }
  if (before.managerId !== after.managerId) {
    await tx.reportingRelationship.updateMany({ where: { employeeId: after.id, type: "DIRECT", endDate: null }, data: { endDate: effectiveDate } });
    if (after.managerId) {
      await tx.reportingRelationship.create({ data: { employeeId: after.id, managerId: after.managerId, startDate: effectiveDate } });
    }
    await tx.employmentHistory.create({ data: { ...base, changeType: "MANAGER_CHANGE", details: { fromManagerId: before.managerId, toManagerId: after.managerId } } });
  }
  if (before.status !== after.status) {
    await tx.employmentHistory.create({ data: { ...base, changeType: "STATUS_CHANGE", details: { from: before.status, to: after.status } } });
  }
}

/** Department / designation / manager change with an explicit effective date. */
export async function transferEmployee(
  actor: Actor,
  input: { employeeId: string; departmentId?: string; designationId?: string; managerId?: string; effectiveDate: string; remarks?: string },
) {
  assertPermission(actor, "employee:update");
  const before = await db.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } });
  if (!before) throw new NotFoundError("Employee");
  await assertNoReportingCycle(input.employeeId, input.managerId);
  await db.$transaction(async (tx) => {
    await assertRefs(tx, input);
    const after = await tx.employee.update({
      where: { id: input.employeeId },
      data: { departmentId: input.departmentId ?? null, designationId: input.designationId ?? null, managerId: input.managerId ?? null },
    });
    await recordJobChanges(tx, actor, before, after, input.effectiveDate, input.remarks);
    await syncDerivedRoles(tx, [before.managerId, after.managerId]);
    await writeAudit(tx, actor, {
      action: "employee.transfer",
      entityType: "Employee",
      entityId: input.employeeId,
      summary: `Transfer/reporting change for ${before.employeeCode}`,
      before: { departmentId: before.departmentId, designationId: before.designationId, managerId: before.managerId },
      after: { departmentId: after.departmentId, designationId: after.designationId, managerId: after.managerId, effectiveDate: input.effectiveDate },
    });
  });
  await notifyEmployees([input.employeeId], {
    type: "employee.transfer",
    title: "Your job details changed",
    body: `Your department, designation or reporting manager was updated effective ${input.effectiveDate}.`,
    link: "/profile",
  });
}

export async function initiateOffboarding(actor: Actor, input: { employeeId: string; exitDate: string; exitReason: string }) {
  assertPermission(actor, "employee:archive");
  const emp = await db.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } });
  if (!emp) throw new NotFoundError("Employee");
  if (emp.status === "EXITED") throw new ConflictError("Employee has already exited.");
  if (actor.employeeId === emp.id) throw new ForbiddenError("You cannot offboard yourself.");
  if (input.exitDate < dbDateToKey(emp.dateOfJoining)) throw new ValidationError("Exit date cannot be before the joining date.", { exitDate: ["Must be after joining date"] });
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: emp.id }, data: { status: "ON_NOTICE", exitDate: dateKeyToDb(input.exitDate), exitReason: input.exitReason } });
    await tx.employmentHistory.create({
      data: { employeeId: emp.id, changeType: "STATUS_CHANGE", effectiveDate: dateKeyToDb(todayKey()), details: { from: emp.status, to: "ON_NOTICE", exitDate: input.exitDate }, remarks: input.exitReason, createdById: actor.id },
    });
    const existing = await tx.checklistItem.count({ where: { employeeId: emp.id, type: "OFFBOARDING" } });
    if (!existing) {
      await tx.checklistItem.createMany({
        data: OFFBOARDING_TEMPLATE.map((t, i) => ({
          employeeId: emp.id,
          type: "OFFBOARDING" as const,
          title: t.title,
          category: t.category,
          owner: t.owner,
          sortOrder: i,
          dueDate: dateKeyToDb(addDaysKey(input.exitDate, t.dueInDays)),
        })),
      });
    }
    await writeAudit(tx, actor, { action: "employee.offboarding_started", entityType: "Employee", entityId: emp.id, summary: `Offboarding ${emp.employeeCode}, exit ${input.exitDate}`, after: input });
  });
  await notifyEmployees([emp.managerId], { type: "employee.offboarding", title: "Team member offboarding", body: `${emp.firstName} ${emp.lastName}'s last working day is ${input.exitDate}.`, link: `/employees/${emp.id}` });
}

/**
 * Finalise an exit: deactivate the account, revoke sessions, close reporting
 * lines, hand direct reports to the next manager up, release department
 * headship and cancel future leave — all atomically.
 */
export async function completeOffboarding(actor: Actor, employeeId: string) {
  assertPermission(actor, "employee:archive");
  const emp = await db.employee.findFirst({ where: { id: employeeId, deletedAt: null }, include: { directReports: { where: { deletedAt: null } }, headOfDepartment: true } });
  if (!emp) throw new NotFoundError("Employee");
  if (emp.status !== "ON_NOTICE") throw new ConflictError("Start offboarding before completing it.");
  const today = todayKey();
  const exitKey = emp.exitDate ? dbDateToKey(emp.exitDate) : today;
  const reportIds = emp.directReports.map((r) => r.id);
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: emp.id }, data: { status: "EXITED", exitDate: dateKeyToDb(exitKey) } });
    if (emp.userId) {
      await tx.user.update({ where: { id: emp.userId }, data: { isActive: false } });
      await tx.session.deleteMany({ where: { userId: emp.userId } });
    }
    await tx.reportingRelationship.updateMany({ where: { OR: [{ employeeId: emp.id }, { managerId: emp.id }], endDate: null }, data: { endDate: dateKeyToDb(exitKey) } });
    for (const r of emp.directReports) {
      await tx.employee.update({ where: { id: r.id }, data: { managerId: emp.managerId } });
      if (emp.managerId) await tx.reportingRelationship.create({ data: { employeeId: r.id, managerId: emp.managerId, startDate: dateKeyToDb(exitKey) } });
      await tx.employmentHistory.create({ data: { employeeId: r.id, changeType: "MANAGER_CHANGE", effectiveDate: dateKeyToDb(exitKey), details: { fromManagerId: emp.id, toManagerId: emp.managerId }, remarks: "Previous manager exited", createdById: actor.id } });
    }
    if (emp.headOfDepartment) await tx.department.update({ where: { id: emp.headOfDepartment.id }, data: { headId: null } });
    const future = await tx.leaveRequest.findMany({ where: { employeeId: emp.id, status: { in: ["PENDING", "APPROVED", "MODIFICATION_REQUESTED"] }, startDate: { gt: dateKeyToDb(exitKey) } } });
    for (const lr of future) {
      await tx.leaveRequest.update({ where: { id: lr.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      const field = lr.status === "APPROVED" ? "used" : "pending";
      await tx.leaveBalance.updateMany({ where: { employeeId: emp.id, leaveTypeId: lr.leaveTypeId, year: lr.startDate.getUTCFullYear() }, data: { [field]: { decrement: lr.days } } });
    }
    await tx.employmentHistory.create({ data: { employeeId: emp.id, changeType: "EXIT", effectiveDate: dateKeyToDb(exitKey), details: { reason: emp.exitReason }, createdById: actor.id } });
    await syncDerivedRoles(tx, [emp.id, emp.managerId, ...reportIds]);
    await writeAudit(tx, actor, { action: "employee.exited", entityType: "Employee", entityId: emp.id, summary: `${emp.employeeCode} exited; ${reportIds.length} reports reassigned` });
  });
}

/** Soft-delete a record created in error. Exited employees should not be archived — keep them for records. */
export async function archiveEmployee(actor: Actor, employeeId: string, reason: string) {
  assertPermission(actor, "employee:archive");
  const emp = await db.employee.findFirst({ where: { id: employeeId, deletedAt: null }, include: { _count: { select: { directReports: { where: { deletedAt: null } }, payrollRecords: true } } } });
  if (!emp) throw new NotFoundError("Employee");
  if (actor.employeeId === emp.id) throw new ForbiddenError("You cannot archive yourself.");
  if (emp._count.directReports > 0) throw new ConflictError("Reassign this employee's direct reports first.");
  if (emp._count.payrollRecords > 0) throw new ConflictError("Employees with payroll history cannot be archived; use offboarding.");
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: emp.id }, data: { deletedAt: new Date() } });
    await tx.department.updateMany({ where: { headId: emp.id }, data: { headId: null } });
    if (emp.userId) {
      await tx.user.update({ where: { id: emp.userId }, data: { isActive: false } });
      await tx.session.deleteMany({ where: { userId: emp.userId } });
    }
    await syncDerivedRoles(tx, [emp.managerId]);
    await writeAudit(tx, actor, { action: "employee.archive", entityType: "Employee", entityId: emp.id, summary: `Archived ${emp.employeeCode}: ${reason}` });
  });
}

export async function toggleChecklistItem(actor: Actor, itemId: string, done: boolean) {
  const item = await db.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError("Checklist item");
  const isOwnEmployeeTask = item.owner === "EMPLOYEE" && actor.employeeId === item.employeeId;
  const isManagerTask = item.owner === "MANAGER" && (await canAccessEmployee(actor, "employee", item.employeeId)) && actor.employeeId !== item.employeeId;
  if (!actor.permissions.has("employee:update") && !isOwnEmployeeTask && !isManagerTask) throw new ForbiddenError();
  await db.$transaction(async (tx) => {
    await tx.checklistItem.update({ where: { id: itemId }, data: { completedAt: done ? new Date() : null, completedById: done ? actor.id : null } });
    if (done && item.type === "ONBOARDING") {
      const remaining = await tx.checklistItem.count({ where: { employeeId: item.employeeId, type: "ONBOARDING", completedAt: null } });
      const emp = await tx.employee.findUniqueOrThrow({ where: { id: item.employeeId } });
      if (remaining === 0 && emp.status === "ONBOARDING") {
        await tx.employee.update({ where: { id: emp.id }, data: { status: "ACTIVE" } });
        await tx.employmentHistory.create({ data: { employeeId: emp.id, changeType: "STATUS_CHANGE", effectiveDate: dateKeyToDb(todayKey()), details: { from: "ONBOARDING", to: "ACTIVE" }, remarks: "Onboarding checklist completed", createdById: actor.id } });
      }
    }
    await writeAudit(tx, actor, { action: done ? "checklist.complete" : "checklist.reopen", entityType: "ChecklistItem", entityId: itemId, summary: item.title });
  });
}

export async function upsertEmergencyContact(actor: Actor, input: { id?: string; employeeId: string; name: string; relationship: string; phone: string; email?: string; isPrimary: boolean }) {
  const allowed = actor.employeeId === input.employeeId || actor.permissions.has("employee:update");
  if (!allowed) throw new ForbiddenError();
  await db.$transaction(async (tx) => {
    if (input.isPrimary) await tx.emergencyContact.updateMany({ where: { employeeId: input.employeeId }, data: { isPrimary: false } });
    const { id, ...data } = input;
    if (id) {
      const existing = await tx.emergencyContact.findFirst({ where: { id, employeeId: input.employeeId } });
      if (!existing) throw new NotFoundError("Contact");
      await tx.emergencyContact.update({ where: { id }, data: { ...data, email: data.email ?? null } });
    } else {
      const count = await tx.emergencyContact.count({ where: { employeeId: input.employeeId } });
      if (count >= 5) throw new ValidationError("A maximum of 5 emergency contacts is allowed.");
      await tx.emergencyContact.create({ data: { ...data, email: data.email ?? null } });
    }
    await writeAudit(tx, actor, { action: id ? "emergency_contact.update" : "emergency_contact.create", entityType: "Employee", entityId: input.employeeId, summary: `Emergency contact ${input.name}` });
  });
}

export async function deleteEmergencyContact(actor: Actor, contactId: string) {
  const c = await db.emergencyContact.findUnique({ where: { id: contactId } });
  if (!c) throw new NotFoundError("Contact");
  if (actor.employeeId !== c.employeeId && !actor.permissions.has("employee:update")) throw new ForbiddenError();
  await db.$transaction(async (tx) => {
    await tx.emergencyContact.delete({ where: { id: contactId } });
    await writeAudit(tx, actor, { action: "emergency_contact.delete", entityType: "Employee", entityId: c.employeeId, summary: `Removed contact ${c.name}` });
  });
}

export async function updateFinancialInfo(actor: Actor, input: { employeeId: string; panNumber?: string; uanNumber?: string; esiNumber?: string; bankName?: string; bankAccountNumber?: string; bankIfsc?: string }) {
  if (!actor.permissions.has("employee:sensitive:read") || !actor.permissions.has("employee:update")) throw new ForbiddenError();
  const { employeeId, ...rest } = input;
  const data = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v ?? null]));
  await db.$transaction(async (tx) => {
    await tx.employeeFinancialInfo.upsert({ where: { employeeId }, update: data, create: { employeeId, ...data } });
    // Values are redacted by the audit writer; only the fact of change is recorded.
    await writeAudit(tx, actor, { action: "employee.financial_update", entityType: "Employee", entityId: employeeId, summary: `Updated statutory/bank details (${Object.keys(rest).filter((k) => rest[k as keyof typeof rest]).join(", ")})` });
  });
}

/** Options for select inputs. */
export async function employeeOptions(opts: { includeExited?: boolean } = {}) {
  return db.employee.findMany({
    where: { deletedAt: null, ...(opts.includeExited ? {} : { status: { not: "EXITED" } }) },
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
}

export async function employeeHistory(actor: Actor, employeeId: string) {
  const access = await profileAccess(actor, employeeId);
  if (!access.full) throw new ForbiddenError();
  const [history, depts, desigs, managers] = await Promise.all([
    db.employmentHistory.findMany({ where: { employeeId }, orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }] }),
    db.department.findMany({ select: { id: true, name: true } }),
    db.designation.findMany({ select: { id: true, title: true } }),
    db.employee.findMany({ select: { id: true, firstName: true, lastName: true } }),
  ]);
  const names: Record<string, string> = {};
  for (const d of depts) names[d.id] = d.name;
  for (const d of desigs) names[d.id] = d.title;
  for (const m of managers) names[m.id] = `${m.firstName} ${m.lastName}`;
  return history.map((h) => ({ ...h, describe: describeHistory(h.changeType, h.details as Record<string, unknown>, names) }));
}

function describeHistory(type: string, d: Record<string, unknown>, names: Record<string, string>): string {
  const n = (id: unknown) => (typeof id === "string" ? (names[id] ?? "—") : "—");
  switch (type) {
    case "JOINED":
      return "Joined the organisation";
    case "TRANSFER":
      return `Department: ${n(d.fromDepartmentId)} → ${n(d.toDepartmentId)}`;
    case "PROMOTION":
    case "DESIGNATION_CHANGE":
      return `Designation: ${d.from ?? "—"} → ${d.to ?? "—"}`;
    case "MANAGER_CHANGE":
      return `Reporting manager: ${n(d.fromManagerId)} → ${n(d.toManagerId)}`;
    case "STATUS_CHANGE":
      return `Status: ${String(d.from)} → ${String(d.to)}`;
    case "EXIT":
      return `Exited${d.reason ? ` (${String(d.reason)})` : ""}`;
    default:
      return type;
  }
}
