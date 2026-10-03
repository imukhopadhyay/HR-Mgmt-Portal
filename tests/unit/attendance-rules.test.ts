import { describe, expect, it } from "vitest";
import { computeAttendanceMetrics, isWorkingDay } from "@/lib/attendance-rules";
import { zonedToUtc } from "@/lib/dates";

const shift = {
  startTime: "09:30",
  endTime: "18:30",
  graceMinutes: 15,
  fullDayMinutes: 450,
  halfDayMinutes: 240,
};
const tz = "Asia/Kolkata";
const at = (t: string, day = "2026-10-05") => zonedToUtc(day, t, tz);

describe("computeAttendanceMetrics", () => {
  it("full on-time day", () => {
    expect(
      computeAttendanceMetrics("2026-10-05", at("09:25"), at("18:35"), shift, tz),
    ).toMatchObject({
      status: "PRESENT",
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workMinutes: 550,
      overtimeMinutes: 10,
    });
  });
  it("grace period hides small lateness", () => {
    expect(
      computeAttendanceMetrics("2026-10-05", at("09:44"), at("18:30"), shift, tz).lateMinutes,
    ).toBe(0);
    expect(
      computeAttendanceMetrics("2026-10-05", at("09:50"), at("18:30"), shift, tz).lateMinutes,
    ).toBe(20);
  });
  it("half day and absent thresholds", () => {
    expect(
      computeAttendanceMetrics("2026-10-05", at("09:30"), at("14:00"), shift, tz),
    ).toMatchObject({ status: "HALF_DAY", earlyLeaveMinutes: 270 });
    expect(computeAttendanceMetrics("2026-10-05", at("09:30"), at("11:00"), shift, tz).status).toBe(
      "ABSENT",
    );
  });
  it("open check-in counts as present", () => {
    expect(computeAttendanceMetrics("2026-10-05", at("10:00"), null, shift, tz)).toMatchObject({
      status: "PRESENT",
      lateMinutes: 30,
      workMinutes: 0,
    });
  });
  it("supports overnight shifts", () => {
    const night = { ...shift, startTime: "22:00", endTime: "06:00" };
    const m = computeAttendanceMetrics(
      "2026-10-05",
      at("22:00"),
      zonedToUtc("2026-10-06", "06:30", tz),
      night,
      tz,
    );
    expect(m.workMinutes).toBe(510);
    expect(m.overtimeMinutes).toBe(30);
  });
  it("rejects check-out before check-in", () => {
    expect(() =>
      computeAttendanceMetrics("2026-10-05", at("10:00"), at("09:00"), shift, tz),
    ).toThrow();
  });
  it("identifies working days", () => {
    expect(isWorkingDay("2026-10-05", [0, 6], new Set())).toBe(true);
    expect(isWorkingDay("2026-10-04", [0, 6], new Set())).toBe(false);
    expect(isWorkingDay("2026-10-02", [0, 6], new Set(["2026-10-02"]))).toBe(false);
  });
});
