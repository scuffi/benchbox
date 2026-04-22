import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { MetricData } from '../hooks/useScenarioData';
import { formatValue } from '../utils/format';

interface GroupDef {
  key: string;
  label: string;
  color: string;
}

interface SizeScalingChartProps {
  data: MetricData[];
  title: string;
  unit: string | null;
  groups: GroupDef[];
  sizes: string[];
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active, payload, label, unit,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  unit: string | null;
}) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((p) => p.value != null);
  return (
    <div className="bg-cf-navy border border-cf-border rounded-lg p-3 text-xs shadow-lg">
      <p className="text-cf-muted mb-2 font-medium">{label}</p>
      {visible.map((p) => (
        <div key={p.name} className="flex justify-between gap-6">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-cf-text font-mono">{formatValue(p.value, 'latency', unit)}</span>
        </div>
      ))}
    </div>
  );
}

export function SizeScalingChart({ data, title, unit, groups, sizes }: SizeScalingChartProps) {
  const chartData = sizes.map((size) => {
    const point: Record<string, string | number | null> = { size };
    for (const g of groups) {
      const match = data.find((d) => d.metric.group === g.key && d.metric.size === size);
      point[g.key] = match?.current?.p50 ?? match?.current?.mean_val ?? null;
    }
    return point;
  });

  const hasData = chartData.some((row) => groups.some((g) => row[g.key] != null));

  if (!hasData) {
    return (
      <div className="bg-cf-card border border-cf-border rounded-lg p-5">
        <h2 className="text-cf-text font-semibold text-sm mb-4">{title}</h2>
        <div className="h-[220px] flex items-center justify-center text-cf-muted text-sm">
          No data available yet
        </div>
      </div>
    );
  }

  return (
    <div className="bg-cf-card border border-cf-border rounded-lg p-5">
      <h2 className="text-cf-text font-semibold text-sm mb-4">{title}</h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3142" vertical={false} />
          <XAxis
            dataKey="size"
            tick={{ fill: '#6b7896', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#2a3142' }}
          />
          <YAxis
            tick={{ fill: '#6b7896', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#2a3142' }}
            tickFormatter={(v: number) => formatValue(v, 'latency', unit)}
            width={64}
          />
          <Tooltip
            content={<CustomTooltip unit={unit} />}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
            formatter={(v) => <span style={{ color: '#9ca3af' }}>{v}</span>}
          />
          {groups.map((g) => (
            <Bar
              key={g.key}
              dataKey={g.key}
              name={g.label}
              fill={g.color}
              radius={[3, 3, 0, 0]}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
