import { z } from "zod";

const pct = z.coerce.number().min(0).max(100);
const amt = z.coerce.number().min(0).max(1e9);
const slab = z.object({ upTo: z.union([amt, z.null()]), rate: pct });
const ptSlab = z.object({ upTo: z.union([amt, z.null()]), amount: amt });

function lastOpen<T extends { upTo: number | null }>(arr: T[]) {
  return arr.length > 0 && arr[arr.length - 1].upTo === null && arr.slice(0, -1).every((s, i, a) => s.upTo !== null && (i === 0 || (a[i - 1].upTo ?? 0) < s.upTo));
}

export const statutoryConfigSchema = z.object({
  pf: z.object({ enabled: z.boolean(), employeeRate: pct, employerRate: pct, wageCeiling: amt, applyCeiling: z.boolean() }),
  esi: z.object({ enabled: z.boolean(), employeeRate: pct, employerRate: pct, grossThreshold: amt }),
  professionalTax: z.object({
    enabled: z.boolean(),
    defaultSlabs: z.array(ptSlab).min(1).refine(lastOpen, "Slabs must ascend and end with an open (no upper bound) slab"),
    stateSlabs: z.record(z.string().min(2).max(40), z.array(ptSlab).min(1).refine(lastOpen, "Slabs must ascend and end with an open slab")),
  }),
  tds: z.object({
    enabled: z.boolean(),
    regime: z.literal("NEW"),
    standardDeduction: amt,
    slabs: z.array(slab).min(1).refine(lastOpen, "Slabs must ascend and end with an open (no upper bound) slab"),
    rebateLimit: amt,
    cessRate: pct,
  }),
});

export const retentionSchema = z.object({
  exitedEmployeeYears: z.coerce.number().int().min(1).max(30),
  rejectedCandidateMonths: z.coerce.number().int().min(1).max(120),
  notificationDays: z.coerce.number().int().min(7).max(3650),
  securityTokenDays: z.coerce.number().int().min(1).max(365),
  auditLogYears: z.coerce.number().int().min(1).max(30),
});
