import { minutesBetween, zonedToUtc } from "./dates";

export interface ShiftRules {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  graceMinutes: number;
  fullDayMinutes: number;
  halfDayMinutes: number;
}

export type AttendanceOutcome = "PRESENT" | "HALF_DAY" | "ABSENT";

export interface AttendanceMetrics {
  workMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: AttendanceOutcome;
}

/** Scheduled shift window (UTC instants) for a calendar day; handles overnight shifts. */
export function shiftWindow(dateKey: string, shift: ShiftRules, tz: string) {
  const start = zonedToUtc(dateKey, shift.startTime, tz);
  let end = zonedToUtc(dateKey, shift.endTime, tz);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, scheduledMinutes: minutesBetween(start, end) };
}

/**
 * Attendance metrics for one day.
 * - late: minutes after shift start, counted only when beyond the grace period.
 * - early leave: minutes before shift end.
 * - overtime: worked minutes beyond the scheduled shift length.
 * - status: PRESENT ≥ fullDayMinutes, HALF_DAY ≥ halfDayMinutes, else ABSENT.
 *   While the employee is still checked in (no check-out) the day counts as PRESENT.
 */
export function computeAttendanceMetrics(
  dateKey: string,
  checkIn: Date,
  checkOut: Date | null,
  shift: ShiftRules,
  tz: string,
): AttendanceMetrics {
  const { start, end, scheduledMinutes } = shiftWindow(dateKey, shift, tz);
  const lateBy = minutesBetween(start, checkIn);
  const lateMinutes = lateBy > shift.graceMinutes ? lateBy : 0;
  if (!checkOut) return { workMinutes: 0, lateMinutes, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: "PRESENT" };
  if (checkOut <= checkIn) throw new Error("Check-out must be after check-in");
  const workMinutes = minutesBetween(checkIn, checkOut);
  const earlyLeaveMinutes = checkOut < end ? minutesBetween(checkOut, end) : 0;
  const overtimeMinutes = Math.max(0, workMinutes - scheduledMinutes);
  const status: AttendanceOutcome = workMinutes >= shift.fullDayMinutes ? "PRESENT" : workMinutes >= shift.halfDayMinutes ? "HALF_DAY" : "ABSENT";
  return { workMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes, status };
}

/** Is the day a scheduled working day for this shift (ignoring leave)? */
export function isWorkingDay(dateKey: string, weeklyOffs: number[], holidayKeys: ReadonlySet<string>) {
  const wd = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return !weeklyOffs.includes(wd) && !holidayKeys.has(dateKey);
}
