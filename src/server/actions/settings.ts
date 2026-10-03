"use server";

import { runAction } from "@/lib/action";
import { retentionSchema, statutoryConfigSchema } from "@/lib/validation/settings";
import * as svc from "@/server/services/settings.service";

export async function saveStatutoryConfigAction(input: unknown) {
  return runAction(statutoryConfigSchema, input, (d, actor) => svc.saveStatutoryConfig(actor, d), "Statutory rules saved");
}

export async function saveRetentionPolicyAction(input: unknown) {
  return runAction(retentionSchema, input, (d, actor) => svc.saveRetentionPolicy(actor, d), "Retention policy saved");
}
