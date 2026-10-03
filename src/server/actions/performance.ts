"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { cycleSchema, goalSchema, managerReviewSchema, selfReviewSchema } from "@/lib/validation/performance";
import * as svc from "@/server/services/performance.service";

export async function saveCycleAction(input: unknown) {
  return runAction(cycleSchema, input, async (d, actor) => {
    await svc.saveCycle(actor, d);
  }, "Cycle saved");
}
export async function activateCycleAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.activateCycle(actor, d), "Cycle activated and reviews created");
}
export async function closeCycleAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.closeCycle(actor, d), "Cycle closed");
}
export async function submitSelfReviewAction(input: unknown) {
  return runAction(selfReviewSchema, input, (d, actor) => svc.submitSelfReview(actor, d), "Self-assessment submitted");
}
export async function submitManagerReviewAction(input: unknown) {
  return runAction(managerReviewSchema, input, (d, actor) => svc.submitManagerReview(actor, d), "Review completed");
}
export async function saveGoalAction(input: unknown) {
  return runAction(goalSchema, input, async (d, actor) => {
    await svc.saveGoal(actor, d);
  }, "Goal saved");
}
export async function deleteGoalAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.deleteGoal(actor, d), "Goal removed");
}
