import { useState, useMemo, useCallback, useEffect } from "react";
import { useApi } from "./hooks/useApi";
import { Header } from "./components/Header";
import { FilterBar } from "./components/FilterBar";
import { SummaryCards } from "./components/SummaryCards";
import { RunsTable } from "./components/RunsTable";
import { RunDetail } from "./components/RunDetail";
import { ScenarioDashboard } from "./components/ScenarioDashboard";
import { LatestRunAnalysis } from "./components/LatestRunAnalysis";
import { SCENARIOS } from "./scenarios";
import {
  type Filters,
  type PerfRun,
  type SummaryResponse,
  type FiltersResponse,
  type RunDetailResponse,
  type RunAnalysis,
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
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("cf-theme");
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  const handleThemeToggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("cf-theme", next);
      return next;
    });
  }, []);

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

  const summaryUrl = useMemo(
    () => buildQuery("/api/summary", { _k: String(refreshKey) }),
    [refreshKey],
  );
  const filtersUrl = useMemo(
    () => buildQuery("/api/filters", { _k: String(refreshKey) }),
    [refreshKey],
  );
  const analysisUrl = useMemo(
    () => buildQuery("/api/analysis", { _k: String(refreshKey) }),
    [refreshKey],
  );

  const { data: runs, loading: runsLoading } = useApi<PerfRun[]>(runsUrl);
  const { data: summary, loading: summaryLoading } =
    useApi<SummaryResponse>(summaryUrl);
  const { data: filterOptions } = useApi<FiltersResponse>(filtersUrl);
  const { data: analysis, loading: analysisLoading } =
    useApi<RunAnalysis>(analysisUrl);

  const anyLoading = runsLoading || summaryLoading || analysisLoading;

  const latestRunMetricsUrl = useMemo(() => {
    if (!analysis) return null;
    return `/api/runs/${analysis.run.run_id}`;
  }, [analysis]);

  const { data: latestRunDetail } =
    useApi<RunDetailResponse>(latestRunMetricsUrl);

  const percentilesMetrics = useMemo(() => {
    return latestRunDetail?.metrics ?? null;
  }, [latestRunDetail]);

  const activeScenarioDef = activeScenario
    ? (SCENARIOS.find((s) => s.id === activeScenario) ?? null)
    : null;

  return (
    <div className="min-h-screen bg-cf-navy flex flex-col">
      <Header
        onRefresh={handleRefresh}
        refreshing={anyLoading}
        scenarios={SCENARIOS}
        activeScenario={activeScenario}
        onScenarioChange={setActiveScenario}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />

      <FilterBar
        filters={filters}
        onChange={handleFiltersChange}
        filterOptions={filterOptions}
        hideMetricPickers={true}
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
            <SummaryCards
              data={summary}
              analysis={analysis}
              loading={summaryLoading || analysisLoading}
            />

            <LatestRunAnalysis data={analysis} loading={analysisLoading} />

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
