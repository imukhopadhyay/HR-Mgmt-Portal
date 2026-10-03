import Link from "next/link";
import { IndianRupee } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { todayKey } from "@/lib/dates";
import { formatINR } from "@/lib/utils";
import { listRuns } from "@/server/services/payroll.service";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { NewRunForm } from "@/components/payroll/run-controls";

export const metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const actor = await requirePagePermission("payroll:read");
  const runs = await listRuns();
  const canManage = actor.permissions.has("payroll:manage");
  return (
    <>
      <PageHeader
        title="Payroll"
        description="Monthly payroll runs: process → approve (by a different user) → mark paid."
        actions={
          <Button variant="outline" asChild>
            <Link href="/payroll/structures">Salary structures</Link>
          </Button>
        }
      />
      {canManage && <NewRunForm defaultMonth={todayKey().slice(0, 7)} />}
      <Card className="py-0">
        {runs.length === 0 ? (
          <EmptyState
            icon={IndianRupee}
            title="No payroll runs yet"
            description="Create a run for a month to compute salaries."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/payroll/${r.id}`} className="font-medium hover:underline">
                      {new Date(Date.UTC(r.year, r.month - 1, 1)).toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.employeeCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(r.totalGross)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(r.totalDeductions)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatINR(r.totalNet)}
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
