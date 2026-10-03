import { z } from "zod";
import { optEmail, optPhone, optText, reqText } from "./common";

export const profileUpdateSchema = z
  .object({
    phone: optPhone,
    personalEmail: optEmail,
    addressLine1: optText(120),
    addressLine2: optText(120),
    city: optText(60),
    state: optText(60),
    postalCode: optText(10),
    reason: optText(500),
  })
  .refine((v) => Object.entries(v).some(([k, val]) => k !== "reason" && val !== undefined), {
    message: "Change at least one field",
    path: ["phone"],
  });

export const TICKET_CATEGORIES = [
  "Payroll",
  "Leave",
  "Attendance",
  "Documents",
  "Benefits",
  "IT access",
  "Policy question",
  "Other",
] as const;

export const ticketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  subject: reqText(150, "Subject"),
  description: reqText(4000, "Description"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export const ticketUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  assigneeId: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  resolution: optText(4000),
});

export const reviewSchema = z.object({
  id: z.string().min(1),
  approve: z.boolean(),
  comment: optText(500),
});
