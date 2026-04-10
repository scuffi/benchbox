import { useState } from 'react';
import { type PerfRun } from '../types';

interface RunsTableProps {
  runs: PerfRun[] | null;
  loading: boolean;
  onSelectRun: (run: PerfRun) => void;
}

type SortKey = 'timestamp' | 'duration_ms' | 'passed' | 'branch' | 'trigger';
type SortDir = 'asc' | 'desc';

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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  if (!dir) return <span className="text-cf-border ml-1">↕</span>;
  return <span className="text-cf-orange ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

function TriggerBadge({ trigger }: { trigger: string | null }) {
  const colors: Record<string, string> = {
    schedule: 'bg-indigo-500/20 text-indigo-400',
    release: 'bg-green-500/20 text-green-400',
    workflow_dispatch: 'bg-yellow-500/20 text-yellow-400',
    local: 'bg-gray-500/20 text-gray-400',
  };
  const cls = trigger ? (colors[trigger] ?? 'bg-gray-500/20 text-gray-400') : 'bg-gray-500/20 text-gray-400';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {trigger ?? 'unknown'}
    </span>
  );
}

function PassBadge({ passed, total }: { passed: number; total: number }) {
  const perfect = passed === total;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${perfect ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
      {passed}/{total}
    </span>
  );
}

export function RunsTable({ runs, loading, onSelectRun }: RunsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = runs
    ? [...runs].sort((a, b) => {
        let av: string | number = a[sortKey] ?? '';
        let bv: string | number = b[sortKey] ?? '';
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        av = String(av);
        bv = String(bv);
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      })
    : null;

  const headers: { key: SortKey; label: string }[] = [
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'branch', label: 'Branch' },
    { key: 'trigger', label: 'Trigger' },
    { key: 'passed', label: 'Pass' },
    { key: 'duration_ms', label: 'Duration' },
  ];

  return (
    <div className="bg-cf-card border border-cf-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-cf-border flex items-center justify-between">
        <h2 className="text-cf-text font-semibold text-sm">Benchmark Runs</h2>
        {runs && <span className="text-cf-muted text-xs">{runs.length} run{runs.length !== 1 ? 's' : ''}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cf-border">
              {headers.map((h) => (
                <th
                  key={h.key}
                  onClick={() => toggleSort(h.key)}
                  className="text-left text-cf-muted text-xs font-medium uppercase tracking-wide px-4 py-3 cursor-pointer select-none hover:text-cf-text transition-colors whitespace-nowrap"
                >
                  {h.label}
                  <SortIcon dir={sortKey === h.key ? sortDir : null} />
                </th>
              ))}
              <th className="px-4 py-3 text-left text-cf-muted text-xs font-medium uppercase tracking-wide">Commit</th>
              <th className="px-4 py-3 text-left text-cf-muted text-xs font-medium uppercase tracking-wide">SDK</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-cf-border/50">
                  {[...Array(8)].map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-cf-border/40 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            )}
            {!loading && (!sorted || sorted.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-cf-muted text-sm">
                  No benchmark runs found. Adjust your filters or run your first benchmark.
                </td>
              </tr>
            )}
            {!loading && sorted?.map((run) => (
              <tr
                key={run.run_id}
                className="border-b border-cf-border/50 hover:bg-white/[0.02] transition-colors group"
              >
                <td className="px-4 py-3 text-cf-text font-mono text-xs whitespace-nowrap">{formatDate(run.timestamp)}</td>
                <td className="px-4 py-3 text-cf-text text-xs font-mono">
                  {run.branch ? (
                    <span className="bg-cf-border/40 px-2 py-0.5 rounded text-cf-muted">{run.branch}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3"><TriggerBadge trigger={run.trigger} /></td>
                <td className="px-4 py-3"><PassBadge passed={run.passed} total={run.total} /></td>
                <td className="px-4 py-3 text-cf-muted font-mono text-xs">{formatDuration(run.duration_ms)}</td>
                <td className="px-4 py-3 text-cf-muted font-mono text-xs">
                  {run.commit_sha ? (
                    <span className="bg-cf-border/40 px-2 py-0.5 rounded">{run.commit_sha.slice(0, 7)}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-cf-muted text-xs">{run.sdk_version ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onSelectRun(run)}
                    className="opacity-0 group-hover:opacity-100 text-cf-orange hover:text-cf-orange-hover text-xs font-medium transition-all"
                  >
                    Details →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
