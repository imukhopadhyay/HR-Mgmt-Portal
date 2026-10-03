import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyLeave, approvalQueue, balancesFor, cancelLeave, decideLeave, modifyLeave } from "@/server/services/leave.service";
import { futureWeekday, makePerson } from "./fixtures";

async function typeId(code: string) {
  return (await db.leaveType.findUniqueOrThrow({ where: { code } })).id;
}

async function setup() {
  const hr = await makePerson({ roles: ["HR_MANAGER"] });
  const mgr = await makePerson();
  const emp = await makePerson({ managerId: mgr.employeeId });
  return { hr, mgr, emp };
}

describe("leave workflow", () => {
  it("single-level approval moves pending to used", async () => {
    const { mgr, emp } = await setup();
    const day = futureWeekday(10);
    const req = await applyLeave(await emp.actor(), { leaveTypeId: await typeId("CL"), startDate: day, endDate: day, reason: "Personal" });
    const year = Number(day.slice(0, 4));
    let cl = (await balancesFor(emp.employeeId, year)).find((b) => b.leaveType.code === "CL")!;
    expect(cl.pending).toBe(1);
    const queue = await approvalQueue(await mgr.actor());
    expect(queue.map((q) => q.id)).toContain(req.id);
    expect(await decideLeave(await mgr.actor(), { id: req.id, decision: "APPROVE" })).toBe("APPROVED");
    cl = (await balancesFor(emp.employeeId, year)).find((b) => b.leaveType.code === "CL")!;
    expect(cl.pending).toBe(0);
    expect(cl.used).toBe(1);
    expect(await db.leaveApproval.count({ where: { leaveRequestId: req.id } })).toBe(1);
  });

  it("two-level approval escalates from manager to HR", async () => {
    const { hr, mgr, emp } = await setup();
    const day = futureWeekday(20);
    const req = await applyLeave(await emp.actor(), { leaveTypeId: await typeId("EL"), startDate: day, endDate: day, reason: "Trip" });
    expect(await decideLeave(await mgr.actor(), { id: req.id, decision: "APPROVE" })).toBe("ESCALATED");
    // The manager cannot act at level 2.
    await expect(decideLeave(await mgr.actor(), { id: req.id, decision: "APPROVE" })).rejects.toThrow(/not the approver/);
    expect(await decideLeave(await hr.actor(), { id: req.id, decision: "APPROVE" })).toBe("APPROVED");
  });

  it("forbids self-approval and approval by unrelated managers", async () => {
    const { mgr, emp } = await setup();
    const otherMgr = await makePerson();
    await makePerson({ managerId: otherMgr.employeeId });
    const day = futureWeekday(30);
    const req = await applyLeave(await emp.actor(), { leaveTypeId: await typeId("CL"), startDate: day, endDate: day, reason: "x" });
    await expect(decideLeave(await emp.actor(), { id: req.id, decision: "APPROVE" })).rejects.toThrow();
    await expect(decideLeave(await otherMgr.actor(), { id: req.id, decision: "APPROVE" })).rejects.toThrow(/not the approver/);
    await expect(decideLeave(await mgr.actor(), { id: req.id, decision: "REJECT" })).rejects.toThrow(/comment/);
    expect(await decideLeave(await mgr.actor(), { id: req.id, decision: "REJECT", comment: "Busy week" })).toBe("REJECTED");
  });

  it("rejects overlaps and insufficient balance", async () => {
    const { emp } = await setup();
    const a = await emp.actor();
    const day = futureWeekday(40);
    await applyLeave(a, { leaveTypeId: await typeId("CL"), startDate: day, endDate: day, reason: "x" });
    await expect(applyLeave(a, { leaveTypeId: await typeId("CL"), startDate: day, endDate: day, reason: "y" })).rejects.toThrow(/Overlaps/);
    const start = futureWeekday(60);
    const end = new Date(`${start}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 25);
    await expect(applyLeave(a, { leaveTypeId: await typeId("CL"), startDate: start, endDate: end.toISOString().slice(0, 10).slice(0, 4) === start.slice(0, 4) ? end.toISOString().slice(0, 10) : `${start.slice(0, 4)}-12-31`, reason: "long" })).rejects.toThrow(/Insufficient|working days|consecutive/);
  });

  it("supports modification requests, resubmission and withdrawal", async () => {
    const { mgr, emp } = await setup();
    const day = futureWeekday(50);
    const req = await applyLeave(await emp.actor(), { leaveTypeId: await typeId("CL"), startDate: day, endDate: day, reason: "x" });
    expect(await decideLeave(await mgr.actor(), { id: req.id, decision: "REQUEST_MODIFICATION", comment: "Pick another day" })).toBe("MODIFICATION_REQUESTED");
    const day2 = futureWeekday(55);
    await modifyLeave(await emp.actor(), req.id, { leaveTypeId: await typeId("CL"), startDate: day2, endDate: day2, reason: "moved" });
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
    await cancelLeave(await emp.actor(), req.id);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("WITHDRAWN");
    const cl = (await balancesFor(emp.employeeId, Number(day2.slice(0, 4)))).find((b) => b.leaveType.code === "CL")!;
    expect(cl.pending).toBe(0);
  });

  it("cancelling approved future leave restores the balance", async () => {
    const { mgr, emp } = await setup();
    const day = futureWeekday(70);
    const req = await applyLeave(await emp.actor(), { leaveTypeId: await typeId("CL"), startDate: day, endDate: day, reason: "x" });
    await decideLeave(await mgr.actor(), { id: req.id, decision: "APPROVE" });
    await cancelLeave(await emp.actor(), req.id);
    const cl = (await balancesFor(emp.employeeId, Number(day.slice(0, 4)))).find((b) => b.leaveType.code === "CL")!;
    expect(cl.used).toBe(0);
  });
});
