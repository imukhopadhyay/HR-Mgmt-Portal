import { contentDisposition, withApi } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { dbDateToKey, formatDateKey } from "@/lib/dates";
import { renderPayslipPdf } from "@/lib/payslip-pdf";
import { toNumber } from "@/lib/utils";
import { getPayslip, mask } from "@/server/services/payroll.service";

export const dynamic = "force-dynamic";

type Line = { code: string; name: string; amount: number };

export const GET = withApi<{ params: Promise<{ id: string }> }>(async (_req, actor, { params }) => {
  const { id } = await params;
  const rec = await getPayslip(actor, id);
  const e = rec.employee;
  const period = new Date(Date.UTC(rec.payrollRun.year, rec.payrollRun.month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const pdf = await renderPayslipPdf({
    company: process.env.COMPANY_NAME ?? "Acme Technologies Pvt Ltd",
    period,
    employee: {
      code: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`,
      designation: e.designation?.title ?? "-",
      department: e.department?.name ?? "-",
      doj: formatDateKey(dbDateToKey(e.dateOfJoining)),
      pan: mask(e.financialInfo?.panNumber),
      uan: mask(e.financialInfo?.uanNumber),
      bank: e.financialInfo?.bankName ?? "-",
      account: mask(e.financialInfo?.bankAccountNumber),
      location: e.workLocation ?? "-",
    },
    days: { working: toNumber(rec.workingDays), paid: toNumber(rec.paidDays), lop: toNumber(rec.lopDays) },
    earnings: rec.earnings as unknown as Line[],
    deductions: rec.deductions as unknown as Line[],
    employer: rec.employerContributions as unknown as Line[],
    gross: toNumber(rec.grossEarnings),
    totalDeductions: toNumber(rec.totalDeductions),
    net: toNumber(rec.netPay),
  });
  await db.$transaction((tx) => writeAudit(tx, actor, { action: "payslip.download", entityType: "PayrollRecord", entityId: rec.id, summary: `${e.employeeCode} ${period}` }));
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": contentDisposition(`payslip-${e.employeeCode}-${rec.payrollRun.year}-${String(rec.payrollRun.month).padStart(2, "0")}.pdf`), "Cache-Control": "private, no-store" },
  });
});
