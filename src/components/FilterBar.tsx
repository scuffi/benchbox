import { useState } from "react";
import { type Filters, type FiltersResponse } from "../types";

interface FilterBarProps {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  filterOptions: FiltersResponse | null;
  hideMetricPickers?: boolean;
}

function InlineSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const active = !!value;
  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-cf-muted text-xs pointer-events-none select-none whitespace-nowrap">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`
          bg-cf-card border rounded-md text-xs pl-[calc(var(--label-w)+12px)] pr-7 py-1.5
          focus:outline-none focus:border-cf-orange transition-colors appearance-none cursor-pointer
          ${active ? "border-cf-orange text-cf-text" : "border-cf-border text-cf-muted hover:border-cf-muted"}
        `}
        style={
          { "--label-w": `${label.length * 6.5}px` } as React.CSSProperties
        }
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2 w-3 h-3 text-cf-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
  filterOptions,
  hideMetricPickers = false,
}: FilterBarProps) {
  const [dateOpen, setDateOpen] = useState(false);

  const hasDateRange = !!(filters.from || filters.to);
  const hasActiveFilters =
    filters.branch !== "main" ||
    !!filters.trigger ||
    hasDateRange ||
    (!hideMetricPickers && (!!filters.scenario || !!filters.metric));

  const handleClear = () =>
    onChange({
      branch: "main",
      trigger: "",
      from: "",
      to: "",
      ...(!hideMetricPickers ? { scenario: "", metric: "" } : {}),
    });

  return (
    <div className="bg-cf-navy border-b border-cf-border px-6 py-2.5 flex flex-wrap items-center gap-2">
      <InlineSelect
        label="Branch:"
        value={filters.branch}
        onChange={(v) => onChange({ branch: v })}
      >
        <option value="">All</option>
        {filterOptions?.branches.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </InlineSelect>

      <InlineSelect
        label="Trigger:"
        value={filters.trigger}
        onChange={(v) => onChange({ trigger: v })}
      >
        <option value="">All</option>
        {filterOptions?.triggers.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </InlineSelect>

      {/* Date range toggle */}
      <button
        onClick={() => setDateOpen((v) => !v)}
        className={`
          flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors
          ${
            dateOpen || hasDateRange
              ? "border-cf-orange text-cf-orange bg-cf-orange/5"
              : "border-cf-border text-cf-muted hover:border-cf-muted"
          }
        `}
      >
        <svg
          className="w-3 h-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        Date range
        {hasDateRange && (
          <span className="w-1.5 h-1.5 rounded-full bg-cf-orange" />
        )}
      </button>

      {(dateOpen || hasDateRange) && (
        <>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-cf-muted">From</span>
            <input
              type="date"
              value={filters.from ? filters.from.slice(0, 10) : ""}
              onChange={(e) =>
                onChange({
                  from: e.target.value ? `${e.target.value}T00:00` : "",
                })
              }
              className="bg-cf-card border border-cf-border text-cf-text text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-cf-orange"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-cf-muted">To</span>
            <input
              type="date"
              value={filters.to ? filters.to.slice(0, 10) : ""}
              onChange={(e) =>
                onChange({
                  to: e.target.value ? `${e.target.value}T23:59` : "",
                })
              }
              className="bg-cf-card border border-cf-border text-cf-text text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-cf-orange"
            />
          </div>
        </>
      )}

      {hasActiveFilters && (
        <button
          onClick={handleClear}
          className="ml-auto flex items-center gap-1 text-xs text-cf-muted hover:text-cf-orange transition-colors"
        >
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Clear
        </button>
      )}
    </div>
  );
}
