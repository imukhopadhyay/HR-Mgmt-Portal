import { describe, expect, it } from "vitest";
import { addDaysKey, eachDayKey, localDateKey, localTime, monthRangeKeys, weekdayOfKey, zonedToUtc } from "@/lib/dates";

describe("dates", () => {
  it("converts IST wall time to UTC", () => {
    expect(zonedToUtc("2026-03-10", "09:30", "Asia/Kolkata").toISOString()).toBe("2026-03-10T04:00:00.000Z");
  });
  it("handles DST zones", () => {
    // New York is UTC-4 in July, UTC-5 in January.
    expect(zonedToUtc("2026-07-01", "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-01-15", "09:00", "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });
  it("derives local calendar day across midnight", () => {
    const d = new Date("2026-03-10T20:00:00Z"); // 01:30 IST next day
    expect(localDateKey(d, "Asia/Kolkata")).toBe("2026-03-11");
    expect(localTime(d, "Asia/Kolkata")).toBe("01:30");
  });
  it("iterates day ranges and month bounds", () => {
    expect(eachDayKey("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(monthRangeKeys(2024, 2)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayOfKey("2026-10-03")).toBe(6);
  });
});
