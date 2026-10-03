import type { PrismaClient } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLES, type RoleKey } from "./permissions";

/** Idempotently sync the permission catalog and system roles into the DB. */
export async function syncRolesAndPermissions(prisma: PrismaClient) {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }
  const perms = await prisma.permission.findMany();
  const byKey = new Map(perms.map((p) => [p.key, p.id]));
  for (const [key, meta] of Object.entries(ROLES) as [RoleKey, (typeof ROLES)[RoleKey]][]) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name: meta.name, description: meta.description },
      create: { key, name: meta.name, description: meta.description, isSystem: true },
    });
    const wanted = DEFAULT_ROLE_PERMISSIONS[key].map((p) => byKey.get(p)!).filter(Boolean);
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: wanted } },
    });
    await prisma.rolePermission.createMany({
      data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
}

/**
 * Keep the derived roles (REPORTING_MANAGER, DEPARTMENT_HEAD) in line with
 * the org data: anyone with direct reports is a reporting manager; anyone
 * heading a department is a department head.
 */
export async function syncDerivedRoles(tx: Tx, employeeIds: (string | null | undefined)[]) {
  const ids = [...new Set(employeeIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  const roles = await tx.role.findMany({
    where: { key: { in: ["REPORTING_MANAGER", "DEPARTMENT_HEAD"] } },
  });
  const rm = roles.find((r) => r.key === "REPORTING_MANAGER");
  const dh = roles.find((r) => r.key === "DEPARTMENT_HEAD");
  const emps = await tx.employee.findMany({
    where: { id: { in: ids } },
    select: {
      userId: true,
      headOfDepartment: { select: { id: true, deletedAt: true } },
      _count: {
        select: { directReports: { where: { deletedAt: null, status: { not: "EXITED" } } } },
      },
    },
  });
  for (const e of emps) {
    if (!e.userId) continue;
    const pairs: [typeof rm, boolean][] = [
      [rm, e._count.directReports > 0],
      [dh, !!e.headOfDepartment && !e.headOfDepartment.deletedAt],
    ];
    for (const [role, should] of pairs) {
      if (!role) continue;
      if (should) {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: e.userId, roleId: role.id } },
          update: {},
          create: { userId: e.userId, roleId: role.id },
        });
      } else {
        await tx.userRole.deleteMany({ where: { userId: e.userId, roleId: role.id } });
      }
    }
  }
}
