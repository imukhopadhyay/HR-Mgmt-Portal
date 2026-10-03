import { Download, IndianRupee } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { formatINR, toNumber } from "@/lib/utils";
import { myPayslips } from "@/server/services/payroll.service";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata = { title: "Payslips" };

export default async function PayslipsPage() {
  const actor = await requireUser();
  if (!actor.employeeId) return <EmptyState title="No employee profile" />;
  const slips = await myPayslips(actor.employeeId);
  return (
    <>
      <PageHeader title="My payslips" description="Payslips appear once payroll for the month is approved." />
      <Card className="py-0">
        {slips.length === 0 ? (
          <EmptyState icon={IndianRupee} title="No payslips yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Paid days</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {slips.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{new Date(Date.UTC(s.payrollRun.year, s.payrollRun.month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</TableCell>
                  <TableCell className="text-right tabular-nums">{toNumber(s.paidDays)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(s.grossEarnings)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(s.totalDeductions)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatINR(s.netPay)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/payslips/${s.id}`}>
                        <Download /> PDF
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
