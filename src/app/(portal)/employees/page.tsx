import Link from "next/link";
import { Download, UserPlus, Users } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatDateKey } from "@/lib/dates";
import { fullName, humanize } from "@/lib/utils";
import { employeeListSchema, EMPLOYEE_STATUSES, EMPLOYMENT_TYPES } from "@/lib/validation/employee";
import { listEmployees } from "@/server/services/employee.service";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePagePermission("directory:read", "employee:read:all", "employee:read:team", "employee:read:department");
  const sp = await searchParams;
  const f = employeeListSchema.parse(sp);
  const [{ rows, total }, departments] = await Promise.all([
    listEmployees(actor, f),
    db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const canCreate = actor.permissions.has("employee:create");
  const canExport = actor.permissions.has("report:export");
  const exportQuery = new URLSearchParams(Object.entries({ q: f.q, departmentId: f.departmentId, status: f.status, employmentType: f.employmentType }).filter(([, v]) => !!v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Employees"
        description={`${total} ${total === 1 ? "person" : "people"} in the directory`}
        actions={
          <>
            {canExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Download /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {["csv", "xlsx", "pdf"].map((fmt) => (
                    <DropdownMenuItem key={fmt} asChild>
                      <a href={`/api/exports/employees?format=${fmt}&${exportQuery}`}>{fmt.toUpperCase()}</a>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canCreate && (
              <Button asChild>
                <Link href="/employees/new">
                  <UserPlus /> Add employee
                </Link>
              </Button>
            )}
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search name, ID or email"
        filters={[
          { name: "departmentId", label: "Department", options: departments.map((d) => ({ value: d.id, label: d.name })) },
          { name: "status", label: "Status", options: EMPLOYEE_STATUSES.map((s) => ({ value: s, label: humanize(s) })) },
          { name: "employmentType", label: "Type", options: EMPLOYMENT_TYPES.map((s) => ({ value: s, label: humanize(s) })) },
        ]}
      />
      <Card className="py-0">
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No employees found" description="Try adjusting your search or filters." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="hidden md:table-cell">Designation</TableHead>
                <TableHead className="hidden lg:table-cell">Manager</TableHead>
                <TableHead className="hidden lg:table-cell">Joined</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/employees/${e.id}`} className="flex items-center gap-3 hover:underline">
                      <EmployeeAvatar id={e.id} name={fullName(e)} hasPhoto={!!e.photoKey} />
                      <div className="min-w-0">
                        <div className="font-medium">{fullName(e)}</div>
                        <div className="text-muted-foreground text-xs">
                          {e.employeeCode} · {e.workEmail}
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>{e.department?.name ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{e.designation?.title ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{formatDateKey(e.dateOfJoining)}</TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Pagination page={f.page} pageSize={f.pageSize} total={total} basePath="/employees" params={sp} />
    </>
  );
}
