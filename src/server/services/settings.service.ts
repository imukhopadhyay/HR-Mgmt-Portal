import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertPermission } from "@/lib/auth/rbac";
import {
  DEFAULT_RETENTION_POLICY,
  DEFAULT_STATUTORY_CONFIG,
  type RetentionPolicy,
  type StatutoryConfig,
} from "@/lib/settings-defaults";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.setting.findUnique({ where: { key } });
  return (s?.value as T | undefined) ?? fallback;
}

export const getStatutoryConfig = () =>
  getSetting<StatutoryConfig>("payroll.statutory", DEFAULT_STATUTORY_CONFIG);
export const getRetentionPolicy = () =>
  getSetting<RetentionPolicy>("privacy.retention", DEFAULT_RETENTION_POLICY);

async function save(actor: Actor, key: string, value: unknown, description: string) {
  assertPermission(actor, "settings:manage");
  await db.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key } });
    await tx.setting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue, updatedById: actor.id },
      create: { key, value: value as Prisma.InputJsonValue, description, updatedById: actor.id },
    });
    await writeAudit(tx, actor, {
      action: "settings.update",
      entityType: "Setting",
      entityId: key,
      before: before?.value,
      after: value,
    });
  });
}

export const saveStatutoryConfig = (actor: Actor, cfg: StatutoryConfig) =>
  save(actor, "payroll.statutory", cfg, "Indian statutory deduction rules");
export const saveRetentionPolicy = (actor: Actor, p: RetentionPolicy) =>
  save(actor, "privacy.retention", p, "Data retention periods");
