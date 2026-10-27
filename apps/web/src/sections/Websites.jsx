import { useMemo, useState } from 'react';
import { formatDate, formatTrackedDuration, websiteTimeByDay } from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { WebsiteRules } from '../components/WebsiteRules.jsx';
import { LineChart } from '../components/LineChart.jsx';
import { EmptyState, Panel, SectionHeader, Stat, cx } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

const RANGES = [
  { id: 7, label: 'Week' },
  { id: 14, label: '2 weeks' },
  { id: 30, label: 'Month' },
  { id: 90, label: 'Quarter' },
];

/**
 * Productive time — add sites to track and read how long you spent on them.
 *
 * Layout follows a compact dashboard pattern: summary cards, a period toggle,
 * one line chart, then a per-site list. Rules still live in grove.settings;
 * seconds in grove.time. The Chrome extension is required for live observation.
 */
export function Websites() {
  const { state, today } = useWorkspace();
  const [days, setDays] = useState(30);
  const settings = state['grove.settings'];
  const time = state['grove.time'];

  const chart = useMemo(
    () => websiteTimeByDay(time, settings.rules, { days, today }),
    [time, settings.rules, days, today],
  );

  const dayLabels = chart.days.map((day) => formatDate(day));
  const activeSites = chart.series.filter((row) => row.total > 0);
  const top = activeSites[0];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Productive time"
        description="Choose the sites to track, then see how that time lands across days. Timing needs the Chrome extension — a web page cannot see your other tabs."
      />

      <Panel className="p-5 sm:p-6">
        <h2 className="mb-4 text-card font-semibold text-ink">Sites to track</h2>
        <WebsiteRules />
      </Panel>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-card font-semibold text-ink">Time spent</h2>
          <div
            role="group"
            aria-label="Range"
            className="flex rounded-full border border-line bg-inset p-1"
          >
            {RANGES.map((range) => (
              <button
                key={range.id}
                type="button"
                aria-pressed={days === range.id}
                onClick={() => setDays(range.id)}
                className={cx(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                  days === range.id
                    ? 'bg-accent text-on-accent'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Panel className="p-4">
            <div className="mb-2 flex size-9 items-center justify-center rounded-card bg-inset text-ink-muted">
              <Icon name="clock" className="size-4" />
            </div>
            <Stat value={formatTrackedDuration(chart.grandTotal)} label="Total in range" />
          </Panel>
          <Panel className="p-4">
            <div className="mb-2 flex size-9 items-center justify-center rounded-card bg-inset text-ink-muted">
              <Icon name="websites" className="size-4" />
            </div>
            <Stat value={activeSites.length} label="Sites with time" />
          </Panel>
          <Panel className="p-4">
            <div className="mb-2 flex size-9 items-center justify-center rounded-card bg-inset text-ink-muted">
              <Icon name="target" className="size-4" />
            </div>
            <Stat
              value={formatTrackedDuration(chart.totals[chart.totals.length - 1] ?? 0)}
              label="Today"
            />
          </Panel>
        </div>

        <Panel className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-card font-medium text-ink">Activity</h3>
              <p className="text-meta text-ink-faint">
                Seconds per day across every tracked site. Approximate — idle time and background
                tabs are not counted.
              </p>
            </div>
            {top && (
              <p className="text-meta text-ink-muted">
                Top: <span className="font-medium text-ink">{top.label}</span>
                {' · '}
                {formatTrackedDuration(top.total)}
              </p>
            )}
          </div>
          {chart.grandTotal === 0 ? (
            <EmptyState
              title="No tracked time in this range"
              description="Turn tracking on, add a site, and keep that tab in front while you work. The extension has to be installed and allowed."
            />
          ) : (
            <LineChart
              values={chart.totals}
              labels={dayLabels}
              height={160}
              formatValue={formatTrackedDuration}
              ariaLabel={`Total tracked website time over ${days} days`}
            />
          )}
        </Panel>

        <Panel className="overflow-hidden p-0">
          <div className="border-b border-line px-5 py-4 sm:px-6">
            <h3 className="text-card font-medium text-ink">By site</h3>
          </div>
          {chart.series.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-muted sm:px-6">
              Add a website above to start a chart for it. Nothing is observed until tracking is on
              and the extension is running.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {chart.series.map((row) => (
                <li key={row.ruleId} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-card bg-inset text-sm font-semibold text-ink">
                      {(row.label || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cx('truncate text-sm font-medium text-ink', !row.enabled && 'text-ink-faint line-through')}>
                        {row.label}
                      </p>
                      <p className="truncate text-meta text-ink-faint">
                        {row.domain || 'No longer on your list'}
                      </p>
                    </div>
                    <p className="tabular shrink-0 text-card font-semibold text-ink">
                      {formatTrackedDuration(row.total)}
                    </p>
                  </div>
                  <LineChart
                    values={row.points}
                    labels={dayLabels}
                    height={72}
                    formatValue={formatTrackedDuration}
                    ariaLabel={`${row.label}: ${formatTrackedDuration(row.total)} over ${days} days`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
