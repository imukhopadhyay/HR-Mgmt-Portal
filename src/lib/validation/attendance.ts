import { z } from "zod";
import { dateKey, optText, reqText, timeHHmm } from "./common";

export const correctionSchema = z.object({
  date: dateKey,
  checkIn: timeHHmm,
  checkOut: timeHHmm,
  reason: reqText(500, "Reason"),
});

export const decisionSchema = z.object({
  id: z.string().min(1),
  approve: z.boolean(),
  comment: optText(500),
});

export const adminAttendanceSchema = z
  .object({
    employeeId: z.string().min(1),
    date: dateKey,
    status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "ON_LEAVE", "HOLIDAY", "WEEKLY_OFF"]),
    checkIn: z
      .string()
      .optional()
      .transform((v) => v || undefined)
      .pipe(timeHHmm.optional()),
    checkOut: z
      .string()
      .optional()
      .transform((v) => v || undefined)
      .pipe(timeHHmm.optional()),
    remarks: reqText(500, "Remarks"),
  })
  .refine((v) => !!v.checkIn === !!v.checkOut, {
    path: ["checkOut"],
    message: "Provide both check-in and check-out, or neither",
  });

export const shiftSchema = z.object({
  id: z.string().optional(),
  name: reqText(60, "Name"),
  startTime: timeHHmm,
  endTime: timeHHmm,
  graceMinutes: z.coerce.number().int().min(0).max(120),
  fullDayMinutes: z.coerce.number().int().min(60).max(960),
  halfDayMinutes: z.coerce.number().int().min(30).max(720),
  weeklyOffs: z.array(z.coerce.number().int().min(0).max(6)).max(6),
  isDefault: z.boolean().default(false),
});

export const holidaySchema = z.object({
  id: z.string().optional(),
  name: reqText(80, "Name"),
  date: dateKey,
  type: z.enum(["PUBLIC", "OPTIONAL", "RESTRICTED"]),
  location: optText(60),
});
