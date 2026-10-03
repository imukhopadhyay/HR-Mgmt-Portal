import { z } from "zod";
import { dateKey, email, optDateKey, optId, optPhone, optText, reqText } from "./common";

const optNum = (min: number, max: number) =>
  z.union([z.literal(""), z.coerce.number().min(min).max(max)]).optional().transform((v) => (v === "" || v === undefined ? undefined : v));

export const requisitionSchema = z.object({
  id: z.string().optional(),
  title: reqText(120, "Title"),
  departmentId: optId,
  designationId: optId,
  hiringManagerId: optId,
  openings: z.coerce.number().int().min(1).max(100),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"]),
  location: optText(80),
  description: reqText(5000, "Description"),
  minExperience: optNum(0, 50),
  maxExperience: optNum(0, 50),
  budgetMin: optNum(0, 1e9),
  budgetMax: optNum(0, 1e9),
  targetDate: optDateKey,
  submit: z.boolean().default(false),
});

export const candidateSchema = z.object({
  id: z.string().optional(),
  recruitmentId: z.string().min(1),
  firstName: reqText(60, "First name"),
  lastName: reqText(60, "Last name"),
  email,
  phone: optPhone,
  source: optText(60),
  currentCompany: optText(80),
  experienceYears: optNum(0, 60),
  expectedCtc: optNum(0, 1e9),
  notes: optText(2000),
});

export const interviewSchema = z.object({
  candidateId: z.string().min(1),
  round: reqText(80, "Round"),
  date: dateKey,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm"),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  mode: z.enum(["ONSITE", "VIDEO", "PHONE"]),
  location: optText(300),
  interviewerId: z.string().min(1, "Select an interviewer"),
});

export const feedbackSchema = z.object({
  interviewId: z.string().min(1),
  status: z.enum(["COMPLETED", "NO_SHOW"]),
  rating: z.coerce.number().int().min(1).max(5),
  recommendation: z.enum(["STRONG_HIRE", "HIRE", "HOLD", "NO_HIRE"]),
  feedback: reqText(4000, "Feedback"),
});

export const offerSchema = z.object({
  candidateId: z.string().min(1),
  offeredCtc: z.coerce.number().min(1).max(1e9),
  joiningDate: dateKey,
});

export const hireSchema = z.object({ candidateId: z.string().min(1), workEmail: email });

export const stageSchema = z.object({
  candidateId: z.string().min(1),
  stage: z.enum(["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"]),
  note: optText(500),
});
