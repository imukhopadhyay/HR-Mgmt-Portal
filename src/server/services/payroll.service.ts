import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertPermission } from "@/lib/auth/rbac";
import { isWorkingDay } from "@/lib/attendance-rules";
import { dateKeyToDb, dbDateToKey, eachDayKey, monthRangeKeys, todayKey } from "@/lib/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { notifyEmployees } from "@/lib/notifications";
import { calculatePayroll, type StructureLine } from "@/lib/payroll-engine";
import { round2, toNumber } from "@/lib/utils";
import { getStatutoryConfig } from "./settings.service";

// ─── Salary structures ───────────────────────────────────────────────────────

export async function salaryComponents() {
  return db.salaryComponent.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
}

export async function structuresFor(actor: Actor, employeeId: string) {
  if (!actor.permissions.has("payroll:read") && actor.employeeId !== employeeId)
    throw new ForbiddenError();
  return db.salaryStructure.findMany({
    where: { employeeId },
    include: {
      lines: { include: { component: true }, orderBy: { component: { sortOrder: "asc" } } },
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

export interface StructureInput {
  employeeId: string;
  effectiveFrom: string;
  annualCtc: number;
  pfOptedOut: boolean;
  notes?: string;
  lines: { componentId: string; value: number }[];
}

export async function saveSalaryStructure(actor: Actor, input: StructureInput) {
  assertPermission(actor, "payroll:manage");
  if (input.employeeId === actor.employeeId)
    throw new ForbiddenError("You cannot change your own salary structure.");
  const comps = await db.salaryComponent.findMany({
    where: { id: { in: input.lines.map((l) => l.componentId) } },
  });
  if (comps.length !== new Set(input.lines.map((l) => l.componentId)).size)
    throw new ValidationError("Invalid salary component.");
  if (!comps.some((c) => c.code === "BASIC"))
    throw new ValidationError("A structure must include Basic Salary.", { lines: ["Add BASIC"] });
  for (const l of input.lines) {
    const c = comps.find((x) => x.id === l.componentId)!;
    if (c.calcType !== "FIXED" && l.value > 100)
      throw new ValidationError(`${c.name} is a percentage and cannot exceed 100.`, {
        lines: [`${c.code} > 100%`],
      });
  }
  // Sanity check: monthly earnings should not exceed monthly CTC.
  const preview = calculatePayroll({
    annualCtc: input.annualCtc,
    lines: input.lines.map((l) => {
      const c = comps.find((x) => x.id === l.componentId)!;
      return {
        code: c.code,
        name: c.name,
        type: c.type,
        calcType: c.calcType,
        value: l.value,
        isTaxable: c.isTaxable,
      };
    }),
    daysInMonth: 30,
    employedDays: 30,
    lopDays: 0,
    config: await getStatutoryConfig(),
  });
  const employerCost =
    preview.gross + preview.employerContributions.reduce((s, e) => s + e.amount, 0);
  if (employerCost > input.annualCtc / 12 + 1) {
    throw new ValidationError(
      `Monthly gross + employer contributions (₹${employerCost}) exceed monthly CTC (₹${round2(input.annualCtc / 12)}). Reduce the components.`,
      { annualCtc: ["Components exceed CTC"] },
    );
  }
  return db.$transaction(async (tx) => {
    const emp = await tx.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } });
    if (!emp) throw new NotFoundError("Employee");
    const clash = await tx.salaryStructure.findFirst({
      where: { employeeId: input.employeeId, effectiveFrom: dateKeyToDb(input.effectiveFrom) },
    });
    if (clash) throw new ConflictError("A structure already starts on this date.");
    const prev = await tx.salaryStructure.findFirst({
      where: {
        employeeId: input.employeeId,
        effectiveFrom: { lt: dateKeyToDb(input.effectiveFrom) },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: dateKeyToDb(input.effectiveFrom) } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (prev) {
      const d = dateKeyToDb(input.effectiveFrom);
      d.setUTCDate(d.getUTCDate() - 1);
      await tx.salaryStructure.update({ where: { id: prev.id }, data: { effectiveTo: d } });
    }
    const s = await tx.salaryStructure.create({
      data: {
        employeeId: input.employeeId,
        effectiveFrom: dateKeyToDb(input.effectiveFrom),
        annualCtc: input.annualCtc,
        pfOptedOut: input.pfOptedOut,
        notes: input.notes ?? null,
        createdById: actor.id,
        lines: { create: input.lines.map((l) => ({ componentId: l.componentId, value: l.value })) },
      },
    });
    await writeAudit(tx, actor, {
      action: "salary_structure.create",
      entityType: "SalaryStructure",
      entityId: s.id,
      summary: `New structure for ${emp.employeeCode} effective ${input.effectiveFrom}${prev ? ` (previous CTC ${toNumber(prev.annualCtc)})` : ""}`,
    });
    return s;
  });
}

// ─── Payroll runs ────────────────────────────────────────────────────────────

export async function listRuns() {
  return db.payrollRun.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], take: 36 });
}

