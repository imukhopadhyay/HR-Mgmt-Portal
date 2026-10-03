import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth/crypto";
import { addDaysKey, todayKey } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { markAbsentees } from "@/server/services/attendance.service";
import { runMonthlyAccrual } from "@/server/services/leave.service";
import { runRetention } from "@/server/services/privacy.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily maintenance job (Vercel Cron → GET with `Authorization: Bearer $CRON_SECRET`).
 * Idempotent: safe to re-run.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const today = todayKey();
  const yesterday = addDaysKey(today, -1);
  const results: Record<string, unknown> = {};
  for (const [name, fn] of [
    ["attendance", () => markAbsentees(yesterday)],
    ["accrual", () => runMonthlyAccrual(Number(today.slice(0, 4)), today)],
    ["retention", () => runRetention(null, false)],
  ] as const) {
    try {
      results[name] = await fn();
    } catch (err) {
      logger.error(`cron.${name}.failed`, { err });
      results[name] = { error: "failed" };
    }
  }
  logger.info("cron.daily", { results });
  return NextResponse.json({ ok: true, date: today, results });
}
