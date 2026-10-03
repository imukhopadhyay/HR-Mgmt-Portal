import type { Row } from "@/lib/export";
import type { Actor } from "@/lib/action";

/** Additional export builders registered by later modules (payroll, recruitment, training, analytics). */
export const extraReports: Record<string, (actor: Actor, q: URLSearchParams) => Promise<{ rows: Row[]; title: string }>> = {};
