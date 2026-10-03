import { z } from "zod";
import { dateKey, optText } from "./common";

export const structureSchema = z.object({
  employeeId: z.string().min(1, "Select an employee"),
  effectiveFrom: dateKey,
  annualCtc: z.coerce.number({ invalid_type_error: "Enter the annual CTC" }).min(1, "CTC must be positive").max(1e9),
  pfOptedOut: z.boolean().default(false),
  notes: optText(500),
  lines: z
    .array(z.object({ componentId: z.string().min(1), value: z.coerce.number().min(0).max(1e9) }))
    .min(1, "Add at least one component"),
});

export const runCreateSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
