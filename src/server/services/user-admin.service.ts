import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertPermission } from "@/lib/auth/rbac";
import type { RoleKey } from "@/lib/auth/permissions";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { requestPasswordReset } from "./auth.service";

export async function listUsers(
  actor: Actor,
  f: { q?: string; role?: string; page: number; pageSize: number },
) {
  assertPermission(actor, "user:manage");
  const where: Prisma.UserWhereInput = {
    ...(f.q
      ? {
          OR: [
            { email: { contains: f.q, mode: "insensitive" } },
            {
              employee: {
                OR: [
                  { firstName: { contains: f.q, mode: "insensitive" } },
                  { lastName: { contains: f.q, mode: "insensitive" } },
                  { employeeCode: { contains: f.q, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
    ...(f.role ? { roles: { some: { role: { key: f.role } } } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      include: {
        roles: { include: { role: true } },
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true, status: true },
        },
      },
      orderBy: { email: "asc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    db.user.count({ where }),
  ]);
  return { rows, total };
}

export async function setUserRoles(actor: Actor, userId: string, roleKeys: RoleKey[]) {
  assertPermission(actor, "user:manage");
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new NotFoundError("User");
  const current = user.roles.map((r) => r.role.key);
  const touchesSuper = current.includes("SUPER_ADMIN") !== roleKeys.includes("SUPER_ADMIN");
  if (touchesSuper && !actor.roles.includes("SUPER_ADMIN"))
    throw new ForbiddenError("Only a Super Admin can grant or revoke Super Admin.");
  if (userId === actor.id && current.includes("SUPER_ADMIN") && !roleKeys.includes("SUPER_ADMIN"))
    throw new ForbiddenError("You cannot remove your own Super Admin role.");
  if (current.includes("SUPER_ADMIN") && !roleKeys.includes("SUPER_ADMIN")) {
    const supers = await db.userRole.count({
      where: { role: { key: "SUPER_ADMIN" }, user: { isActive: true } },
    });
    if (supers <= 1) throw new ConflictError("At least one active Super Admin is required.");
  }
  const wanted = [...new Set<RoleKey>(roleKeys)];
  if (wanted.length === 0) throw new ConflictError("A user must have at least one role.");
  const roles = await db.role.findMany({ where: { key: { in: wanted } } });
  await db.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId, role: { key: { notIn: wanted } } } });
    await tx.userRole.createMany({
      data: roles.map((r) => ({ userId, roleId: r.id })),
      skipDuplicates: true,
    });
    // Revoke sessions so new permissions apply immediately and removed ones cannot linger.
    if (userId !== actor.id) await tx.session.deleteMany({ where: { userId } });
    await writeAudit(tx, actor, {
      action: "user.roles_update",
      entityType: "User",
      entityId: userId,
      summary: user.email,
      before: { roles: current },
      after: { roles: wanted },
    });
  });
}

export async function setUserActive(actor: Actor, userId: string, isActive: boolean) {
  assertPermission(actor, "user:manage");
  if (userId === actor.id) throw new ForbiddenError("You cannot deactivate your own account.");
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new NotFoundError("User");
  if (user.roles.some((r) => r.role.key === "SUPER_ADMIN") && !actor.roles.includes("SUPER_ADMIN"))
    throw new ForbiddenError("Only a Super Admin can change another Super Admin.");
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { isActive, failedLoginCount: 0, lockedUntil: null },
    });
    if (!isActive) await tx.session.deleteMany({ where: { userId } });
    await writeAudit(tx, actor, {
      action: isActive ? "user.activate" : "user.deactivate",
      entityType: "User",
      entityId: userId,
      summary: user.email,
    });
  });
}

export async function sendResetLink(actor: Actor, userId: string) {
  assertPermission(actor, "user:manage");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");
  await requestPasswordReset(user.email, {
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
  await db.$transaction((tx) =>
    writeAudit(tx, actor, {
      action: "user.reset_link_sent",
      entityType: "User",
      entityId: userId,
      summary: user.email,
    }),
  );
}

export async function listAudit(
  actor: Actor,
  f: {
    action?: string;
    entityType?: string;
    actorQ?: string;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  },
) {
  assertPermission(actor, "audit:read");
  const where: Prisma.AuditLogWhereInput = {
    ...(f.action ? { action: { contains: f.action, mode: "insensitive" } } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.actorQ ? { actor: { email: { contains: f.actorQ, mode: "insensitive" } } } : {}),
    ...(f.from || f.to
      ? {
          createdAt: {
            ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}),
            ...(f.to ? { lte: new Date(`${f.to}T23:59:59Z`) } : {}),
          },
        }
      : {}),
  };
  const [rows, total, entityTypes] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actor: { select: { email: true } } },
      orderBy: { seq: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);
  return { rows, total, entityTypes: entityTypes.map((e) => e.entityType) };
}
