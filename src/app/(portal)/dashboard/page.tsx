import Link from "next/link";
import { CalendarClock, CalendarDays, ClipboardCheck, Clock, LogIn, Megaphone, UserMinus, UserPlus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { dbDateToKey, formatDateKey, formatDateTime, localTime } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { activeAnnouncements, defaultRange, headcountTrend, managerSnapshot, orgSnapshot, personalSnapshot, recentActivity, upcomingHolidays } from "@/server/services/dashboard.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { FilterBar } from "@/components/shared/filter-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";

export const metadata = { title: "Dashboard" };

const key = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireUser();
  const sp = await searchParams;
  const def = defaultRange();
  let from = key(sp.from) ?? def.from;
  let to = key(sp.to) ?? def.to;
  if (from > to) [from, to] = [to, from];
  const filters = { from, to, departmentId: sp.departmentId || undefined };

  const [personal, manager, org, trend, announcements, holidays, activity, departments] = await Promise.all([
    personalSnapshot(actor),
    managerSnapshot(actor),
    orgSnapshot(actor, filters),
    actor.permissions.has("report:read") ? headcountTrend(actor, 12, filters.departmentId) : null,
    activeAnnouncements(actor, 4),
    upcomingHolidays(4),
    recentActivity(actor, 8),
    db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const firstName = actor.name.split(" ")[0];
  const shortDate = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <>
      <PageHeader title={`Welcome back, ${firstName}`} description={actor.designation ?? "HR Portal"} />

      {personal && (
        <section aria-labelledby="my-day" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 id="my-day" className="sr-only">
            My day
          </h2>
          <StatCard
            label="Today's attendance"
            icon={LogIn}
            href="/attendance"
            value={personal.attendance?.checkInAt ? (personal.attendance.checkOutAt ? "Completed" : `In since ${localTime(personal.attendance.checkInAt)}`) : "Not checked in"}
            hint={personal.attendance?.checkOutAt ? `Out at ${localTime(personal.attendance.checkOutAt)}` : "Tap to check in / out"}
          />
          {personal.balances
            .filter((b) => !b.leaveType.allowNegativeBalance)
            .slice(0, 2)
            .map((b) => (
              <StatCard key={b.id} label={`${b.leaveType.name} balance`} icon={CalendarDays} href="/leave" value={`${b.available} days`} hint={`${b.used} used · ${b.pending} pending`} />
            ))}
          <StatCard
            label="My pending requests"
            icon={CalendarClock}
            href="/leave"
            value={personal.pending}
            hint={personal.nextLeave ? `Next leave: ${formatDateKey(dbDateToKey(personal.nextLeave.startDate))}` : "No upcoming leave"}
          />
        </section>
      )}

      {manager && (
        <section aria-labelledby="team" className="grid gap-4 lg:grid-cols-3">
          <h2 id="team" className="sr-only">
            My team
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:col-span-1">
            <StatCard label="Leave approvals" icon={ClipboardCheck} value={manager.pendingLeave} href="/approvals?tab=leave" hint="Awaiting you" />
            <StatCard label="Attendance fixes" icon={Clock} value={manager.pendingCorrections} href="/approvals?tab=attendance" hint="Awaiting you" />
            <StatCard label="Team present today" icon={Users} value={`${manager.presentToday}/${manager.teamSize}`} href="/attendance/team" />
            <StatCard label="Team on leave" icon={CalendarDays} value={manager.onLeaveToday.length} href="/leave/calendar" />
          </div>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Leave approval alerts</CardTitle>
              <CardDescription>Oldest requests waiting for your decision</CardDescription>
            </CardHeader>
            <CardContent>
              {manager.oldestPending.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing waiting — you&apos;re all caught up.</p>
              ) : (
                <ul className="divide-y">
                  {manager.oldestPending.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">
                          {r.employee.firstName} {r.employee.lastName}
                        </span>{" "}
                        · {r.leaveType.name} · {formatDateKey(dbDateToKey(r.startDate))}
                      </span>
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/approvals?tab=leave">Review</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {manager.onLeaveToday.length > 0 && (
                <p className="text-muted-foreground mt-3 text-xs">
                  On leave today: {manager.onLeaveToday.map((l) => `${l.employee.firstName} ${l.employee.lastName} (${l.leaveType.name})`).join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {org && (
        <section aria-labelledby="org" className="grid gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 id="org" className="text-lg font-semibold">
              Organisation overview
            </h2>
            <FilterBar
              search={false}
              filters={[
                { name: "from", label: "From", type: "date" },
                { name: "to", label: "To", type: "date" },
                { name: "departmentId", label: "Department", options: departments.map((d) => ({ value: d.id, label: d.name })) },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <StatCard label="Headcount" icon={Users} value={org.headcount} href="/employees" hint={`${org.onboarding} onboarding`} />
            <StatCard label="Joiners" icon={UserPlus} value={org.joiners} hint={`${shortDate(from)} – ${shortDate(to)}`} />
            <StatCard label="Exits" icon={UserMinus} value={org.exits} hint={`${shortDate(from)} – ${shortDate(to)}`} />
            <StatCard label="Present today" value={org.today.present} hint={`${org.today.onLeave} on leave · ${org.today.absent} absent`} href="/attendance/team" />
            <StatCard label="Pending leave" value={org.pendingLeave} hint="Organisation-wide" />
            <StatCard label="Pending corrections" value={org.pendingCorrections} hint="Organisation-wide" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily attendance</CardTitle>
                <CardDescription>Weekdays in the selected range</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart
                  title="Daily attendance"
                  data={org.attendanceTrend}
                  xKey="date"
                  xFormat="day"
                  series={[
                    { key: "present", label: "Present", color: "var(--chart-1)" },
                    { key: "leave", label: "On leave", color: "var(--chart-3)" },
                    { key: "absent", label: "Absent", color: "var(--chart-2)" },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Headcount by department</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleBarChart data={org.byDepartment} layout="vertical" valueLabel="Employees" height={Math.max(200, org.byDepartment.length * 34)} />
              </CardContent>
            </Card>
            {trend && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Headcount trend</CardTitle>
                    <CardDescription>Month-end headcount, last 12 months</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TrendChart title="Headcount trend" data={trend} xKey="month" xFormat="month" series={[{ key: "headcount", label: "Headcount", color: "var(--chart-1)" }]} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Joiners and exits</CardTitle>
                    <CardDescription>Per month, last 12 months</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TrendChart
                      title="Joiners and exits"
                      data={trend}
                      xKey="month"
                      xFormat="month"
                      series={[
                        { key: "joiners", label: "Joiners", color: "var(--chart-3)" },
                        { key: "exits", label: "Exits", color: "var(--chart-2)" },
                      ]}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Announcements</CardTitle>
            <Button variant="link" size="sm" asChild>
              <Link href="/announcements">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {announcements.length === 0 ? (
              <EmptyState icon={Megaphone} title="No announcements" />
            ) : (
              <ul className="grid gap-4">
                {announcements.map((a) => (
                  <li key={a.id} className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.title}</span>
                      {a.priority === "HIGH" && <StatusBadge status="HIGH" label="Important" />}
                      {a.department && <Badge variant="outline">{a.department.name}</Badge>}
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-sm">{a.body}</p>
                    <span className="text-muted-foreground text-xs">{formatDateTime(a.publishedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming holidays</CardTitle>
            </CardHeader>
            <CardContent>
              {holidays.length === 0 ? (
                <p className="text-muted-foreground text-sm">No upcoming holidays configured.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {holidays.map((h) => (
                    <li key={h.id} className="flex justify-between gap-2">
                      <span>{h.name}</span>
                      <span className="text-muted-foreground">{formatDateKey(dbDateToKey(h.date), { weekday: "short", day: "numeric", month: "short" })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {activity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <span className="font-medium">{a.actor?.employee ? `${a.actor.employee.firstName} ${a.actor.employee.lastName}` : (a.actor?.email ?? "System")}</span>{" "}
                      <span className="text-muted-foreground">{humanize(a.action.replace(".", "_"))}</span>
                      {a.summary && <div className="text-muted-foreground truncate text-xs">{a.summary}</div>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </>
  );
}
