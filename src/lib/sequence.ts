import type { Tx } from "@/lib/db";

/** Atomically increments and returns the next value of a named counter. */
export async function nextSequence(tx: Tx, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}

export function formatCode(prefix: string, n: number, width = 5) {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}
