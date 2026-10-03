import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/action";
import { employeeScopeWhere } from "@/lib/auth/rbac";
import { addDaysKey, dateKeyToDb, dbDateToKey, eachDayKey, todayKey } from "@/lib/dates";
import { approvalQueue, balancesFor } from "./leave.service";
import { pendingCorrections } from "./attendance.service";

export interface DashboardFilters {
  from: string;
  to: string;
  departmentId?: string;
}

export async function personalSnapshot(actor: Actor) {
  if (!actor.employeeId) return null;
  const today = todayKey();
  const year = Number(today.slice(0, 4));
  const [attendance, balances, pending, nextLeave] = await Promise.all([
    db.attendance.findUnique({ where: { employeeId_date: { employeeId: actor.employeeId, date: dateKeyToDb(today) } } }),
    balancesFor(actor.employeeId, year),
    db.leaveRequest.count({ where: { employeeId: actor.employeeId, status: { in: ["PENDING", "MODIFICATION_REQUESTED"] } } }),
    db.leaveRequest.findFirst({ where: { employeeId: actor.employeeId, status: "APPROVED", startDate: { gte: dateKeyToDb(today) } }, orderBy: { startDate: "asc" }, include: { leaveType: { select: { name: true } } } }),
  ]);
  return { attendance, balances, pending, nextLeave };
}

export async function upcomingHolidays(limit = 4) {
  return db.holiday.findMany({ where: { date: { gte: dateKeyToDb(todayKey()) } }, orderBy: { date: "asc" }, take: limit });
}

export async function activeAnnouncements(actor: Actor, limit = 5) {
  const now = new Date();
  return db.announcement.findMany({
    where: {
      deletedAt: null,
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      AND: [{ OR: [{ departmentId: null }, ...(actor.departmentId ? [{ departmentId: actor.departmentId }] : []), ...(actor.permissions.has("announcement:manage") ? [{ departmentId: { not: null } }] : [])] }],
    },
    include: { author: { select: { employee: { select: { firstName: true, lastName: true } } } }, department: { select: { name: true } } },
    orderBy: [{ priority: "desc" }, { publishedAt: "desc" }],
    take: limit,
  });
}

/** Approvals awaiting the actor + what their team looks like today. */
export async function managerSnapshot(actor: Actor) {
  const canLeave = actor.permissions.has("leave:approve");
  const canAtt = actor.permissions.has("attendance:approve");
  if (!canLeave && !canAtt) return null;
  const today = todayKey();
  const scope = await employeeScopeWhere(actor, "attendance");
  const teamWhere: Prisma.EmployeeWhereInput = { AND: [scope, { deletedAt: null, status: { not: "EXITED" }, id: { not: actor.employeeId ?? "" } }] };
  const [leaveQueue, corrections, teamSize, presentToday, onLeaveToday] = await Promise.all([
    canLeave ? approvalQueue(actor) : [],
    canAtt ? pendingCorrections(actor) : [],
    db.employee.count({ where: teamWhere }),
    db.attendance.count({ where: { date: dateKeyToDb(today), status: { in: ["PRESENT", "HALF_DAY"] }, employee: teamWhere } }),
    db.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: dateKeyToDb(today) }, endDate: { gte: dateKeyToDb(today) }, employee: teamWhere },
      include: { employee: { select: { id: true, firstName: true, lastName: true } }, leaveType: { select: { name: true } } },
    }),
  ]);
  return { pendingLeave: leaveQueue.length, pendingCorrections: corrections.length, teamSize, presentToday, onLeaveToday, oldestPending: leaveQueue.slice(0, 5) };
}

