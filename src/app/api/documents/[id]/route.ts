import { contentDisposition, withApi } from "@/lib/api";
import { getDocumentForDownload } from "@/server/services/document.service";

export const dynamic = "force-dynamic";

export const GET = withApi<{ params: Promise<{ id: string }> }>(async (req, actor, { params }) => {
  const { id } = await params;
  const { doc, body } = await getDocumentForDownload(actor, id);
  const inline =
    new URL(req.url).searchParams.get("inline") === "1" &&
    (doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/"));
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(body.length),
      "Content-Disposition": contentDisposition(doc.name, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
