interface HeaderProps {
  onRefresh: () => void;
  refreshing: boolean;
}

export function Header({ onRefresh, refreshing }: HeaderProps) {
  return (
    <header className="bg-cf-navy border-b border-cf-border px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M67.3 35.6c-1.1 0-2.1.1-3.1.3C61.9 27.4 54.5 22 45.8 22c-11.5 0-20.8 9.3-20.8 20.8 0 .6 0 1.1.1 1.7C18.7 46 14 51.7 14 58.5c0 7.7 6.2 13.9 13.9 13.9h39.4c8.3 0 15-6.7 15-15 0-8.2-6.7-14.9-15-14.9z" fill="#F48120"/>
          <path d="M67.3 35.6c.5 0 1 0 1.5.1L70 36l.5-1.3c.4-1.1 1-2.1 1.7-2.9l1-1.1-1.3-.8c-1.5-.9-3.3-1.4-5.1-1.4-.6 0-1.2.1-1.8.2l-1.4.3.4 1.4c.2.8.3 1.6.3 2.4v2.1l2.1-.4c.3 0 .7-.1 1-.1z" fill="#FBAD41"/>
        </svg>
        <div>
          <h1 className="text-white font-semibold text-base leading-tight">BenchBox</h1>
          <p className="text-cf-muted text-xs">Sandbox SDK Performance Dashboard</p>
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center gap-2 bg-cf-orange hover:bg-cf-orange-hover disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </header>
  );
}
