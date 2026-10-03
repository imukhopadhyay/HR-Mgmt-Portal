"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { runCreateSchema, structureSchema } from "@/lib/validation/payroll";
import * as svc from "@/server/services/payroll.service";

export async function saveStructureAction(input: unknown) {
  return runAction(structureSchema, input, async (d, actor) => {
    await svc.saveSalaryStructure(actor, d);
  }, "Salary structure saved");
}

export async function createRunAction(input: unknown) {
  return runAction(runCreateSchema, input, async (d, actor) => {
    const r = await svc.createRun(actor, d.year, d.month);
    return { id: r.id };
  }, "Payroll run created");
}

export async function processRunAction(id: string) {
  return runAction(z.string().min(1), id, async (d, actor) => {
    const r = await svc.processRun(actor, d);
    return r;
  }, "Payroll processed");
}

export async function approveRunAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.approveRun(actor, d), "Payroll approved and payslips published");
}

export async function setRunStatusAction(id: string, status: "PAID" | "CANCELLED" | "DRAFT") {
  return runAction(z.object({ id: z.string().min(1), status: z.enum(["PAID", "CANCELLED", "DRAFT"]) }), { id, status }, (d, actor) => svc.setRunStatus(actor, d.id, d.status), "Payroll status updated");
}
