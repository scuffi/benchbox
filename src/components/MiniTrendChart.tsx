import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { TrendPoint } from '../types';
import type { MetricKind } from '../scenarios';
import { formatValue } from '../utils/format';

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
}

function MiniTooltip({
  active, payload, kind, unit,
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
            <span className="text-cf-muted">{p.name}</span>
            <span className="text-cf-text font-mono">{formatValue(p.value, kind, unit)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MiniTrendChart({ title, trend, kind, unit, color = '#F48120' }: MiniTrendChartProps) {
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

  const chartData = trend.map((d, i) => {
    const primary =
      kind === 'rate' || kind === 'count' || kind === 'throughput'
        ? d.mean_val
        : d.p50;
    return { i, primary, mean: d.mean_val };
  });

  const latest = chartData[chartData.length - 1];
  const latestVal = latest?.primary ?? latest?.mean;

  return (
    <div className="bg-cf-card border border-cf-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-cf-text text-xs font-medium">{title}</h3>
        {latestVal != null && (
          <span className="font-mono text-xs text-cf-text">{formatValue(latestVal, kind, unit)}</span>
        )}
      </div>
      <span className="text-cf-muted text-xs">{trend.length} run{trend.length !== 1 ? 's' : ''}</span>
      <ResponsiveContainer width="100%" height={90}>
        <LineChart data={chartData} margin={{ top: 6, right: 4, left: 0, bottom: 2 }}>
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            content={<MiniTooltip kind={kind} unit={unit} />}
            cursor={{ stroke: '#2a3142', strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="primary"
            name="p50"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="mean"
            name="mean"
            stroke="#334155"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
