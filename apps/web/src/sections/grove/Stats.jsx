import { useMemo, useState } from 'react';
import { addDays, milestones, todayISO } from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { EmptyState, Meter, Panel, Stat, cx } from '../../components/ui.jsx';

const RANGES = [
  { id: 7, label: '7D' },
  { id: 30, label: '30D' },
  { id: 90, label: '90D' },
  { id: 0, label: 'All' },
];

const SOURCE_LABELS = { task: 'Tasks', website: 'Websites', focus: 'Focus sessions', adjustment: 'Adjustments' };

function hhmm(seconds) {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

export function Stats() {
  const { state } = useWorkspace();
  const [days, setDays] = useState(7);
  const ledger = state['grove.ledger'];
  const time = state['grove.time'];
  const settings = state['grove.settings'];

  const from = days === 0 ? '0000-01-01' : addDays(todayISO(), -(days - 1));

  const summary = useMemo(() => {
    const bySource = {};
    let xp = 0;
    for (const event of ledger.events) {
      if (event.localDay < from) continue;
      xp += event.xp;
      bySource[event.source] = (bySource[event.source] ?? 0) + event.xp;
    }
    const sites = new Map();
    for (const [day, record] of Object.entries(time.days)) {
      if (day < from) continue;
      for (const [ruleId, value] of Object.entries(record.rules)) {
        const entry = sites.get(ruleId) ?? { seconds: 0, covered: 0 };
        entry.seconds += value.seconds;
        entry.covered += value.focusCoveredSeconds;
        sites.set(ruleId, entry);
      }
    }
    return { xp, bySource, sites: [...sites.entries()].sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 6) };
  }, [ledger.events, time.days, from]);

  const marks = milestones(state['grove.focus'].sessions, state['grove.garden']);
  const recent = ledger.events.slice(-12).reverse();
  const topSiteSeconds = summary.sites[0]?.[1].seconds ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Range" className="flex gap-1">
        {RANGES.map((range) => (
          <button
            key={range.id}
            type="button"
            aria-pressed={days === range.id}
            onClick={() => setDays(range.id)}
            className={cx(
              'rounded-chip px-3 py-1.5 text-sm font-medium transition-colors duration-150',
              days === range.id ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink',
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4"><Stat value={summary.xp} label="XP in range" /></Panel>
        <Panel className="p-4"><Stat value={marks.sessions} label="focus sessions" /></Panel>
        <Panel className="p-4"><Stat value={hhmm(marks.minutes * 60)} label="total focus time" /></Panel>
      </div>

      <Panel className="p-4">
        <h2 className="mb-3 text-card font-medium text-ink">Where the XP came from</h2>
        {summary.xp === 0 ? (
          <p className="text-sm text-ink-muted">Nothing earned in this range yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {Object.entries(summary.bySource).sort((a, b) => b[1] - a[1]).map(([source, xp]) => (
              <li key={source}>
                <Meter value={xp} max={summary.xp} label={`${SOURCE_LABELS[source] ?? source}: ${xp} XP`} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="p-4">
        <h2 className="mb-1 text-card font-medium text-ink">Time on your sites</h2>
        <p className="mb-3 text-meta text-ink-faint">
          Approximate, and only for sites you added. Time inside a focus session is shown
          separately because the session already paid for it.
        </p>
        {summary.sites.length === 0 ? (
          <p className="text-sm text-ink-muted">No tracked time in this range.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.sites.map(([ruleId, value]) => {
              const rule = settings.rules.find((r) => r.id === ruleId);
              return (
                <li key={ruleId} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <Meter value={value.seconds} max={topSiteSeconds || 1} label={`${rule?.label ?? 'A removed rule'}: ${hhmm(value.seconds)}`} />
                  </span>
                  {value.covered > 0 && (
                    <span className="shrink-0 text-meta text-ink-faint">{hhmm(value.covered)} in sessions</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel className="p-4">
        <h2 className="mb-3 text-card font-medium text-ink">Recent rewards</h2>
        {recent.length === 0 ? (
          <EmptyState title="Nothing earned yet" description="Finish a task or run a session." />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((event) => (
              <li key={event.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink-muted">{event.note || SOURCE_LABELS[event.source]}</span>
                <span className="tabular shrink-0 text-ink">{event.xp >= 0 ? '+' : ''}{event.xp} XP</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
