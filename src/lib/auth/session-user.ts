import type { Prisma } from "@prisma/client";
import type { Permission, RoleKey } from "./permissions";

export const sessionUserInclude = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      departmentId: true,
      photoKey: true,
      headOfDepartment: { select: { id: true } },
      designation: { select: { title: true } },
    },
  },
} satisfies Prisma.UserInclude;

type UserWithAccess = Prisma.UserGetPayload<{ include: typeof sessionUserInclude }>;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
  roles: RoleKey[];
  permissions: ReadonlySet<string>;
  employeeId: string | null;
  employeeCode: string | null;
  departmentId: string | null;
  designation: string | null;
  /** Department ids this user heads (scope for `:department` permissions). */
  headOfDepartmentIds: string[];
}

export function buildSessionUser(user: UserWithAccess): SessionUser {
  const permissions = new Set<string>();
  for (const ur of user.roles)
    for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
  const e = user.employee;
  return {
    id: user.id,
    email: user.email,
    name: e ? `${e.firstName} ${e.lastName}` : user.email,
    mustChangePassword: user.mustChangePassword,
    roles: user.roles.map((r) => r.role.key as RoleKey),
    permissions,
    employeeId: e?.id ?? null,
    employeeCode: e?.employeeCode ?? null,
    departmentId: e?.departmentId ?? null,
    designation: e?.designation?.title ?? null,
    headOfDepartmentIds: e?.headOfDepartment ? [e.headOfDepartment.id] : [],
  };
}

export function hasPermission(user: Pick<SessionUser, "permissions">, perm: Permission): boolean {
  return user.permissions.has(perm);
}

export function hasAny(user: Pick<SessionUser, "permissions">, perms: Permission[]): boolean {
  return perms.some((p) => user.permissions.has(p));
}