export async function createRun(actor: Actor, year: number, month: number) {
  assertPermission(actor, "payroll:manage");
  const { end } = monthRangeKeys(year, month);
  if (`${year}-${String(month).padStart(2, "0")}` > todayKey().slice(0, 7))
    throw new ValidationError("Payroll cannot be created for a future month.");
  void end;
  return db.$transaction(async (tx) => {
    const exists = await tx.payrollRun.findUnique({ where: { year_month: { year, month } } });
    if (exists && exists.status !== "CANCELLED")
      throw new ConflictError("A payroll run already exists for this month.");
    const run = exists
      ? await tx.payrollRun.update({
          where: { id: exists.id },
          data: {
            status: "DRAFT",
            processedAt: null,
            processedById: null,
            approvedAt: null,
            approvedById: null,
          },
        })
      : await tx.payrollRun.create({ data: { year, month } });
    await writeAudit(tx, actor, {
      action: "payroll.run_create",
      entityType: "PayrollRun",
      entityId: run.id,
      summary: `${year}-${month}`,
    });
    return run;
  });
}

interface LopBreakdown {
  unpaidLeave: number;
  absent: number;
  halfDays: number;
  total: number;
}

/**
 * LOP for a month = approved unpaid-leave working days + ABSENT days +
 * 0.5 × HALF_DAY attendance not covered by a paid half-day leave.
 */
export async function computeLop(
  employeeId: string,
  startKey: string,
  endKey: string,
  weeklyOffs: number[],
  holidays: ReadonlySet<string>,
): Promise<LopBreakdown> {
  const [unpaid, paidHalf, att] = await Promise.all([
    db.leaveRequest.findMany({
      where: {
        employeeId,
        status: "APPROVED",
        leaveType: { isPaid: false },
        startDate: { lte: dateKeyToDb(endKey) },
        endDate: { gte: dateKeyToDb(startKey) },
      },
    }),
    db.leaveRequest.findMany({
      where: {
        employeeId,
        status: "APPROVED",
        leaveType: { isPaid: true },
        halfDay: { not: null },
        startDate: { gte: dateKeyToDb(startKey), lte: dateKeyToDb(endKey) },
      },
      select: { startDate: true },
    }),
    db.attendance.findMany({
      where: {
        employeeId,
        date: { gte: dateKeyToDb(startKey), lte: dateKeyToDb(endKey) },
        status: { in: ["ABSENT", "HALF_DAY"] },
      },
      select: { date: true, status: true },
    }),
  ]);
  let unpaidLeave = 0;
  const unpaidDays = new Set<string>();
  for (const l of unpaid) {
    const s = dbDateToKey(l.startDate) < startKey ? startKey : dbDateToKey(l.startDate);
    const e = dbDateToKey(l.endDate) > endKey ? endKey : dbDateToKey(l.endDate);
    for (const k of eachDayKey(s, e)) {
      if (isWorkingDay(k, weeklyOffs, holidays)) {
        unpaidLeave += l.halfDay ? 0.5 : 1;
        unpaidDays.add(k);
      }
    }
  }
  const paidHalfDays = new Set(paidHalf.map((p) => dbDateToKey(p.startDate)));
  let absent = 0;
  let halfDays = 0;
  for (const a of att) {
    const k = dbDateToKey(a.date);
    if (unpaidDays.has(k)) continue; // already counted as unpaid leave
    if (a.status === "ABSENT") absent++;
    else if (!paidHalfDays.has(k)) halfDays += 0.5;
  }
  return { unpaidLeave, absent, halfDays, total: unpaidLeave + absent + halfDays };
}

