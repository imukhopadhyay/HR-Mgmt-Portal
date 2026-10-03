import { z } from "zod";
import { dateKey, optText, reqText } from "./common";

export const leaveApplySchema = z.object({
  leaveTypeId: z.string().min(1, "Select a leave type"),
  startDate: dateKey,
  endDate: dateKey,
  halfDay: z
    .enum(["", "FIRST_HALF", "SECOND_HALF"])
    .optional()
    .transform((v) => (v ? v : undefined)),
  reason: reqText(1000, "Reason"),
});

export const leaveModifySchema = leaveApplySchema.extend({ id: z.string().min(1) });

export const leaveDecisionSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_MODIFICATION"]),
  comment: optText(1000),
});

export const leaveTypeSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, "2–6 letters"),
  name: reqText(60, "Name"),
  description: optText(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex colour, e.g. #2563eb"),
  annualEntitlement: z.coerce.number().min(0).max(365),
  accrual: z.enum(["ANNUAL_UPFRONT", "MONTHLY", "NONE"]),
  carryForwardLimit: z.coerce.number().min(0).max(365),
  isPaid: z.boolean(),
  allowHalfDay: z.boolean(),
  allowNegativeBalance: z.boolean(),
  maxConsecutiveDays: z.union([z.literal(""), z.coerce.number().int().min(1).max(365)]).optional().transform((v) => (v === "" || v === undefined ? undefined : v)),
  minNoticeDays: z.coerce.number().int().min(0).max(90),
  documentRequiredAfterDays: z.union([z.literal(""), z.coerce.number().int().min(1).max(365)]).optional().transform((v) => (v === "" || v === undefined ? undefined : v)),
  approvalLevels: z.coerce.number().int().min(1).max(2),
  isActive: z.boolean(),
});

export const balanceAdjustSchema = z.object({
  employeeId: z.string().min(1, "Select an employee"),
  leaveTypeId: z.string().min(1, "Select a leave type"),
  year: z.coerce.number().int().min(2000).max(2100),
  delta: z.coerce.number().min(-365).max(365).refine((v) => v * 2 === Math.round(v * 2), "Use multiples of 0.5"),
  reason: reqText(300, "Reason"),
});
