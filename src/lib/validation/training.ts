import { z } from "zod";
import { dateKey, optText, reqText } from "./common";

export const trainingSchema = z.object({
  id: z.string().optional(),
  title: reqText(150, "Title"),
  description: optText(3000),
  category: reqText(60, "Category"),
  trainer: optText(120),
  mode: z.enum(["CLASSROOM", "VIRTUAL", "SELF_PACED"]),
  location: optText(200),
  startDate: dateKey,
  endDate: dateKey,
  capacity: z.union([z.literal(""), z.coerce.number().int().min(1).max(10000)]).optional().transform((v) => (v === "" || v === undefined ? undefined : v)),
  providesCertification: z.boolean(),
  skill: optText(80),
  status: z.enum(["PLANNED", "ONGOING", "COMPLETED", "CANCELLED"]),
});

export const completionSchema = z.object({
  enrollmentId: z.string().min(1),
  status: z.enum(["ENROLLED", "ATTENDED", "COMPLETED", "NO_SHOW", "CANCELLED"]),
  attendancePercent: z.union([z.literal(""), z.coerce.number().int().min(0).max(100)]).optional().transform((v) => (v === "" || v === undefined ? undefined : v)),
  score: z.union([z.literal(""), z.coerce.number().int().min(0).max(100)]).optional().transform((v) => (v === "" || v === undefined ? undefined : v)),
});

export const trainingFeedbackSchema = z.object({ enrollmentId: z.string().min(1), rating: z.coerce.number().int().min(1).max(5), feedback: optText(2000) });
export const skillSchema = z.object({ name: reqText(80, "Skill"), level: z.coerce.number().int().min(1).max(5) });
export const bulkEnrollSchema = z.object({ trainingId: z.string().min(1), employeeIds: z.array(z.string().min(1)).min(1, "Select at least one employee").max(500) });