/** Organisation-wide figures for HR / leadership (scoped for department heads). */
export async function orgSnapshot(actor: Actor, f: DashboardFilters) {
  if (!actor.permissions.has("report:read") && !actor.permissions.has("employee:read:all")) return null;
  const scope = await employeeScopeWhere(actor, "employee");
  const base: Prisma.EmployeeWhereInput = { AND: [scope, { deletedAt: null }, f.departmentId ? { departmentId: f.departmentId } : {}] };
  const active: Prisma.EmployeeWhereInput = { AND: [base, { status: { not: "EXITED" } }] };
  const today = todayKey();
  const [headcount, byDept, byType, joiners, exits, attendanceToday, pendingLeave, pendingCorrections, attendanceTrend, onboarding, depts] = await Promise.all([
    db.employee.count({ where: active }),
    db.employee.groupBy({ by: ["departmentId"], where: active, _count: true }),
    db.employee.groupBy({ by: ["employmentType"], where: active, _count: true }),
    db.employee.count({ where: { AND: [base, { dateOfJoining: { gte: dateKeyToDb(f.from), lte: dateKeyToDb(f.to) } }] } }),
    db.employee.count({ where: { AND: [base, { status: "EXITED", exitDate: { gte: dateKeyToDb(f.from), lte: dateKeyToDb(f.to) } }] } }),
    db.attendance.groupBy({ by: ["status"], where: { date: dateKeyToDb(today), employee: active }, _count: true }),
    db.leaveRequest.count({ where: { status: "PENDING", employee: active } }),
    db.attendanceCorrection.count({ where: { status: "PENDING", employee: active } }),
    db.attendance.groupBy({ by: ["date", "status"], where: { date: { gte: dateKeyToDb(f.from), lte: dateKeyToDb(f.to) }, employee: active }, _count: true, orderBy: { date: "asc" } }),
    db.employee.count({ where: { AND: [active, { status: "ONBOARDING" }] } }),
    db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);
  const deptName = Object.fromEntries(depts.map((d) => [d.id, d.name]));
  const trendMap = new Map<string, { date: string; present: number; absent: number; leave: number }>();
  for (const k of eachDayKey(f.from, f.to)) trendMap.set(k, { date: k, present: 0, absent: 0, leave: 0 });
  for (const r of attendanceTrend) {
    const row = trendMap.get(dbDateToKey(r.date));
    if (!row) continue;
    if (r.status === "PRESENT" || r.status === "HALF_DAY") row.present += r._count;
    else if (r.status === "ABSENT") row.absent += r._count;
    else if (r.status === "ON_LEAVE") row.leave += r._count;
  }
  const status = Object.fromEntries(attendanceToday.map((a) => [a.status, a._count]));
  return {
    headcount,
    joiners,
    exits,
    onboarding,
    pendingLeave,
    pendingCorrections,
    today: { present: (status.PRESENT ?? 0) + (status.HALF_DAY ?? 0), absent: status.ABSENT ?? 0, onLeave: status.ON_LEAVE ?? 0 },
    byDepartment: byDept.map((d) => ({ name: d.departmentId ? (deptName[d.departmentId] ?? "Other") : "Unassigned", value: d._count })).sort((a, b) => b.value - a.value),
    byType: byType.map((t) => ({ name: t.employmentType, value: t._count })),
    attendanceTrend: [...trendMap.values()].filter((r) => {
      const wd = new Date(`${r.date}T00:00:00Z`).getUTCDay();
      return wd !== 0 && wd !== 6;
    }),
  };
}

/** Headcount at month ends for the last N months (from joining/exit dates). */
export async function headcountTrend(actor: Actor, months = 12, departmentId?: string) {
  const scope = await employeeScopeWhere(actor, "employee");
  const emps = await db.employee.findMany({
    where: { AND: [scope, { deletedAt: null }, departmentId ? { departmentId } : {}] },
    select: { dateOfJoining: true, exitDate: true, status: true },
  });
  const today = todayKey();
  const out: { month: string; headcount: number; joiners: number; exits: number }[] = [];
  const [y, m] = today.split("-").map(Number);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i + 1, 0)); // last day of month
    const endKey = dbDateToKey(d);
    const startKey = `${endKey.slice(0, 7)}-01`;
    let headcount = 0, joiners = 0, exits = 0;
    for (const e of emps) {
      const j = dbDateToKey(e.dateOfJoining);
      const x = e.exitDate && e.status === "EXITED" ? dbDateToKey(e.exitDate) : null;
      if (j <= endKey && (!x || x > endKey)) headcount++;
      if (j >= startKey && j <= endKey) joiners++;
      if (x && x >= startKey && x <= endKey) exits++;
    }
    out.push({ month: endKey.slice(0, 7), headcount, joiners, exits });
  }
  return out;
}

export async function recentActivity(actor: Actor, limit = 8) {
  if (!actor.permissions.has("audit:read") && !actor.permissions.has("employee:read:all")) return [];
  // Only business events (no auth noise), without before/after payloads.
  return db.auditLog.findMany({
    where: { action: { notIn: ["auth.login", "auth.logout", "auth.login_failed", "document.download", "attendance.check_in", "attendance.check_out"] } },
    select: { id: true, action: true, summary: true, createdAt: true, actor: { select: { email: true, employee: { select: { firstName: true, lastName: true } } } } },
    orderBy: { seq: "desc" },
    take: limit,
  });
}

export function defaultRange(): DashboardFilters {
  const to = todayKey();
  return { from: addDaysKey(to, -29), to };
}
