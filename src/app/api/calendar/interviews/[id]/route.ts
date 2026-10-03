import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { db } from "@/lib/db";
import { buildIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";

export const GET = withApi<{ params: Promise<{ id: string }> }>(async (_req, actor, { params }) => {
  const { id } = await params;
  const i = await db.interview.findUnique({
    where: { id },
    include: { candidate: { include: { recruitment: { select: { title: true } } } } },
  });
  if (!i) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (i.interviewerId !== actor.employeeId && !actor.permissions.has("recruitment:manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ics = buildIcs([
    {
      uid: `interview-${i.id}`,
      start: i.scheduledAt,
      end: new Date(i.scheduledAt.getTime() + i.durationMinutes * 60_000),
      summary: `Interview: ${i.candidate.firstName} ${i.candidate.lastName} (${i.round})`,
      description: `${i.candidate.recruitment.title} — ${i.mode.toLowerCase()} interview`,
      location: i.location ?? undefined,
    },
  ]);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="interview-${i.id}.ics"`,
    },
  });
});
