import { Ban, CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { dbDateToKey, formatDateKey, todayKey } from "@/lib/dates";
import { humanize, toNumber } from "@/lib/utils";
import { balancesFor, myRequests } from "@/server/services/leave.service";
import { cancelLeaveAction } from "@/server/actions/leave";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ApplyLeaveDialog } from "@/components/leave/apply-leave-dialog";
import { FilterBar } from "@/components/shared/filter-bar";

export const metadata = { title: "Leave" };

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const actor = await requireUser();
  if (!actor.employeeId)
    return (
      <EmptyState title="No employee profile" description="Leave is available to employees only." />
    );
  const today = todayKey();
  const yearParam = Number((await searchParams).year);
  const year = yearParam >= 2000 && yearParam <= 2100 ? yearParam : Number(today.slice(0, 4));
  const [balances, requests] = await Promise.all([
    balancesFor(actor.employeeId, year),
    myRequests(actor.employeeId, year),
  ]);
  const typeOptions = balances.map((b) => ({
    id: b.leaveType.id,
    name: b.leaveType.name,
    code: b.leaveType.code,
    available: b.available,
    allowHalfDay: b.leaveType.allowHalfDay,
    allowNegativeBalance: b.leaveType.allowNegativeBalance,
    minNoticeDays: b.leaveType.minNoticeDays,
    documentRequiredAfterDays: b.leaveType.documentRequiredAfterDays,
  }));
  return (
    <>
      <PageHeader
        title="My leave"
        description={`Balances and requests for ${year}`}
        actions={<ApplyLeaveDialog types={typeOptions} />}
      />
      <FilterBar
        search={false}
        filters={[
          {
            name: "year",
            label: "Year",
            options: [-1, 0, 1]
              .map((d) => String(Number(today.slice(0, 4)) + d))
              .map((y) => ({ value: y, label: y })),
          },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {balances.map((b) => {
          const total = b.entitled + b.carriedForward + b.adjusted;
          return (
            <Card key={b.id} className="gap-2 px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{b.leaveType.name}</span>
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: b.leaveType.color }}
                  aria-hidden
                />
              </div>
              {b.leaveType.allowNegativeBalance && total === 0 ? (
                <div className="text-muted-foreground text-sm">Used: {b.used} day(s)</div>
              ) : (
                <>
                  <div className="text-2xl font-semibold tabular-nums">
                    {b.available}
                    <span className="text-muted-foreground text-sm font-normal"> / {total}</span>
                  </div>
                  <Progress
                    value={total ? ((b.used + b.pending) / total) * 100 : 0}
                    aria-label={`${b.leaveType.name} usage`}
                  />
                  <div className="text-muted-foreground text-xs">
                    Used {b.used} · Pending {b.pending}
                    {b.carriedForward ? ` · Carried ${b.carriedForward}` : ""}
                    {b.adjusted ? ` · Adj ${b.adjusted}` : ""}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
      <Card className="py-0">
        <CardHeader className="pt-5">
          <CardTitle>Requests</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {requests.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No leave requests this year" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Approvals</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => {
                  const startKey = dbDateToKey(r.startDate);
                  const editable =
                    r.status === "MODIFICATION_REQUESTED" ||
                    (r.status === "PENDING" && r.approvals.length === 0);
                  const cancellable =
                    r.status === "PENDING" ||
                    r.status === "MODIFICATION_REQUESTED" ||
                    (r.status === "APPROVED" && startKey > today);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="font-medium">{r.leaveType.name}</span>
                        <div
                          className="text-muted-foreground max-w-56 truncate text-xs"
                          title={r.reason}
                        >
                          {r.reason}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateKey(startKey)}
                        {r.endDate.getTime() !== r.startDate.getTime() &&
                          ` – ${formatDateKey(dbDateToKey(r.endDate))}`}
                        {r.halfDay && (
                          <div className="text-muted-foreground text-xs">{humanize(r.halfDay)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{toNumber(r.days)}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                        {r.status === "PENDING" && r.requiredLevels > 1 && (
                          <div className="text-muted-foreground text-xs">
                            Stage {r.currentLevel} of {r.requiredLevels}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {r.approvals.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <ul className="text-xs">
                            {r.approvals.map((a) => (
                              <li key={a.id}>
                                L{a.level} {humanize(a.action)} by {a.approver.firstName}{" "}
                                {a.approver.lastName}
                                {a.comment && (
                                  <span className="text-muted-foreground"> — “{a.comment}”</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          {editable && (
                            <ApplyLeaveDialog
                              types={typeOptions}
                              existing={{
                                id: r.id,
                                leaveTypeId: r.leaveTypeId,
                                startDate: startKey,
                                endDate: dbDateToKey(r.endDate),
                                halfDay: r.halfDay ?? "",
                                reason: r.reason,
                              }}
                            />
                          )}
                          {cancellable && (
                            <ConfirmAction
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={
                                    r.status === "APPROVED" ? "Cancel leave" : "Withdraw request"
                                  }
                                >
                                  <Ban />
                                </Button>
                              }
                              title={
                                r.status === "APPROVED"
                                  ? "Cancel approved leave?"
                                  : "Withdraw this request?"
                              }
                              description="The days will be returned to your balance."
                              destructive
                              confirmLabel={r.status === "APPROVED" ? "Cancel leave" : "Withdraw"}
                              action={cancelLeaveAction.bind(null, r.id)}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
