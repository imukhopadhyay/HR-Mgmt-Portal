import { db } from "@/lib/db";
import type { Row } from "@/lib/export";
import type { Actor } from "@/lib/action";
import { assertPermission } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";
import { toNumber } from "@/lib/utils";

type Line = { code: string; name: string; amount: number };
type Builder = (actor: Actor, q: URLSearchParams) => Promise<{ rows: Row[]; title: string }>;

async function runFor(actor: Actor, q: URLSearchParams) {
  assertPermission(actor, "payroll:read");
  const run = await db.payrollRun.findUnique({
    where: { id: q.get("runId") ?? "" },
    include: {
      records: {
        include: {
          employee: {
            select: {
              employeeCode: true,
              firstName: true,
              lastName: true,
              department: { select: { name: true, costCenter: true } },
              financialInfo: {
                select: {
                  bankAccountNumber: true,
                  bankIfsc: true,
                  bankName: true,
                  panNumber: true,
                  uanNumber: true,
                },
              },
            },
          },
        },
        orderBy: { employee: { employeeCode: "asc" } },
      },
    },
  });
  if (!run) throw new NotFoundError("Payroll run");
  return run;
}

/** Additional export builders (payroll, analytics). */
export const extraReports: Record<string, Builder> = {
  "payroll-register": async (actor, q) => {
    const run = await runFor(actor, q);
    const codes = new Set<string>();
    for (const r of run.records)
      for (const l of [
        ...(r.earnings as Line[]),
        ...(r.deductions as Line[]),
        ...(r.employerContributions as Line[]),
      ])
        codes.add(l.code);
    return {
      title: `Payroll register ${run.year}-${String(run.month).padStart(2, "0")}`,
      rows: run.records.map((r) => {
        const all = [
          ...(r.earnings as Line[]),
          ...(r.deductions as Line[]),
          ...(r.employerContributions as Line[]),
        ];
        const row: Row = {
          "Employee ID": r.employee.employeeCode,
          Name: `${r.employee.firstName} ${r.employee.lastName}`,
          Department: r.employee.department?.name ?? "",
          "Paid days": toNumber(r.paidDays),
          "LOP days": toNumber(r.lopDays),
        };
        for (const c of codes) row[c] = all.find((l) => l.code === c)?.amount ?? 0;
        row.Gross = toNumber(r.grossEarnings);
        row.Deductions = toNumber(r.totalDeductions);
        row["Net pay"] = toNumber(r.netPay);
        return row;
      }),
    };
  },
  "payroll-bank": async (actor, q) => {
    assertPermission(actor, "payroll:manage");
    const run = await runFor(actor, q);
    return {
      title: `Bank transfer ${run.year}-${String(run.month).padStart(2, "0")}`,
      rows: run.records.map((r) => ({
        "Employee ID": r.employee.employeeCode,
        "Beneficiary name": `${r.employee.firstName} ${r.employee.lastName}`,
        "Account number": r.employee.financialInfo?.bankAccountNumber ?? "MISSING",
        IFSC: r.employee.financialInfo?.bankIfsc ?? "MISSING",
        Bank: r.employee.financialInfo?.bankName ?? "",
        Amount: toNumber(r.netPay),
        Narration: `Salary ${run.year}-${String(run.month).padStart(2, "0")}`,
      })),
    };
  },
  "payroll-journal": async (actor, q) => {
    const run = await runFor(actor, q);
    // Accounting journal summary by cost centre and component.
    const agg = new Map<
      string,
      { costCenter: string; code: string; name: string; type: string; amount: number }
    >();
    for (const r of run.records) {
      const cc = r.employee.department?.costCenter ?? "UNASSIGNED";
      const add = (lines: Line[], type: string) => {
        for (const l of lines) {
          const k = `${cc}|${type}|${l.code}`;
          const cur = agg.get(k) ?? { costCenter: cc, code: l.code, name: l.name, type, amount: 0 };
          cur.amount += l.amount;
          agg.set(k, cur);
        }
      };
      add(r.earnings as Line[], "Expense (earning)");
      add(r.employerContributions as Line[], "Expense (employer contribution)");
      add(r.deductions as Line[], "Liability (deduction payable)");
      const net = agg.get(`${cc}|Liability|NET`) ?? {
        costCenter: cc,
        code: "NET",
        name: "Net salary payable",
        type: "Liability",
        amount: 0,
      };
      net.amount += toNumber(r.netPay);
      agg.set(`${cc}|Liability|NET`, net);
    }
    return {
      title: `Payroll journal ${run.year}-${String(run.month).padStart(2, "0")}`,
      rows: [...agg.values()]
        .sort((a, b) => a.costCenter.localeCompare(b.costCenter) || a.type.localeCompare(b.type))
        .map((a) => ({
          "Cost centre": a.costCenter,
          Type: a.type,
          Code: a.code,
          Component: a.name,
          Amount: Math.round(a.amount * 100) / 100,
        })),
    };
  },
};

extraReports["hr-analytics"] = async (actor, q) => {
  const { hrAnalytics } = await import("./analytics.service");
  const { addDaysKey, todayKey } = await import("@/lib/dates");
  const to = q.get("to") || todayKey();
  const from = q.get("from") || addDaysKey(to, -89);
  const a = await hrAnalytics(actor, {
    from,
    to,
    departmentId: q.get("departmentId") || undefined,
  });
  const rows: Row[] = [
    { Section: "Summary", Metric: "Headcount (end)", Value: a.summary.headcount },
    { Section: "Summary", Metric: "Headcount (start)", Value: a.summary.startHeadcount },
    { Section: "Summary", Metric: "Joiners", Value: a.summary.joiners },
    { Section: "Summary", Metric: "Exits", Value: a.summary.exits },
    { Section: "Summary", Metric: "Turnover % (period)", Value: a.summary.turnoverRate },
    { Section: "Summary", Metric: "Turnover % (annualised)", Value: a.summary.annualizedTurnover },
    { Section: "Summary", Metric: "Attendance rate %", Value: a.summary.attendanceRate ?? "" },
    { Section: "Summary", Metric: "Approved leave days", Value: a.summary.leaveDays },
    ...a.deptTurnover.map((d) => ({
      Section: "Department",
      Metric: d.name,
      Value: `${d.headcount} staff, ${d.exits} exits, ${d.turnover}% turnover`,
    })),
    ...a.leaveByType.map((d) => ({ Section: "Leave by type", Metric: d.name, Value: d.value })),
    ...a.recruitment.map((d) => ({
      Section: "Recruitment pipeline",
      Metric: d.name,
      Value: d.value,
    })),
    ...a.trend.map((d) => ({
      Section: "Monthly trend",
      Metric: d.month,
      Value: `HC ${d.headcount}, +${d.joiners} / -${d.exits}`,
    })),
  ];
  return { title: `HR analytics ${from} to ${to}`, rows };
};
