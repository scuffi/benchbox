import { type SummaryResponse, type RunAnalysis } from "../types";

interface SummaryCardsProps {
  data: SummaryResponse | null;
  analysis: RunAnalysis | null;
  loading: boolean;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatDate(ts: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return ts;
  }
}

type StatusLevel = "clear" | "issues" | "failures";

function getStatus(analysis: RunAnalysis | null): StatusLevel {
  if (!analysis) return "clear";
  if (analysis.failures.length > 0) return "failures";
  if (
    analysis.shortTermRegressions.length > 0 ||
    analysis.longTermRegressions.length > 0
  )
    return "issues";
  return "clear";
}

const STATUS_CONFIG = {
  clear: {
    label: "All Clear",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.3)",
  },
  issues: {
    label: "Issues Detected",
    color: "#f97316",
    bg: "rgba(249,115,22,0.08)",
    border: "rgba(249,115,22,0.3)",
  },
  failures: {
    label: "Failures Detected",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.3)",
  },
};

function StatDot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative flex h-3 w-3 shrink-0">
      {pulse && (
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative inline-flex rounded-full h-3 w-3"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

function CountRow({
  value,
  label,
  color,
  dim,
}: {
  value: number;
  label: string;
  color: string;
  dim?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="text-sm font-bold font-mono w-6 text-right shrink-0"
        style={{ color: dim ? "#7d8590" : color }}
      >
        {value}
      </span>
      <span className="text-xs text-cf-muted">{label}</span>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-cf-muted text-xs">{label}</span>
      <span className="text-cf-text text-xs font-mono">{value}</span>
    </div>
  );
}

export function SummaryCards({ data, analysis, loading }: SummaryCardsProps) {
  if (loading) {
    return (
      <div className="bg-cf-card border border-cf-border rounded-lg h-[120px] animate-pulse" />
    );
  }

  const counts = data?.counts;
  const run = analysis?.run ?? null;
  const status = getStatus(analysis);
  const cfg = STATUS_CONFIG[status];

  const failures = analysis?.failures.length ?? 0;
  const stRegressions = analysis?.shortTermRegressions.length ?? 0;
  const ltRegressions = analysis?.longTermRegressions.length ?? 0;
  const stImprovements = analysis?.shortTermImprovements.length ?? 0;
  const ltImprovements = analysis?.longTermImprovements.length ?? 0;
  const measuredCount =
    analysis?.metrics.filter((m) => m.mean_val != null).length ?? 0;

  const passRate =
    counts && counts.total_runs > 0
      ? `${Math.round((counts.perfect_runs / counts.total_runs) * 100)}%`
      : "—";

  return (
    <div
      className="bg-cf-card border border-cf-border rounded-lg overflow-hidden"
      style={{ borderLeftColor: cfg.color, borderLeftWidth: 4 }}
    >
      {/* Main body */}
      <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-start gap-6">
        {/* Left — status + run metadata */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2.5">
            <StatDot color={cfg.color} pulse={status === "failures"} />
            <span className="text-cf-text font-semibold text-base leading-none">
              {cfg.label}
            </span>
            {run && (
              <span className="text-cf-muted text-xs ml-1">
                {formatDate(run.timestamp)}
              </span>
            )}
          </div>

          {run ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
              <span className="bg-cf-border/50 text-cf-text font-mono px-2 py-0.5 rounded">
                {run.branch ?? "unknown"}
              </span>
              {run.commit_sha && (
                <span className="bg-cf-border/50 text-cf-muted font-mono px-2 py-0.5 rounded">
                  {run.commit_sha.slice(0, 7)}
                </span>
              )}
              {run.trigger && (
                <span className="bg-cf-border/50 text-cf-muted px-2 py-0.5 rounded capitalize">
                  {run.trigger}
                </span>
              )}
              <span className="text-cf-muted">·</span>
              <span
                className={`font-mono font-medium ${run.passed === run.total ? "text-green-400" : "text-red-400"}`}
              >
                {run.passed ?? "?"}/{run.total ?? "?"} passed
              </span>
              <span className="text-cf-muted">·</span>
              <span className="text-cf-muted font-mono">
                {formatDuration(run.duration_ms)}
              </span>
              {run.sdk_version && (
                <>
                  <span className="text-cf-muted/40">·</span>
                  <span className="text-cf-muted">SDK {run.sdk_version}</span>
                </>
              )}
              {analysis && (
                <>
                  <span className="text-cf-muted/40">·</span>
                  <span className="text-cf-muted">
                    {analysis.historyRunCount} runs compared
                  </span>
                </>
              )}
            </div>
          ) : (
            <p className="text-cf-muted text-xs">No runs found</p>
          )}
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px bg-cf-border self-stretch" />

        {/* Right — analysis counts */}
        {analysis ? (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 shrink-0">
            <CountRow
              value={failures}
              label="failures"
              color="#ef4444"
              dim={failures === 0}
            />
            <CountRow
              value={stRegressions}
              label="short-term regressions"
              color="#f97316"
              dim={stRegressions === 0}
            />
            <CountRow
              value={ltRegressions}
              label="long-term regressions"
              color="#f59e0b"
              dim={ltRegressions === 0}
            />
            <CountRow
              value={stImprovements}
              label="short-term improvements"
              color="#22c55e"
              dim={stImprovements === 0}
            />
            <CountRow
              value={ltImprovements}
              label="long-term improvements"
              color="#22c55e"
              dim={ltImprovements === 0}
            />
            <CountRow
              value={measuredCount}
              label="metrics measured"
              color="#F48120"
              dim={false}
            />
          </div>
        ) : (
          <div className="text-cf-muted text-xs">No analysis available</div>
        )}
      </div>

      {/* Footer bar — aggregate stats */}
      {counts && (
        <div className="px-6 py-2.5 border-t border-cf-border bg-cf-navy/40 flex flex-wrap gap-x-5 gap-y-1 items-center">
          <StatPill label="Total runs" value={String(counts.total_runs)} />
          <span className="text-cf-muted/40 text-xs">·</span>
          <StatPill label="Perfect pass rate" value={passRate} />
          <span className="text-cf-muted/40 text-xs">·</span>
          <StatPill
            label="Avg duration"
            value={formatDuration(counts.avg_duration_ms)}
          />
          <span className="text-cf-muted/40 text-xs">·</span>
          <StatPill label="Branches" value={String(counts.branch_count)} />
        </div>
      )}
    </div>
  );
}
