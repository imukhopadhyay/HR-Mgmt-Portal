import type { AttendanceStatus, Prisma, Shift } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertCanAccessEmployee, assertEmployee, assertPermission, canAccessEmployee, employeeScopeWhere } from "@/lib/auth/rbac";
import { computeAttendanceMetrics, isWorkingDay } from "@/lib/attendance-rules";
import { appTimezone, dateKeyToDb, dbDateToKey, eachDayKey, localDateKey, monthRangeKeys, todayKey, zonedToUtc } from "@/lib/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { notifyEmployees, notifyUsers, usersWithPermission } from "@/lib/notifications";

const FALLBACK_SHIFT = { startTime: "09:30", endTime: "18:30", graceMinutes: 15, fullDayMinutes: 450, halfDayMinutes: 240, weeklyOffs: [0, 6] };

async function shiftFor(tx: Tx, employeeId: string): Promise<Pick<Shift, "startTime" | "endTime" | "graceMinutes" | "fullDayMinutes" | "halfDayMinutes" | "weeklyOffs"> & { id: string | null }> {
  const emp = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { shift: true } });
  if (emp.shift && !emp.shift.deletedAt) return emp.shift;
  const def = await tx.shift.findFirst({ where: { isDefault: true, deletedAt: null } });
  return def ?? { id: null, ...FALLBACK_SHIFT };
}

export async function holidayKeys(startKey: string, endKey: string): Promise<Set<string>> {
  const rows = await db.holiday.findMany({ where: { date: { gte: dateKeyToDb(startKey), lte: dateKeyToDb(endKey) }, type: "PUBLIC" }, select: { date: true } });
  return new Set(rows.map((r) => dbDateToKey(r.date)));
}

/** Approved leave covering a day (full or half). */
async function leaveOn(tx: Tx, employeeId: string, key: string) {
  return tx.leaveRequest.findFirst({
    where: { employeeId, status: "APPROVED", startDate: { lte: dateKeyToDb(key) }, endDate: { gte: dateKeyToDb(key) } },
    select: { id: true, halfDay: true },
  });
}

export async function checkIn(actor: Actor, now = new Date()) {
  const employeeId = assertEmployee(actor);
  const tz = appTimezone();
  const key = localDateKey(now, tz);
  return db.$transaction(async (tx) => {
    const emp = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { status: true } });
    if (emp.status === "EXITED" || emp.status === "SUSPENDED") throw new ForbiddenError("Your employment status does not allow check-in.");
    const leave = await leaveOn(tx, employeeId, key);
    if (leave && !leave.halfDay) throw new ConflictError("You are on approved leave today. Cancel the leave to record attendance.");
    const existing = await tx.attendance.findUnique({ where: { employeeId_date: { employeeId, date: dateKeyToDb(key) } } });
    if (existing?.checkInAt) throw new ConflictError("You have already checked in today.");
    const shift = await shiftFor(tx, employeeId);
    const metrics = computeAttendanceMetrics(key, now, null, shift, tz);
    const data = { checkInAt: now, checkOutAt: null, shiftId: shift.id, lateMinutes: metrics.lateMinutes, status: "PRESENT" as const, source: "WEB" as const };
    const rec = existing
      ? await tx.attendance.update({ where: { id: existing.id }, data })
      : await tx.attendance.create({ data: { employeeId, date: dateKeyToDb(key), ...data } });
    await writeAudit(tx, actor, { action: "attendance.check_in", entityType: "Attendance", entityId: rec.id, summary: `Check-in ${key}` });
    return rec;
  });
}

export async function checkOut(actor: Actor, now = new Date()) {
  const employeeId = assertEmployee(actor);
  const tz = appTimezone();
  // Support overnight shifts: the open record may belong to yesterday.
  const open = await db.attendance.findFirst({
    where: { employeeId, checkInAt: { not: null }, checkOutAt: null, date: { gte: dateKeyToDb(localDateKey(new Date(now.getTime() - 24 * 3600_000), tz)) } },
    orderBy: { date: "desc" },
  });
  if (!open || !open.checkInAt) throw new ConflictError("You have not checked in.");
  if (now.getTime() - open.checkInAt.getTime() < 60_000) throw new ValidationError("Check-out must be at least a minute after check-in.");
  return db.$transaction(async (tx) => {
    const shift = await shiftFor(tx, employeeId);
    const key = dbDateToKey(open.date);
    const m = computeAttendanceMetrics(key, open.checkInAt!, now, shift, tz);
    const leave = await leaveOn(tx, employeeId, key);
    const status: AttendanceStatus = leave?.halfDay && m.status === "ABSENT" ? "HALF_DAY" : m.status;
    const rec = await tx.attendance.update({ where: { id: open.id }, data: { checkOutAt: now, ...m, status } });
    await writeAudit(tx, actor, { action: "attendance.check_out", entityType: "Attendance", entityId: rec.id, summary: `Check-out ${key}: ${m.workMinutes} min` });
    return rec;
  });
}

