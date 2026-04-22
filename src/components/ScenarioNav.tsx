import { type ScenarioDef } from '../scenarios';

interface ScenarioNavProps {
  scenarios: ScenarioDef[];
  active: string | null;
  onChange: (id: string | null) => void;
}

export function ScenarioNav({ scenarios, active, onChange }: ScenarioNavProps) {
  return (
    <div className="bg-cf-card border-b border-cf-border px-6 overflow-x-auto">
      <div className="flex min-w-max">
        <button
          onClick={() => onChange(null)}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === null
              ? 'border-cf-orange text-cf-text'
              : 'border-transparent text-cf-muted hover:text-cf-text hover:border-cf-border'
          }`}
        >
          Overview
        </button>
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              active === s.id
                ? 'text-cf-text'
                : 'border-transparent text-cf-muted hover:text-cf-text hover:border-cf-border'
            }`}
            style={active === s.id ? { borderBottomColor: s.color, borderBottomWidth: 2 } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