export async function processRun(actor: Actor, runId: string) {
  assertPermission(actor, "payroll:manage");
  const run = await db.payrollRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError("Payroll run");
  if (!["DRAFT", "PROCESSED"].includes(run.status))
    throw new ConflictError(`A ${run.status.toLowerCase()} run cannot be reprocessed.`);
  const { start, end } = monthRangeKeys(run.year, run.month);
  const daysInMonth = Number(end.slice(8));
  const config = await getStatutoryConfig();
  const hols = await db.holiday.findMany({
    where: { date: { gte: dateKeyToDb(start), lte: dateKeyToDb(end) }, type: "PUBLIC" },
  });
  const holidays = new Set(hols.map((h) => dbDateToKey(h.date)));
  const defShift = await db.shift.findFirst({ where: { isDefault: true, deletedAt: null } });

  const employees = await db.employee.findMany({
    where: {
      deletedAt: null,
      dateOfJoining: { lte: dateKeyToDb(end) },
      OR: [{ exitDate: null }, { exitDate: { gte: dateKeyToDb(start) } }],
      salaryStructures: { some: { effectiveFrom: { lte: dateKeyToDb(end) } } },
    },
    include: {
      shift: { select: { weeklyOffs: true } },
      salaryStructures: {
        where: { effectiveFrom: { lte: dateKeyToDb(end) } },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        include: { lines: { include: { component: true } } },
      },
    },
  });

  const records: Prisma.PayrollRecordCreateManyInput[] = [];
  const skipped: string[] = [];
  for (const e of employees) {
    const s = e.salaryStructures[0];
    if (!s || toNumber(s.annualCtc) <= 0) {
      skipped.push(e.employeeCode);
      continue;
    }
    const joinKey = dbDateToKey(e.dateOfJoining);
    const exitKey = e.exitDate ? dbDateToKey(e.exitDate) : null;
    const from = joinKey > start ? joinKey : start;
    const to = exitKey && exitKey < end ? exitKey : end;
    const employedDays = eachDayKey(from, to).length;
    const lop = await computeLop(
      e.id,
      from,
      to,
      e.shift?.weeklyOffs ?? defShift?.weeklyOffs ?? [0, 6],
      holidays,
    );
    const lines: StructureLine[] = s.lines.map((l) => ({
      code: l.component.code,
      name: l.component.name,
      type: l.component.type,
      calcType: l.component.calcType,
      value: toNumber(l.value),
      isTaxable: l.component.isTaxable,
    }));
    const res = calculatePayroll({
      annualCtc: toNumber(s.annualCtc),
      lines,
      daysInMonth,
      employedDays,
      lopDays: lop.total,
      state: e.state,
      pfOptedOut: s.pfOptedOut,
      config,
    });
    records.push({
      payrollRunId: run.id,
      employeeId: e.id,
      workingDays: employedDays,
      paidDays: res.paidDays,
      lopDays: lop.total,
      grossEarnings: res.gross,
      totalDeductions: res.totalDeductions,
      netPay: res.net,
      earnings: res.earnings as unknown as Prisma.InputJsonValue,
      deductions: res.deductions as unknown as Prisma.InputJsonValue,
      employerContributions: res.employerContributions as unknown as Prisma.InputJsonValue,
    });
  }

  const totals = records.reduce(
    (t, r) => ({
      g: t.g + Number(r.grossEarnings),
      d: t.d + Number(r.totalDeductions),
      n: t.n + Number(r.netPay),
    }),
    { g: 0, d: 0, n: 0 },
  );
  await db.$transaction(
    async (tx) => {
      const claim = await tx.payrollRun.updateMany({
        where: { id: run.id, status: { in: ["DRAFT", "PROCESSED"] } },
        data: {
          status: "PROCESSED",
          processedById: actor.id,
          processedAt: new Date(),
          totalGross: totals.g,
          totalDeductions: totals.d,
          totalNet: totals.n,
          employeeCount: records.length,
        },
      });
      if (claim.count !== 1) throw new ConflictError("The run was modified concurrently.");
      await tx.payrollRecord.deleteMany({ where: { payrollRunId: run.id } });
      await tx.payrollRecord.createMany({ data: records });
      await writeAudit(tx, actor, {
        action: "payroll.process",
        entityType: "PayrollRun",
        entityId: run.id,
        summary: `${run.year}-${run.month}: ${records.length} employees, net ₹${round2(totals.n)}${skipped.length ? `; skipped ${skipped.join(", ")}` : ""}`,
      });
    },
    { timeout: 60_000 },
  );
  return { processed: records.length, skipped };
}

