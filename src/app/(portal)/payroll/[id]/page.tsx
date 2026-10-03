import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { pageError, requirePagePermission } from "@/lib/auth/guard";
import { formatDateTime } from "@/lib/dates";
import { formatINR, toNumber } from "@/lib/utils";
import { runDetail } from "@/server/services/payroll.service";
import { approveRunAction, processRunAction, setRunStatusAction } from "@/server/actions/payroll";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmAction } from "@/components/shared/confirm-action";

export const metadata = { title: "Payroll run" };

type Line = { code: string; name: string; amount: number };

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("payroll:read");
  const { id } = await params;
  const { run, users } = await runDetail(actor, id).catch(pageError);
  const label = new Date(Date.UTC(run.year, run.month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const p = actor.permissions;
  const canManage = p.has("payroll:manage");
  const totalEmployer = run.records.reduce((s, r) => s + (r.employerContributions as Line[]).reduce((a, l) => a + l.amount, 0), 0);
  return (
    <>
      <PageHeader
        title={`Payroll — ${label}`}
        description={[run.processedAt && `Processed ${formatDateTime(run.processedAt)} by ${users[run.processedById ?? ""] ?? "—"}`, run.approvedAt && `Approved ${formatDateTime(run.approvedAt)} by ${users[run.approvedById ?? ""] ?? "—"}`].filter(Boolean).join(" · ") || "Not processed yet"}
        actions={
          <>
            <StatusBadge status={run.status} />
            {canManage && ["DRAFT", "PROCESSED"].includes(run.status) && (
              <ConfirmAction trigger={<Button>{run.status === "DRAFT" ? "Process payroll" : "Reprocess"}</Button>} title={`${run.status === "DRAFT" ? "Process" : "Reprocess"} payroll for ${label}?`} description="Salaries are computed from structures, attendance (LOP) and unpaid leave, using the current statutory rules." confirmLabel="Process" action={processRunAction.bind(null, run.id)} />
            )}
            {p.has("payroll:approve") && run.status === "PROCESSED" && (
              <ConfirmAction trigger={<Button variant="outline">Approve</Button>} title="Approve payroll?" description="Payslips are published to employees and they are notified. You cannot approve a run you processed." confirmLabel="Approve & publish" action={approveRunAction.bind(null, run.id)} />
            )}
            {canManage && run.status === "APPROVED" && <ConfirmAction trigger={<Button variant="outline">Mark as paid</Button>} title="Mark payroll as paid?" confirmLabel="Mark paid" action={setRunStatusAction.bind(null, run.id, "PAID")} />}
            {canManage && run.status === "PROCESSED" && <ConfirmAction trigger={<Button variant="ghost">Revert to draft</Button>} title="Revert to draft?" description="Computed records are discarded." confirmLabel="Revert" action={setRunStatusAction.bind(null, run.id, "DRAFT")} />}
            {canManage && ["DRAFT", "PROCESSED"].includes(run.status) && <ConfirmAction trigger={<Button variant="ghost" className="text-destructive">Cancel run</Button>} title="Cancel this payroll run?" destructive confirmLabel="Cancel run" action={setRunStatusAction.bind(null, run.id, "CANCELLED")} />}
            {run.records.length > 0 && p.has("report:export") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Download /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={`/api/exports/payroll-register?format=xlsx&runId=${run.id}`}>Payroll register (XLSX)</a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`/api/exports/payroll-register?format=pdf&runId=${run.id}`}>Payroll register (PDF)</a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`/api/exports/payroll-journal?format=csv&runId=${run.id}`}>Accounting journal (CSV)</a>
                  </DropdownMenuItem>
                  {canManage && (
                    <DropdownMenuItem asChild>
                      <a href={`/api/exports/payroll-bank?format=csv&runId=${run.id}`}>Bank transfer file (CSV)</a>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Employees" value={run.employeeCount} />
        <StatCard label="Gross" value={formatINR(run.totalGross)} />
        <StatCard label="Deductions" value={formatINR(run.totalDeductions)} />
        <StatCard label="Net pay" value={formatINR(run.totalNet)} />
        <StatCard label="Employer contributions" value={formatINR(totalEmployer)} />
      </div>
      <Card className="py-0">
        {run.records.length === 0 ? (
          <EmptyState icon={FileText} title="No records" description={run.status === "DRAFT" ? "Process the run to compute salaries." : "This run has no records."} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Paid days</TableHead>
                <TableHead className="text-right">LOP</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="hidden text-right lg:table-cell">PF</TableHead>
                <TableHead className="hidden text-right lg:table-cell">PT</TableHead>
                <TableHead className="hidden text-right lg:table-cell">TDS</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.records.map((r) => {
                const d = r.deductions as Line[];
                const amt = (c: string) => d.find((x) => x.code === c)?.amount ?? 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/employees/${r.employee.id}`} className="font-medium hover:underline">
                        {r.employee.firstName} {r.employee.lastName}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {r.employee.employeeCode} · {r.employee.department?.name ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{toNumber(r.paidDays)}</TableCell>
                    <TableCell className="text-right tabular-nums">{toNumber(r.lopDays)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(r.grossEarnings)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatINR(amt("PF"))}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatINR(amt("PT"))}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatINR(amt("TDS"))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(r.totalDeductions)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatINR(r.netPay)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild>
                        <a href={`/api/payslips/${r.id}`} aria-label={`Payslip for ${r.employee.firstName} ${r.employee.lastName}`}>
                          <FileText />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell colSpan={2} />
                <TableCell className="text-right tabular-nums">{formatINR(run.totalGross)}</TableCell>
                <TableCell className="hidden lg:table-cell" colSpan={3} />
                <TableCell className="text-right tabular-nums">{formatINR(run.totalDeductions)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(run.totalNet)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Card>
    </>
  );
}
