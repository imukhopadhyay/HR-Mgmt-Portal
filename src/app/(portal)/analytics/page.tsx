import { Download } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { addDaysKey, todayKey } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { hrAnalytics } from "@/server/services/analytics.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { StatCard } from "@/components/shared/stat-card";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";

export const metadata = { title: "HR analytics" };

const k = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePagePermission("report:read");
  const sp = await searchParams;
  let to = k(sp.to) ?? todayKey();
  let from = k(sp.from) ?? addDaysKey(to, -89);
  if (from > to) [from, to] = [to, from];
  const departmentId = sp.departmentId || undefined;
  const [a, depts] = await Promise.all([
    hrAnalytics(actor, { from, to, departmentId }),
    db.department.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const q = new URLSearchParams(
    Object.entries({ from, to, departmentId }).filter(([, v]) => !!v) as [string, string][],
  ).toString();
  const humanized = (list: { name: string; value: number }[]) =>
    list.map((x) => ({ ...x, name: humanize(x.name) }));
  return (
    <>
      <PageHeader
        title="HR analytics"
        description={`Organisation and department metrics for ${from} to ${to}. Figures reflect records in your access scope.`}
        actions={
          actor.permissions.has("report:export") &&
          ["csv", "xlsx", "pdf"].map((f) => (
            <Button key={f} variant="outline" size="sm" asChild>
              <a href={`/api/exports/hr-analytics?format=${f}&${q}`}>
                <Download /> {f.toUpperCase()}
              </a>
            </Button>
          ))
        }
      />
      <FilterBar
        search={false}
        filters={[
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
          {
            name: "departmentId",
            label: "Department",
            options: depts.map((d) => ({ value: d.id, label: d.name })),
          },
        ]}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard
          label="Headcount"
          value={a.summary.headcount}
          hint={`Start of period: ${a.summary.startHeadcount}`}
        />
        <StatCard label="Joiners" value={a.summary.joiners} />
        <StatCard label="Exits" value={a.summary.exits} />
        <StatCard
          label="Turnover"
          value={`${a.summary.turnoverRate}%`}
          hint={`${a.summary.annualizedTurnover}% annualised`}
        />
        <StatCard
          label="Attendance rate"
          value={a.summary.attendanceRate !== null ? `${a.summary.attendanceRate}%` : "—"}
          hint={`${a.summary.absences} absences`}
        />
        <StatCard label="Leave days taken" value={a.summary.leaveDays} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workforce trend</CardTitle>
            <CardDescription>Month-end headcount</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              title="Workforce trend"
              data={a.trend}
              xKey="month"
              xFormat="month"
              series={[{ key: "headcount", label: "Headcount", color: "var(--chart-1)" }]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hiring vs attrition</CardTitle>
            <CardDescription>Joiners and exits per month</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              title="Hiring vs attrition"
              data={a.trend}
              xKey="month"
              xFormat="month"
              series={[
                { key: "joiners", label: "Joiners", color: "var(--chart-3)" },
                { key: "exits", label: "Exits", color: "var(--chart-2)" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Leave taken by type</CardTitle>
            <CardDescription>Approved days in period</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart layout="vertical" valueLabel="Days" data={a.leaveByType} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Leave taken by department</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              layout="vertical"
              valueLabel="Days"
              data={a.leaveByDept}
              color="var(--chart-3)"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tenure distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart valueLabel="Employees" data={a.tenure} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recruitment pipeline</CardTitle>
            <CardDescription>Candidates added in period, by current stage</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              layout="vertical"
              valueLabel="Candidates"
              data={humanized(a.recruitment)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Employment type</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              layout="vertical"
              valueLabel="Employees"
              data={humanized(a.byEmploymentType)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attendance mix</CardTitle>
            <CardDescription>Attendance records in period</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart layout="vertical" valueLabel="Days" data={humanized(a.attendanceMix)} />
          </CardContent>
        </Card>
      </div>
      <Card className="py-0">
        <CardHeader className="pt-5">
          <CardTitle>Department turnover</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Headcount</TableHead>
              <TableHead className="text-right">Exits (period)</TableHead>
              <TableHead className="text-right">Turnover</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {a.deptTurnover.map((d) => (
              <TableRow key={d.name}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-right tabular-nums">{d.headcount}</TableCell>
                <TableCell className="text-right tabular-nums">{d.exits}</TableCell>
                <TableCell className="text-right tabular-nums">{d.turnover}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
