import { z } from "zod";
import { optDateKey, optId, reqText } from "./common";

export const announcementSchema = z.object({
  id: z.string().optional(),
  title: reqText(150, "Title"),
  body: reqText(5000, "Message"),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]),
  departmentId: optId,
  expiresAt: optDateKey,
  notify: z.boolean().default(true),
});
