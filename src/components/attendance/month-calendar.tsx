import { cn, formatMinutes, humanize } from "@/lib/utils";
import { localTime } from "@/lib/dates";

export interface CalendarCell {
  key: string;
  status: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workMinutes: number;
  lateMinutes: number;
  note?: string;
}

const STYLE: Record<string, string> = {
  PRESENT: "bg-success/15 text-success border-success/30",
  HALF_DAY: "bg-warning/20 text-amber-700 dark:text-warning border-warning/40",
  ABSENT: "bg-destructive/12 text-destructive border-destructive/30",
  ON_LEAVE: "bg-primary/12 text-primary border-primary/30",
  HOLIDAY: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  WEEKLY_OFF: "bg-muted text-muted-foreground",
  NOT_MARKED: "border-dashed text-muted-foreground",
  UPCOMING: "text-muted-foreground/60",
};

const time = (d: Date | null) => (d ? localTime(d) : "");

export function MonthCalendar({ cells, today }: { cells: CalendarCell[]; today: string }) {
  const first = new Date(`${cells[0].key}T00:00:00Z`).getUTCDay();
  const blanks = (first + 6) % 7; // Monday-first grid
  return (
    <div>
      <div
        className="text-muted-foreground mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium"
        aria-hidden
      >
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1" aria-label="Attendance calendar">
        {Array.from({ length: blanks }).map((_, i) => (
          <li key={`b${i}`} aria-hidden />
        ))}
        {cells.map((c) => {
          const day = Number(c.key.slice(8));
          const label = `${c.key}: ${humanize(c.status)}${c.note ? ` (${c.note})` : ""}${c.workMinutes ? `, worked ${formatMinutes(c.workMinutes)}` : ""}${c.lateMinutes ? `, late ${c.lateMinutes} min` : ""}`;
          return (
            <li
              key={c.key}
              title={label}
              aria-label={label}
              className={cn(
                "flex min-h-16 flex-col rounded-md border p-1.5 text-xs sm:min-h-20",
                STYLE[c.status] ?? "",
                c.key === today && "ring-ring ring-2",
              )}
            >
              <span className="font-semibold">{day}</span>
              <span className="hidden truncate sm:block">
                {c.status === "UPCOMING" ? "" : humanize(c.status)}
              </span>
              {c.checkInAt && (
                <span className="hidden truncate opacity-80 md:block">
                  {time(c.checkInAt)}–{time(c.checkOutAt)}
                </span>
              )}
              {c.note && <span className="hidden truncate opacity-80 md:block">{c.note}</span>}
            </li>
          );
        })}
      </ol>
      <div className="text-muted-foreground mt-3 flex flex-wrap gap-3 text-xs">
        {["PRESENT", "HALF_DAY", "ABSENT", "ON_LEAVE", "HOLIDAY", "WEEKLY_OFF", "NOT_MARKED"].map(
          (s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn("inline-block size-3 rounded-sm border", STYLE[s])} aria-hidden />{" "}
              {humanize(s)}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
