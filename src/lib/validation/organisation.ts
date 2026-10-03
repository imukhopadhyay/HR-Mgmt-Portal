import { z } from "zod";
import { dateKey, optId, optText, reqText } from "./common";

export const departmentSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,12}$/, "2–12 letters, digits, - or _"),
  name: reqText(80, "Name"),
  description: optText(500),
  costCenter: optText(30),
  parentId: optId,
  headId: optId,
});

export const designationSchema = z.object({
  id: z.string().optional(),
  title: reqText(80, "Title"),
  level: z.coerce.number().int().min(1, "Level 1–10").max(10, "Level 1–10"),
  grade: optText(10),
  departmentId: optId,
  description: optText(500),
});

export const transferSchema = z.object({
  employeeId: z.string().min(1),
  departmentId: optId,
  designationId: optId,
  managerId: optId,
  effectiveDate: dateKey,
  remarks: optText(500),
});
