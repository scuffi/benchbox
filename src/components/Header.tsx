interface HeaderProps {
  onRefresh: () => void;
  refreshing: boolean;
}

export function Header({ onRefresh, refreshing }: HeaderProps) {
  return (
    <header className="bg-cf-navy border-b border-cf-border px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <img
          src="/favicon.png"
          alt="BenchBox logo"
          className="w-8 h-8 object-contain"
        />
        <div>
          <h1 className="text-white font-semibold text-base leading-tight">
            BenchBox
          </h1>
          <p className="text-cf-muted text-xs">
            Sandbox SDK Performance Dashboard
          </p>
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center gap-2 bg-cf-orange hover:bg-cf-orange-hover disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
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
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </header>
  );
}
