"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { departmentSchema, designationSchema } from "@/lib/validation/organisation";
import * as svc from "@/server/services/organisation.service";

export async function saveDepartmentAction(input: unknown) {
  return runAction(departmentSchema, input, (d, actor) => svc.saveDepartment(actor, d), "Department saved");
}

export async function deleteDepartmentAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.deleteDepartment(actor, d), "Department deleted");
}

export async function saveDesignationAction(input: unknown) {
  return runAction(designationSchema, input, (d, actor) => svc.saveDesignation(actor, d), "Designation saved");
}

export async function deleteDesignationAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.deleteDesignation(actor, d), "Designation deleted");
}
