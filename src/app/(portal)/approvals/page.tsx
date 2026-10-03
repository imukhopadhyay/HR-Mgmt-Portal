import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { dbDateToKey, formatDateKey, formatDateTime } from "@/lib/dates";
import { humanize, toNumber } from "@/lib/utils";
import { approvalQueue } from "@/server/services/leave.service";
import { pendingCorrections } from "@/server/services/attendance.service";
import { pendingProfileUpdates } from "@/server/services/self-service.service";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LeaveDecisionButtons, SimpleDecisionButtons } from "@/components/leave/decision-buttons";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requirePagePermission(
    "leave:approve",
    "attendance:approve",
    "request:manage",
  );
  const { tab } = await searchParams;
  const [leave, corrections, profile] = await Promise.all([
    actor.permissions.has("leave:approve") ? approvalQueue(actor) : [],
    actor.permissions.has("attendance:approve") ? pendingCorrections(actor) : [],
    actor.permissions.has("request:manage") ? pendingProfileUpdates(actor) : [],
  ]);
  const profileVisible = profile.filter((p) => p.employeeId !== actor.employeeId);
  return (
    <>
      <PageHeader title="Approvals" description="Requests waiting for your decision." />
      <Tabs defaultValue={tab ?? "leave"}>
        <TabsList>
          <TabsTrigger value="leave">
            Leave <Badge variant="secondary">{leave.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="attendance">
            Attendance <Badge variant="secondary">{corrections.length}</Badge>
          </TabsTrigger>
          {actor.permissions.has("request:manage") && (
            <TabsTrigger value="profile">
              Profile updates <Badge variant="secondary">{profileVisible.length}</Badge>
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="leave">
          <Card className="py-0">
            {leave.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="No leave requests waiting"
                description="You're all caught up."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Leave</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="hidden lg:table-cell">Stage</TableHead>
                    <TableHead className="text-right">Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leave.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          href={`/employees/${r.employee.id}`}
                          className="font-medium hover:underline"
                        >
                          {r.employee.firstName} {r.employee.lastName}
                        </Link>
                        <div className="text-muted-foreground text-xs">
                          {r.employee.employeeCode} · {r.employee.department?.name ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{r.leaveType.name}</span>
                        <div
                          className="text-muted-foreground max-w-60 truncate text-xs whitespace-normal"
                          title={r.reason}
                        >
                          {r.reason}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateKey(dbDateToKey(r.startDate))} –{" "}
                        {formatDateKey(dbDateToKey(r.endDate))}
                        {r.halfDay && (
                          <div className="text-muted-foreground text-xs">{humanize(r.halfDay)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{toNumber(r.days)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-xs">
                          {r.currentLevel === 1 ? "Manager" : "HR"} ({r.currentLevel}/
                          {r.requiredLevels})
                        </span>
                        {r.approvals.map((a) => (
                          <div key={a.id} className="text-muted-foreground text-xs">
                            L{a.level}: {humanize(a.action)} by {a.approver.firstName}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>
                        <LeaveDecisionButtons
                          id={r.id}
                          name={`${r.employee.firstName} ${r.employee.lastName}`}
                          finalStage={r.currentLevel >= r.requiredLevels}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="attendance">
          <Card className="py-0">
            {corrections.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No attendance corrections waiting" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Recorded</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="hidden md:table-cell">Reason</TableHead>
                    <TableHead className="text-right">Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {corrections.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.employee.firstName} {c.employee.lastName}
                        <div className="text-muted-foreground text-xs">
                          {c.employee.employeeCode}
                        </div>
                      </TableCell>
                      <TableCell>{formatDateKey(dbDateToKey(c.date))}</TableCell>
                      <TableCell className="text-xs">
                        {c.attendance?.checkInAt
                          ? `${formatDateTime(c.attendance.checkInAt)} – ${c.attendance.checkOutAt ? formatDateTime(c.attendance.checkOutAt) : "…"}`
                          : humanize(c.attendance?.status ?? "NOT_MARKED")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateTime(c.requestedCheckIn)} – {formatDateTime(c.requestedCheckOut)}
                      </TableCell>
                      <TableCell className="hidden max-w-64 truncate whitespace-normal md:table-cell">
                        {c.reason}
                      </TableCell>
                      <TableCell>
                        <SimpleDecisionButtons id={c.id} kind="correction" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="profile">
          <Card className="py-0">
            {profileVisible.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No profile updates waiting" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Changes</TableHead>
                    <TableHead className="text-right">Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profileVisible.map((p) => {
                    const { fields, reason } = p.changes as {
                      fields: Record<string, { from: string | null; to: string | null }>;
                      reason: string | null;
                    };
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.employee.firstName} {p.employee.lastName}
                          <div className="text-muted-foreground text-xs">
                            {p.employee.employeeCode}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <ul className="grid gap-0.5 text-xs">
                            {Object.entries(fields).map(([k, v]) => (
                              <li key={k}>
                                <span className="font-medium">
                                  {humanize(k.replace(/([A-Z])/g, "_$1"))}:
                                </span>{" "}
                                <span className="text-muted-foreground line-through">
                                  {v.from ?? "—"}
                                </span>{" "}
                                → {v.to ?? "—"}
                              </li>
                            ))}
                          </ul>
                          {reason && (
                            <p className="text-muted-foreground mt-1 text-xs">Reason: {reason}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <SimpleDecisionButtons id={p.id} kind="profile" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
