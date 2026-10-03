"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Series {
  key: string;
  label: string;
  color: string;
}

/** Multi-series line chart (one y-axis), with crosshair tooltip, legend and a table view. */
export function TrendChart({
  data,
  xKey,
  series,
  height = 260,
  xFormat = "raw",
  title,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  height?: number;
  xFormat?: "day" | "month" | "raw";
  title: string;
}) {
  const formatX = (v: string) =>
    xFormat === "day"
      ? new Date(`${v}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })
      : xFormat === "month"
        ? new Date(`${v}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })
        : v;
  if (!data.length) return <p className="text-muted-foreground py-10 text-center text-sm">No data for this period.</p>;
  return (
    <figure>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey={xKey} tickFormatter={formatX} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <Tooltip
              labelFormatter={(v) => formatX(String(v))}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }}
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            />
            {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs">
        <summary className="text-muted-foreground cursor-pointer">View as table</summary>
        <div className="mt-2 max-h-60 overflow-auto">
          <table className="w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th className="py-1 pr-3 font-medium">Period</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1 pr-3 font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={String(d[xKey])} className="border-t">
                  <td className="py-1 pr-3">{formatX(String(d[xKey]))}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-3 tabular-nums">
                      {d[s.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
