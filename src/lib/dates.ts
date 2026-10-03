/**
 * Calendar helpers. Attendance and leave are tracked in the organisation's
 * timezone (APP_TIMEZONE, default Asia/Kolkata). Calendar days are represented
 * as "YYYY-MM-DD" strings in business logic and as UTC-midnight Date objects
 * when persisted to `@db.Date` columns.
 */
export const DEFAULT_TZ = "Asia/Kolkata";

export function appTimezone(): string {
  return process.env.APP_TIMEZONE || DEFAULT_TZ;
}

function parts(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** "YYYY-MM-DD" for the instant in the given timezone. */
export function localDateKey(date: Date, tz = appTimezone()): string {
  const p = parts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Offset (ms) of tz relative to UTC at the given instant. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time ("YYYY-MM-DD", "HH:mm") in tz to a UTC instant. */
export function zonedToUtc(dateKey: string, time: string, tz = appTimezone()): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset = tzOffsetMs(guess, tz);
  const result = new Date(guess.getTime() - offset);
  // Re-check once for DST transitions.
  const offset2 = tzOffsetMs(result, tz);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2);
}

/** Wall-clock "HH:mm" of an instant in tz. */
export function localTime(date: Date, tz = appTimezone()): string {
  const p = parts(date, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** UTC-midnight Date for a calendar day key, suitable for @db.Date columns. */
export function dateKeyToDb(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`Invalid date key: ${key}`);
  return new Date(`${key}T00:00:00.000Z`);
}

/** Calendar day key of a @db.Date value (stored as UTC midnight). */
export function dbDateToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayKey(tz = appTimezone()): string {
  return localDateKey(new Date(), tz);
}

export function addDaysKey(key: string, days: number): string {
  const d = dateKeyToDb(key);
  d.setUTCDate(d.getUTCDate() + days);
  return dbDateToKey(d);
}

/** Inclusive list of day keys between two keys. */
export function eachDayKey(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  for (let k = startKey; k <= endKey; k = addDaysKey(k, 1)) {
    out.push(k);
    if (out.length > 3660) throw new Error("Date range too large");
  }
  return out;
}

/** 0 = Sunday … 6 = Saturday, for a calendar key. */
export function weekdayOfKey(key: string): number {
  return dateKeyToDb(key).getUTCDay();
}

export function monthRangeKeys(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

export function formatDateKey(
  key: string | Date,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  const d = typeof key === "string" ? dateKeyToDb(key) : key;
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" }).format(d);
}

export function formatDateTime(d: Date, tz = appTimezone()) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tz,
  }).format(d);
}
