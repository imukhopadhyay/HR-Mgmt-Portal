"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { announcementSchema } from "@/lib/validation/announcement";
import * as svc from "@/server/services/announcement.service";

export async function saveAnnouncementAction(input: unknown) {
  return runAction(
    announcementSchema,
    input,
    async (d, actor) => {
      await svc.saveAnnouncement(actor, d);
    },
    "Announcement saved",
  );
}

export async function deleteAnnouncementAction(id: string) {
  return runAction(
    z.string().min(1),
    id,
    (d, actor) => svc.deleteAnnouncement(actor, d),
    "Announcement removed",
  );
}