export async function todayStatus(employeeId: string) {
  const key = todayKey();
  const [rec, leave, hol] = await Promise.all([
    db.attendance.findUnique({ where: { employeeId_date: { employeeId, date: dateKeyToDb(key) } } }),
    leaveOn(db, employeeId, key),
    db.holiday.findFirst({ where: { date: dateKeyToDb(key) } }),
  ]);
  const shift = await shiftFor(db, employeeId);
  return { key, record: rec, onLeave: !!leave && !leave.halfDay, halfDayLeave: !!leave?.halfDay, holiday: hol?.name ?? null, shift };
}

export type DayCell = {
  key: string;
  status: AttendanceStatus | "UPCOMING" | "NOT_MARKED";
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  note?: string;
};

/** Month calendar combining records, holidays, weekly-offs and approved leave. */
export async function monthCalendar(actor: Actor, employeeId: string, year: number, month: number) {
  await assertCanAccessEmployee(actor, "attendance", employeeId);
  const { start, end } = monthRangeKeys(year, month);
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { dateOfJoining: true, exitDate: true } });
  const shift = await shiftFor(db, employeeId);
  const [records, holidays, leaves] = await Promise.all([
    db.attendance.findMany({ where: { employeeId, date: { gte: dateKeyToDb(start), lte: dateKeyToDb(end) } } }),
    db.holiday.findMany({ where: { date: { gte: dateKeyToDb(start), lte: dateKeyToDb(end) } } }),
    db.leaveRequest.findMany({
      where: { employeeId, status: "APPROVED", startDate: { lte: dateKeyToDb(end) }, endDate: { gte: dateKeyToDb(start) } },
      include: { leaveType: { select: { name: true } } },
    }),
  ]);
  const recByKey = new Map(records.map((r) => [dbDateToKey(r.date), r]));
  const holByKey = new Map(holidays.map((h) => [dbDateToKey(h.date), h]));
  const today = todayKey();
  const joinKey = dbDateToKey(emp.dateOfJoining);
  const cells: DayCell[] = eachDayKey(start, end).map((key) => {
    const r = recByKey.get(key);
    const base = { key, checkInAt: r?.checkInAt ?? null, checkOutAt: r?.checkOutAt ?? null, workMinutes: r?.workMinutes ?? 0, lateMinutes: r?.lateMinutes ?? 0, overtimeMinutes: r?.overtimeMinutes ?? 0 };
    const leave = leaves.find((l) => dbDateToKey(l.startDate) <= key && dbDateToKey(l.endDate) >= key);
    const hol = holByKey.get(key);
    if (r && r.status !== "ABSENT") return { ...base, status: r.status, note: leave ? `${leave.leaveType.name}${leave.halfDay ? " (half day)" : ""}` : hol?.name };
    if (leave && !leave.halfDay) return { ...base, status: "ON_LEAVE", note: leave.leaveType.name };
    if (hol && hol.type === "PUBLIC") return { ...base, status: "HOLIDAY", note: hol.name };
    if (shift.weeklyOffs.includes(new Date(`${key}T00:00:00Z`).getUTCDay())) return { ...base, status: "WEEKLY_OFF" };
    if (key < joinKey || (emp.exitDate && key > dbDateToKey(emp.exitDate))) return { ...base, status: "UPCOMING", note: "Not employed" };
    if (r) return { ...base, status: r.status };
    if (key >= today) return { ...base, status: "UPCOMING" };
    return { ...base, status: "NOT_MARKED" };
  });
  return { cells, summary: summarize(cells) };
}

