import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { zonedToUtc } from "@/lib/dates";
import {
  checkIn,
  checkOut,
  decideCorrection,
  requestCorrection,
} from "@/server/services/attendance.service";
import {
  approveRun,
  createRun,
  getPayslip,
  processRun,
  saveSalaryStructure,
} from "@/server/services/payroll.service";
import { makePerson } from "./fixtures";

describe("attendance", () => {
  it("checks in once and computes metrics on check-out", async () => {
    const e = await makePerson();
    const a = await e.actor();
    const inAt = new Date(Date.now() - 9 * 3600_000);
    await checkIn(a, inAt);
    await expect(checkIn(a, new Date(inAt.getTime() + 60_000))).rejects.toThrow(
      /already checked in/,
    );
    const rec = await checkOut(a, new Date(inAt.getTime() + 8 * 3600_000));
    expect(rec.workMinutes).toBe(480);
    expect(rec.status).toBe("PRESENT");
  });

  it("routes correction requests to the manager and applies on approval", async () => {
    const mgr = await makePerson();
    const e = await makePerson({ managerId: mgr.employeeId });
    const d = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const c = await requestCorrection(await e.actor(), {
      date: d,
      checkIn: "09:30",
      checkOut: "18:30",
      reason: "Forgot to punch",
    });
    await expect(decideCorrection(await e.actor(), { id: c.id, approve: true })).rejects.toThrow();
    await decideCorrection(await mgr.actor(), { id: c.id, approve: true });
    const rec = await db.attendance.findFirstOrThrow({
      where: { employeeId: e.employeeId, date: new Date(`${d}T00:00:00Z`) },
    });
    expect(rec.source).toBe("CORRECTION");
    expect(rec.checkInAt?.toISOString()).toBe(zonedToUtc(d, "09:30", "Asia/Kolkata").toISOString());
  });
});

describe("payroll", () => {
  it("processes, enforces segregation of duties and protects payslips", async () => {
    const hr = await makePerson({ roles: ["HR_ADMIN"] });
    const approver = await makePerson({ roles: ["SUPER_ADMIN"] });
    const emp = await makePerson({ joined: "2020-01-01", state: "Karnataka" });
    const other = await makePerson();
    const comps = await Promise.all(
      [
        { code: "BASIC", name: "Basic", calcType: "PERCENT_OF_CTC" as const },
        { code: "HRA", name: "HRA", calcType: "PERCENT_OF_BASIC" as const },
      ].map((c) =>
        db.salaryComponent.upsert({
          where: { code: c.code },
          update: {},
          create: { ...c, type: "EARNING" },
        }),
      ),
    );
    const hrActor = await hr.actor();
    await expect(
      saveSalaryStructure(await emp.actor(), {
        employeeId: emp.employeeId,
        effectiveFrom: "2020-01-01",
        annualCtc: 600000,
        pfOptedOut: false,
        lines: [],
      }),
    ).rejects.toThrow(/permission/);
    await saveSalaryStructure(hrActor, {
      employeeId: emp.employeeId,
      effectiveFrom: "2020-01-01",
      annualCtc: 600000,
      pfOptedOut: false,
      lines: [
        { componentId: comps[0].id, value: 40 },
        { componentId: comps[1].id, value: 50 },
      ],
    });

    const run = await createRun(hrActor, 2025, 6);
    const res = await processRun(hrActor, run.id);
    expect(res.processed).toBeGreaterThan(0);
    const rec = await db.payrollRecord.findUniqueOrThrow({
      where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: emp.employeeId } },
    });
    expect(Number(rec.grossEarnings)).toBe(30000); // basic 20,000 + HRA 10,000
    // Employee cannot see an unapproved payslip; others never can.
    await expect(getPayslip(await emp.actor(), rec.id)).rejects.toThrow(/not been published/);
    await expect(approveRun(hrActor, run.id)).rejects.toThrow(/Segregation of duties/);
    await approveRun(await approver.actor(), run.id);
    expect((await getPayslip(await emp.actor(), rec.id)).id).toBe(rec.id);
    await expect(getPayslip(await other.actor(), rec.id)).rejects.toThrow(/permission/);
  });
});
