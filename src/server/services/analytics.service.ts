import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/action";
import { assertPermission, employeeScopeWhere } from "@/lib/auth/rbac";
import { dateKeyToDb, dbDateToKey, eachDayKey } from "@/lib/dates";
import { toNumber } from "@/lib/utils";
import { headcountTrend } from "./dashboard.service";

export interface AnalyticsFilters {
  from: string;
  to: string;
  departmentId?: string;
}

export async function hrAnalytics(actor: Actor, f: AnalyticsFilters) {
  assertPermission(actor, "report:read");
  const scope = await employeeScopeWhere(actor, "employee");
  const emp: Prisma.EmployeeWhereInput = {
    AND: [scope, { deletedAt: null }, f.departmentId ? { departmentId: f.departmentId } : {}],
  };
  const from = dateKeyToDb(f.from);
  const to = dateKeyToDb(f.to);

  const [employees, depts, attendance, leave, leaveTypes, candidates, exitsList] =
    await Promise.all([
      db.employee.findMany({
        where: emp,
        select: {
          id: true,
          departmentId: true,
          status: true,
          dateOfJoining: true,
          exitDate: true,
          gender: true,
          employmentType: true,
        },
      }),
      db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
      db.attendance.groupBy({
        by: ["status"],
        where: { date: { gte: from, lte: to }, employee: emp },
        _count: true,
      }),
      db.leaveRequest.findMany({
        where: {
          status: "APPROVED",
          startDate: { lte: to },
          endDate: { gte: from },
          employee: emp,
        },
        select: { days: true, leaveTypeId: true, employee: { select: { departmentId: true } } },
      }),
      db.leaveType.findMany({ select: { id: true, name: true } }),
      db.candidate.groupBy({
        by: ["stage"],
        where: {
          deletedAt: null,
          createdAt: { gte: from, lte: new Date(to.getTime() + 86400000) },
        },
        _count: true,
      }),
      db.employee.findMany({
        where: { AND: [emp, { status: "EXITED", exitDate: { gte: from, lte: to } }] },
        select: { exitReason: true, departmentId: true },
      }),
    ]);
  const deptName = Object.fromEntries(depts.map((d) => [d.id, d.name]));
  const typeName = Object.fromEntries(leaveTypes.map((t) => [t.id, t.name]));

  const activeAt = (key: string) =>
    employees.filter(
      (e) =>
        dbDateToKey(e.dateOfJoining) <= key &&
        (!e.exitDate || e.status !== "EXITED" || dbDateToKey(e.exitDate) > key),
    ).length;
  const startHc = activeAt(f.from);
  const endHc = activeAt(f.to);
  const avgHc = (startHc + endHc) / 2 || 1;
  const exits = exitsList.length;
  const joiners = employees.filter(
    (e) => dbDateToKey(e.dateOfJoining) >= f.from && dbDateToKey(e.dateOfJoining) <= f.to,
  ).length;
  const periodDays = eachDayKey(f.from, f.to).length;
  const turnoverRate = Math.round((exits / avgHc) * 1000) / 10;
  const annualizedTurnover = Math.round((exits / avgHc) * (365 / periodDays) * 1000) / 10;

  const att = Object.fromEntries(attendance.map((a) => [a.status, a._count]));
  const presentLike = (att.PRESENT ?? 0) + (att.HALF_DAY ?? 0) * 0.5;
  const workdayRecords = (att.PRESENT ?? 0) + (att.HALF_DAY ?? 0) + (att.ABSENT ?? 0);
  const attendanceRate = workdayRecords
    ? Math.round((presentLike / workdayRecords) * 1000) / 10
    : null;

  const leaveByType = new Map<string, number>();
  const leaveByDept = new Map<string, number>();
  for (const l of leave) {
    leaveByType.set(
      typeName[l.leaveTypeId] ?? "Other",
      (leaveByType.get(typeName[l.leaveTypeId] ?? "Other") ?? 0) + toNumber(l.days),
    );
    const d = l.employee.departmentId
      ? (deptName[l.employee.departmentId] ?? "Other")
      : "Unassigned";
    leaveByDept.set(d, (leaveByDept.get(d) ?? 0) + toNumber(l.days));
  }

  const current = employees.filter((e) => e.status !== "EXITED");
  const tenureBuckets = { "< 1 yr": 0, "1–3 yrs": 0, "3–5 yrs": 0, "5+ yrs": 0 };
  const now = Date.now();
  for (const e of current) {
    const yrs = (now - e.dateOfJoining.getTime()) / (365.25 * 86400000);
    tenureBuckets[yrs < 1 ? "< 1 yr" : yrs < 3 ? "1–3 yrs" : yrs < 5 ? "3–5 yrs" : "5+ yrs"]++;
  }
  const count = <K extends string>(arr: K[]) => {
    const m = new Map<string, number>();
    for (const k of arr) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  };

  const byDeptHeadcount = count(
    current.map((e) => (e.departmentId ? (deptName[e.departmentId] ?? "Other") : "Unassigned")),
  );
  const deptTurnover = byDeptHeadcount.map((d) => {
    const ex = exitsList.filter(
      (x) => (x.departmentId ? deptName[x.departmentId] : "Unassigned") === d.name,
    ).length;
    return {
      name: d.name,
      headcount: d.value,
      exits: ex,
      turnover: d.value ? Math.round((ex / (d.value + ex)) * 1000) / 10 : 0,
    };
  });

  return {
    summary: {
      headcount: endHc,
      startHeadcount: startHc,
      joiners,
      exits,
      turnoverRate,
      annualizedTurnover,
      attendanceRate,
      leaveDays: leave.reduce((s, l) => s + toNumber(l.days), 0),
      absences: att.ABSENT ?? 0,
    },
    byDepartment: byDeptHeadcount,
    deptTurnover,
    byEmploymentType: count(current.map((e) => e.employmentType)),
    byGender: count(current.map((e) => e.gender)),
    tenure: Object.entries(tenureBuckets).map(([name, value]) => ({ name, value })),
    leaveByType: [...leaveByType.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    leaveByDept: [...leaveByDept.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    attendanceMix: Object.entries(att).map(([name, value]) => ({ name, value })),
    recruitment: candidates.map((c) => ({ name: c.stage, value: c._count })),
    exitReasons: count(exitsList.map((e) => (e.exitReason ?? "Not recorded").slice(0, 40))),
    trend: await headcountTrend(actor, 12, f.departmentId),
  };
}
