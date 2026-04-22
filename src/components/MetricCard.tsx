import type { MetricData } from "../hooks/useScenarioData";
import { formatValue } from "../utils/format";

function getPrimaryValue(data: MetricData): number | null {
  const m = data.current;
  if (!m) return null;
  const kind = data.metric.kind;
  if (kind === "rate" || kind === "count" || kind === "throughput")
    return m.mean_val;
  return m.p50 ?? m.mean_val;
}

function getPrevPrimaryValue(data: MetricData): number | null {
  const trend = data.trend;
  if (trend.length < 2) return null;
  const prev = trend[trend.length - 2];
  const kind = data.metric.kind;
  if (kind === "rate" || kind === "count" || kind === "throughput")
    return prev.mean_val;
  return prev.p50 ?? prev.mean_val;
}

interface MetricCardProps {
  data: MetricData;
  accentColor?: string;
  large?: boolean;
}

export function MetricCard({
  data,
  accentColor = "#F48120",
  large = false,
}: MetricCardProps) {
  const current = getPrimaryValue(data);
  const prev = getPrevPrimaryValue(data);
  const unit = data.current?.unit ?? null;
  const kind = data.metric.kind;

  let pctChange: number | null = null;
  if (current != null && prev != null && prev !== 0) {
    pctChange = (current - prev) / prev;
  }

  const higherIsBetter = data.metric.higherIsBetter;
  let changeColor = "text-cf-muted";
  let arrowUp = true;
  let isSignificant = false;

  if (pctChange !== null && Math.abs(pctChange) > 0.005) {
    isSignificant = true;
    arrowUp = pctChange > 0;
    if (higherIsBetter == null) {
      changeColor = "text-cf-muted";
    } else if (pctChange > 0 === higherIsBetter) {
      changeColor = "text-green-400";
    } else {
      changeColor = "text-red-400";
    }
  }

  const formattedCurrent = formatValue(current, kind, unit);
  const formattedPrev = prev != null ? formatValue(prev, kind, unit) : null;

  return (
    <div
      className="bg-cf-card border border-cf-border rounded-lg p-4 flex flex-col gap-2 min-w-0"
      style={{ borderLeftColor: accentColor, borderLeftWidth: 3 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-cf-muted text-xs font-medium uppercase tracking-wide truncate">
          {data.metric.label}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-cf-border/60 text-cf-muted capitalize shrink-0">
          {kind}
        </span>
      </div>

      <div
        className={`font-mono font-semibold text-cf-text leading-none ${large ? "text-3xl" : "text-xl"}`}
      >
        {formattedCurrent}
      </div>

      {isSignificant && formattedPrev && (
        <div className={`text-xs flex items-center gap-1 ${changeColor}`}>
          <span>{arrowUp ? "↑" : "↓"}</span>
          <span>
            {pctChange! >= 0 ? "+" : ""}
            {(pctChange! * 100).toFixed(1)}% vs prev
          </span>
          <span className="text-cf-border mx-0.5">·</span>
          <span className="text-cf-muted">{formattedPrev}</span>
        </div>
      )}

      {!isSignificant && data.trend.length > 1 && (
        <span className="text-xs text-cf-muted">Stable vs prev run</span>
      )}

      {data.trend.length === 0 && !data.current && (
        <span className="text-xs text-cf-muted">No data yet</span>
      )}
    </div>
  );
}
