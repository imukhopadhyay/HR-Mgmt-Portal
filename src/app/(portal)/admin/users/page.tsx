import Link from "next/link";
import { KeyRound } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { listUsers } from "@/server/services/user-admin.service";
import { sendResetLinkAction, setUserActiveAction } from "@/server/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Pagination } from "@/components/shared/pagination";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { RoleEditor } from "@/components/admin/role-editor";

export const metadata = { title: "Users & roles" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePagePermission("user:manage");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total }, roles] = await Promise.all([
    listUsers(actor, { q: sp.q, role: sp.role, page, pageSize: 25 }),
    db.role.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Portal accounts, role assignments and access status. Every change is audited."
      />
      <FilterBar
        searchPlaceholder="Search email, name or ID"
        filters={[
          {
            name: "role",
            label: "Role",
            options: roles.map((r) => ({ value: r.key, label: r.name })),
          },
        ]}
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="hidden md:table-cell">Last login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => {
              const locked = u.lockedUntil && u.lockedUntil > new Date();
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">
                      {u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.email}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {u.email}
                      {u.employee && (
                        <>
                          {" · "}
                          <Link className="hover:underline" href={`/employees/${u.employee.id}`}>
                            {u.employee.employeeCode}
                          </Link>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r.roleId} variant="outline">
                          {r.role.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    {!u.isActive ? (
                      <Badge variant="destructive">Disabled</Badge>
                    ) : locked ? (
                      <Badge variant="warning">Locked</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                    {u.mustChangePassword && (
                      <div className="text-muted-foreground text-xs">Invite pending</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <RoleEditor
                        userId={u.id}
                        email={u.email}
                        current={u.roles.map((r) => r.role.key)}
                        roles={roles.map((r) => ({
                          key: r.key,
                          name: r.name,
                          description: r.description,
                        }))}
                      />
                      {u.isActive && (
                        <ConfirmAction
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Send reset link to ${u.email}`}
                            >
                              <KeyRound />
                            </Button>
                          }
                          title="Send password reset link?"
                          description={`A reset link is emailed to ${u.email}.`}
                          confirmLabel="Send link"
                          action={sendResetLinkAction.bind(null, u.id)}
                        />
                      )}
                      {u.id !== actor.id && (
                        <ConfirmAction
                          trigger={
                            <Button
                              variant="ghost"
                              size="sm"
                              className={u.isActive ? "text-destructive" : undefined}
                            >
                              {u.isActive ? "Disable" : locked ? "Enable" : "Enable"}
                            </Button>
                          }
                          title={u.isActive ? `Disable ${u.email}?` : `Enable ${u.email}?`}
                          description={
                            u.isActive
                              ? "The user is signed out everywhere and can no longer log in."
                              : "The user can sign in again; any lockout is cleared."
                          }
                          destructive={u.isActive}
                          confirmLabel={u.isActive ? "Disable" : "Enable"}
                          action={setUserActiveAction.bind(null, u.id, !u.isActive)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <Pagination page={page} pageSize={25} total={total} basePath="/admin/users" params={sp} />
    </>
  );
}
