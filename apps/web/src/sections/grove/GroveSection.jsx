import { useState } from 'react';
import { availableSeeds, levelFromXp, todayISO, xpOnDay } from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Meter, Panel, cx } from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';
import { Session } from './Session.jsx';
import { Garden } from './Garden.jsx';
import { Collection } from './Collection.jsx';
import { Stats } from './Stats.jsx';

/** Sub-navigation lives inside the section, as it does for DSA: the rail is full. */
const TABS = [
  { id: 'session', label: 'Focus', render: Session },
  { id: 'garden', label: 'Garden', render: Garden },
  { id: 'collection', label: 'Collection', render: Collection },
  { id: 'stats', label: 'Stats', render: Stats },
];

export function GroveSection({ tab, onChangeTab, onNavigate }) {
  const { state } = useWorkspace();
  const ledger = state['grove.ledger'];
  const settings = state['grove.settings'];
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const Render = active.render;
  const [howOpen, setHowOpen] = useState(false);

  const level = levelFromXp(ledger.lifetime.xp);
  const xpToday = xpOnDay(ledger, todayISO());
  const seeds = availableSeeds(ledger);
  const focus = settings.focus ?? {};
  const taskXp = settings.taskBaseXp ?? 10;
  const taskCap = settings.dailyTaskCapXp ?? 120;
  const xpPerMin = focus.xpPerMinute ?? 2;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-page font-semibold text-ink">Grove</h1>
          <p className="text-meta text-ink-muted">
            Grow your focus, one session at a time. Interrupting never costs what you have grown.
          </p>
        </div>
        <dl className="flex items-center gap-5 text-right">
          <div>
            <dt className="text-meta text-ink-faint">Level</dt>
            <dd className="tabular text-stat font-semibold text-ink">{level.level}</dd>
          </div>
          <div>
            <dt className="text-meta text-ink-faint">XP today</dt>
            <dd className="tabular text-stat font-semibold text-ink">{xpToday}</dd>
          </div>
          <div>
            <dt className="text-meta text-ink-faint">Seeds</dt>
            <dd className="tabular text-stat font-semibold text-ink">{seeds}</dd>
          </div>
        </dl>
      </header>

      <div className="mb-3">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-ink">
            Level {level.level}
            <span className="ml-2 text-meta font-normal text-ink-faint">
              {level.into} / {level.needed} XP to level {level.level + 1}
            </span>
          </p>
          <p className="tabular text-meta text-ink-faint">{ledger.lifetime.xp} XP lifetime</p>
        </div>
        <Meter
          value={level.into}
          max={level.needed}
          label={`Level ${level.level} · ${level.into} of ${level.needed} XP to level ${level.level + 1}`}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Grove views" className="flex flex-wrap gap-1 rounded-card border border-line bg-surface p-1 shadow-card">
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

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="rounded-chip px-2 py-1 text-meta text-ink-faint transition-colors duration-150 hover:bg-hover hover:text-ink"
        >
          Preferences are in Settings
        </button>
      </div>

      <Render />

      <Panel level="inset" className="mt-5 overflow-hidden p-0">
        <button
          type="button"
          onClick={() => setHowOpen((open) => !open)}
          aria-expanded={howOpen}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-hover"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-card font-medium text-ink">How Grove works</span>
            <span className="block text-meta text-ink-faint">XP, levels, seeds, and how you earn them</span>
          </span>
          <Icon
            name={howOpen ? 'chevronLeft' : 'chevronRight'}
            className={cx('size-4 shrink-0 text-ink-faint transition-transform duration-150', howOpen && '-rotate-90')}
          />
        </button>
        {howOpen && (
          <div className="space-y-2 border-t border-line px-4 py-3">
            <dl className="space-y-2 text-meta leading-relaxed text-ink-muted">
              <div>
                <dt className="font-medium text-ink">XP</dt>
                <dd>
                  Experience points — a running total of focused work. XP never goes down and is never spent.
                  Your <span className="text-ink">level</span> is derived from lifetime XP; fill the meter above to reach the next one.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink">How you gain XP</dt>
                <dd>
                  <span className="text-ink">Focus sessions</span> earn about {xpPerMin} XP per eligible minute
                  (plus a completion bonus when you finish the full timer).
                  {' '}<span className="text-ink">Tasks</span> earn about {taskXp} XP when you complete one
                  (priority can add a little; capped around {taskCap} XP/day from tasks).
                  {' '}<span className="text-ink">Tracked websites</span> earn XP at minute thresholds you set in Settings — only while that tab is in front.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Seeds</dt>
                <dd>
                  Come from focus sessions and are spent in Collection to unlock plants and scenery.
                  Levels gate what you may unlock; seeds decide what you take. Spending seeds never costs XP or levels.
                </dd>
              </div>
            </dl>
            <p className="text-[10px] leading-relaxed text-ink-faint">
              Numbers are tunable in Settings. Ending a session early still keeps the plant and the XP you already earned.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
