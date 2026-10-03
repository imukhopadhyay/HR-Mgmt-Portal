import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertPermission } from "@/lib/auth/rbac";
import { syncDerivedRoles } from "@/lib/auth/role-sync";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

export async function listDepartments() {
  const depts = await db.department.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      head: { select: { id: true, firstName: true, lastName: true } },
      parent: { select: { id: true, name: true } },
      _count: { select: { employees: { where: { deletedAt: null, status: { not: "EXITED" } } } } },
    },
  });
  return depts;
}

export async function departmentDetail(id: string) {
  const dept = await db.department.findFirst({
    where: { id, deletedAt: null },
    include: {
      head: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      parent: { select: { id: true, name: true } },
      children: { where: { deletedAt: null }, select: { id: true, name: true } },
      designations: { where: { deletedAt: null }, orderBy: { level: "desc" } },
    },
  });
  if (!dept) throw new NotFoundError("Department");
  const [byStatus, byType, byDesignation] = await Promise.all([
    db.employee.groupBy({ by: ["status"], where: { departmentId: id, deletedAt: null }, _count: true }),
    db.employee.groupBy({ by: ["employmentType"], where: { departmentId: id, deletedAt: null, status: { not: "EXITED" } }, _count: true }),
    db.employee.groupBy({ by: ["designationId"], where: { departmentId: id, deletedAt: null, status: { not: "EXITED" } }, _count: true }),
  ]);
  return { dept, byStatus, byType, byDesignation };
}

/** Prevent a department from becoming its own ancestor. */
async function assertNoDeptCycle(id: string | undefined, parentId: string | undefined) {
  if (!id || !parentId) return;
  let cursor: string | null = parentId;
  for (let i = 0; cursor && i < 50; i++) {
    if (cursor === id) throw new ValidationError("A department cannot be nested under itself.", { parentId: ["Creates a cycle"] });
    const p: { parentId: string | null } | null = await db.department.findUnique({ where: { id: cursor }, select: { parentId: true } });
    cursor = p?.parentId ?? null;
  }
}

export async function saveDepartment(
  actor: Actor,
  input: { id?: string; code: string; name: string; description?: string; costCenter?: string; parentId?: string; headId?: string },
) {
  assertPermission(actor, "department:manage");
  await assertNoDeptCycle(input.id, input.parentId);
  if (input.headId) {
    const head = await db.employee.findFirst({ where: { id: input.headId, deletedAt: null, status: { not: "EXITED" } }, include: { headOfDepartment: true } });
    if (!head) throw new ValidationError("Select an active employee as head.", { headId: ["Invalid employee"] });
    if (head.headOfDepartment && head.headOfDepartment.id !== input.id) {
      throw new ValidationError(`This employee already heads ${head.headOfDepartment.name}.`, { headId: ["Already heads another department"] });
    }
  }
  return db.$transaction(async (tx) => {
    const data = {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      costCenter: input.costCenter ?? null,
      parentId: input.parentId ?? null,
      headId: input.headId ?? null,
    };
    let previousHead: string | null = null;
    let id = input.id;
    if (id) {
      const before = await tx.department.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundError("Department");
      previousHead = before.headId;
      await tx.department.update({ where: { id }, data });
      await writeAudit(tx, actor, { action: "department.update", entityType: "Department", entityId: id, summary: `Updated ${input.name}`, before, after: data });
    } else {
      const created = await tx.department.create({ data });
      id = created.id;
      await writeAudit(tx, actor, { action: "department.create", entityType: "Department", entityId: id, summary: `Created ${input.name}`, after: data });
    }
    await syncDerivedRoles(tx, [previousHead, input.headId]);
    return { id };
  });
}

export async function deleteDepartment(actor: Actor, id: string) {
  assertPermission(actor, "department:manage");
  const dept = await db.department.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { employees: { where: { deletedAt: null, status: { not: "EXITED" } } }, children: { where: { deletedAt: null } } } } },
  });
  if (!dept) throw new NotFoundError("Department");
  if (dept._count.employees > 0) throw new ConflictError("Move all employees out of this department before deleting it.");
  if (dept._count.children > 0) throw new ConflictError("Remove or re-parent sub-departments first.");
  await db.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: { deletedAt: new Date(), headId: null, name: `${dept.name} (deleted ${Date.now()})`, code: `${dept.code}-DEL-${Date.now().toString(36)}`.slice(0, 40) } });
    await syncDerivedRoles(tx, [dept.headId]);
    await writeAudit(tx, actor, { action: "department.delete", entityType: "Department", entityId: id, summary: `Deleted ${dept.name}` });
  });
}

