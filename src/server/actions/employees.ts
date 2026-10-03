"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import {
  emergencyContactSchema,
  employeeCreateSchema,
  employeeUpdateSchema,
  financialInfoSchema,
  offboardSchema,
} from "@/lib/validation/employee";
import { transferSchema } from "@/lib/validation/organisation";
import * as svc from "@/server/services/employee.service";

export async function createEmployeeAction(input: unknown) {
  return runAction(
    employeeCreateSchema,
    input,
    (d, actor) => svc.createEmployee(actor, d),
    "Employee created",
  );
}

export async function updateEmployeeAction(input: unknown) {
  return runAction(
    employeeUpdateSchema,
    input,
    (d, actor) => svc.updateEmployee(actor, d),
    "Employee updated",
  );
}

export async function transferEmployeeAction(input: unknown) {
  return runAction(
    transferSchema,
    input,
    (d, actor) => svc.transferEmployee(actor, d),
    "Job details updated",
  );
}

export async function initiateOffboardingAction(input: unknown) {
  return runAction(
    offboardSchema,
    input,
    (d, actor) => svc.initiateOffboarding(actor, d),
    "Offboarding started",
  );
}

export async function completeOffboardingAction(employeeId: string) {
  return runAction(
    z.string().min(1),
    employeeId,
    (id, actor) => svc.completeOffboarding(actor, id),
    "Employee exited and access revoked",
  );
}

export async function archiveEmployeeAction(employeeId: string, reason?: string) {
  return runAction(
    z.object({
      employeeId: z.string().min(1),
      reason: z.string().trim().min(3, "Give a reason").max(500),
    }),
    { employeeId, reason: reason ?? "" },
    (d, actor) => svc.archiveEmployee(actor, d.employeeId, d.reason),
    "Employee archived",
  );
}

export async function toggleChecklistAction(input: unknown) {
  return runAction(
    z.object({ id: z.string().min(1), done: z.boolean() }),
    input,
    (d, actor) => svc.toggleChecklistItem(actor, d.id, d.done),
    "Checklist updated",
  );
}

export async function saveEmergencyContactAction(input: unknown) {
  return runAction(
    emergencyContactSchema,
    input,
    (d, actor) => svc.upsertEmergencyContact(actor, d),
    "Emergency contact saved",
  );
}

export async function deleteEmergencyContactAction(id: string) {
  return runAction(
    z.string().min(1),
    id,
    (cid, actor) => svc.deleteEmergencyContact(actor, cid),
    "Contact removed",
  );
}

export async function updateFinancialInfoAction(input: unknown) {
  return runAction(
    financialInfoSchema,
    input,
    (d, actor) => svc.updateFinancialInfo(actor, d),
    "Statutory & bank details saved",
  );
}
