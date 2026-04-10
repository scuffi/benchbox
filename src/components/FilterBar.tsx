import { type Filters, type ScenarioCombo, type FiltersResponse } from '../types';

interface FilterBarProps {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  scenarios: ScenarioCombo[];
  filterOptions: FiltersResponse | null;
}

function Select({
  label, value, onChange, children, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label className="text-cf-muted text-xs font-medium uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-cf-card border border-cf-border text-cf-text text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-cf-orange disabled:opacity-50 min-w-[130px]"
      >
        {children}
      </select>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label className="text-cf-muted text-xs font-medium uppercase tracking-wide">{label}</label>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-cf-card border border-cf-border text-cf-text text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-cf-orange"
      />
    </div>
  );
}

export function FilterBar({ filters, onChange, scenarios, filterOptions }: FilterBarProps) {
  const scenarioOptions = Array.from(
    new Map(scenarios.map((s) => [s.scenario, s])).values()
  );

  const metricOptions = filters.scenario
    ? scenarios.filter((s) => s.scenario === filters.scenario)
    : scenarios;

  const handleScenarioChange = (scenario: string) => {
    const firstMetric = scenarios.find((s) => s.scenario === scenario);
    onChange({ scenario, metric: firstMetric?.metric_name ?? '' });
  };

  return (
    <div className="bg-cf-card border-b border-cf-border px-6 py-4">
      <div className="flex flex-wrap gap-4 items-end">
        <Select label="Branch" value={filters.branch} onChange={(v) => onChange({ branch: v })}>
          <option value="">All branches</option>
          {filterOptions?.branches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </Select>

        <Select label="Trigger" value={filters.trigger} onChange={(v) => onChange({ trigger: v })}>
          <option value="">All triggers</option>
          {filterOptions?.triggers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>

        <DateInput label="From" value={filters.from} onChange={(v) => onChange({ from: v })} />
        <DateInput label="To" value={filters.to} onChange={(v) => onChange({ to: v })} />

        <Select
          label="Scenario"
          value={filters.scenario}
          onChange={handleScenarioChange}
          disabled={scenarioOptions.length === 0}
        >
          <option value="">All scenarios</option>
          {scenarioOptions.map((s) => (
            <option key={s.scenario} value={s.scenario}>{s.scenario}</option>
          ))}
        </Select>

        <Select
          label="Metric"
          value={filters.metric}
          onChange={(v) => onChange({ metric: v })}
          disabled={metricOptions.length === 0}
        >
          <option value="">All metrics</option>
          {metricOptions.map((m) => (
            <option key={`${m.scenario}-${m.metric_name}`} value={m.metric_name}>
              {m.metric_name} ({m.unit})
            </option>
          ))}
        </Select>

        {(filters.branch || filters.trigger || filters.from || filters.to || filters.scenario || filters.metric) && (
          <button
            onClick={() => onChange({ branch: '', trigger: '', from: '', to: '', scenario: '', metric: '' })}
            className="text-cf-muted hover:text-cf-orange text-xs underline self-end pb-2 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
