import { Trash2 } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { dbDateToKey, formatDateKey, todayKey } from "@/lib/dates";
import { humanize, toNumber } from "@/lib/utils";
import { deleteHolidayAction, deleteShiftAction } from "@/server/actions/attendance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ConfirmAction } from "@/components/shared/confirm-action";
import { LeaveTypeDialog } from "@/components/settings/leave-type-dialog";
import { BalanceAdjustForm } from "@/components/settings/balance-adjust-form";
import { HolidayDialog, ShiftDialog } from "@/components/settings/shift-holiday-forms";
import { StatutorySettings } from "@/components/settings/statutory-settings";
import { PrivacySettings } from "@/components/settings/privacy-settings";

export const metadata = { title: "HR configuration" };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requirePagePermission(
    "leave:manage",
    "attendance:manage",
    "settings:manage",
    "payroll:manage",
  );
  const p = actor.permissions;
  const { tab } = await searchParams;
  const year = Number(todayKey().slice(0, 4));
  const [types, shifts, holidays, employees] = await Promise.all([
    db.leaveType.findMany({ orderBy: { code: "asc" } }),
    db.shift.findMany({
      where: { deletedAt: null },
      include: {
        _count: {
          select: { employees: { where: { deletedAt: null, status: { not: "EXITED" } } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.holiday.findMany({
      where: { date: { gte: new Date(`${year - 1}-01-01`) } },
      orderBy: { date: "asc" },
    }),
    db.employee.findMany({
      where: { deletedAt: null, status: { not: "EXITED" }, id: { not: actor.employeeId ?? "" } },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
      orderBy: { firstName: "asc" },
    }),
  ]);
  const tabs = [
    p.has("leave:manage") && "leave",
    p.has("attendance:manage") && "attendance",
    (p.has("payroll:manage") || p.has("settings:manage")) && "payroll",
    p.has("settings:manage") && "privacy",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title="HR configuration"
        description="Policies and calendars used across leave, attendance and payroll. All changes are audited."
      />
      <Tabs defaultValue={tab && tabs.includes(tab) ? tab : tabs[0]}>
        <TabsList>
          {tabs.includes("leave") && <TabsTrigger value="leave">Leave policy</TabsTrigger>}
          {tabs.includes("attendance") && (
            <TabsTrigger value="attendance">Shifts & holidays</TabsTrigger>
          )}
          {tabs.includes("payroll") && (
            <TabsTrigger value="payroll">Payroll statutory rules</TabsTrigger>
          )}
          {tabs.includes("privacy") && (
            <TabsTrigger value="privacy">Privacy & retention</TabsTrigger>
          )}
        </TabsList>

        {tabs.includes("leave") && (
          <TabsContent value="leave" className="grid gap-6">
            <Card className="py-0">
              <CardHeader className="flex flex-row items-center justify-between pt-5">
                <div>
                  <CardTitle>Leave types</CardTitle>
                  <CardDescription>
                    Entitlements, accrual, carry-forward and approval levels.
                  </CardDescription>
                </div>
                <LeaveTypeDialog />
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Entitlement</TableHead>
                    <TableHead>Accrual</TableHead>
                    <TableHead className="text-right">Carry fwd</TableHead>
                    <TableHead className="hidden md:table-cell">Rules</TableHead>
                    <TableHead>Approvals</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <span
                          className="mr-2 inline-block size-2.5 rounded-full"
                          style={{ background: t.color }}
                          aria-hidden
                        />
                        <span className="font-medium">{t.name}</span>{" "}
                        <Badge variant="outline">{t.code}</Badge>
                        {!t.isActive && <Badge variant="secondary">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {toNumber(t.annualEntitlement)}
                      </TableCell>
                      <TableCell>{humanize(t.accrual)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {toNumber(t.carryForwardLimit)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-xs whitespace-normal md:table-cell">
                        {[
                          t.isPaid ? "Paid" : "Unpaid",
                          t.allowHalfDay && "half days",
                          t.minNoticeDays && `${t.minNoticeDays}d notice`,
                          t.maxConsecutiveDays && `max ${t.maxConsecutiveDays}d`,
                          t.allowNegativeBalance && "no balance limit",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </TableCell>
                      <TableCell>{t.approvalLevels === 2 ? "Manager → HR" : "Manager"}</TableCell>
                      <TableCell>
                        <LeaveTypeDialog
                          initial={{
                            id: t.id,
                            code: t.code,
                            name: t.name,
                            description: t.description ?? "",
                            color: t.color,
                            annualEntitlement: toNumber(t.annualEntitlement),
                            accrual: t.accrual,
                            carryForwardLimit: toNumber(t.carryForwardLimit),
                            isPaid: t.isPaid,
                            allowHalfDay: t.allowHalfDay,
                            allowNegativeBalance: t.allowNegativeBalance,
                            maxConsecutiveDays: t.maxConsecutiveDays ?? "",
                            minNoticeDays: t.minNoticeDays,
                            documentRequiredAfterDays: t.documentRequiredAfterDays ?? "",
                            approvalLevels: t.approvalLevels,
                            isActive: t.isActive,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Balance adjustments</CardTitle>
                <CardDescription>
                  Credit or debit leave days with a recorded reason. You cannot adjust your own
                  balance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BalanceAdjustForm
                  year={year}
                  employees={employees.map((e) => ({
                    id: e.id,
                    label: `${e.firstName} ${e.lastName} · ${e.employeeCode}`,
                  }))}
                  types={types.filter((t) => t.isActive).map((t) => ({ id: t.id, label: t.name }))}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {tabs.includes("attendance") && (
          <TabsContent value="attendance" className="grid gap-6 lg:grid-cols-2">
            <Card className="py-0">
              <CardHeader className="flex flex-row items-center justify-between pt-5">
                <div>
                  <CardTitle>Shifts</CardTitle>
                  <CardDescription>Work schedules, grace periods and weekly offs.</CardDescription>
                </div>
                <ShiftDialog />
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shift</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Weekly off</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium whitespace-normal">
                        {s.name} {s.isDefault && <Badge variant="info">Default</Badge>}
                        <div className="text-muted-foreground text-xs">
                          Grace {s.graceMinutes}m · full {s.fullDayMinutes}m · half{" "}
                          {s.halfDayMinutes}m
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {s.startTime}–{s.endTime}
                      </TableCell>
                      <TableCell>{s.weeklyOffs.map((d) => DAYS[d]).join(", ") || "None"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s._count.employees}
                      </TableCell>
                      <TableCell className="text-right">
                        <ShiftDialog
                          initial={{
                            id: s.id,
                            name: s.name,
                            startTime: s.startTime,
                            endTime: s.endTime,
                            graceMinutes: s.graceMinutes,
                            fullDayMinutes: s.fullDayMinutes,
                            halfDayMinutes: s.halfDayMinutes,
                            weeklyOffs: s.weeklyOffs,
                            isDefault: s.isDefault,
                          }}
                        />
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`}>
                              <Trash2 />
                            </Button>
                          }
                          title={`Delete ${s.name}?`}
                          destructive
                          confirmLabel="Delete"
                          action={deleteShiftAction.bind(null, s.id)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Card className="py-0">
              <CardHeader className="flex flex-row items-center justify-between pt-5">
                <div>
                  <CardTitle>Holiday calendar</CardTitle>
                  <CardDescription>
                    Public holidays are excluded from leave counts and attendance.
                  </CardDescription>
                </div>
                <HolidayDialog />
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Holiday</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        {formatDateKey(dbDateToKey(h.date), {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {h.name}
                        {h.location && (
                          <div className="text-muted-foreground text-xs">{h.location}</div>
                        )}
                      </TableCell>
                      <TableCell>{humanize(h.type)}</TableCell>
                      <TableCell className="text-right">
                        <HolidayDialog
                          initial={{
                            id: h.id,
                            name: h.name,
                            date: dbDateToKey(h.date),
                            type: h.type,
                            location: h.location ?? "",
                          }}
                        />
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`Delete ${h.name}`}>
                              <Trash2 />
                            </Button>
                          }
                          title={`Delete ${h.name}?`}
                          destructive
                          confirmLabel="Delete"
                          action={deleteHolidayAction.bind(null, h.id)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        )}

        {tabs.includes("payroll") && (
          <TabsContent value="payroll">
            <StatutorySettings canEdit={p.has("settings:manage")} />
          </TabsContent>
        )}
        {tabs.includes("privacy") && (
          <TabsContent value="privacy">
            <PrivacySettings />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
