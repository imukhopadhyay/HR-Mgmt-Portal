"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { runAction } from "@/lib/action";

export async function markAllNotificationsRead(_: unknown) {
  return runAction(z.any(), _, async (_d, actor) => {
    await db.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
  }, "All notifications marked as read");
}

export async function markNotificationRead(id: string) {
  return runAction(z.string().min(1), id, async (nid, actor) => {
    // Scoped by userId so users can only touch their own notifications.
    await db.notification.updateMany({ where: { id: nid, userId: actor.id }, data: { readAt: new Date() } });
  }, "Marked as read");
}
