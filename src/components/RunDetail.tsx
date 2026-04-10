import { useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { type PerfRun, type RunDetailResponse } from '../types';

interface RunDetailProps {
  run: PerfRun;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatDate(ts: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(ts));
  } catch {
    return ts;
  }
}

function MetricVal({ v, unit }: { v: number | null; unit: string }) {
  if (v === null || v === undefined) return <span className="text-cf-border">—</span>;
  const fmt = (n: number) => {
    if (unit === 'ms' || unit === 'milliseconds') return `${n.toFixed(2)}ms`;
    if (unit === 'bytes') return n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${Math.round(n)}B`;
    return `${n.toFixed(3)} ${unit}`;
  };
  return <span className="font-mono text-cf-text">{fmt(v)}</span>;
}

export function RunDetail({ run, onClose }: RunDetailProps) {
  const { data, loading } = useApi<RunDetailResponse>(`/api/runs/${run.run_id}`);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const byScenario = data?.metrics.reduce<Record<string, typeof data.metrics>>((acc, m) => {
    if (!acc[m.scenario]) acc[m.scenario] = [];
    acc[m.scenario].push(m);
    return acc;
  }, {}) ?? {};

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-cf-navy border-l border-cf-border w-full max-w-3xl h-full overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-cf-navy border-b border-cf-border px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-cf-text font-semibold text-base">Run Details</h2>
            <p className="text-cf-muted text-xs mt-0.5 font-mono">{run.run_id}</p>
          </div>
          <button onClick={onClose} className="text-cf-muted hover:text-cf-text transition-colors p-1">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Run metadata */}
        <div className="px-6 py-5 border-b border-cf-border">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Timestamp', value: formatDate(run.timestamp) },
              { label: 'Branch', value: run.branch ?? '—' },
              { label: 'Trigger', value: run.trigger ?? '—' },
              { label: 'Duration', value: formatDuration(run.duration_ms) },
              { label: 'Pass', value: `${run.passed} / ${run.total}` },
              { label: 'SDK Version', value: run.sdk_version ?? '—' },
              { label: 'Commit', value: run.commit_sha ? run.commit_sha.slice(0, 12) : '—' },
              ...(run.worker_url ? [{ label: 'Worker URL', value: run.worker_url }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-cf-muted text-xs uppercase tracking-wide">{label}</span>
                <span className="text-cf-text text-sm font-mono break-all">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Metrics by scenario */}
        <div className="px-6 py-5">
          <h3 className="text-cf-text font-semibold text-sm mb-4">Metrics</h3>
          {loading && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-cf-card border border-cf-border rounded-lg animate-pulse" />
              ))}
            </div>
          )}
          {!loading && Object.keys(byScenario).length === 0 && (
            <p className="text-cf-muted text-sm">No metrics recorded for this run.</p>
          )}
          {!loading && Object.entries(byScenario).map(([scenario, metrics]) => (
            <div key={scenario} className="mb-6">
              <h4 className="text-cf-orange font-medium text-xs uppercase tracking-wide mb-3">{scenario}</h4>
              <div className="overflow-x-auto rounded-lg border border-cf-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-cf-card border-b border-cf-border">
                      <th className="text-left text-cf-muted px-3 py-2 font-medium">Metric</th>
                      <th className="text-right text-cf-muted px-3 py-2 font-medium">Samples</th>
                      <th className="text-right text-cf-muted px-3 py-2 font-medium">Min</th>
                      <th className="text-right text-cf-muted px-3 py-2 font-medium">Mean</th>
                      <th className="text-right text-cf-muted px-3 py-2 font-medium">p50</th>
                      <th className="text-right text-cf-muted px-3 py-2 font-medium">p90</th>
                      <th className="text-right text-cf-muted px-3 py-2 font-medium">p95</th>
                      <th className="text-right text-cf-muted px-3 py-2 font-medium">p99</th>
                      <th className="text-right text-cf-muted px-3 py-2 font-medium">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map((m) => (
                      <tr key={m.metric_name} className="border-b border-cf-border/50 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 text-cf-text font-medium">{m.metric_name}</td>
                        <td className="px-3 py-2 text-right text-cf-muted">{m.sample_count}</td>
                        <td className="px-3 py-2 text-right"><MetricVal v={m.min_val} unit={m.unit} /></td>
                        <td className="px-3 py-2 text-right"><MetricVal v={m.mean_val} unit={m.unit} /></td>
                        <td className="px-3 py-2 text-right"><MetricVal v={m.p50} unit={m.unit} /></td>
                        <td className="px-3 py-2 text-right"><MetricVal v={m.p90} unit={m.unit} /></td>
                        <td className="px-3 py-2 text-right"><MetricVal v={m.p95} unit={m.unit} /></td>
                        <td className="px-3 py-2 text-right"><MetricVal v={m.p99} unit={m.unit} /></td>
                        <td className="px-3 py-2 text-right"><MetricVal v={m.max_val} unit={m.unit} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
