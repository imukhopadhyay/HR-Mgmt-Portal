import "server-only";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  link?: string;
}

/**
 * Create in-app notifications for users and (optionally) email them.
 * Called after the business transaction commits; failures are logged, never thrown.
 */
export async function notifyUsers(
  userIds: (string | null | undefined)[],
  n: NotificationInput,
  opts: { email?: boolean } = {},
) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  try {
    await db.notification.createMany({ data: ids.map((userId) => ({ userId, ...n })) });
    if (opts.email) {
      const users = await db.user.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { email: true },
      });
      const link = n.link ? `\n\nOpen: ${env().APP_URL}${n.link}` : "";
      await Promise.all(
        users.map((u) => sendEmail({ to: u.email, subject: n.title, text: `${n.body}${link}` })),
      );
    }
  } catch (err) {
    logger.error("notify.failed", { type: n.type, err });
  }
}

export async function notifyEmployees(
  employeeIds: (string | null | undefined)[],
  n: NotificationInput,
  opts: { email?: boolean } = {},
) {
  const ids = employeeIds.filter((x): x is string => !!x);
  if (!ids.length) return;
  const rows = await db.employee.findMany({ where: { id: { in: ids } }, select: { userId: true } });
  await notifyUsers(
    rows.map((r) => r.userId),
    n,
    opts,
  );
}

/** Users holding any of the given permissions (e.g. all HR approvers). */
export async function usersWithPermission(permission: string): Promise<string[]> {
  const rows = await db.user.findMany({
    where: {
      isActive: true,
      roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
