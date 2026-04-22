import { useState, useEffect } from 'react';
import type { TrendPoint, PerfMetric } from '../types';
import type { MetricDef } from '../scenarios';

export interface MetricData {
  metric: MetricDef;
  current: PerfMetric | null;
  trend: TrendPoint[];
}

export function useScenarioData(
  scenarioId: string | null,
  metrics: MetricDef[],
  latestMetrics: PerfMetric[] | null,
  branch: string,
  refreshKey: number,
): { data: MetricData[]; loading: boolean } {
  const [trends, setTrends] = useState<Map<string, TrendPoint[]>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!scenarioId || metrics.length === 0) {
      setTrends(new Map());
      return;
    }

    let cancelled = false;
    const controllers: AbortController[] = [];
    setLoading(true);

    const promises = metrics.map((m) => {
      const controller = new AbortController();
      controllers.push(controller);
      const params = new URLSearchParams({ scenario: scenarioId, metric: m.name, limit: '50' });
      if (branch) params.set('branch', branch);

      return fetch(`/api/trend?${params}`, { signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<TrendPoint[]>) : Promise.resolve([] as TrendPoint[])))
        .catch(() => [] as TrendPoint[])
        .then((data) => ({ name: m.name, data }));
    });

    Promise.all(promises).then((results) => {
      if (cancelled) return;
      const map = new Map<string, TrendPoint[]>();
      for (const r of results) map.set(r.name, r.data);
      setTrends(map);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  // metrics reference is stable (comes from SCENARIOS const), scenarioId change implies metrics change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, branch, refreshKey]);

  const data: MetricData[] = metrics.map((m) => ({
    metric: m,
    current: latestMetrics?.find((lm) => lm.scenario === scenarioId && lm.metric_name === m.name) ?? null,
    trend: trends.get(m.name) ?? [],
  }));

  return { data, loading };
}
