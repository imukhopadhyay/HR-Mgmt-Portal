import { db } from "@/lib/db";
import type { Actor } from "@/lib/action";
import type { RoleKey } from "@/lib/auth/permissions";
import { syncDerivedRoles } from "@/lib/auth/role-sync";
import { buildSessionUser, sessionUserInclude } from "@/lib/auth/session-user";
import { hashPassword } from "@/lib/auth/crypto";

let n = 0;
const uid = () =>
  `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const PASSWORD = "Str0ng!Password";
let pwHash: string | undefined;

export async function makeDepartment(name = `Dept ${uid()}`) {
  return db.department.create({ data: { code: `D${uid()}`.slice(0, 12).toUpperCase(), name } });
}

/** Base data (default shift, leave types) is created once in global-setup.ts. */
export async function ensureBaseData() {
  const shift = await db.shift.findFirstOrThrow({ where: { isDefault: true } });
  return { shift };
}

export interface MadePerson {
  employeeId: string;
  userId: string;
  email: string;
  actor: () => Promise<Actor>;
}

export async function makePerson(
  opts: {
    roles?: RoleKey[];
    managerId?: string;
    departmentId?: string;
    joined?: string;
    state?: string;
  } = {},
): Promise<MadePerson> {
  pwHash ??= await hashPassword(PASSWORD);
  const { shift } = await ensureBaseData();
  const email = `user-${uid()}@example.test`;
  const roles = await db.role.findMany({ where: { key: { in: opts.roles ?? ["EMPLOYEE"] } } });
  const user = await db.user.create({
    data: { email, passwordHash: pwHash, roles: { create: roles.map((r) => ({ roleId: r.id })) } },
  });
  const emp = await db.employee.create({
    data: {
      employeeCode: `T-${uid()}`,
      userId: user.id,
      firstName: "Test",
      lastName: uid(),
      workEmail: email,
      dateOfJoining: new Date(`${opts.joined ?? "2024-01-01"}T00:00:00Z`),
      status: "ACTIVE",
      managerId: opts.managerId ?? null,
      departmentId: opts.departmentId ?? null,
      shiftId: shift.id,
      state: opts.state ?? null,
    },
  });
  if (opts.managerId) await db.$transaction((tx) => syncDerivedRoles(tx, [opts.managerId]));
  return { employeeId: emp.id, userId: user.id, email, actor: () => actorFor(user.id) };
}

export async function actorFor(userId: string): Promise<Actor> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: sessionUserInclude });
  return { ...buildSessionUser(u), ipAddress: "127.0.0.1", userAgent: "vitest" };
}

/** A weekday at least `daysAhead` days in the future (YYYY-MM-DD). */
export function futureWeekday(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86400000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
