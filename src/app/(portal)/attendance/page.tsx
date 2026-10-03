import { X } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { appTimezone, dbDateToKey, formatDateKey, formatDateTime, todayKey } from "@/lib/dates";
import { formatMinutes } from "@/lib/utils";
import { monthCalendar, todayStatus } from "@/server/services/attendance.service";
import { cancelCorrectionAction } from "@/server/actions/attendance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { MonthPicker, parseMonth } from "@/components/shared/month-picker";
import { CheckInCard } from "@/components/attendance/check-in-card";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { CorrectionDialog } from "@/components/attendance/correction-dialog";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const actor = await requireUser();
  if (!actor.employeeId)
    return (
      <EmptyState
        title="No employee profile"
        description="Attendance is available to employees only."
      />
    );
  const today = todayKey();
  const { year, month } = parseMonth((await searchParams).month, today);
  const [status, cal, corrections] = await Promise.all([
    todayStatus(actor.employeeId),
    monthCalendar(actor, actor.employeeId, year, month),
    db.attendanceCorrection.findMany({
      where: { employeeId: actor.employeeId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  const s = cal.summary;
  const blocked = status.onLeave ? "You are on approved leave today." : null;
  return (
    <>
      <PageHeader
        title="My attendance"
        description="Check in and out, review your month and request corrections."
        actions={<CorrectionDialog maxDate={today} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <CheckInCard
          checkInAt={status.record?.checkInAt?.toISOString() ?? null}
          checkOutAt={status.record?.checkOutAt?.toISOString() ?? null}
          shiftLabel={`Shift ${status.shift.startTime}–${status.shift.endTime}${status.holiday ? ` · Holiday: ${status.holiday}` : ""}${status.halfDayLeave ? " · Half-day leave" : ""}`}
          blockedReason={blocked}
          tz={appTimezone()}
        />
        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
          <StatCard label="Present" value={s.present} hint={`${s.halfDay} half days`} />
          <StatCard label="Absent" value={s.absent} hint={`${s.notMarked} not marked`} />
          <StatCard label="Late arrivals" value={s.lateDays} />
          <StatCard
            label="Hours worked"
            value={formatMinutes(s.workMinutes)}
            hint={`Overtime ${formatMinutes(s.overtimeMinutes)}`}
          />
          <StatCard label="On leave" value={s.onLeave} />
          <StatCard label="Holidays" value={s.holidays} />
          <StatCard label="Weekly offs" value={s.weeklyOffs} />
          <StatCard
            label="Today"
            value={status.record ? (status.record.checkOutAt ? "Done" : "Working") : "Not in"}
          />
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Attendance calendar</CardTitle>
          <MonthPicker year={year} month={month} basePath="/attendance" />
        </CardHeader>
        <CardContent>
          <MonthCalendar cells={cal.cells} today={today} />
        </CardContent>
      </Card>
      <Card className="py-0">
        <CardHeader className="pt-5">
          <CardTitle>My correction requests</CardTitle>
        </CardHeader>
        {corrections.length === 0 ? (
          <EmptyState title="No correction requests" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Requested times</TableHead>
                <TableHead className="hidden md:table-cell">Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Reviewer note</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {corrections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{formatDateKey(dbDateToKey(c.date))}</TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(c.requestedCheckIn)} – {formatDateTime(c.requestedCheckOut)}
                  </TableCell>
                  <TableCell className="hidden max-w-60 truncate md:table-cell">
                    {c.reason}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{c.reviewComment ?? "—"}</TableCell>
                  <TableCell>
                    {c.status === "PENDING" && (
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Cancel request">
                            <X />
                          </Button>
                        }
                        title="Cancel this correction request?"
                        confirmLabel="Cancel request"
                        action={cancelCorrectionAction.bind(null, c.id)}
                      />
                    )}
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
