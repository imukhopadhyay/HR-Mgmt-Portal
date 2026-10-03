"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { assertEmployee } from "@/lib/auth/rbac";
import { dateKey } from "@/lib/validation/common";
import {
  balanceAdjustSchema,
  leaveApplySchema,
  leaveDecisionSchema,
  leaveModifySchema,
  leaveTypeSchema,
} from "@/lib/validation/leave";
import * as svc from "@/server/services/leave.service";

export async function applyLeaveAction(input: unknown) {
  return runAction(
    leaveApplySchema,
    input,
    async (d, actor) => {
      const r = await svc.applyLeave(actor, d);
      return { id: r.id };
    },
    "Leave request submitted",
  );
}

export async function modifyLeaveAction(input: unknown) {
  return runAction(
    leaveModifySchema,
    input,
    ({ id, ...d }, actor) => svc.modifyLeave(actor, id, d),
    "Leave request updated and resubmitted",
  );
}

export async function decideLeaveAction(input: unknown) {
  return runAction(
    leaveDecisionSchema,
    input,
    async (d, actor) => {
      const r = await svc.decideLeave(actor, d);
      return r;
    },
    "Decision recorded",
  );
}

export async function cancelLeaveAction(id: string, reason?: string) {
  return runAction(
    z.object({ id: z.string().min(1), reason: z.string().trim().max(500).optional() }),
    { id, reason },
    (d, actor) => svc.cancelLeave(actor, d.id, d.reason),
    "Leave request cancelled",
  );
}

export async function previewLeaveDaysAction(input: unknown) {
  return runAction(
    z.object({ startDate: dateKey, endDate: dateKey, halfDay: z.boolean() }),
    input,
    async (d, actor) => {
      const employeeId = assertEmployee(actor);
      return svc.previewLeaveDays(employeeId, d.startDate, d.endDate, d.halfDay);
    },
  );
}

export async function saveLeaveTypeAction(input: unknown) {
  return runAction(
    leaveTypeSchema,
    input,
    async (d, actor) => {
      await svc.saveLeaveType(actor, d);
    },
    "Leave type saved",
  );
}

export async function adjustBalanceAction(input: unknown) {
  return runAction(
    balanceAdjustSchema,
    input,
    (d, actor) => svc.adjustBalance(actor, d),
    "Balance adjusted",
  );
}

export async function yearEndRolloverAction(year: number) {
  return runAction(
    z.number().int().min(2000).max(2100),
    year,
    async (y, actor) => {
      const r = await svc.yearEndRollover(actor, y);
      return r;
    },
    "Year-end rollover completed",
  );
}
