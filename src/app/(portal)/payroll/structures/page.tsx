import { requirePagePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { dbDateToKey, formatDateKey } from "@/lib/dates";
import { formatINR, toNumber } from "@/lib/utils";
import { salaryComponents, structuresFor } from "@/server/services/payroll.service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { StructureForm } from "@/components/payroll/structure-form";

export const metadata = { title: "Salary structures" };

export default async function StructuresPage({ searchParams }: { searchParams: Promise<{ employeeId?: string }> }) {
  const actor = await requirePagePermission("payroll:read");
  const { employeeId } = await searchParams;
  const employees = await db.employee.findMany({ where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true, employeeCode: true, status: true }, orderBy: { firstName: "asc" } });
  const [structures, components] = employeeId ? await Promise.all([structuresFor(actor, employeeId), salaryComponents()]) : [[], []];
  const emp = employees.find((e) => e.id === employeeId);
  const canEdit = actor.permissions.has("payroll:manage") && employeeId !== actor.employeeId;
  return (
    <>
      <PageHeader title="Salary structures" description="Effective-dated CTC breakdowns. A new structure automatically closes the previous one." />
      <FilterBar search={false} filters={[{ name: "employeeId", label: "Employee", options: employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName} · ${e.employeeCode}${e.status === "EXITED" ? " (exited)" : ""}` })) }]} />
      {!emp ? (
        <Card>
          <EmptyState title="Select an employee" description="Choose an employee to view or revise their salary structure." />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>History — {emp.firstName} {emp.lastName}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {structures.length === 0 && <p className="text-muted-foreground text-sm">No salary structure yet.</p>}
              {structures.map((s) => (
                <div key={s.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">CTC {formatINR(s.annualCtc)} / year</span>
                    {!s.effectiveTo ? <Badge variant="success">Current</Badge> : <Badge variant="outline">Past</Badge>}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {formatDateKey(dbDateToKey(s.effectiveFrom))} – {s.effectiveTo ? formatDateKey(dbDateToKey(s.effectiveTo)) : "present"}
                    {s.pfOptedOut && " · PF opted out"}
                  </p>
                  <ul className="mt-2 grid gap-0.5 text-sm">
                    {s.lines.map((l) => (
                      <li key={l.id} className="flex justify-between">
                        <span>{l.component.name}</span>
                        <span className="tabular-nums">{l.component.calcType === "FIXED" ? formatINR(l.value) : `${toNumber(l.value)}% ${l.component.calcType === "PERCENT_OF_BASIC" ? "of basic" : "of CTC"}`}</span>
                      </li>
                    ))}
                  </ul>
                  {s.notes && <p className="text-muted-foreground mt-2 text-xs">{s.notes}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Revise structure</CardTitle>
                <CardDescription>Use for increments, promotions or corrections. Changes are audited.</CardDescription>
              </CardHeader>
              <CardContent>
                <StructureForm key={emp.id} employeeId={emp.id} components={components.map((c) => ({ id: c.id, code: c.code, name: c.name, type: c.type, calcType: c.calcType, isTaxable: c.isTaxable }))} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
