import { z } from "zod";
import { dateKey, optDateKey, optId, optText, reqText } from "./common";

const rating = z.coerce.number().int().min(1, "1–5").max(5, "1–5");
const optNum = z
  .union([z.literal(""), z.coerce.number().min(-1e12).max(1e12)])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

export const cycleSchema = z.object({
  id: z.string().optional(),
  name: reqText(80, "Name"),
  startDate: dateKey,
  endDate: dateKey,
  selfReviewDue: dateKey,
  managerReviewDue: dateKey,
});

export const selfReviewSchema = z.object({
  id: z.string().min(1),
  selfRating: rating,
  selfComments: reqText(5000, "Comments"),
});

export const managerReviewSchema = z.object({
  id: z.string().min(1),
  managerRating: rating,
  managerComments: reqText(5000, "Comments"),
  strengths: optText(3000),
  improvements: optText(3000),
  finalRating: rating,
});

export const goalSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string().min(1),
  cycleId: optId,
  type: z.enum(["PERFORMANCE", "DEVELOPMENT"]),
  title: reqText(150, "Title"),
  description: optText(2000),
  kpi: optText(120),
  targetValue: optNum,
  currentValue: optNum,
  unit: optText(30),
  weight: z.coerce.number().int().min(0).max(100),
  progress: z.coerce.number().int().min(0).max(100),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  dueDate: optDateKey,
});
