import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prev/next month navigation via the `month=YYYY-MM` query param. */
export function MonthPicker({ year, month, basePath, params = {} }: { year: number; month: number; basePath: string; params?: Record<string, string | undefined> }) {
  const shift = (d: number) => {
    const m = month + d;
    const y = year + Math.floor((m - 1) / 12);
    const mm = ((((m - 1) % 12) + 12) % 12) + 1;
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => !!v) as [string, string][]);
    q.set("month", `${y}-${String(mm).padStart(2, "0")}`);
    return `${basePath}?${q.toString()}`;
  };
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" asChild>
        <Link href={shift(-1)} aria-label="Previous month">
          <ChevronLeft />
        </Link>
      </Button>
      <span className="min-w-36 text-center text-sm font-medium">{label}</span>
      <Button variant="outline" size="icon" asChild>
        <Link href={shift(1)} aria-label="Next month">
          <ChevronRight />
        </Link>
      </Button>
    </div>
  );
}

export function parseMonth(value: string | undefined, fallbackKey: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) };
  return { year: Number(fallbackKey.slice(0, 4)), month: Number(fallbackKey.slice(5, 7)) };
}
