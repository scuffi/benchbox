import { type SummaryResponse } from '../types';

interface SummaryCardsProps {
  data: SummaryResponse | null;
  loading: boolean;
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-cf-card border border-cf-border rounded-lg px-5 py-4 flex flex-col gap-1">
      <span className="text-cf-muted text-xs font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-semibold ${accent ? 'text-cf-orange' : 'text-cf-text'}`}>{value}</span>
      {sub && <span className="text-cf-muted text-xs">{sub}</span>}
    </div>
  );
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
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return ts;
  }
}

export function SummaryCards({ data, loading }: SummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-cf-card border border-cf-border rounded-lg px-5 py-4 h-[84px] animate-pulse" />
        ))}
      </div>
    );
  }

  const counts = data?.counts;
  const latest = data?.latest;

  const passRate = counts && counts.total_runs > 0
    ? `${Math.round((counts.perfect_runs / counts.total_runs) * 100)}%`
    : '—';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card
        label="Total Runs"
        value={counts ? String(counts.total_runs) : '—'}
        sub={counts ? `${counts.branch_count} branch${counts.branch_count !== 1 ? 'es' : ''}` : undefined}
      />
      <Card
        label="Perfect Pass Rate"
        value={passRate}
        sub={counts ? `${counts.perfect_runs} of ${counts.total_runs} runs` : undefined}
        accent={true}
      />
      <Card
        label="Avg Duration"
        value={counts?.avg_duration_ms ? formatDuration(counts.avg_duration_ms) : '—'}
        sub="across all runs"
      />
      <Card
        label="Last Run"
        value={latest ? formatDate(latest.timestamp) : '—'}
        sub={latest ? (latest.branch ?? 'unknown branch') : undefined}
      />
    </div>
  );
}
