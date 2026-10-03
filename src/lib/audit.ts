import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { redact } from "@/lib/logger";

export interface AuditActor {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEntry {
  action: string; // e.g. "employee.create"
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "object") {
    const keys = Object.keys(value as object).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  return JSON.stringify(value);
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Strip secrets / sensitive keys and normalise Decimals/Dates.
  return JSON.parse(JSON.stringify(redact(value))) as Prisma.InputJsonValue;
}

export function computeAuditHash(prevHash: string | null, payload: Record<string, unknown>): string {
  return createHash("sha256").update(`${prevHash ?? "GENESIS"}|${canonical(payload)}`).digest("hex");
}

/**
 * Append an audit record inside the caller's transaction so that the business
 * change and its audit entry commit atomically. Writes are serialised with a
 * transaction-scoped advisory lock to keep the hash chain linear.
 */
export async function writeAudit(tx: Tx, actor: AuditActor | null, entry: AuditEntry) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(727274)`;
  const last = await tx.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
  const createdAt = new Date();
  const before = toJson(entry.before);
  const after = toJson(entry.after);
  const payload = {
    actorId: actor?.id ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary ?? null,
    before: before ?? null,
    after: after ?? null,
    createdAt: createdAt.toISOString(),
  };
  const hash = computeAuditHash(last?.hash ?? null, payload);
  await tx.auditLog.create({
    data: {
      actorId: payload.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: payload.entityId,
      summary: payload.summary,
      before,
      after,
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
      prevHash: last?.hash ?? null,
      hash,
      createdAt,
    },
  });
}

/** Audit outside of an existing transaction (e.g. login events). */
export async function audit(actor: AuditActor | null, entry: AuditEntry) {
  await db.$transaction((tx) => writeAudit(tx, actor, entry));
}

/** Re-compute the chain and report the first broken link, if any. */
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; brokenAtSeq?: string }> {
  let prev: string | null = null;
  let checked = 0;
  let cursor: bigint | undefined;
  for (;;) {
    const rows: Awaited<ReturnType<typeof db.auditLog.findMany>> = await db.auditLog.findMany({
      where: cursor !== undefined ? { seq: { gt: cursor } } : undefined,
      orderBy: { seq: "asc" },
      take: 1000,
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const payload = {
        actorId: r.actorId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        before: r.before ?? null,
        after: r.after ?? null,
        createdAt: r.createdAt.toISOString(),
      };
      if (r.prevHash !== prev || computeAuditHash(prev, payload) !== r.hash) {
        return { ok: false, checked, brokenAtSeq: r.seq.toString() };
      }
      prev = r.hash;
      checked++;
      cursor = r.seq;
    }
  }
  return { ok: true, checked };
}
