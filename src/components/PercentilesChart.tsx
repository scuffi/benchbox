import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { type PerfMetric } from '../types';

interface PercentilesChartProps {
  metrics: PerfMetric[] | null;
  loading: boolean;
  scenario: string;
  metric: string;
}

const PERCENTILE_COLORS: Record<string, string> = {
  min:  '#22c55e',
  p50:  '#F48120',
  p75:  '#f59e0b',
  p90:  '#6366f1',
  p95:  '#8b5cf6',
  p99:  '#ef4444',
  max:  '#dc2626',
  mean: '#94a3b8',
};

function formatVal(v: number, unit: string): string {
  if (unit === 'ms' || unit === 'milliseconds') return `${v.toFixed(1)}ms`;
  if (unit === 'bytes') return v >= 1048576 ? `${(v / 1048576).toFixed(2)}MB` : v >= 1024 ? `${(v / 1024).toFixed(1)}KB` : `${Math.round(v)}B`;
  return `${v.toFixed(2)} ${unit}`;
}

interface TooltipPayload {
  value: number;
  payload: { unit: string };
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const unit = payload[0]?.payload?.unit ?? '';
  return (
    <div className="bg-cf-navy border border-cf-border rounded-lg p-3 text-xs shadow-lg">
      <p style={{ color: PERCENTILE_COLORS[label ?? ''] ?? '#fff' }} className="font-medium mb-1">{label}</p>
      <p className="text-cf-text font-mono">{formatVal(payload[0].value, unit)}</p>
    </div>
  );
}

export function PercentilesChart({ metrics, loading, scenario, metric }: PercentilesChartProps) {
  if (loading) {
    return (
      <div className="bg-cf-card border border-cf-border rounded-lg p-5">
        <div className="h-4 w-48 bg-cf-border rounded animate-pulse mb-4" />
        <div className="h-[260px] bg-cf-border/20 rounded animate-pulse" />
      </div>
    );
  }

  const filtered = metrics?.filter(
    (m) =>
      (!scenario || m.scenario === scenario) &&
      (!metric || m.metric_name === metric)
  ) ?? [];

  if (filtered.length === 0) {
    return (
      <div className="bg-cf-card border border-cf-border rounded-lg p-5">
        <h2 className="text-cf-text font-semibold text-sm mb-4">Percentile Distribution</h2>
        <div className="h-[260px] flex flex-col items-center justify-center text-cf-muted gap-2">
          <svg className="w-10 h-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <span className="text-sm">
            {(!scenario || !metric) ? 'Select a scenario and metric above' : 'No percentile data for this selection'}
          </span>
        </div>
      </div>
    );
  }

  const m = filtered[filtered.length - 1];
  const unit = m.unit;

  const chartData = [
    { label: 'min',  value: m.min_val,  unit },
    { label: 'mean', value: m.mean_val, unit },
    { label: 'p50',  value: m.p50,      unit },
    { label: 'p75',  value: m.p75,      unit },
    { label: 'p90',  value: m.p90,      unit },
    { label: 'p95',  value: m.p95,      unit },
    { label: 'p99',  value: m.p99,      unit },
    { label: 'max',  value: m.max_val,  unit },
  ].filter((d) => d.value !== null && d.value !== undefined) as { label: string; value: number; unit: string }[];

  return (
    <div className="bg-cf-card border border-cf-border rounded-lg p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-cf-text font-semibold text-sm">Percentile Distribution</h2>
          <p className="text-cf-muted text-xs mt-0.5">
            {m.scenario} — {m.metric_name} · latest run · {m.sample_count} sample{m.sample_count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3142" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#6b7896', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#2a3142' }} />
          <YAxis
            tick={{ fill: '#6b7896', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#2a3142' }}
            tickFormatter={(v: number) => formatVal(v, unit)}
            width={64}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.label} fill={PERCENTILE_COLORS[entry.label] ?? '#F48120'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
