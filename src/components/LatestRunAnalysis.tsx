import { useState } from "react";
import { type RunAnalysis, type MetricChange } from "../types";
import { formatValue } from "../utils/format";

interface LatestRunAnalysisProps {
  data: RunAnalysis | null;
  loading: boolean;
}

function fmtNum(val: number, unit: string | null): string {
  const u = unit?.toLowerCase() ?? "";
  const kind =
    u === "%" || u === "percent"
      ? "rate"
      : u === "count" || u === "counts"
        ? "count"
        : "latency";
  return formatValue(val, kind, unit);
}

function fmtPct(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;
}

function MetricRow({
  item,
  valueEl,
  subEl,
  borderColor,
}: {
  item: MetricChange;
  valueEl: React.ReactNode;
  subEl: React.ReactNode;
  borderColor: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-3 border-b border-cf-border/50 last:border-0 hover:bg-white/[0.02] transition-colors"
      style={{ borderLeftColor: borderColor, borderLeftWidth: 3 }}
    >
      <div className="min-w-0">
        <span className="text-cf-text text-xs font-medium">
          {item.scenario}
        </span>
        <span className="text-cf-border mx-1.5">/</span>
        <span className="text-cf-muted text-xs">{item.metric_name}</span>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs font-mono">{valueEl}</div>
        <div className="text-xs text-cf-muted mt-0.5">{subEl}</div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  accentColor,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  accentColor: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-cf-card border border-cf-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: accentColor }}
          />
          <span className="text-cf-text text-sm font-medium">{title}</span>
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: `${accentColor}22`,
              color: accentColor,
            }}
          >
            {count}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-cf-muted transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function FailuresSection({ items }: { items: MetricChange[] }) {
  return (
    <CollapsibleSection
      title="Direct Failures — count/percent dropped"
      count={items.length}
      accentColor="#ef4444"
      defaultOpen={true}
    >
      {items.map((f) => (
        <MetricRow
          key={`${f.scenario}||${f.metric_name}`}
          item={f}
          borderColor="#ef4444"
          valueEl={
            <span className="text-red-400">
              {fmtNum(f.historicalMean, f.unit)}{" "}
              <span className="text-cf-muted">→</span>{" "}
              <span className="font-bold">{fmtNum(f.current, f.unit)}</span>
            </span>
          }
          subEl={`${fmtPct(f.pctChange)} · ${f.sampleCount} samples`}
        />
      ))}
    </CollapsibleSection>
  );
}

function ShortTermRegressionsSection({ items }: { items: MetricChange[] }) {
  return (
    <CollapsibleSection
      title="Short-term Regressions — sudden spike"
      count={items.length}
      accentColor="#f97316"
      defaultOpen={true}
    >
      {items.slice(0, 15).map((r) => (
        <MetricRow
          key={`${r.scenario}||${r.metric_name}`}
          item={r}
          borderColor="#f97316"
          valueEl={
            <span className="text-orange-400">
              {fmtNum(r.historicalMean, r.unit)}{" "}
              <span className="text-cf-muted">→</span>{" "}
              <span className="font-bold">{fmtNum(r.current, r.unit)}</span>
            </span>
          }
          subEl={`z=${r.zScore.toFixed(2)}σ · ${fmtPct(r.pctChange)} · ${r.sampleCount} samples`}
        />
      ))}
    </CollapsibleSection>
  );
}

function ShortTermImprovementsSection({ items }: { items: MetricChange[] }) {
  return (
    <CollapsibleSection
      title="Short-term Improvements — sudden drop"
      count={items.length}
      accentColor="#22c55e"
      defaultOpen={true}
    >
      {items.slice(0, 15).map((imp) => (
        <MetricRow
          key={`${imp.scenario}||${imp.metric_name}`}
          item={imp}
          borderColor="#22c55e"
          valueEl={
            <span className="text-green-400">
              {fmtNum(imp.historicalMean, imp.unit)}{" "}
              <span className="text-cf-muted">→</span>{" "}
              <span className="font-bold">{fmtNum(imp.current, imp.unit)}</span>
            </span>
          }
          subEl={`z=${imp.zScore.toFixed(2)}σ · ${fmtPct(imp.pctChange)} · ${imp.sampleCount} samples`}
        />
      ))}
    </CollapsibleSection>
  );
}

function LongTermRegressionsSection({ items }: { items: MetricChange[] }) {
  return (
    <CollapsibleSection
      title="Long-term Regression Trends — gradual increase"
      count={items.length}
      accentColor="#f59e0b"
      defaultOpen={true}
    >
      {items.slice(0, 15).map((r) => (
        <MetricRow
          key={`${r.scenario}||${r.metric_name}`}
          item={r}
          borderColor="#f59e0b"
          valueEl={
            <span className="text-amber-400 font-bold">
              +{(r.slopePctPerRun * 100).toFixed(2)}%/run
            </span>
          }
          subEl={`mean ${fmtNum(r.historicalMean, r.unit)} · ${r.sampleCount} samples`}
        />
      ))}
    </CollapsibleSection>
  );
}

function LongTermImprovementsSection({ items }: { items: MetricChange[] }) {
  return (
    <CollapsibleSection
      title="Long-term Improvement Trends — gradual decrease"
      count={items.length}
      accentColor="#22c55e"
      defaultOpen={true}
    >
      {items.slice(0, 15).map((imp) => (
        <MetricRow
          key={`${imp.scenario}||${imp.metric_name}`}
          item={imp}
          borderColor="#22c55e"
          valueEl={
            <span className="text-green-400 font-bold">
              {(imp.slopePctPerRun * 100).toFixed(2)}%/run
            </span>
          }
          subEl={`mean ${fmtNum(imp.historicalMean, imp.unit)} · ${imp.sampleCount} samples`}
        />
      ))}
    </CollapsibleSection>
  );
}

export function LatestRunAnalysis({ data, loading }: LatestRunAnalysisProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div
            key={i}
            className="bg-cf-card border border-cf-border rounded-lg h-12 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-cf-card border border-cf-border rounded-lg px-5 py-12 text-center">
        <p className="text-cf-muted text-sm">
          No analysis data available. Run your first benchmark to get started.
        </p>
      </div>
    );
  }

  const {
    metrics,
    failures,
    shortTermRegressions,
    shortTermImprovements,
    longTermRegressions,
    longTermImprovements,
    historyRunCount,
  } = data;
  const measuredCount = metrics.filter((m) => m.mean_val != null).length;
  const allClear =
    failures.length === 0 &&
    shortTermRegressions.length === 0 &&
    longTermRegressions.length === 0 &&
    shortTermImprovements.length === 0 &&
    longTermImprovements.length === 0;

  if (allClear) {
    return (
      <div className="bg-cf-card border border-cf-border rounded-lg px-5 py-10 text-center">
        <p className="text-cf-text text-sm font-medium">
          No regressions or improvements detected
        </p>
        <p className="text-cf-muted text-xs mt-1">
          All {measuredCount} metrics are within normal range vs{" "}
          {historyRunCount} historical runs
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {failures.length > 0 && <FailuresSection items={failures} />}
      {shortTermRegressions.length > 0 && (
        <ShortTermRegressionsSection items={shortTermRegressions} />
      )}
      {longTermRegressions.length > 0 && (
        <LongTermRegressionsSection items={longTermRegressions} />
      )}
      {shortTermImprovements.length > 0 && (
        <ShortTermImprovementsSection items={shortTermImprovements} />
      )}
      {longTermImprovements.length > 0 && (
        <LongTermImprovementsSection items={longTermImprovements} />
      )}
    </div>
  );
}
