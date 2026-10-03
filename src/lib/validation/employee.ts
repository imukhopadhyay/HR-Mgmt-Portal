import { z } from "zod";
import { dateKey, email, optDateKey, optEmail, optId, optPhone, optText, reqText } from "./common";

export const GENDERS = ["MALE", "FEMALE", "NON_BINARY", "UNDISCLOSED"] as const;
export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"] as const;
export const EMPLOYEE_STATUSES = ["ONBOARDING", "ACTIVE", "ON_NOTICE", "SUSPENDED", "EXITED"] as const;

const personal = {
  firstName: reqText(60, "First name"),
  middleName: optText(60),
  lastName: reqText(60, "Last name"),
  personalEmail: optEmail,
  phone: optPhone,
  dateOfBirth: optDateKey,
  gender: z.enum(GENDERS).default("UNDISCLOSED"),
  addressLine1: optText(120),
  addressLine2: optText(120),
  city: optText(60),
  state: optText(60),
  postalCode: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().regex(/^[0-9A-Za-z -]{3,10}$/, "Enter a valid postal code").optional()),
  country: z.string().trim().max(60).default("India"),
  bio: optText(1000),
};

const job = {
  departmentId: optId,
  designationId: optId,
  managerId: optId,
  shiftId: optId,
  employmentType: z.enum(EMPLOYMENT_TYPES).default("FULL_TIME"),
  workLocation: optText(80),
  dateOfJoining: dateKey,
  probationEndsOn: optDateKey,
};

function dobCheck<T extends { dateOfBirth?: string; dateOfJoining?: string }>(v: T, ctx: z.RefinementCtx) {
  if (v.dateOfBirth) {
    const age = (Date.now() - Date.parse(v.dateOfBirth)) / (365.25 * 24 * 3600 * 1000);
    if (age < 16 || age > 100) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Enter a plausible date of birth" });
  }
}

export const employeeCreateSchema = z
  .object({
    ...personal,
    ...job,
    workEmail: email,
    createAccount: z.coerce.boolean().default(true),
  })
  .superRefine(dobCheck);

export const employeeUpdateSchema = z
  .object({
    id: z.string().min(1),
    ...personal,
    ...job,
    workEmail: email,
    status: z.enum(EMPLOYEE_STATUSES),
    changeRemarks: optText(500),
  })
  .superRefine(dobCheck);

export const employeeListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: z.string().optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional().or(z.literal("").transform(() => undefined)),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional().or(z.literal("").transform(() => undefined)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export const emergencyContactSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string().min(1),
  name: reqText(100, "Name"),
  relationship: reqText(40, "Relationship"),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number"),
  email: optEmail,
  isPrimary: z.coerce.boolean().default(false),
});

export const offboardSchema = z.object({
  employeeId: z.string().min(1),
  exitDate: dateKey,
  exitReason: reqText(500, "Exit reason"),
});

export const financialInfoSchema = z.object({
  employeeId: z.string().min(1),
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN (e.g. ABCDE1234F)").optional()),
  uanNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().regex(/^\d{12}$/, "UAN must be 12 digits").optional()),
  esiNumber: optText(20),
  bankName: optText(80),
  bankAccountNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().regex(/^\d{6,18}$/, "Enter a valid account number").optional()),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC").optional()),
});

export type EmployeeCreateInput = z.output<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.output<typeof employeeUpdateSchema>;
