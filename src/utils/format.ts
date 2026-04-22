import type { MetricKind } from '../scenarios';

export function formatValue(value: number | null | undefined, kind: MetricKind | string, unit: string | null | undefined): string {
  if (value == null) return '—';
  const u = unit?.toLowerCase() ?? '';
  if (kind === 'rate' || u === '%' || u === 'percent') return `${value.toFixed(1)}%`;
  if (kind === 'count' || u === 'count' || u === 'counts') return Math.round(value).toLocaleString();
  if (kind === 'throughput') return `${value.toFixed(1)} ops/s`;
  if (u === 'ms' || u === 'milliseconds' || kind === 'latency' || kind === 'duration') {
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value.toFixed(1)}ms`;
  }
  return `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`;
}
