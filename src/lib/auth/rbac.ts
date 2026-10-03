import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import type { Permission, ScopedResource } from "./permissions";
import type { SessionUser } from "./session-user";

export function assertAuthenticated(actor: SessionUser | null): asserts actor is SessionUser {
  if (!actor) throw new UnauthenticatedError();
}

export function assertPermission(actor: SessionUser, ...perms: Permission[]) {
  if (!perms.some((p) => actor.permissions.has(p))) throw new ForbiddenError();
}

export function assertEmployee(actor: SessionUser): string {
  if (!actor.employeeId) throw new ForbiddenError("Your account is not linked to an employee profile.");
  return actor.employeeId;
}

/** All employees below `managerId` in the reporting tree (direct and indirect). */
export async function reportingTreeIds(managerId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT id FROM "Employee" WHERE "managerId" = ${managerId} AND "deletedAt" IS NULL
      UNION
      SELECT e.id FROM "Employee" e JOIN tree t ON e."managerId" = t.id WHERE e."deletedAt" IS NULL
    )
    SELECT id FROM tree LIMIT 10000`;
  return rows.map((r) => r.id);
}

/** Departments headed by the actor, including all sub-departments. */
export async function headedDepartmentIds(actor: SessionUser): Promise<string[]> {
  if (actor.headOfDepartmentIds.length === 0) return [];
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT id FROM "Department" WHERE id = ANY(${actor.headOfDepartmentIds}::text[])
      UNION
      SELECT d.id FROM "Department" d JOIN tree t ON d."parentId" = t.id WHERE d."deletedAt" IS NULL
    )
    SELECT id FROM tree`;
  return rows.map((r) => r.id);
}

/**
 * Prisma filter restricting Employee rows to those the actor may see for a
 * resource. Scopes are additive: self ∪ team ∪ department, or everything.
 */
export async function employeeScopeWhere(
  actor: SessionUser,
  resource: ScopedResource,
): Promise<Prisma.EmployeeWhereInput> {
  const p = actor.permissions;
  if (p.has(`${resource}:read:all`)) return {};
  const or: Prisma.EmployeeWhereInput[] = [];
  if (actor.employeeId) or.push({ id: actor.employeeId });
  if (p.has(`${resource}:read:department`)) {
    const depts = await headedDepartmentIds(actor);
    if (depts.length) or.push({ departmentId: { in: depts } });
  }
  if (p.has(`${resource}:read:team`) || p.has(`${resource}:read:department`)) {
    if (actor.employeeId) {
      const team = await reportingTreeIds(actor.employeeId);
      if (team.length) or.push({ id: { in: team } });
    }
  }
  if (or.length === 0) return { id: "__none__" };
  return { OR: or };
}

export async function canAccessEmployee(
  actor: SessionUser,
  resource: ScopedResource,
  employeeId: string,
): Promise<boolean> {
  if (actor.employeeId === employeeId) return true;
  if (actor.permissions.has(`${resource}:read:all`)) return true;
  const where = await employeeScopeWhere(actor, resource);
  const found = await db.employee.count({ where: { AND: [where, { id: employeeId }] } });
  return found > 0;
}

export async function assertCanAccessEmployee(
  actor: SessionUser,
  resource: ScopedResource,
  employeeId: string,
) {
  if (!(await canAccessEmployee(actor, resource, employeeId))) throw new ForbiddenError();
}
