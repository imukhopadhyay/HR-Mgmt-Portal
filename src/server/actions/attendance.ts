"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { adminAttendanceSchema, correctionSchema, decisionSchema, holidaySchema, shiftSchema } from "@/lib/validation/attendance";
import * as svc from "@/server/services/attendance.service";

export async function checkInAction(_: unknown) {
  return runAction(z.any(), _, async (_d, actor) => {
    await svc.checkIn(actor);
  }, "Checked in");
}

export async function checkOutAction(_: unknown) {
  return runAction(z.any(), _, async (_d, actor) => {
    await svc.checkOut(actor);
  }, "Checked out");
}

export async function requestCorrectionAction(input: unknown) {
  return runAction(correctionSchema, input, async (d, actor) => {
    await svc.requestCorrection(actor, d);
  }, "Correction request submitted");
}

export async function cancelCorrectionAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.cancelCorrection(actor, d), "Request cancelled");
}

export async function decideCorrectionAction(input: unknown) {
  return runAction(decisionSchema, input, (d, actor) => svc.decideCorrection(actor, d), "Correction processed");
}

export async function adminSetAttendanceAction(input: unknown) {
  return runAction(adminAttendanceSchema, input, (d, actor) => svc.adminSetAttendance(actor, d), "Attendance updated");
}

export async function saveShiftAction(input: unknown) {
  return runAction(shiftSchema, input, async (d, actor) => {
    await svc.saveShift(actor, d);
  }, "Shift saved");
}

export async function deleteShiftAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.deleteShift(actor, d), "Shift deleted");
}

export async function saveHolidayAction(input: unknown) {
  return runAction(holidaySchema, input, async (d, actor) => {
    await svc.saveHoliday(actor, d);
  }, "Holiday saved");
}

export async function deleteHolidayAction(id: string) {
  return runAction(z.string().min(1), id, (d, actor) => svc.deleteHoliday(actor, d), "Holiday deleted");
}
