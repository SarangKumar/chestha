import { availableSeeds, levelFromXp, todayISO, xpOnDay } from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Meter, cx } from '../../components/ui.jsx';
import { Session } from './Session.jsx';
import { Collection } from './Collection.jsx';
import { Stats } from './Stats.jsx';
import { GroveSettings } from './GroveSettings.jsx';

/** Sub-navigation lives inside the section, as it does for DSA: the rail is full. */
const TABS = [
  { id: 'session', label: 'Session', render: Session },
  { id: 'collection', label: 'Collection', render: Collection },
  { id: 'stats', label: 'Stats', render: Stats },
  { id: 'settings', label: 'Settings', render: GroveSettings },
];

export function GroveSection({ tab, onChangeTab }) {
  const { state } = useWorkspace();
  const ledger = state['grove.ledger'];
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const Render = active.render;

  const level = levelFromXp(ledger.lifetime.xp);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-page font-semibold text-ink">Grove</h1>
          <p className="text-meta text-ink-muted">
            One session, one plant. Interrupting it never costs you what you have grown.
          </p>
        </div>
        <dl className="flex items-center gap-5 text-right">
          <div>
            <dt className="text-meta text-ink-faint">XP today</dt>
            <dd className="tabular text-stat font-semibold text-ink">{xpOnDay(ledger, todayISO())}</dd>
          </div>
          <div>
            <dt className="text-meta text-ink-faint">Seeds</dt>
            <dd className="tabular text-stat font-semibold text-ink">{availableSeeds(ledger)}</dd>
          </div>
        </dl>
      </header>

      <div className="mb-5">
        <Meter
          value={level.into}
          max={level.needed}
          label={`Level ${level.level} · ${level.into} of ${level.needed} XP to level ${level.level + 1}`}
        />
      </div>

      <div role="tablist" aria-label="Grove views" className="mb-4 flex flex-wrap gap-1 rounded-card border border-line bg-surface p-1 shadow-card">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active.id === item.id}
            onClick={() => onChangeTab(item.id)}
            className={cx(
              'rounded-chip px-3 py-1.5 text-sm font-medium transition-colors duration-150',
              active.id === item.id ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Render />
    </div>
  );
}