export async function listDesignations() {
  return db.designation.findMany({
    where: { deletedAt: null },
    orderBy: [{ level: "desc" }, { title: "asc" }],
    include: { department: { select: { id: true, name: true } }, _count: { select: { employees: { where: { deletedAt: null, status: { not: "EXITED" } } } } } },
  });
}

export async function saveDesignation(actor: Actor, input: { id?: string; title: string; level: number; grade?: string; departmentId?: string; description?: string }) {
  assertPermission(actor, "department:manage");
  const data = { title: input.title, level: input.level, grade: input.grade ?? null, departmentId: input.departmentId ?? null, description: input.description ?? null };
  return db.$transaction(async (tx) => {
    if (input.id) {
      const before = await tx.designation.findFirst({ where: { id: input.id, deletedAt: null } });
      if (!before) throw new NotFoundError("Designation");
      await tx.designation.update({ where: { id: input.id }, data });
      await writeAudit(tx, actor, { action: "designation.update", entityType: "Designation", entityId: input.id, before, after: data });
      return { id: input.id };
    }
    const d = await tx.designation.create({ data });
    await writeAudit(tx, actor, { action: "designation.create", entityType: "Designation", entityId: d.id, after: data });
    return { id: d.id };
  });
}

export async function deleteDesignation(actor: Actor, id: string) {
  assertPermission(actor, "department:manage");
  const d = await db.designation.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { employees: { where: { deletedAt: null } } } } } });
  if (!d) throw new NotFoundError("Designation");
  if (d._count.employees > 0) throw new ConflictError("This designation is assigned to employees.");
  await db.$transaction(async (tx) => {
    await tx.designation.update({ where: { id }, data: { deletedAt: new Date(), title: `${d.title} (deleted ${Date.now()})` } });
    await writeAudit(tx, actor, { action: "designation.delete", entityType: "Designation", entityId: id, summary: d.title });
  });
}

export interface OrgNode {
  id: string;
  name: string;
  title: string | null;
  department: string | null;
  code: string;
  children: OrgNode[];
}

/** Reporting tree built in memory from a single query. */
export async function orgTree(): Promise<OrgNode[]> {
  const emps = await db.employee.findMany({
    where: { deletedAt: null, status: { not: "EXITED" } },
    select: { id: true, firstName: true, lastName: true, employeeCode: true, managerId: true, designation: { select: { title: true } }, department: { select: { name: true } } },
    orderBy: { firstName: "asc" },
  });
  const nodes = new Map<string, OrgNode>();
  for (const e of emps) {
    nodes.set(e.id, { id: e.id, name: `${e.firstName} ${e.lastName}`, title: e.designation?.title ?? null, department: e.department?.name ?? null, code: e.employeeCode, children: [] });
  }
  const roots: OrgNode[] = [];
  for (const e of emps) {
    const node = nodes.get(e.id)!;
    const parent = e.managerId ? nodes.get(e.managerId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function shiftOptions() {
  return db.shift.findMany({ where: { deletedAt: null }, select: { id: true, name: true, isDefault: true }, orderBy: { name: "asc" } });
}

/** Select options for the employee form / transfer dialog. */
export async function employeeFormOptions() {
  const [departments, designations, managers, shifts] = await Promise.all([
    db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.designation.findMany({ where: { deletedAt: null }, select: { id: true, title: true, level: true }, orderBy: [{ level: "desc" }, { title: "asc" }] }),
    db.employee.findMany({ where: { deletedAt: null, status: { not: "EXITED" } }, select: { id: true, firstName: true, lastName: true, employeeCode: true }, orderBy: { firstName: "asc" } }),
    db.shift.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    departments: departments.map((d) => ({ id: d.id, label: d.name })),
    designations: designations.map((d) => ({ id: d.id, label: `${d.title} (L${d.level})` })),
    managers: managers.map((m) => ({ id: m.id, label: `${m.firstName} ${m.lastName} · ${m.employeeCode}` })),
    shifts: shifts.map((s) => ({ id: s.id, label: s.name })),
  };
}
