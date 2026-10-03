import type { LeaveAccrual } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { dbDateToKey } from "@/lib/dates";

const roundHalf = (n: number) => Math.round(n * 2) / 2;

/**
 * Entitlement for a leave type in a given year as of a date.
 * - ANNUAL_UPFRONT: full entitlement, pro-rated by remaining months for mid-year joiners.
 * - MONTHLY: accrues entitlement/12 per completed-or-current month of service in the year.
 * - NONE: 0 (e.g. unpaid leave).
 * Results are rounded to the nearest half day.
 */
export function computeEntitlement(
  type: { annualEntitlement: number; accrual: LeaveAccrual },
  year: number,
  joiningKey: string,
  asOfKey: string,
): number {
  if (type.accrual === "NONE" || type.annualEntitlement <= 0) return 0;
  const [jy, jm] = joiningKey.split("-").map(Number);
  if (jy > year) return 0;
  const startMonth = jy === year ? jm : 1;
  if (type.accrual === "ANNUAL_UPFRONT") {
    const months = 12 - startMonth + 1;
    return roundHalf((type.annualEntitlement * months) / 12);
  }
  const [ay, am] = asOfKey.split("-").map(Number);
  const throughMonth = ay > year ? 12 : ay < year ? 0 : am;
  const months = Math.max(0, throughMonth - startMonth + 1);
  return roundHalf((type.annualEntitlement * months) / 12);
}

/** Create missing balances for active leave types (idempotent). */
export async function ensureLeaveBalances(
  tx: Tx,
  employeeId: string,
  year: number,
  asOfKey: string,
) {
  const emp = await tx.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { dateOfJoining: true },
  });
  const types = await tx.leaveType.findMany({ where: { isActive: true } });
  const existing = await tx.leaveBalance.findMany({
    where: { employeeId, year },
    select: { leaveTypeId: true },
  });
  const have = new Set(existing.map((e) => e.leaveTypeId));
  const joiningKey = dbDateToKey(emp.dateOfJoining);
  const data = types
    .filter((t) => !have.has(t.id))
    .map((t) => ({
      employeeId,
      leaveTypeId: t.id,
      year,
      entitled: computeEntitlement(
        { annualEntitlement: Number(t.annualEntitlement), accrual: t.accrual },
        year,
        joiningKey,
        asOfKey,
      ),
    }));
  if (data.length) await tx.leaveBalance.createMany({ data, skipDuplicates: true });
}
