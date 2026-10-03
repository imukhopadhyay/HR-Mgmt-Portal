"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { runRetention } from "@/server/services/privacy.service";

export async function runRetentionAction(dryRun: boolean) {
  return runAction(z.boolean(), dryRun, (d, actor) => runRetention(actor, d), dryRun ? "Dry run complete" : "Retention policy applied");
}