export function summarize(cells: Pick<DayCell, "status" | "workMinutes" | "lateMinutes" | "overtimeMinutes">[]) {
  const s = { present: 0, halfDay: 0, absent: 0, onLeave: 0, holidays: 0, weeklyOffs: 0, notMarked: 0, lateDays: 0, workMinutes: 0, overtimeMinutes: 0 };
  for (const c of cells) {
    if (c.status === "PRESENT") s.present++;
    else if (c.status === "HALF_DAY") s.halfDay++;
    else if (c.status === "ABSENT") s.absent++;
    else if (c.status === "ON_LEAVE") s.onLeave++;
    else if (c.status === "HOLIDAY") s.holidays++;
    else if (c.status === "WEEKLY_OFF") s.weeklyOffs++;
    else if (c.status === "NOT_MARKED") s.notMarked++;
    if (c.lateMinutes > 0) s.lateDays++;
    s.workMinutes += c.workMinutes;
    s.overtimeMinutes += c.overtimeMinutes;
  }
  return s;
}

/** Daily roll-call for employees in the actor's attendance scope. */
export async function teamDay(actor: Actor, key: string, filters: { departmentId?: string; q?: string } = {}) {
  assertPermission(actor, "attendance:read:all", "attendance:read:department", "attendance:read:team");
  const scope = await employeeScopeWhere(actor, "attendance");
  const where: Prisma.EmployeeWhereInput = {
    AND: [
      scope,
      { deletedAt: null, status: { notIn: ["EXITED"] }, dateOfJoining: { lte: dateKeyToDb(key) } },
      filters.departmentId ? { departmentId: filters.departmentId } : {},
      filters.q ? { OR: [{ firstName: { contains: filters.q, mode: "insensitive" } }, { lastName: { contains: filters.q, mode: "insensitive" } }, { employeeCode: { contains: filters.q, mode: "insensitive" } }] } : {},
    ],
  };
  const [emps, hol] = await Promise.all([
    db.employee.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        photoKey: true,
        department: { select: { name: true } },
        shift: { select: { weeklyOffs: true, name: true } },
        attendance: { where: { date: dateKeyToDb(key) }, take: 1 },
        leaveRequests: { where: { status: "APPROVED", startDate: { lte: dateKeyToDb(key) }, endDate: { gte: dateKeyToDb(key) } }, select: { halfDay: true, leaveType: { select: { name: true } } }, take: 1 },
      },
      orderBy: { firstName: "asc" },
      take: 500,
    }),
    db.holiday.findFirst({ where: { date: dateKeyToDb(key), type: "PUBLIC" } }),
  ]);
  const wd = new Date(`${key}T00:00:00Z`).getUTCDay();
  return emps.map((e) => {
    const rec = e.attendance[0];
    const leave = e.leaveRequests[0];
    let status: string = rec?.status ?? "NOT_MARKED";
    if (!rec) {
      if (leave && !leave.halfDay) status = "ON_LEAVE";
      else if (hol) status = "HOLIDAY";
      else if ((e.shift?.weeklyOffs ?? [0, 6]).includes(wd)) status = "WEEKLY_OFF";
    }
    return { employee: e, record: rec ?? null, status, leave: leave?.leaveType.name ?? null };
  });
}

