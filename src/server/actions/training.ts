"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { bulkEnrollSchema, completionSchema, skillSchema, trainingFeedbackSchema, trainingSchema } from "@/lib/validation/training";
import * as svc from "@/server/services/training.service";

export async function saveTrainingAction(input: unknown) {
  return runAction(trainingSchema, input, async (d, actor) => {
    const t = await svc.saveTraining(actor, d);
    return { id: t.id };
  }, "Programme saved");
}
export async function selfEnrollAction(trainingId: string) {
  return runAction(z.string().min(1), trainingId, (d, actor) => svc.selfEnroll(actor, d), "Enrolled");
}
export async function cancelEnrollmentAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.cancelEnrollment(actor, d), "Enrolment cancelled");
}
export async function enrollEmployeesAction(input: unknown) {
  return runAction(bulkEnrollSchema, input, (d, actor) => svc.enrollEmployees(actor, d.trainingId, d.employeeIds), "Employees enrolled");
}
export async function recordCompletionAction(input: unknown) {
  return runAction(completionSchema, input, (d, actor) => svc.recordCompletion(actor, d), "Record updated");
}
export async function trainingFeedbackAction(input: unknown) {
  return runAction(trainingFeedbackSchema, input, (d, actor) => svc.submitTrainingFeedback(actor, d), "Thanks for your feedback");
}
export async function saveSkillAction(input: unknown) {
  return runAction(skillSchema, input, (d, actor) => svc.saveSkill(actor, d), "Skill saved");
}
export async function deleteSkillAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.deleteSkill(actor, d), "Skill removed");
}
