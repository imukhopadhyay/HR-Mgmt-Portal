import { describe, expect, it } from "vitest";
import { availableBalance, countLeaveDays, rangesOverlap, validateLeaveApplication } from "@/lib/leave-rules";
import { computeEntitlement } from "@/server/services/leave-entitlement";

const policy = { allowHalfDay: true, maxConsecutiveDays: null, minNoticeDays: 0, allowNegativeBalance: false };

describe("countLeaveDays", () => {
  it("excludes weekly offs and holidays", () => {
    // Fri 2026-10-02 (holiday) .. Tue 2026-10-06 → Mon + Tue = 2
    expect(countLeaveDays("2026-10-02", "2026-10-06", false, [0, 6], new Set(["2026-10-02"]))).toBe(2);
  });
  it("counts half days", () => {
    expect(countLeaveDays("2026-10-05", "2026-10-05", true, [0, 6], new Set())).toBe(0.5);
  });
  it("returns 0 for weekend-only ranges", () => {
    expect(countLeaveDays("2026-10-03", "2026-10-04", false, [0, 6], new Set())).toBe(0);
  });
});

describe("validateLeaveApplication", () => {
  const base = { startKey: "2026-10-12", endKey: "2026-10-13", halfDay: false, todayKey: "2026-10-01", days: 2, available: 5, policy };
  it("accepts a valid request", () => expect(validateLeaveApplication(base)).toEqual({}));
  it("rejects insufficient balance", () => expect(validateLeaveApplication({ ...base, available: 1 }).leaveTypeId).toMatch(/Insufficient/));
  it("allows negative balance types", () => expect(validateLeaveApplication({ ...base, available: 0, policy: { ...policy, allowNegativeBalance: true } })).toEqual({}));
  it("enforces notice period", () => expect(validateLeaveApplication({ ...base, policy: { ...policy, minNoticeDays: 30 } }).startDate).toMatch(/advance/));
  it("enforces max consecutive days", () => expect(validateLeaveApplication({ ...base, days: 5, policy: { ...policy, maxConsecutiveDays: 3 } }).endDate).toMatch(/consecutive/));
  it("rejects reversed and cross-year ranges", () => {
    expect(validateLeaveApplication({ ...base, endKey: "2026-10-01" }).endDate).toBeDefined();
    expect(validateLeaveApplication({ ...base, startKey: "2026-12-30", endKey: "2027-01-02" }).endDate).toMatch(/calendar years/);
  });
  it("rejects multi-day half-day requests", () => expect(validateLeaveApplication({ ...base, halfDay: true }).halfDay).toBeDefined());
  it("rejects ranges without working days", () => expect(validateLeaveApplication({ ...base, days: 0 }).startDate).toMatch(/no working days/));
});

describe("balances and entitlement", () => {
  it("computes available balance", () => expect(availableBalance({ entitled: 12, carriedForward: 3, adjusted: -1, used: 4, pending: 1.5 })).toBe(8.5));
  it("detects overlaps", () => {
    expect(rangesOverlap("2026-01-01", "2026-01-05", "2026-01-05", "2026-01-07")).toBe(true);
    expect(rangesOverlap("2026-01-01", "2026-01-04", "2026-01-05", "2026-01-07")).toBe(false);
  });
  it("pro-rates annual entitlement for mid-year joiners", () => {
    expect(computeEntitlement({ annualEntitlement: 12, accrual: "ANNUAL_UPFRONT" }, 2026, "2026-07-15", "2026-08-01")).toBe(6);
    expect(computeEntitlement({ annualEntitlement: 12, accrual: "ANNUAL_UPFRONT" }, 2026, "2020-01-01", "2026-08-01")).toBe(12);
  });
  it("accrues monthly entitlement to date", () => {
    expect(computeEntitlement({ annualEntitlement: 15, accrual: "MONTHLY" }, 2026, "2020-01-01", "2026-04-10")).toBe(5);
    expect(computeEntitlement({ annualEntitlement: 15, accrual: "MONTHLY" }, 2025, "2020-01-01", "2026-04-10")).toBe(15);
    expect(computeEntitlement({ annualEntitlement: 15, accrual: "NONE" }, 2026, "2020-01-01", "2026-04-10")).toBe(0);
  });
});
