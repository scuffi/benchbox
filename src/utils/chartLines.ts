import type { TrendPoint } from '../types';

export interface LineDef {
  key: keyof TrendPoint;
  label: string;
  color: string;
  dashed?: boolean;
  defaultOn: boolean;
}

export const ALL_LINES: LineDef[] = [
  { key: 'min_val',  label: 'min',  color: '#22c55e', defaultOn: false },
  { key: 'p50',      label: 'p50',  color: '#F48120', defaultOn: true  },
  { key: 'p75',      label: 'p75',  color: '#f59e0b', defaultOn: false },
  { key: 'p90',      label: 'p90',  color: '#6366f1', defaultOn: true  },
  { key: 'p95',      label: 'p95',  color: '#8b5cf6', defaultOn: false },
  { key: 'p99',      label: 'p99',  color: '#ef4444', defaultOn: true  },
  { key: 'max_val',  label: 'max',  color: '#dc2626', defaultOn: false },
  { key: 'mean_val', label: 'mean', color: '#94a3b8', dashed: true, defaultOn: true },
];

export const MINI_LINES: LineDef[] = [
  { key: 'min_val',  label: 'min',  color: '#22c55e', defaultOn: false },
  { key: 'p50',      label: 'p50',  color: '#F48120', defaultOn: true  },
  { key: 'p75',      label: 'p75',  color: '#f59e0b', defaultOn: false },
  { key: 'p90',      label: 'p90',  color: '#6366f1', defaultOn: false },
  { key: 'p95',      label: 'p95',  color: '#8b5cf6', defaultOn: false },
  { key: 'p99',      label: 'p99',  color: '#ef4444', defaultOn: false },
  { key: 'max_val',  label: 'max',  color: '#dc2626', defaultOn: false },
  { key: 'mean_val', label: 'mean', color: '#94a3b8', dashed: true, defaultOn: true },
];

export const DEFAULT_ON_FULL = new Set(ALL_LINES.filter((l) => l.defaultOn).map((l) => l.key as string));
export const DEFAULT_ON_MINI = new Set(MINI_LINES.filter((l) => l.defaultOn).map((l) => l.key as string));
