import { useMemo, useState } from 'react';
import { addDays, catalogueItem, eligibleMinutes, milestones, todayISO } from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { EmptyState, Meter, Panel, Stat, cx } from '../../components/ui.jsx';

const RANGES = [
  { id: 7, label: '7D' },
  { id: 30, label: '30D' },
  { id: 90, label: '90D' },
  { id: 0, label: 'All' },
];

const SOURCE_LABELS = {
  task: 'Tasks',
  website: 'Websites',
  focus: 'Focus sessions',
  adjustment: 'Adjustments',
};

function hhmm(seconds) {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function sessionDay(session) {
  return (session.endedAt ?? session.startedAt)?.slice(0, 10) ?? '';
}

function Spark({ values, className }) {
  const max = Math.max(1, ...values);
  return (
    <div className={cx('flex h-8 items-end gap-0.5', className)} aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={index}
          className="min-w-[3px] flex-1 rounded-sm bg-accent/70"
          style={{ height: `${Math.max(8, (value / max) * 100)}%`, opacity: value === 0 ? 0.22 : 1 }}
        />
      ))}
    </div>
  );
}

function deltaLabel(current, previous) {
  if (previous <= 0 && current <= 0) return null;
  if (previous <= 0) return { text: 'New', tone: 'ok' };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: '0%', tone: 'muted' };
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, tone: pct > 0 ? 'ok' : 'danger' };
}

export function Stats() {
  const { state } = useWorkspace();
  const [days, setDays] = useState(7);
  const ledger = state['grove.ledger'];
  const time = state['grove.time'];
  const settings = state['grove.settings'];
  const garden = state['grove.garden'];
  const sessions = state['grove.focus'].sessions;
  const today = todayISO();

  const from = days === 0 ? '0000-01-01' : addDays(today, -(days - 1));
  const prevFrom = days === 0 ? null : addDays(from, -days);
  const prevTo = days === 0 ? null : addDays(from, -1);

  const focusStats = useMemo(() => {
    const finished = sessions.filter((s) => s.endedAt);
    const inRange = (day, start, end) => day >= start && (!end || day <= end);

    const current = finished.filter((s) => inRange(sessionDay(s), from, today));
    const previous = prevFrom
      ? finished.filter((s) => inRange(sessionDay(s), prevFrom, prevTo))
      : [];

    const currentMinutes = current.reduce(
      (sum, s) => sum + eligibleMinutes(s, Date.parse(s.endedAt)),
      0,
    );
    const previousMinutes = previous.reduce(
      (sum, s) => sum + eligibleMinutes(s, Date.parse(s.endedAt)),
      0,
    );

    const bucketCount = days === 0 ? 14 : Math.min(days, 30);
    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const day = addDays(today, -(bucketCount - 1 - i));
      return current.filter((s) => sessionDay(s) === day).length;
    });

    const counts = new Map();
    for (const plant of garden.plants) {
      const day = plant.plantedAt?.slice(0, 10) ?? '';
      if (day < from) continue;
      counts.set(plant.speciesId, (counts.get(plant.speciesId) ?? 0) + 1);
    }
    const topPlants = [...counts.entries()]
      .map(([id, count]) => ({ id, count, name: catalogueItem(id)?.name ?? 'Plant' }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      sessions: current.length,
      prevSessions: previous.length,
      minutes: currentMinutes,
      prevMinutes: previousMinutes,
      buckets,
      topPlants,
      topMax: topPlants[0]?.count ?? 1,
    };
  }, [sessions, garden.plants, from, today, days, prevFrom, prevTo]);

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
    return {
      xp,
      bySource,
      sites: [...sites.entries()].sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 6),
    };
  }, [ledger.events, time.days, from]);

  const marks = milestones(sessions, garden);
  const recent = ledger.events.slice(-12).reverse();
  const topSiteSeconds = summary.sites[0]?.[1].seconds ?? 0;
  const sessionDelta = deltaLabel(focusStats.sessions, focusStats.prevSessions);
  const timeDelta = deltaLabel(focusStats.minutes, focusStats.prevMinutes);

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Range"
        className="inline-flex gap-1 rounded-full border border-line bg-surface p-1 shadow-card"
      >
        {RANGES.map((range) => (
          <button
            key={range.id}
            type="button"
            aria-pressed={days === range.id}
            onClick={() => setDays(range.id)}
            className={cx(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150',
              days === range.id ? 'bg-accent text-on-accent' : 'text-ink-muted hover:bg-hover hover:text-ink',
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <Stat value={focusStats.sessions} label="Focus sessions" />
            {sessionDelta && days !== 0 && (
              <span
                className={cx(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  sessionDelta.tone === 'ok' && 'bg-ok-soft text-ok',
                  sessionDelta.tone === 'danger' && 'bg-danger-soft text-danger',
                  sessionDelta.tone === 'muted' && 'bg-inset text-ink-faint',
                )}
              >
                {sessionDelta.text}
              </span>
            )}
          </div>
          <Spark values={focusStats.buckets} />
        </Panel>
        <Panel className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <Stat value={hhmm(focusStats.minutes * 60)} label="Total focus time" />
            {timeDelta && days !== 0 && (
              <span
                className={cx(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  timeDelta.tone === 'ok' && 'bg-ok-soft text-ok',
                  timeDelta.tone === 'danger' && 'bg-danger-soft text-danger',
                  timeDelta.tone === 'muted' && 'bg-inset text-ink-faint',
                )}
              >
                {timeDelta.text}
              </span>
            )}
          </div>
          <p className="text-meta text-ink-faint">
            Lifetime · {marks.sessions} sessions · {hhmm(marks.minutes * 60)}
          </p>
        </Panel>
      </div>

      <Panel className="p-4">
        <h2 className="mb-3 text-card font-medium text-ink">Top plants</h2>
        {focusStats.topPlants.length === 0 ? (
          <p className="text-sm text-ink-muted">No plants grown in this range yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {focusStats.topPlants.map((row) => (
              <li key={row.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-ink">{row.name}</span>
                  <span className="tabular text-meta text-ink-faint">
                    {row.count} session{row.count === 1 ? '' : 's'}
                  </span>
                </div>
                <Meter value={row.count} max={focusStats.topMax} label={`${row.name}: ${row.count}`} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4"><Stat value={summary.xp} label="XP in range" /></Panel>
        <Panel className="p-4"><Stat value={marks.plants} label="plants grown" /></Panel>
        <Panel className="p-4"><Stat value={marks.matured} label="fully grown" /></Panel>
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
                    <Meter
                      value={value.seconds}
                      max={topSiteSeconds || 1}
                      label={`${rule?.label ?? 'A removed rule'}: ${hhmm(value.seconds)}`}
                    />
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
