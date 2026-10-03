import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { canAccessEmployee, employeeScopeWhere } from "@/lib/auth/rbac";
import {
  completeOffboarding,
  createEmployee,
  getEmployeeProfile,
  initiateOffboarding,
  transferEmployee,
  updateEmployee,
} from "@/server/services/employee.service";
import { saveDepartment } from "@/server/services/organisation.service";
import { makeDepartment, makePerson } from "./fixtures";

describe("RBAC scoping", () => {
  it("managers see their reporting tree, employees only themselves", async () => {
    const mgr = await makePerson();
    const report = await makePerson({ managerId: mgr.employeeId });
    const grand = await makePerson({ managerId: report.employeeId });
    const stranger = await makePerson();
    const m = await mgr.actor();
    expect(m.roles).toContain("REPORTING_MANAGER"); // derived role
    expect(await canAccessEmployee(m, "leave", report.employeeId)).toBe(true);
    expect(await canAccessEmployee(m, "leave", grand.employeeId)).toBe(true);
    expect(await canAccessEmployee(m, "leave", stranger.employeeId)).toBe(false);
    const e = await stranger.actor();
    expect(await canAccessEmployee(e, "employee", mgr.employeeId)).toBe(false);
    const where = await employeeScopeWhere(e, "employee");
    expect(await db.employee.count({ where })).toBe(1);
  });

  it("department heads see their department", async () => {
    const dept = await makeDepartment();
    const head = await makePerson({ departmentId: dept.id });
    const member = await makePerson({ departmentId: dept.id });
    const hr = await makePerson({ roles: ["HR_ADMIN"] });
    await saveDepartment(await hr.actor(), {
      id: dept.id,
      code: dept.code,
      name: dept.name,
      headId: head.employeeId,
    });
    const h = await head.actor();
    expect(h.roles).toContain("DEPARTMENT_HEAD");
    expect(await canAccessEmployee(h, "attendance", member.employeeId)).toBe(true);
  });

  it("employees get a directory view of colleagues without personal data", async () => {
    const a = await makePerson();
    const b = await makePerson();
    await db.employee.update({
      where: { id: b.employeeId },
      data: { dateOfBirth: new Date("1990-01-01"), addressLine1: "Secret street" },
    });
    const { employee, access } = await getEmployeeProfile(await a.actor(), b.employeeId);
    expect(access.full).toBe(false);
    expect(employee.dateOfBirth).toBeNull();
    expect(employee.addressLine1).toBeNull();
    expect(employee.financialInfo).toBeFalsy();
  });
});

describe("employee lifecycle", () => {
  it("prevents non-HR users from creating employees", async () => {
    const e = await makePerson();
    await expect(
      createEmployee(await e.actor(), {
        firstName: "A",
        lastName: "B",
        workEmail: "x1@example.test",
        dateOfJoining: "2026-01-01",
        gender: "UNDISCLOSED",
        country: "India",
        employmentType: "FULL_TIME",
        createAccount: false,
      }),
    ).rejects.toThrow(/permission/);
  });

  it("creates an employee with code, history, checklist, balances and account", async () => {
    const hr = await makePerson({ roles: ["HR_ADMIN"] });
    const mgr = await makePerson();
    const email = `new-${Date.now()}@example.test`;
    const r = await createEmployee(await hr.actor(), {
      firstName: "New",
      lastName: "Joiner",
      workEmail: email,
      dateOfJoining: "2026-02-01",
      managerId: mgr.employeeId,
      gender: "UNDISCLOSED",
      country: "India",
      employmentType: "FULL_TIME",
      createAccount: true,
    });
    expect(r.employeeCode).toMatch(/^EMP-\d{5}$/);
    const emp = await db.employee.findUniqueOrThrow({
      where: { id: r.id },
      include: { history: true, checklistItems: true, leaveBalances: true, user: true },
    });
    expect(emp.history[0].changeType).toBe("JOINED");
    expect(emp.checklistItems.length).toBeGreaterThan(5);
    expect(emp.leaveBalances.length).toBeGreaterThan(0);
    expect(emp.user?.mustChangePassword).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: r.id, action: "employee.create" } })).toBe(
      1,
    );
    await expect(
      createEmployee(await hr.actor(), {
        firstName: "Dup",
        lastName: "X",
        workEmail: email,
        dateOfJoining: "2026-02-01",
        gender: "UNDISCLOSED",
        country: "India",
        employmentType: "FULL_TIME",
        createAccount: false,
      }),
    ).rejects.toThrow(/already in use/);
  });

  it("records transfers and blocks circular reporting lines", async () => {
    const hr = await makePerson({ roles: ["HR_ADMIN"] });
    const a = await makePerson();
    const b = await makePerson({ managerId: a.employeeId });
    const actor = await hr.actor();
    await expect(
      transferEmployee(actor, {
        employeeId: a.employeeId,
        managerId: b.employeeId,
        effectiveDate: "2026-03-01",
      }),
    ).rejects.toThrow(/circular/);
    const dept = await makeDepartment();
    await transferEmployee(actor, {
      employeeId: b.employeeId,
      departmentId: dept.id,
      effectiveDate: "2026-03-01",
    });
    const hist = await db.employmentHistory.findMany({ where: { employeeId: b.employeeId } });
    expect(hist.map((h) => h.changeType)).toEqual(
      expect.arrayContaining(["TRANSFER", "MANAGER_CHANGE"]),
    );
    expect((await a.actor()).roles).not.toContain("REPORTING_MANAGER");
  });

  it("does not allow exiting via the edit form", async () => {
    const hr = await makePerson({ roles: ["HR_ADMIN"] });
    const e = await makePerson();
    const emp = await db.employee.findUniqueOrThrow({ where: { id: e.employeeId } });
    await expect(
      updateEmployee(await hr.actor(), {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        workEmail: emp.workEmail,
        dateOfJoining: "2024-01-01",
        status: "EXITED",
        gender: "UNDISCLOSED",
        country: "India",
        employmentType: "FULL_TIME",
      }),
    ).rejects.toThrow(/offboarding/);
  });

  it("completing an exit revokes access and reassigns reports", async () => {
    const hr = await makePerson({ roles: ["HR_ADMIN"] });
    const boss = await makePerson();
    const leaver = await makePerson({ managerId: boss.employeeId });
    const report = await makePerson({ managerId: leaver.employeeId });
    const actor = await hr.actor();
    await initiateOffboarding(actor, {
      employeeId: leaver.employeeId,
      exitDate: "2026-12-31",
      exitReason: "Relocation",
    });
    await completeOffboarding(actor, leaver.employeeId);
    const u = await db.user.findUniqueOrThrow({ where: { id: leaver.userId } });
    expect(u.isActive).toBe(false);
    expect(
      (await db.employee.findUniqueOrThrow({ where: { id: report.employeeId } })).managerId,
    ).toBe(boss.employeeId);
    expect(
      await db.checklistItem.count({
        where: { employeeId: leaver.employeeId, type: "OFFBOARDING" },
      }),
    ).toBeGreaterThan(0);
  });
});
