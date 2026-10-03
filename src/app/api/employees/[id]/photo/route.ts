import { withApi } from "@/lib/api";
import { sniffMime } from "@/lib/storage/validation";
import { readProfilePhoto } from "@/server/services/document.service";

export const dynamic = "force-dynamic";

export const GET = withApi<{ params: Promise<{ id: string }> }>(async (_req, actor, { params }) => {
  const { id } = await params;
  const body = await readProfilePhoto(actor, id);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": sniffMime(body.subarray(0, 16)) ?? "application/octet-stream", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
});
