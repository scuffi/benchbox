import { useMemo, type ReactNode } from "react";
import { type ScenarioDef } from "../scenarios";
import type { PerfMetric } from "../types";
import { useScenarioData, type MetricData } from "../hooks/useScenarioData";
import { MetricCard } from "./MetricCard";
import { MiniTrendChart } from "./MiniTrendChart";
import { SizeScalingChart } from "./SizeScalingChart";

interface ScenarioDashboardProps {
  scenario: ScenarioDef;
  latestMetrics: PerfMetric[] | null;
  branch: string;
  refreshKey: number;
}

const FILE_IO_GROUPS_READWRITE = [
  { key: "write", label: "Write", color: "#F48120" },
  { key: "read", label: "Read", color: "#6366f1" },
  { key: "roundtrip", label: "Roundtrip", color: "#22c55e" },
];
const FILE_IO_GROUPS_CONCURRENT = [
  { key: "conc-write", label: "Conc. Write", color: "#f59e0b" },
  { key: "conc-read", label: "Conc. Read", color: "#a78bfa" },
];
const FILE_IO_SIZES = ["1KB", "10KB", "100KB", "1MB"];
const FILE_IO_CONC_SIZES = ["1KB", "10KB", "100KB"];

const BACKUP_GROUPS = [
  { key: "create", label: "Create", color: "#F48120" },
  { key: "restore", label: "Restore", color: "#6366f1" },
];
const BACKUP_SIZES = ["Small", "Medium", "Large"];

function SkeletonCard() {
  return (
    <div className="bg-cf-card border border-cf-border rounded-lg p-4 h-24 animate-pulse" />
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-cf-muted text-xs font-semibold uppercase tracking-widest mb-3">
      {children}
    </h3>
  );
}

export function ScenarioDashboard({
  scenario,
  latestMetrics,
  branch,
  refreshKey,
}: ScenarioDashboardProps) {
  const { data, loading } = useScenarioData(
    scenario.id,
    scenario.metrics,
    latestMetrics,
    branch,
    refreshKey,
  );

  const unit = useMemo(() => {
    const m = latestMetrics?.find((lm) => lm.scenario === scenario.id);
    return m?.unit ?? "ms";
  }, [latestMetrics, scenario.id]);

  if (loading && data.every((d) => d.trend.length === 0 && !d.current)) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {scenario.metrics.slice(0, 5).map((m) => (
            <SkeletonCard key={m.name} />
          ))}
        </div>
      </div>
    );
  }

  if (scenario.id === "file-io")
    return <FileIoLayout data={data} scenario={scenario} unit={unit} />;
  if (scenario.id === "backup-restore")
    return <BackupRestoreLayout data={data} scenario={scenario} unit={unit} />;
  return <StandardLayout data={data} scenario={scenario} unit={unit} />;
}

// ---------------------------------------------------------------------------
// Standard layout — bucket-mounting, bursty-traffic, sustained-throughput,
//                   concurrent-creation, burst-startup, cold-start
// ---------------------------------------------------------------------------

function StandardLayout({
  data,
  scenario,
  unit,
}: {
  data: MetricData[];
  scenario: ScenarioDef;
  unit: string;
}) {
  const cardCols =
    data.length <= 3
      ? "grid-cols-1 sm:grid-cols-3"
      : data.length <= 5
        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";

  const trendCols =
    data.length <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : data.length <= 4
        ? "grid-cols-2 lg:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 ${cardCols}`}>
        {data.map((d) => (
          <MetricCard
            key={d.metric.name}
            data={d}
            accentColor={scenario.color}
            large={data.length <= 3}
          />
        ))}
      </div>

      <div>
        <SectionLabel>Trend over time</SectionLabel>
        <div className={`grid gap-4 ${trendCols}`}>
          {data.map((d) => (
            <MiniTrendChart
              key={d.metric.name}
              title={d.metric.label}
              trend={d.trend}
              kind={d.metric.kind}
              unit={d.current?.unit ?? unit}
              color={scenario.color}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File I/O layout — grouped by size, with scaling charts
// ---------------------------------------------------------------------------

function FileIoLayout({
  data,
  scenario,
  unit,
}: {
  data: MetricData[];
  scenario: ScenarioDef;
  unit: string;
}) {
  const SIZES = ["1KB", "10KB", "100KB", "1MB"];

  return (
    <div className="space-y-8">
      {SIZES.map((size) => {
        const sizeData = data.filter((d) => d.metric.size === size);
        if (sizeData.length === 0) return null;
        return (
          <div key={size}>
            <SectionLabel>{size}</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {sizeData.map((d) => (
                <MetricCard
                  key={d.metric.name}
                  data={d}
                  accentColor={scenario.color}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div>
        <SectionLabel>Size scaling comparison</SectionLabel>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SizeScalingChart
            data={data}
            title="Read / Write / Roundtrip Latency by Size (p50)"
            unit={unit}
            groups={FILE_IO_GROUPS_READWRITE}
            sizes={FILE_IO_SIZES}
          />
          <SizeScalingChart
            data={data}
            title="Concurrent Read / Write Latency by Size (p50)"
            unit={unit}
            groups={FILE_IO_GROUPS_CONCURRENT}
            sizes={FILE_IO_CONC_SIZES}
          />
        </div>
      </div>

      <div>
        <SectionLabel>Write trend</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {data
            .filter((d) => d.metric.group === "write")
            .map((d) => (
              <MiniTrendChart
                key={d.metric.name}
                title={d.metric.size ?? d.metric.label}
                trend={d.trend}
                kind={d.metric.kind}
                unit={d.current?.unit ?? unit}
                color="#F48120"
              />
            ))}
        </div>
      </div>

      <div>
        <SectionLabel>Read trend</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {data
            .filter((d) => d.metric.group === "read")
            .map((d) => (
              <MiniTrendChart
                key={d.metric.name}
                title={d.metric.size ?? d.metric.label}
                trend={d.trend}
                kind={d.metric.kind}
                unit={d.current?.unit ?? unit}
                color="#6366f1"
              />
            ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backup/Restore layout — grouped by size + after-restore section
// ---------------------------------------------------------------------------

function BackupRestoreLayout({
  data,
  scenario,
  unit,
}: {
  data: MetricData[];
  scenario: ScenarioDef;
  unit: string;
}) {
  const sizedData = data.filter((d) => d.metric.group !== "after");
  const afterData = data.filter((d) => d.metric.group === "after");

  return (
    <div className="space-y-8">
      {BACKUP_SIZES.map((size) => {
        const sizeData = sizedData.filter((d) => d.metric.size === size);
        if (sizeData.length === 0) return null;
        return (
          <div key={size}>
            <SectionLabel>{size}</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sizeData.map((d) => (
                <MetricCard
                  key={d.metric.name}
                  data={d}
                  accentColor={scenario.color}
                  large
                />
              ))}
            </div>
          </div>
        );
      })}

      <div>
        <SectionLabel>Create vs Restore by size (p50)</SectionLabel>
        <SizeScalingChart
          data={sizedData}
          title="Create vs Restore Latency"
          unit={unit}
          groups={BACKUP_GROUPS}
          sizes={BACKUP_SIZES}
        />
      </div>

      {afterData.length > 0 && (
        <div>
          <SectionLabel>After restore</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {afterData.map((d) => (
              <div key={d.metric.name} className="space-y-3">
                <MetricCard data={d} accentColor={scenario.color} large />
                <MiniTrendChart
                  title={`${d.metric.label} trend`}
                  trend={d.trend}
                  kind={d.metric.kind}
                  unit={d.current?.unit ?? unit}
                  color={scenario.color}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
