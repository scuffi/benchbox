import { useState } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { TrendPoint } from "../types";
import type { MetricKind } from "../scenarios";
import { formatValue } from "../utils/format";
import { MINI_LINES, DEFAULT_ON_MINI } from "../utils/chartLines";

interface MiniTrendChartProps {
  title: string;
  trend: TrendPoint[];
  kind: MetricKind;
  unit: string | null;
  color?: string;
}

interface TooltipPayload {
  value: number;
  name: string;
  color: string;
}

function MiniTooltip({
  active,
  payload,
  kind,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  kind: MetricKind;
  unit: string | null;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-cf-navy border border-cf-border rounded px-2.5 py-1.5 text-xs shadow-lg">
      <div className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <div key={p.name} className="flex justify-between gap-3">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="text-cf-text font-mono">
              {formatValue(p.value, kind, unit)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MiniTrendChart({
  title,
  trend,
  kind,
  unit,
  color = "#F48120",
}: MiniTrendChartProps) {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(DEFAULT_ON_MINI);

  function toggleKey(key: string) {
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const lines = MINI_LINES.map((l) => ({
    ...l,
    color: l.key === "p50" ? color : l.color,
  }));

  const activeLines = lines.filter((l) => activeKeys.has(l.key as string));

  if (trend.length === 0) {
    return (
      <div className="bg-cf-card border border-cf-border rounded-lg p-4">
        <h3 className="text-cf-text text-xs font-medium mb-3">{title}</h3>
        <div className="h-[90px] flex items-center justify-center">
          <span className="text-cf-muted text-xs">No trend data</span>
        </div>
      </div>
    );
  }

  const chartData = trend.map((d) => ({
    min_val: d.min_val,
    p50: d.p50,
    p75: d.p75,
    p90: d.p90,
    p95: d.p95,
    p99: d.p99,
    max_val: d.max_val,
    mean_val: d.mean_val,
  }));

  const latestActive = activeLines[0]?.key
    ? chartData[chartData.length - 1]?.[
        activeLines[0].key as keyof (typeof chartData)[0]
      ]
    : null;

  return (
    <div className="bg-cf-card border border-cf-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-cf-text text-xs font-medium">{title}</h3>
        {latestActive != null && (
          <span className="font-mono text-xs text-cf-text">
            {formatValue(latestActive as number, kind, unit)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {lines.map((l) => {
          const on = activeKeys.has(l.key as string);
          return (
            <button
              key={l.key as string}
              onClick={() => toggleKey(l.key as string)}
              className="px-1.5 py-0.5 rounded text-xs font-mono border transition-colors"
              style={{
                borderColor: l.color,
                color: on ? l.color : "#4b5563",
                backgroundColor: on ? `${l.color}18` : "transparent",
                borderStyle: l.dashed ? "dashed" : "solid",
              }}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      <span className="text-cf-muted text-xs">
        {trend.length} run{trend.length !== 1 ? "s" : ""}
      </span>
      <ResponsiveContainer width="100%" height={90}>
        <LineChart
          data={chartData}
          margin={{ top: 6, right: 4, left: 0, bottom: 2 }}
        >
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            content={<MiniTooltip kind={kind} unit={unit} />}
            cursor={{ stroke: "#2a3142", strokeWidth: 1 }}
          />
          {activeLines.map((l) => (
            <Line
              key={l.key as string}
              type="monotone"
              dataKey={l.key as string}
              name={l.label}
              stroke={l.color}
              strokeWidth={l.dashed ? 1 : 2}
              strokeDasharray={l.dashed ? "3 3" : undefined}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
