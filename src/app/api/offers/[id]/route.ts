import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { contentDisposition, withApi } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function wrap(text: string, max: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if ((line + " " + word).trim().length > max) {
        out.push(line);
        line = word;
      } else line = (line + " " + word).trim();
    }
    out.push(line);
  }
  return out;
}

export const GET = withApi<{ params: Promise<{ id: string }> }>(async (_req, actor, { params }) => {
  if (!actor.permissions.has("recruitment:manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const c = await db.candidate.findFirst({ where: { id, deletedAt: null } });
  if (!c?.offerLetter) return NextResponse.json({ error: "No offer generated" }, { status: 404 });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  for (const line of wrap(
    c.offerLetter.replace(/[^\x20-\x7E\n]/g, (ch) => (ch === "₹" ? "Rs." : "?")),
    95,
  )) {
    if (y < 50) {
      page = pdf.addPage([595, 842]);
      y = 790;
    }
    page.drawText(line, { x: 50, y, size: 10, font });
    y -= 15;
  }
  await db.$transaction((tx) =>
    writeAudit(tx, actor, {
      action: "candidate.offer_download",
      entityType: "Candidate",
      entityId: c.id,
    }),
  );
  return new Response(new Uint8Array(await pdf.save()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(`offer-${c.firstName}-${c.lastName}.pdf`),
      "Cache-Control": "private, no-store",
    },
  });
});
