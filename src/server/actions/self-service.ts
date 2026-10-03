"use server";

import { runAction } from "@/lib/action";
import {
  profileUpdateSchema,
  reviewSchema,
  ticketSchema,
  ticketUpdateSchema,
} from "@/lib/validation/self-service";
import * as svc from "@/server/services/self-service.service";

export async function submitProfileUpdateAction(input: unknown) {
  return runAction(
    profileUpdateSchema,
    input,
    async (d, actor) => {
      await svc.submitProfileUpdate(actor, d);
    },
    "Request submitted to HR",
  );
}

export async function reviewProfileUpdateAction(input: unknown) {
  return runAction(
    reviewSchema,
    input,
    (d, actor) => svc.reviewProfileUpdate(actor, d),
    "Request processed",
  );
}

export async function createTicketAction(input: unknown) {
  return runAction(
    ticketSchema,
    input,
    async (d, actor) => {
      const t = await svc.createTicket(actor, d);
      return { id: t.id };
    },
    "Request raised",
  );
}

export async function updateTicketAction(input: unknown) {
  return runAction(
    ticketUpdateSchema,
    input,
    (d, actor) => svc.updateTicket(actor, d),
    "Request updated",
  );
}