/** Monthly summary rows (one per employee in scope) for reports and exports. */
export async function monthlyReport(actor: Actor, year: number, month: number, departmentId?: string) {
  assertPermission(actor, "attendance:read:all", "attendance:read:department", "attendance:read:team");
  const scope = await employeeScopeWhere(actor, "attendance");
  const { start, end } = monthRangeKeys(year, month);
  const emps = await db.employee.findMany({
    where: { AND: [scope, { deletedAt: null, dateOfJoining: { lte: dateKeyToDb(end) }, OR: [{ exitDate: null }, { exitDate: { gte: dateKeyToDb(start) } }] }, departmentId ? { departmentId } : {}] },
    select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } }, dateOfJoining: true, exitDate: true, shift: { select: { weeklyOffs: true } } },
    orderBy: { employeeCode: "asc" },
  });
  const ids = emps.map((e) => e.id);
  const [records, holidays, leaves] = await Promise.all([
    db.attendance.findMany({ where: { employeeId: { in: ids }, date: { gte: dateKeyToDb(start), lte: dateKeyToDb(end) } } }),
    holidayKeys(start, end),
    db.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", startDate: { lte: dateKeyToDb(end) }, endDate: { gte: dateKeyToDb(start) } } }),
  ]);
  const days = eachDayKey(start, end);
  const today = todayKey();
  return emps.map((e) => {
    const recs = records.filter((r) => r.employeeId === e.id);
    const byKey = new Map(recs.map((r) => [dbDateToKey(r.date), r]));
    const offs = e.shift?.weeklyOffs ?? [0, 6];
    let workingDays = 0, present = 0, halfDay = 0, absent = 0, onLeave = 0, late = 0, work = 0, ot = 0, unmarked = 0;
    for (const k of days) {
      if (k < dbDateToKey(e.dateOfJoining) || (e.exitDate && k > dbDateToKey(e.exitDate))) continue;
      const working = isWorkingDay(k, offs, holidays);
      if (working) workingDays++;
      const r = byKey.get(k);
      const lv = leaves.find((l) => l.employeeId === e.id && dbDateToKey(l.startDate) <= k && dbDateToKey(l.endDate) >= k);
      if (r) {
        if (r.status === "PRESENT") present++;
        else if (r.status === "HALF_DAY") halfDay++;
        else if (r.status === "ABSENT") absent++;
        else if (r.status === "ON_LEAVE") onLeave++;
        if (r.lateMinutes > 0) late++;
        work += r.workMinutes;
        ot += r.overtimeMinutes;
      } else if (lv && working) onLeave += lv.halfDay ? 0.5 : 1;
      else if (working && k < today) unmarked++;
    }
    return {
      employeeId: e.id,
      employeeCode: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`,
      department: e.department?.name ?? "",
      workingDays,
      present,
      halfDay,
      absent,
      onLeave,
      unmarked,
      lateDays: late,
      workHours: Math.round((work / 60) * 10) / 10,
      overtimeHours: Math.round((ot / 60) * 10) / 10,
    };
  });
}

// ─── Corrections ────────────────────────────────────────────────────────────

export async function requestCorrection(actor: Actor, input: { date: string; checkIn: string; checkOut: string; reason: string }) {
  const employeeId = assertEmployee(actor);
  const tz = appTimezone();
  if (input.date > todayKey()) throw new ValidationError("You cannot correct a future date.", { date: ["Future dates are not allowed"] });
  const ageDays = (Date.parse(todayKey()) - Date.parse(input.date)) / 86400000;
  if (ageDays > 45) throw new ValidationError("Corrections are allowed for the last 45 days only.", { date: ["Too old"] });
  const inAt = zonedToUtc(input.date, input.checkIn, tz);
  let outAt = zonedToUtc(input.date, input.checkOut, tz);
  if (outAt <= inAt) outAt = new Date(outAt.getTime() + 24 * 3600_000); // overnight
  if (outAt.getTime() - inAt.getTime() > 16 * 3600_000) throw new ValidationError("Shift cannot exceed 16 hours.", { checkOut: ["Too long"] });
  const dup = await db.attendanceCorrection.findFirst({ where: { employeeId, date: dateKeyToDb(input.date), status: "PENDING" } });
  if (dup) throw new ConflictError("A correction for this date is already pending.");
  const existing = await db.attendance.findUnique({ where: { employeeId_date: { employeeId, date: dateKeyToDb(input.date) } } });
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { managerId: true } });
  const c = await db.$transaction(async (tx) => {
    const c = await tx.attendanceCorrection.create({
      data: { employeeId, attendanceId: existing?.id, date: dateKeyToDb(input.date), requestedCheckIn: inAt, requestedCheckOut: outAt, reason: input.reason },
    });
    await writeAudit(tx, actor, { action: "attendance.correction_request", entityType: "AttendanceCorrection", entityId: c.id, summary: `For ${input.date}` });
    return c;
  });
  if (emp.managerId) {
    await notifyEmployees([emp.managerId], { type: "attendance.correction", title: "Attendance correction request", body: `${actor.name} requested a correction for ${input.date}.`, link: "/approvals?tab=attendance" }, { email: true });
  } else {
    await notifyUsers(await usersWithPermission("attendance:read:all"), { type: "attendance.correction", title: "Attendance correction request", body: `${actor.name} requested a correction for ${input.date}.`, link: "/approvals?tab=attendance" });
  }
  return c;
}

export async function pendingCorrections(actor: Actor) {
  assertPermission(actor, "attendance:approve");
  const scope = await employeeScopeWhere(actor, "attendance");
  return db.attendanceCorrection.findMany({
    where: { status: "PENDING", employee: { AND: [scope, { id: { not: actor.employeeId ?? "" } }] } },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } }, attendance: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function decideCorrection(actor: Actor, input: { id: string; approve: boolean; comment?: string }) {
  assertPermission(actor, "attendance:approve");
  const c = await db.attendanceCorrection.findUnique({ where: { id: input.id } });
  if (!c) throw new NotFoundError("Correction");
  if (c.employeeId === actor.employeeId) throw new ForbiddenError("You cannot approve your own correction.");
  if (!(await canAccessEmployee(actor, "attendance", c.employeeId))) throw new ForbiddenError();
  if (!input.approve && !input.comment) throw new ValidationError("Provide a reason for rejection.", { comment: ["Required"] });
  const tz = appTimezone();
  await db.$transaction(async (tx) => {
    const updated = await tx.attendanceCorrection.updateMany({
      where: { id: c.id, status: "PENDING" },
      data: { status: input.approve ? "APPROVED" : "REJECTED", reviewerId: actor.employeeId, reviewedAt: new Date(), reviewComment: input.comment ?? null },
    });
    if (updated.count !== 1) throw new ConflictError("This request has already been processed.");
    if (input.approve) {
      const key = dbDateToKey(c.date);
      const shift = await shiftFor(tx, c.employeeId);
      const m = computeAttendanceMetrics(key, c.requestedCheckIn, c.requestedCheckOut, shift, tz);
      const data = { checkInAt: c.requestedCheckIn, checkOutAt: c.requestedCheckOut, shiftId: shift.id, ...m, source: "CORRECTION" as const, remarks: `Corrected: ${c.reason}`.slice(0, 500) };
      const rec = await tx.attendance.upsert({
        where: { employeeId_date: { employeeId: c.employeeId, date: c.date } },
        update: data,
        create: { employeeId: c.employeeId, date: c.date, ...data },
      });
      await tx.attendanceCorrection.update({ where: { id: c.id }, data: { attendanceId: rec.id } });
    }
    await writeAudit(tx, actor, { action: input.approve ? "attendance.correction_approve" : "attendance.correction_reject", entityType: "AttendanceCorrection", entityId: c.id, summary: dbDateToKey(c.date) });
  });
  await notifyEmployees([c.employeeId], { type: "attendance.correction_decided", title: `Attendance correction ${input.approve ? "approved" : "rejected"}`, body: `${dbDateToKey(c.date)}${input.comment ? `: ${input.comment}` : ""}`, link: "/attendance" }, { email: true });
}

export async function cancelCorrection(actor: Actor, id: string) {
  const c = await db.attendanceCorrection.findUnique({ where: { id } });
  if (!c || c.employeeId !== actor.employeeId) throw new NotFoundError("Correction");
  const res = await db.attendanceCorrection.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (res.count !== 1) throw new ConflictError("Only pending requests can be cancelled.");
}

/** HR direct edit of a day's attendance (attendance:manage). */
export async function adminSetAttendance(actor: Actor, input: { employeeId: string; date: string; status: AttendanceStatus; checkIn?: string; checkOut?: string; remarks: string }) {
  assertPermission(actor, "attendance:manage");
  const tz = appTimezone();
  const shift = await shiftFor(db, input.employeeId);
  let data: Prisma.AttendanceUncheckedUpdateInput = { status: input.status, checkInAt: null, checkOutAt: null, workMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
  if (input.checkIn && input.checkOut) {
    const inAt = zonedToUtc(input.date, input.checkIn, tz);
    let outAt = zonedToUtc(input.date, input.checkOut, tz);
    if (outAt <= inAt) outAt = new Date(outAt.getTime() + 24 * 3600_000);
    const m = computeAttendanceMetrics(input.date, inAt, outAt, shift, tz);
    data = { ...m, checkInAt: inAt, checkOutAt: outAt, status: input.status === "PRESENT" || input.status === "HALF_DAY" ? m.status : input.status };
  }
  await db.$transaction(async (tx) => {
    const before = await tx.attendance.findUnique({ where: { employeeId_date: { employeeId: input.employeeId, date: dateKeyToDb(input.date) } } });
    const rec = await tx.attendance.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date: dateKeyToDb(input.date) } },
      update: { ...data, source: "ADMIN", remarks: input.remarks, shiftId: shift.id },
      create: { ...(data as Omit<Prisma.AttendanceUncheckedCreateInput, "employeeId" | "date">), employeeId: input.employeeId, date: dateKeyToDb(input.date), source: "ADMIN", remarks: input.remarks, shiftId: shift.id },
    });
    await writeAudit(tx, actor, { action: "attendance.admin_edit", entityType: "Attendance", entityId: rec.id, summary: `${input.date}: ${input.remarks}`, before, after: data });
  });
}

/**
 * Daily job: for the given day, mark ON_LEAVE for full-day approved leave and
 * ABSENT for active employees with no attendance on a working day. Idempotent.
 */
export async function markAbsentees(dayKey: string) {
  const holidays = await holidayKeys(dayKey, dayKey);
  const emps = await db.employee.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "ONBOARDING", "ON_NOTICE"] }, dateOfJoining: { lte: dateKeyToDb(dayKey) }, OR: [{ exitDate: null }, { exitDate: { gte: dateKeyToDb(dayKey) } }] },
    select: { id: true, shiftId: true, shift: { select: { weeklyOffs: true } }, attendance: { where: { date: dateKeyToDb(dayKey) }, select: { id: true } } },
  });
  const def = await db.shift.findFirst({ where: { isDefault: true, deletedAt: null } });
  const leaves = await db.leaveRequest.findMany({ where: { status: "APPROVED", startDate: { lte: dateKeyToDb(dayKey) }, endDate: { gte: dateKeyToDb(dayKey) } }, select: { employeeId: true, halfDay: true } });
  const onLeave = new Map(leaves.map((l) => [l.employeeId, l.halfDay]));
  const rows: Prisma.AttendanceCreateManyInput[] = [];
  for (const e of emps) {
    if (e.attendance.length) continue;
    const offs = e.shift?.weeklyOffs ?? def?.weeklyOffs ?? [0, 6];
    if (!isWorkingDay(dayKey, offs, holidays)) continue;
    const half = onLeave.get(e.id);
    if (half === null) rows.push({ employeeId: e.id, date: dateKeyToDb(dayKey), status: "ON_LEAVE", source: "SYSTEM", shiftId: e.shiftId });
    else rows.push({ employeeId: e.id, date: dateKeyToDb(dayKey), status: half ? "HALF_DAY" : "ABSENT", source: "SYSTEM", shiftId: e.shiftId, remarks: half ? "Half-day leave, no attendance" : "No attendance recorded" });
  }
  if (rows.length) await db.attendance.createMany({ data: rows, skipDuplicates: true });
  return { marked: rows.length };
}

// ─── Shifts & holidays ───────────────────────────────────────────────────────

export async function saveShift(actor: Actor, input: { id?: string; name: string; startTime: string; endTime: string; graceMinutes: number; fullDayMinutes: number; halfDayMinutes: number; weeklyOffs: number[]; isDefault: boolean }) {
  assertPermission(actor, "attendance:manage");
  if (input.halfDayMinutes > input.fullDayMinutes) throw new ValidationError("Half-day minutes cannot exceed full-day minutes.", { halfDayMinutes: ["Must be ≤ full day"] });
  return db.$transaction(async (tx) => {
    if (input.isDefault) await tx.shift.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const { id, ...data } = input;
    const s = id ? await tx.shift.update({ where: { id }, data }) : await tx.shift.create({ data });
    await writeAudit(tx, actor, { action: id ? "shift.update" : "shift.create", entityType: "Shift", entityId: s.id, after: data });
    return s;
  });
}

export async function deleteShift(actor: Actor, id: string) {
  assertPermission(actor, "attendance:manage");
  const s = await db.shift.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { employees: { where: { deletedAt: null } } } } } });
  if (!s) throw new NotFoundError("Shift");
  if (s._count.employees > 0) throw new ConflictError("Reassign employees on this shift first.");
  if (s.isDefault) throw new ConflictError("Choose another default shift first.");
  await db.$transaction(async (tx) => {
    await tx.shift.update({ where: { id }, data: { deletedAt: new Date(), name: `${s.name} (deleted ${Date.now()})` } });
    await writeAudit(tx, actor, { action: "shift.delete", entityType: "Shift", entityId: id, summary: s.name });
  });
}

export async function saveHoliday(actor: Actor, input: { id?: string; name: string; date: string; type: "PUBLIC" | "OPTIONAL" | "RESTRICTED"; location?: string }) {
  assertPermission(actor, "attendance:manage");
  return db.$transaction(async (tx) => {
    const data = { name: input.name, date: dateKeyToDb(input.date), type: input.type, location: input.location ?? null };
    const h = input.id ? await tx.holiday.update({ where: { id: input.id }, data }) : await tx.holiday.create({ data });
    await writeAudit(tx, actor, { action: input.id ? "holiday.update" : "holiday.create", entityType: "Holiday", entityId: h.id, summary: `${input.date} ${input.name}` });
    return h;
  });
}

export async function deleteHoliday(actor: Actor, id: string) {
  assertPermission(actor, "attendance:manage");
  await db.$transaction(async (tx) => {
    const h = await tx.holiday.delete({ where: { id } });
    await writeAudit(tx, actor, { action: "holiday.delete", entityType: "Holiday", entityId: id, summary: `${dbDateToKey(h.date)} ${h.name}` });
  });
}
