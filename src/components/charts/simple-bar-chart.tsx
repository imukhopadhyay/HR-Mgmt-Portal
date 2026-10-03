"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function SimpleBarChart({
  data,
  height = 240,
  color = "var(--chart-1)",
  layout = "horizontal",
  valueLabel = "Count",
}: {
  data: { name: string; value: number }[];
  height?: number;
  color?: string;
  layout?: "horizontal" | "vertical";
  valueLabel?: string;
}) {
  if (!data.length)
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">No data for this period.</p>
    );
  const vertical = layout === "vertical";
  return (
    <div
      style={{ height }}
      role="img"
      aria-label={`${valueLabel} chart: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={vertical ? "vertical" : "horizontal"}
          margin={{ top: 4, right: vertical ? 32 : 12, bottom: 4, left: vertical ? 8 : -8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            horizontal={!vertical}
            vertical={vertical}
          />
          {/* Recharts discovers axes among direct children — no fragments here. */}
          <XAxis
            type={vertical ? "number" : "category"}
            dataKey={vertical ? undefined : "name"}
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            interval={vertical ? undefined : 0}
            angle={!vertical && data.length > 6 ? -25 : 0}
            textAnchor={!vertical && data.length > 6 ? "end" : "middle"}
            height={!vertical && data.length > 6 ? 60 : 30}
          />
          <YAxis
            type={vertical ? "category" : "number"}
            dataKey={vertical ? "name" : undefined}
            width={vertical ? 130 : 40}
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => [v, valueLabel]}
          />
          <Bar
            dataKey="value"
            name={valueLabel}
            fill={color}
            isAnimationActive={false}
            radius={4}
            maxBarSize={32}
            label={{
              position: vertical ? "right" : "top",
              fontSize: 11,
              fill: "var(--muted-foreground)",
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
