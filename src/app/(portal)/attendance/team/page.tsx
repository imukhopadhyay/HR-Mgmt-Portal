import Link from "next/link";
import { Download } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { localTime, todayKey } from "@/lib/dates";
import { formatMinutes } from "@/lib/utils";
import { monthlyReport, teamDay } from "@/server/services/attendance.service";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MonthPicker, parseMonth } from "@/components/shared/month-picker";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { AdminEditDialog } from "@/components/attendance/admin-edit-dialog";

export const metadata = { title: "Team attendance" };

export default async function TeamAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePagePermission("attendance:read:team", "attendance:read:department", "attendance:read:all");
  const sp = await searchParams;
  const view = sp.view === "monthly" ? "monthly" : "daily";
  const today = todayKey();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const departments = await db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const canEdit = actor.permissions.has("attendance:manage");
  const canExport = actor.permissions.has("report:export");

  const tabs = (
    <Tabs value={view}>
      <TabsList>
        <TabsTrigger value="daily" asChild>
          <Link href="/attendance/team?view=daily">Daily</Link>
        </TabsTrigger>
        <TabsTrigger value="monthly" asChild>
          <Link href="/attendance/team?view=monthly">Monthly summary</Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (view === "monthly") {
    const { year, month } = parseMonth(sp.month, today);
    const rows = await monthlyReport(actor, year, month, sp.departmentId);
    const q = new URLSearchParams(Object.entries({ month: `${year}-${String(month).padStart(2, "0")}`, departmentId: sp.departmentId }).filter(([, v]) => !!v) as [string, string][]).toString();
    return (
      <>
        <PageHeader
          title="Team attendance"
          description="Monthly attendance summary for employees in your scope."
          actions={
            canExport && (
              <>
                {["csv", "xlsx", "pdf"].map((f) => (
                  <Button key={f} variant="outline" size="sm" asChild>
                    <a href={`/api/exports/attendance-monthly?format=${f}&${q}`}>
                      <Download /> {f.toUpperCase()}
                    </a>
                  </Button>
                ))}
              </>
            )
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {tabs}
          <MonthPicker year={year} month={month} basePath="/attendance/team" params={{ view: "monthly", departmentId: sp.departmentId }} />
        </div>
        <FilterBar search={false} filters={[{ name: "departmentId", label: "Department", options: departments.map((d) => ({ value: d.id, label: d.name })) }]} />
        <Card className="py-0">
          {rows.length === 0 ? (
            <EmptyState title="No employees in scope" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Working days</TableHead>
                  <TableHead className="text-right">Present</TableHead>
                  <TableHead className="text-right">Half day</TableHead>
                  <TableHead className="text-right">Absent</TableHead>
                  <TableHead className="text-right">Leave</TableHead>
                  <TableHead className="text-right">Late</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">OT hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.employeeId}>
                    <TableCell>
                      <Link href={`/employees/${r.employeeId}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {r.employeeCode} · {r.department}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.workingDays}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.present}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.halfDay}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.absent}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.onLeave}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.lateDays}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.workHours}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.overtimeHours}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </>
    );
  }

  const rows = await teamDay(actor, date, { departmentId: sp.departmentId, q: sp.q });
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <>
      <PageHeader title="Team attendance" description="Daily roll-call for employees in your scope." />
      <div className="flex flex-wrap items-center justify-between gap-3">{tabs}</div>
      <FilterBar
        searchPlaceholder="Search employee"
        filters={[
          { name: "date", label: "Date", type: "date" },
          { name: "departmentId", label: "Department", options: departments.map((d) => ({ value: d.id, label: d.name })) },
        ]}
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Present" value={count("PRESENT")} />
        <StatCard label="Half day" value={count("HALF_DAY")} />
        <StatCard label="On leave" value={count("ON_LEAVE")} />
        <StatCard label="Absent" value={count("ABSENT")} />
        <StatCard label="Not marked" value={count("NOT_MARKED")} hint={date === today ? "Not checked in yet" : undefined} />
      </div>
      <Card className="py-0">
        {rows.length === 0 ? (
          <EmptyState title="No employees in scope" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead className="hidden sm:table-cell">Worked</TableHead>
                <TableHead className="hidden sm:table-cell">Late</TableHead>
                {canEdit && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ employee: e, record: r, status, leave }) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/employees/${e.id}`} className="flex items-center gap-2 hover:underline">
                      <EmployeeAvatar id={e.id} name={`${e.firstName} ${e.lastName}`} hasPhoto={!!e.photoKey} />
                      <span>
                        <span className="block font-medium">
                          {e.firstName} {e.lastName}
                        </span>
                        <span className="text-muted-foreground text-xs">{e.employeeCode}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{e.department?.name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={status} />
                    {leave && <div className="text-muted-foreground text-xs">{leave}</div>}
                  </TableCell>
                  <TableCell className="tabular-nums">{r?.checkInAt ? localTime(r.checkInAt) : "—"}</TableCell>
                  <TableCell className="tabular-nums">{r?.checkOutAt ? localTime(r.checkOutAt) : "—"}</TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">{r?.workMinutes ? formatMinutes(r.workMinutes) : "—"}</TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">{r?.lateMinutes ? `${r.lateMinutes} min` : "—"}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <AdminEditDialog
                        employeeId={e.id}
                        name={`${e.firstName} ${e.lastName}`}
                        date={date}
                        status={status}
                        checkIn={r?.checkInAt ? localTime(r.checkInAt) : undefined}
                        checkOut={r?.checkOutAt ? localTime(r.checkOutAt) : undefined}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
