import { eachDayKey } from "./dates";

export interface LeavePolicy {
  allowHalfDay: boolean;
  maxConsecutiveDays: number | null;
  minNoticeDays: number;
  allowNegativeBalance: boolean;
}

/**
 * Chargeable leave days between two inclusive day keys: weekly-offs and
 * holidays are excluded. A half-day request must be a single working day.
 */
export function countLeaveDays(
  startKey: string,
  endKey: string,
  halfDay: boolean,
  weeklyOffs: number[],
  holidayKeys: ReadonlySet<string>,
): number {
  if (endKey < startKey) return 0;
  let days = 0;
  for (const k of eachDayKey(startKey, endKey)) {
    const wd = new Date(`${k}T00:00:00Z`).getUTCDay();
    if (!weeklyOffs.includes(wd) && !holidayKeys.has(k)) days++;
  }
  if (halfDay) return days === 1 ? 0.5 : days;
  return days;
}

export interface LeaveValidationInput {
  startKey: string;
  endKey: string;
  halfDay: boolean;
  todayKey: string;
  days: number;
  available: number;
  policy: LeavePolicy;
  isAdminEntry?: boolean;
}

/** Business-rule validation of a leave application. Returns field → message. */
export function validateLeaveApplication(i: LeaveValidationInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (i.endKey < i.startKey) errors.endDate = "End date must be on or after the start date";
  if (i.startKey.slice(0, 4) !== i.endKey.slice(0, 4))
    errors.endDate = "Split leave that spans two calendar years into two requests";
  if (i.halfDay && i.startKey !== i.endKey)
    errors.halfDay = "Half-day leave must start and end on the same day";
  if (i.halfDay && !i.policy.allowHalfDay)
    errors.halfDay = "This leave type does not allow half days";
  if (!errors.endDate && i.days <= 0)
    errors.startDate = "The selected dates contain no working days";
  if (!i.isAdminEntry && i.policy.minNoticeDays > 0) {
    const notice = Math.round((Date.parse(i.startKey) - Date.parse(i.todayKey)) / 86400000);
    if (notice < i.policy.minNoticeDays)
      errors.startDate = `Apply at least ${i.policy.minNoticeDays} day(s) in advance`;
  }
  if (i.policy.maxConsecutiveDays && i.days > i.policy.maxConsecutiveDays) {
    errors.endDate = `At most ${i.policy.maxConsecutiveDays} consecutive day(s) allowed for this leave type`;
  }
  if (!i.policy.allowNegativeBalance && i.days > i.available) {
    errors.leaveTypeId = `Insufficient balance: ${i.available} day(s) available`;
  }
  return errors;
}

export function availableBalance(b: {
  entitled: number;
  carriedForward: number;
  adjusted: number;
  used: number;
  pending: number;
}) {
  return Math.round((b.entitled + b.carriedForward + b.adjusted - b.used - b.pending) * 2) / 2;
}

/** Two date ranges overlap (inclusive day keys). */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}