export async function approveRun(actor: Actor, runId: string) {
  assertPermission(actor, "payroll:approve");
  const run = await db.payrollRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError("Payroll run");
  if (run.status !== "PROCESSED") throw new ConflictError("Only processed runs can be approved.");
  if (run.processedById === actor.id)
    throw new ForbiddenError(
      "Segregation of duties: the approver must be different from the person who processed the run.",
    );
  await db.$transaction(async (tx) => {
    const claim = await tx.payrollRun.updateMany({
      where: { id: runId, status: "PROCESSED" },
      data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() },
    });
    if (claim.count !== 1) throw new ConflictError("The run was modified concurrently.");
    await writeAudit(tx, actor, {
      action: "payroll.approve",
      entityType: "PayrollRun",
      entityId: runId,
      summary: `${run.year}-${run.month}`,
    });
  });
  const recs = await db.payrollRecord.findMany({
    where: { payrollRunId: runId },
    select: { employeeId: true },
  });
  const label = new Date(Date.UTC(run.year, run.month - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  await notifyEmployees(
    recs.map((r) => r.employeeId),
    {
      type: "payroll.payslip",
      title: `Payslip for ${label} is available`,
      body: "Your payslip has been published. Open it from the Payslips page.",
      link: "/payslips",
    },
    { email: true },
  );
}

export async function setRunStatus(
  actor: Actor,
  runId: string,
  status: "PAID" | "CANCELLED" | "DRAFT",
) {
  assertPermission(actor, "payroll:manage");
  const run = await db.payrollRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError("Payroll run");
  const allowed: Record<string, string[]> = {
    PAID: ["APPROVED"],
    CANCELLED: ["DRAFT", "PROCESSED"],
    DRAFT: ["PROCESSED"],
  };
  if (!allowed[status].includes(run.status))
    throw new ConflictError(
      `Cannot move a ${run.status.toLowerCase()} run to ${status.toLowerCase()}.`,
    );
  await db.$transaction(async (tx) => {
    await tx.payrollRun.update({
      where: { id: runId },
      data: { status, ...(status === "PAID" ? { paidAt: new Date() } : {}) },
    });
    if (status === "CANCELLED" || status === "DRAFT")
      await tx.payrollRecord.deleteMany({ where: { payrollRunId: runId } });
    await writeAudit(tx, actor, {
      action: `payroll.${status.toLowerCase()}`,
      entityType: "PayrollRun",
      entityId: runId,
      summary: `${run.year}-${run.month}`,
    });
  });
}

export async function runDetail(actor: Actor, runId: string) {
  assertPermission(actor, "payroll:read");
  const run = await db.payrollRun.findUnique({
    where: { id: runId },
    include: {
      records: {
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { employee: { employeeCode: "asc" } },
      },
    },
  });
  if (!run) throw new NotFoundError("Payroll run");
  const users = await db.user.findMany({
    where: { id: { in: [run.processedById, run.approvedById].filter((x): x is string => !!x) } },
    select: { id: true, email: true },
  });
  return { run, users: Object.fromEntries(users.map((u) => [u.id, u.email])) };
}

/** Payslip data with authorization: own payslips once approved, or payroll readers. */
export async function getPayslip(actor: Actor, recordId: string) {
  const rec = await db.payrollRecord.findUnique({
    where: { id: recordId },
    include: {
      payrollRun: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          dateOfJoining: true,
          workLocation: true,
          department: { select: { name: true } },
          designation: { select: { title: true } },
          financialInfo: {
            select: { panNumber: true, uanNumber: true, bankName: true, bankAccountNumber: true },
          },
        },
      },
    },
  });
  if (!rec) throw new NotFoundError("Payslip");
  const own = rec.employeeId === actor.employeeId;
  if (!own && !actor.permissions.has("payroll:read")) throw new ForbiddenError();
  if (
    own &&
    !actor.permissions.has("payroll:read") &&
    !["APPROVED", "PAID"].includes(rec.payrollRun.status)
  )
    throw new ForbiddenError("This payslip has not been published yet.");
  return rec;
}

export async function myPayslips(employeeId: string) {
  return db.payrollRecord.findMany({
    where: { employeeId, payrollRun: { status: { in: ["APPROVED", "PAID"] } } },
    include: { payrollRun: { select: { year: true, month: true, status: true } } },
    orderBy: [{ payrollRun: { year: "desc" } }, { payrollRun: { month: "desc" } }],
  });
}

export function mask(value: string | null | undefined, visible = 4) {
  if (!value) return "—";
  return value.length <= visible
    ? value
    : `${"•".repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;
}
