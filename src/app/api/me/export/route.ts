import { withApi } from "@/lib/api";
import { exportMyData } from "@/server/services/privacy.service";

export const dynamic = "force-dynamic";

/** Right-of-access export of the signed-in employee's personal data (JSON). */
export const GET = withApi(async (_req, actor) => {
  const data = await exportMyData(actor);
  return new Response(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="my-hr-data.json"', "Cache-Control": "private, no-store" },
  });
});
