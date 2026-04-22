import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { type TrendPoint } from "../types";
import { ALL_LINES, DEFAULT_ON_FULL } from "../utils/chartLines";

interface TrendChartProps {
  data: TrendPoint[] | null;
  loading: boolean;
  unit: string;
  scenario: string;
  metric: string;
}

function formatTs(ts: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return ts;
  }
}

function formatVal(v: number, unit: string): string {
  if (unit === "ms" || unit === "milliseconds") return `${v.toFixed(1)}ms`;
  if (unit === "bytes")
    return v >= 1024 * 1024
      ? `${(v / 1024 / 1024).toFixed(2)}MB`
      : v >= 1024
        ? `${(v / 1024).toFixed(1)}KB`
        : `${v}B`;
  return `${v.toFixed(2)} ${unit}`;
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-cf-navy border border-cf-border rounded-lg p-3 text-xs shadow-lg">
      <p className="text-cf-muted mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-cf-text font-mono">
            {formatVal(p.value, unit)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({
  data,
  loading,
  unit,
  scenario,
  metric,
}: TrendChartProps) {
  const title =
    scenario && metric
      ? `${scenario} — ${metric}`
      : "Select a scenario & metric to view trends";
  const [activeKeys, setActiveKeys] = useState<Set<string>>(DEFAULT_ON_FULL);

  function toggleKey(key: string) {
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="bg-cf-card border border-cf-border rounded-lg p-5">
        <div className="h-4 w-48 bg-cf-border rounded animate-pulse mb-4" />
        <div className="h-[280px] bg-cf-border/20 rounded animate-pulse" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-cf-card border border-cf-border rounded-lg p-5">
        <h2 className="text-cf-text font-semibold text-sm mb-4">
          Trend Over Time
        </h2>
        <div className="h-[280px] flex flex-col items-center justify-center text-cf-muted gap-2">
          <svg
            className="w-10 h-10 opacity-30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
            />
          </svg>
          <span className="text-sm">
            {!scenario || !metric
              ? "Select a scenario and metric above"
              : "No trend data for this selection"}
          </span>
        </div>
      </div>
    );
  }

  const activeLines = ALL_LINES.filter((l) => activeKeys.has(l.key as string));

  const chartData = data.map((d) => ({
    ts: formatTs(d.timestamp),
    fullTs: d.timestamp,
    commit: d.commit_sha ? d.commit_sha.slice(0, 7) : null,
    min_val: d.min_val,
    p50: d.p50,
    p75: d.p75,
    p90: d.p90,
    p95: d.p95,
    p99: d.p99,
    max_val: d.max_val,
    mean_val: d.mean_val,
  }));

  const allVals = data.flatMap(
    (d) =>
      activeLines
        .map((l) => d[l.key] as number | null)
        .filter((v) => v != null) as number[],
  );
  const avg = allVals.length
    ? allVals.reduce((a, b) => a + b, 0) / allVals.length
    : null;

  return (
    <div className="bg-cf-card border border-cf-border rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-cf-text font-semibold text-sm">
            Trend Over Time
          </h2>
          <p className="text-cf-muted text-xs mt-0.5">{title}</p>
        </div>
        <span className="text-cf-muted text-xs">
          {data.length} data point{data.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {ALL_LINES.map((l) => {
          const on = activeKeys.has(l.key as string);
          return (
            <button
              key={l.key as string}
              onClick={() => toggleKey(l.key as string)}
              className="px-2 py-0.5 rounded text-xs font-mono font-medium border transition-opacity"
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
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3142" />
          <XAxis
            dataKey="ts"
            tick={{ fill: "#6b7896", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#2a3142" }}
          />
          <YAxis
            tick={{ fill: "#6b7896", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#2a3142" }}
            tickFormatter={(v: number) => formatVal(v, unit)}
            width={64}
          />
          <Tooltip content={<CustomTooltip unit={unit} />} />
          <Legend
            wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
            formatter={(value) => (
              <span style={{ color: "#9ca3af" }}>{value}</span>
            )}
          />
          {avg !== null && (
            <ReferenceLine
              y={avg}
              stroke="#2a3142"
              strokeDasharray="4 4"
              label={{ value: "avg", fill: "#4b5563", fontSize: 10 }}
            />
          )}
          {activeLines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.label}
              stroke={l.color}
              strokeWidth={l.dashed ? 1.5 : 2}
              strokeDasharray={l.dashed ? "4 4" : undefined}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
