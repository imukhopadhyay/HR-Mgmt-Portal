/** Minimal RFC 5545 calendar generation for "Add to calendar" downloads. */
function fmt(d: Date) {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export interface IcsEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  allDay?: boolean;
}

export function buildIcs(events: IcsEvent[], name = "HR Portal") {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HR Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@hr-portal`, `DTSTAMP:${fmt(new Date())}`);
    if (e.allDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${e.start.toISOString().slice(0, 10).replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${e.end.toISOString().slice(0, 10).replace(/-/g, "")}`,
      );
    } else {
      lines.push(`DTSTART:${fmt(e.start)}`, `DTEND:${fmt(e.end)}`);
    }
    lines.push(`SUMMARY:${esc(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
