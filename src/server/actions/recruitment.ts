"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { appTimezone, zonedToUtc } from "@/lib/dates";
import {
  candidateSchema,
  feedbackSchema,
  hireSchema,
  interviewSchema,
  offerSchema,
  requisitionSchema,
  stageSchema,
} from "@/lib/validation/recruitment";
import * as svc from "@/server/services/recruitment.service";

export async function saveRequisitionAction(input: unknown) {
  return runAction(
    requisitionSchema,
    input,
    async (d, actor) => {
      const r = await svc.saveRequisition(actor, d);
      return { id: r.id };
    },
    "Requisition saved",
  );
}

export async function setRequisitionStatusAction(
  id: string,
  status: "PENDING_APPROVAL" | "OPEN" | "ON_HOLD" | "CLOSED" | "CANCELLED" | "DRAFT",
) {
  return runAction(
    z.object({
      id: z.string().min(1),
      status: z.enum(["PENDING_APPROVAL", "OPEN", "ON_HOLD", "CLOSED", "CANCELLED", "DRAFT"]),
    }),
    { id, status },
    (d, actor) => svc.setRequisitionStatus(actor, d.id, d.status),
    "Requisition updated",
  );
}

export async function saveCandidateAction(input: unknown) {
  return runAction(
    candidateSchema,
    input,
    async (d, actor) => {
      const c = await svc.saveCandidate(actor, d);
      return { id: c.id };
    },
    "Candidate saved",
  );
}

export async function moveCandidateAction(input: unknown) {
  return runAction(
    stageSchema,
    input,
    (d, actor) => svc.moveCandidate(actor, d.candidateId, d.stage, d.note),
    "Candidate moved",
  );
}

export async function scheduleInterviewAction(input: unknown) {
  return runAction(
    interviewSchema,
    input,
    async ({ date, time, ...d }, actor) => {
      await svc.scheduleInterview(actor, {
        ...d,
        scheduledAt: zonedToUtc(date, time, appTimezone()),
      });
    },
    "Interview scheduled",
  );
}

export async function submitFeedbackAction(input: unknown) {
  return runAction(
    feedbackSchema,
    input,
    (d, actor) => svc.submitFeedback(actor, d),
    "Feedback submitted",
  );
}

export async function cancelInterviewAction(id: string) {
  return runAction(
    z.string().min(1),
    id,
    (d, actor) => svc.cancelInterview(actor, d),
    "Interview cancelled",
  );
}

export async function generateOfferAction(input: unknown) {
  return runAction(
    offerSchema,
    input,
    (d, actor) => svc.generateOffer(actor, d),
    "Offer generated",
  );
}

export async function hireCandidateAction(input: unknown) {
  return runAction(
    hireSchema,
    input,
    async (d, actor) => {
      const e = await svc.hireCandidate(actor, d.candidateId, d.workEmail);
      return { id: e.id, employeeCode: e.employeeCode };
    },
    "Candidate hired — employee record and onboarding checklist created",
  );
}
