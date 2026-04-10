export interface PerfRun {
  run_id: string;
  timestamp: string;
  commit_sha: string | null;
  branch: string | null;
  sdk_version: string | null;
  duration_ms: number;
  passed: number;
  total: number;
  worker_url: string | null;
  trigger: string | null;
}

export interface PerfMetric {
  scenario: string;
  metric_name: string;
  unit: string;
  sample_count: number;
  min_val: number | null;
  max_val: number | null;
  mean_val: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  std_dev: number | null;
}

export interface ScenarioCombo {
  scenario: string;
  metric_name: string;
  unit: string;
}

export interface TrendPoint {
  run_id: string;
  timestamp: string;
  branch: string | null;
  commit_sha: string | null;
  mean_val: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  min_val: number | null;
  max_val: number | null;
  std_dev: number | null;
  unit: string;
}

export interface SummaryCounts {
  total_runs: number;
  perfect_runs: number;
  avg_duration_ms: number;
  branch_count: number;
}

export interface SummaryResponse {
  latest: PerfRun | null;
  counts: SummaryCounts | null;
}

export interface FiltersResponse {
  branches: string[];
  triggers: string[];
}

export interface RunDetailResponse {
  run: PerfRun;
  metrics: PerfMetric[];
}

export interface Filters {
  branch: string;
  trigger: string;
  from: string;
  to: string;
  scenario: string;
  metric: string;
}
