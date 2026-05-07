import { type ScenarioDef } from "../scenarios";

interface HeaderProps {
  onRefresh: () => void;
  refreshing: boolean;
  scenarios: ScenarioDef[];
  activeScenario: string | null;
  onScenarioChange: (id: string | null) => void;
  theme: "dark" | "light";
  onThemeToggle: () => void;
}

export function Header({
  onRefresh,
  refreshing,
  scenarios,
  activeScenario,
  onScenarioChange,
  theme,
  onThemeToggle,
}: HeaderProps) {
  return (
    <header className="bg-cf-navy border-b border-cf-border sticky top-0 z-50">
      <div className="px-4 h-[44px] flex items-stretch">
        {/* Logo */}
        <div className="flex items-center gap-2 pr-4 mr-3 border-r border-cf-border shrink-0">
          <img src="/favicon.png" alt="" className="w-5 h-5 object-contain" />
          <span className="text-cf-text font-semibold text-sm tracking-tight">
            BenchBox
          </span>
        </div>

        {/* Tabs — full-height bottom-border style */}
        <nav className="flex items-stretch flex-1 overflow-x-auto gap-0.5">
          <TabButton
            active={activeScenario === null}
            onClick={() => onScenarioChange(null)}
            accentColor="#F48120"
          >
            Overview
          </TabButton>
          {scenarios.map((s) => (
            <TabButton
              key={s.id}
              active={activeScenario === s.id}
              onClick={() => onScenarioChange(s.id)}
              accentColor={s.color ?? "#F48120"}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor: s.color ?? "#F48120",
                  opacity: activeScenario === s.id ? 1 : 0.4,
                }}
              />
              {s.label}
            </TabButton>
          ))}
        </nav>

        {/* Right controls */}
        <div className="shrink-0 ml-1 flex items-center gap-1">
          {/* Theme toggle */}
          <button
            onClick={onThemeToggle}
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className="p-1.5 rounded-md text-cf-muted hover:text-cf-text hover:bg-white/[0.06] transition-colors"
          >
            {theme === "dark" ? (
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="4" />
                <path
                  strokeLinecap="round"
                  d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
                />
              </svg>
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title={refreshing ? "Refreshing…" : "Refresh data"}
            className="p-1.5 rounded-md text-cf-muted hover:text-cf-text hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

function TabButton({
  active,
  onClick,
  accentColor,
  children,
}: {
  active: boolean;
  onClick: () => void;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center gap-1.5 px-3.5 text-xs font-medium whitespace-nowrap
        border-b-2 transition-colors
        ${
          active
            ? "text-cf-text"
            : "text-cf-muted border-transparent hover:text-cf-text"
        }
      `}
      style={active ? { borderBottomColor: accentColor } : undefined}
    >
      {children}
      {!active && (
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 scale-x-0 hover:scale-x-100 transition-transform origin-left rounded-full opacity-30"
          style={{ backgroundColor: accentColor }}
        />
      )}
    </button>
  );
}
