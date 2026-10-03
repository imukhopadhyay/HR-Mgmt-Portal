import { z } from "zod";

export const id = z.string().min(1).max(64);
export const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");
export const timeHHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use the format HH:mm");

/** Trimmed optional text: "" → undefined. */
export const optText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const reqText = (max = 255, label = "This field") =>
  z.string().trim().min(1, `${label} is required`).max(max, `Must be at most ${max} characters`);

export const optId = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

export const optDateKey = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(dateKey.optional());

export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number");

export const optPhone = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(phone.optional());

export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const optEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.toLowerCase() : undefined))
  .pipe(email.optional());

export const money = z.coerce
  .number({ invalid_type_error: "Enter an amount" })
  .min(0, "Must be zero or more")
  .max(1e11);

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export const password = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), "Use both upper- and lower-case letters")
  .refine((v) => /\d/.test(v), "Include at least one number")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "Include at least one symbol");
