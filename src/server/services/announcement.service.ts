import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertPermission } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";
import { notifyUsers } from "@/lib/notifications";

export async function saveAnnouncement(
  actor: Actor,
  input: {
    id?: string;
    title: string;
    body: string;
    priority: "LOW" | "NORMAL" | "HIGH";
    departmentId?: string;
    expiresAt?: string;
    notify: boolean;
  },
) {
  assertPermission(actor, "announcement:manage");
  const data = {
    title: input.title,
    body: input.body,
    priority: input.priority,
    departmentId: input.departmentId ?? null,
    expiresAt: input.expiresAt ? new Date(`${input.expiresAt}T23:59:59Z`) : null,
  };
  const a = await db.$transaction(async (tx) => {
    const a = input.id
      ? await tx.announcement.update({ where: { id: input.id }, data })
      : await tx.announcement.create({ data: { ...data, authorId: actor.id } });
    await writeAudit(tx, actor, {
      action: input.id ? "announcement.update" : "announcement.publish",
      entityType: "Announcement",
      entityId: a.id,
      summary: input.title,
    });
    return a;
  });
  if (!input.id && input.notify) {
    const users = await db.user.findMany({
      where: {
        isActive: true,
        ...(input.departmentId ? { employee: { departmentId: input.departmentId } } : {}),
      },
      select: { id: true },
    });
    await notifyUsers(
      users.map((u) => u.id),
      {
        type: "announcement",
        title: input.priority === "HIGH" ? `Important: ${input.title}` : input.title,
        body: input.body.slice(0, 200),
        link: "/announcements",
      },
      { email: input.priority === "HIGH" },
    );
  }
  return a;
}

export async function deleteAnnouncement(actor: Actor, id: string) {
  assertPermission(actor, "announcement:manage");
  const a = await db.announcement.findFirst({ where: { id, deletedAt: null } });
  if (!a) throw new NotFoundError("Announcement");
  await db.$transaction(async (tx) => {
    await tx.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit(tx, actor, {
      action: "announcement.delete",
      entityType: "Announcement",
      entityId: id,
      summary: a.title,
    });
  });
}
