import Link from "next/link";
import { Building2, Trash2 } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { listDepartments, listDesignations, employeeFormOptions } from "@/server/services/organisation.service";
import { deleteDepartmentAction, deleteDesignationAction } from "@/server/actions/organisation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { DepartmentDialog, DesignationDialog } from "@/components/organisation/department-dialog";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const actor = await requirePagePermission("directory:read");
  const canManage = actor.permissions.has("department:manage");
  const [depts, desigs, options] = await Promise.all([listDepartments(), listDesignations(), canManage ? employeeFormOptions() : null]);
  const deptOpts = depts.map((d) => ({ id: d.id, label: d.name }));
  const total = depts.reduce((n, d) => n + d._count.employees, 0);
  return (
    <>
      <PageHeader
        title="Departments & designations"
        description={`${depts.length} departments · ${total} active employees`}
        actions={canManage && options ? <DepartmentDialog departments={deptOpts} employees={options.managers} /> : null}
      />
      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="designations">Designations & levels</TabsTrigger>
        </TabsList>
        <TabsContent value="departments">
          {depts.length === 0 ? (
            <Card>
              <EmptyState icon={Building2} title="No departments yet" />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {depts.map((d) => (
                <Card key={d.id} className="gap-3">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <Link href={`/departments/${d.id}`} className="hover:underline">
                        {d.name}
                      </Link>
                      <Badge variant="outline">{d.code}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Head: </span>
                      {d.head ? (
                        <Link className="hover:underline" href={`/employees/${d.head.id}`}>
                          {d.head.firstName} {d.head.lastName}
                        </Link>
                      ) : (
                        "Not assigned"
                      )}
                    </p>
                    {d.parent && (
                      <p>
                        <span className="text-muted-foreground">Part of: </span>
                        {d.parent.name}
                      </p>
                    )}
                    <p className="text-2xl font-semibold tabular-nums">{d._count.employees}</p>
                    <p className="text-muted-foreground text-xs">active employees</p>
                    {canManage && options && (
                      <div className="mt-2 flex gap-2">
                        <DepartmentDialog
                          departments={deptOpts}
                          employees={options.managers}
                          initial={{ id: d.id, code: d.code, name: d.name, description: d.description ?? "", costCenter: d.costCenter ?? "", parentId: d.parentId ?? "", headId: d.headId ?? "" }}
                        />
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <Trash2 /> Delete
                            </Button>
                          }
                          title={`Delete ${d.name}?`}
                          description="Only empty departments without sub-departments can be deleted."
                          destructive
                          confirmLabel="Delete"
                          action={deleteDepartmentAction.bind(null, d.id)}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="designations">
          <Card className="py-0">
            {canManage && (
              <div className="flex justify-end p-3">
                <DesignationDialog departments={deptOpts} />
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Employees</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {desigs.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.title}</TableCell>
                    <TableCell>{g.level}</TableCell>
                    <TableCell>{g.grade ?? "—"}</TableCell>
                    <TableCell>{g.department?.name ?? "Any"}</TableCell>
                    <TableCell>{g._count.employees}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <DesignationDialog departments={deptOpts} initial={{ id: g.id, title: g.title, level: g.level, grade: g.grade ?? "", departmentId: g.departmentId ?? "", description: g.description ?? "" }} />
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`Delete ${g.title}`}>
                              <Trash2 />
                            </Button>
                          }
                          title={`Delete ${g.title}?`}
                          destructive
                          confirmLabel="Delete"
                          action={deleteDesignationAction.bind(null, g.id)}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
