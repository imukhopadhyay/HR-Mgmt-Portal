import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { humanize } from "@/lib/utils";
import { departmentDetail } from "@/server/services/organisation.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("directory:read");
  const { id } = await params;
  const { dept, byStatus, byType, byDesignation } = await departmentDetail(id);
  const members = await db.employee.findMany({
    where: { departmentId: id, deletedAt: null, status: { not: "EXITED" } },
    select: { id: true, firstName: true, lastName: true, photoKey: true, status: true, designation: { select: { title: true } } },
    orderBy: { firstName: "asc" },
  });
  const desigNames = Object.fromEntries(dept.designations.map((d) => [d.id, d.title]));
  const active = byStatus.filter((s) => s.status !== "EXITED").reduce((n, s) => n + s._count, 0);
  const exited = byStatus.find((s) => s.status === "EXITED")?._count ?? 0;
  return (
    <>
      <PageHeader title={dept.name} description={[dept.code, dept.costCenter, dept.parent ? `Part of ${dept.parent.name}` : null].filter(Boolean).join(" · ")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active headcount" value={active} />
        <StatCard label="Department head" value={dept.head ? `${dept.head.firstName} ${dept.head.lastName}` : "—"} href={dept.head ? `/employees/${dept.head.id}` : undefined} />
        <StatCard label="Exited (all time)" value={exited} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By designation</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart layout="vertical" valueLabel="Employees" data={byDesignation.map((d) => ({ name: d.designationId ? (desigNames[d.designationId] ?? "Other") : "Unassigned", value: d._count }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By employment type</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart layout="vertical" valueLabel="Employees" data={byType.map((d) => ({ name: humanize(d.employmentType), value: d._count }))} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <li key={m.id}>
                <Link href={`/employees/${m.id}`} className="hover:bg-muted flex items-center gap-3 rounded-md p-2">
                  <EmployeeAvatar id={m.id} name={`${m.firstName} ${m.lastName}`} hasPhoto={!!m.photoKey} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.firstName} {m.lastName}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">{m.designation?.title}</div>
                  </div>
                  {m.status !== "ACTIVE" && <StatusBadge status={m.status} />}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
