import { useState, useMemo, useCallback } from "react";
import { useApi } from "./hooks/useApi";
import { Header } from "./components/Header";
import { FilterBar } from "./components/FilterBar";
import { SummaryCards } from "./components/SummaryCards";
import { TrendChart } from "./components/TrendChart";
import { PercentilesChart } from "./components/PercentilesChart";
import { RunsTable } from "./components/RunsTable";
import { RunDetail } from "./components/RunDetail";
import { ScenarioNav } from "./components/ScenarioNav";
import { ScenarioDashboard } from "./components/ScenarioDashboard";
import { SCENARIOS } from "./scenarios";
import {
  type Filters,
  type PerfRun,
  type SummaryResponse,
  type FiltersResponse,
  type ScenarioCombo,
  type TrendPoint,
  type RunDetailResponse,
} from "./types";

function buildQuery(base: string, params: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

const DEFAULT_FILTERS: Filters = {
  branch: "main",
  trigger: "",
  from: "",
  to: "",
  scenario: "",
  metric: "",
};

function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedRun, setSelectedRun] = useState<PerfRun | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);

  const handleFiltersChange = useCallback((partial: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const runsUrl = useMemo(
    () =>
      buildQuery("/api/runs", {
        branch: filters.branch,
        trigger: filters.trigger,
        from: filters.from,
        to: filters.to,
        _k: String(refreshKey),
      }),
    [filters.branch, filters.trigger, filters.from, filters.to, refreshKey],
  );

  const trendUrl = useMemo(() => {
    if (!filters.scenario || !filters.metric) return null;
    return buildQuery("/api/trend", {
      scenario: filters.scenario,
      metric: filters.metric,
      branch: filters.branch,
      from: filters.from,
      to: filters.to,
      _k: String(refreshKey),
    });
  }, [filters, refreshKey]);

  const summaryUrl = useMemo(
    () => buildQuery("/api/summary", { _k: String(refreshKey) }),
    [refreshKey],
  );
  const scenariosUrl = useMemo(
    () => buildQuery("/api/scenarios", { _k: String(refreshKey) }),
    [refreshKey],
  );
  const filtersUrl = useMemo(
    () => buildQuery("/api/filters", { _k: String(refreshKey) }),
    [refreshKey],
  );

  const { data: runs, loading: runsLoading } = useApi<PerfRun[]>(runsUrl);
  const { data: summary, loading: summaryLoading } =
    useApi<SummaryResponse>(summaryUrl);
  const { data: scenarios } = useApi<ScenarioCombo[]>(scenariosUrl);
  const { data: filterOptions } = useApi<FiltersResponse>(filtersUrl);
  const { data: trendData, loading: trendLoading } =
    useApi<TrendPoint[]>(trendUrl);

  const latestRunMetrics = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    return runs[0];
  }, [runs]);

  const anyLoading = runsLoading || summaryLoading;

  const latestRunMetricsUrl = useMemo(() => {
    if (!latestRunMetrics) return null;
    return `/api/runs/${latestRunMetrics.run_id}`;
  }, [latestRunMetrics]);

  const { data: latestRunDetail } =
    useApi<RunDetailResponse>(latestRunMetricsUrl);

  const percentilesMetrics = useMemo(() => {
    return latestRunDetail?.metrics ?? null;
  }, [latestRunDetail]);

  const trendUnit = useMemo(() => {
    if (!trendData || trendData.length === 0) {
      return (
        scenarios?.find(
          (s) =>
            s.scenario === filters.scenario && s.metric_name === filters.metric,
        )?.unit ?? ""
      );
    }
    return trendData[0].unit ?? "";
  }, [trendData, scenarios, filters.scenario, filters.metric]);

  const activeScenarioDef = activeScenario
    ? (SCENARIOS.find((s) => s.id === activeScenario) ?? null)
    : null;

  return (
    <div className="min-h-screen bg-cf-navy flex flex-col">
      <Header onRefresh={handleRefresh} refreshing={anyLoading} />

      <ScenarioNav
        scenarios={SCENARIOS}
        active={activeScenario}
        onChange={setActiveScenario}
      />

      <FilterBar
        filters={filters}
        onChange={handleFiltersChange}
        scenarios={scenarios ?? []}
        filterOptions={filterOptions}
        hideMetricPickers={activeScenario !== null}
      />

      <main className="flex-1 px-6 py-6 max-w-screen-2xl mx-auto w-full">
        {activeScenarioDef ? (
          <div className="space-y-2">
            <div className="mb-6">
              <h2 className="text-cf-text font-semibold text-lg">
                {activeScenarioDef.label}
              </h2>
              <p className="text-cf-muted text-sm mt-0.5">
                {activeScenarioDef.description}
              </p>
            </div>
            <ScenarioDashboard
              scenario={activeScenarioDef}
              latestMetrics={percentilesMetrics}
              branch={filters.branch}
              refreshKey={refreshKey}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <SummaryCards data={summary} loading={summaryLoading} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <TrendChart
                data={trendData}
                loading={trendLoading}
                unit={trendUnit}
                scenario={filters.scenario}
                metric={filters.metric}
              />
              <PercentilesChart
                metrics={percentilesMetrics}
                loading={runsLoading}
                scenario={filters.scenario}
                metric={filters.metric}
              />
            </div>

            <RunsTable
              runs={runs}
              loading={runsLoading}
              onSelectRun={setSelectedRun}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-cf-border px-6 py-3 text-center">
        <span className="text-cf-muted text-xs">
          BenchBox · Cloudflare Workers + D1 · {new Date().getFullYear()}
        </span>
      </footer>

      {selectedRun && (
        <RunDetail run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  );
}

export default App;
