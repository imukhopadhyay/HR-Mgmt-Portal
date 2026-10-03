import Link from "next/link";
import { Download } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { dbDateToKey, eachDayKey, monthRangeKeys, todayKey } from "@/lib/dates";
import { cn, toNumber } from "@/lib/utils";
import { teamCalendar } from "@/server/services/leave.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { MonthPicker, parseMonth } from "@/components/shared/month-picker";

export const metadata = { title: "Leave calendar" };

export default async function LeaveCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePagePermission("leave:read:team", "leave:read:department", "leave:read:all");
  const sp = await searchParams;
  const { year, month } = parseMonth(sp.month, todayKey());
  const { start, end } = monthRangeKeys(year, month);
  const [requests, departments, holidays] = await Promise.all([
    teamCalendar(actor, start, end, sp.departmentId),
    db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.holiday.findMany({ where: { date: { gte: new Date(start), lte: new Date(end) } } }),
  ]);
  const days = eachDayKey(start, end);
  const holidaySet = new Set(holidays.map((h) => dbDateToKey(h.date)));
  const people = new Map<string, { name: string; dept: string; items: typeof requests }>();
  for (const r of requests) {
    const p = people.get(r.employee.id) ?? { name: `${r.employee.firstName} ${r.employee.lastName}`, dept: r.employee.department?.name ?? "", items: [] };
    p.items.push(r);
    people.set(r.employee.id, p);
  }
  const today = todayKey();
  const exportQ = `year=${year}${sp.departmentId ? `&departmentId=${sp.departmentId}` : ""}`;
  return (
    <>
      <PageHeader
        title="Team leave calendar"
        description="Approved (solid) and pending (striped) leave for employees in your scope."
        actions={
          actor.permissions.has("report:export") && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/exports/leave?format=xlsx&${exportQ}`}>
                <Download /> Leave report (XLSX)
              </a>
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar search={false} filters={[{ name: "departmentId", label: "Department", options: departments.map((d) => ({ value: d.id, label: d.name })) }]} />
        <MonthPicker year={year} month={month} basePath="/leave/calendar" params={{ departmentId: sp.departmentId }} />
      </div>
      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          {people.size === 0 ? (
            <EmptyState title="No leave this month" />
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-xs">
              <caption className="sr-only">Leave by employee and day</caption>
              <thead>
                <tr>
                  <th scope="col" className="bg-card sticky left-0 z-10 w-44 border-b px-3 py-2 text-left font-medium">
                    Employee
                  </th>
                  {days.map((d) => {
                    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
                    return (
                      <th key={d} scope="col" className={cn("border-b px-0.5 py-2 text-center font-normal", (wd === 0 || wd === 6 || holidaySet.has(d)) && "bg-muted text-muted-foreground", d === today && "text-primary font-bold")}>
                        {Number(d.slice(8))}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {[...people.entries()].map(([id, p]) => (
                  <tr key={id} className="border-b">
                    <th scope="row" className="bg-card sticky left-0 z-10 px-3 py-2 text-left font-normal">
                      <Link href={`/employees/${id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-muted-foreground">{p.dept}</div>
                    </th>
                    {days.map((d) => {
                      const r = p.items.find((x) => dbDateToKey(x.startDate) <= d && dbDateToKey(x.endDate) >= d);
                      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
                      return (
                        <td key={d} className={cn("h-9 px-0.5", (wd === 0 || wd === 6 || holidaySet.has(d)) && "bg-muted")}>
                          {r && (
                            <div
                              title={`${r.leaveType.name} (${r.status.toLowerCase()}) · ${toNumber(r.days)} day(s)`}
                              className="h-5 rounded-sm"
                              style={{
                                background: r.status === "APPROVED" ? r.leaveType.color : `repeating-linear-gradient(45deg, ${r.leaveType.color}, ${r.leaveType.color} 3px, transparent 3px, transparent 6px)`,
                                opacity: r.halfDay ? 0.6 : 1,
                              }}
                            >
                              <span className="sr-only">
                                {r.leaveType.code} {r.status}
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
