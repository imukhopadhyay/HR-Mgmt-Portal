import { requirePagePermission } from "@/lib/auth/guard";
import { dbDateToKey, formatDateKey } from "@/lib/dates";
import { listCycles } from "@/server/services/performance.service";
import { activateCycleAction, closeCycleAction } from "@/server/actions/performance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import { ConfirmAction } from "@/components/shared/confirm-action";
import { CycleDialog } from "@/components/performance/cycle-dialog";

export const metadata = { title: "Performance cycles" };

export default async function CyclesPage() {
  await requirePagePermission("performance:manage");
  const cycles = await listCycles();
  return (
    <>
      <PageHeader
        title="Performance cycles"
        description="Create a cycle, activate it to open reviews for all active employees, then close it."
        actions={<CycleDialog />}
      />
      <Card className="py-0">
        {cycles.length === 0 ? (
          <EmptyState title="No cycles yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cycle</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Completion</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((c) => {
                const done = c.reviews.filter((r) => r.status === "COMPLETED").length;
                const selfDone = c.reviews.filter((r) => r.status !== "SELF_REVIEW").length;
                const pct = c.reviews.length ? Math.round((done / c.reviews.length) * 100) : 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      {formatDateKey(dbDateToKey(c.startDate))} –{" "}
                      {formatDateKey(dbDateToKey(c.endDate))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="min-w-48">
                      <Progress value={pct} aria-label={`${pct}% complete`} />
                      <span className="text-muted-foreground text-xs">
                        {done}/{c.reviews.length} completed · {selfDone} self-assessments in
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.status === "DRAFT" && (
                        <ConfirmAction
                          trigger={<Button size="sm">Activate</Button>}
                          title={`Activate ${c.name}?`}
                          description="Creates a review for every active employee and notifies them."
                          confirmLabel="Activate"
                          action={activateCycleAction.bind(null, c.id)}
                        />
                      )}
                      {c.status === "ACTIVE" && (
                        <ConfirmAction
                          trigger={
                            <Button size="sm" variant="outline">
                              Close
                            </Button>
                          }
                          title={`Close ${c.name}?`}
                          description="Reviews become read-only."
                          confirmLabel="Close cycle"
                          action={closeCycleAction.bind(null, c.id)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
