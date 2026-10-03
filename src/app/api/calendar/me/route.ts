import { withApi } from "@/lib/api";
import { db } from "@/lib/db";
import { addDaysKey, dateKeyToDb, dbDateToKey, todayKey } from "@/lib/dates";
import { buildIcs, type IcsEvent } from "@/lib/ics";

export const dynamic = "force-dynamic";

/** Personal calendar: approved leave, company holidays and interviews you conduct (next 12 months). */
export const GET = withApi(async (_req, actor) => {
  const from = todayKey();
  const to = addDaysKey(from, 365);
  const [holidays, leave, interviews] = await Promise.all([
    db.holiday.findMany({ where: { date: { gte: dateKeyToDb(from), lte: dateKeyToDb(to) } } }),
    actor.employeeId ? db.leaveRequest.findMany({ where: { employeeId: actor.employeeId, status: "APPROVED", endDate: { gte: dateKeyToDb(from) } }, include: { leaveType: { select: { name: true } } } }) : [],
    actor.employeeId ? db.interview.findMany({ where: { interviewerId: actor.employeeId, status: "SCHEDULED", scheduledAt: { gte: new Date() } }, include: { candidate: { select: { firstName: true, lastName: true } } } }) : [],
  ]);
  const events: IcsEvent[] = [
    ...holidays.map((h) => ({ uid: `holiday-${h.id}`, start: h.date, end: dateKeyToDb(addDaysKey(dbDateToKey(h.date), 1)), summary: `Holiday: ${h.name}`, allDay: true })),
    ...leave.map((l) => ({ uid: `leave-${l.id}`, start: l.startDate, end: dateKeyToDb(addDaysKey(dbDateToKey(l.endDate), 1)), summary: `${l.leaveType.name}${l.halfDay ? " (half day)" : ""}`, allDay: true })),
    ...interviews.map((i) => ({ uid: `interview-${i.id}`, start: i.scheduledAt, end: new Date(i.scheduledAt.getTime() + i.durationMinutes * 60_000), summary: `Interview: ${i.candidate.firstName} ${i.candidate.lastName}`, location: i.location ?? undefined })),
  ];
  return new Response(buildIcs(events, "My HR calendar"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="hr-calendar.ics"', "Cache-Control": "private, no-store" } });
});
