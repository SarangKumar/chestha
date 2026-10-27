import { addDays, todayISO } from '../dates.js';

/**
 * Human-readable duration for tracked website seconds.
 * Minutes below an hour; hours and leftover minutes above.
 */
export function formatTrackedDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

/**
 * Builds a day-aligned series of website time for charts and the dashboard widget.
 *
 * Reads `grove.time` and the current rules list. Removed rules that still have
 * recorded seconds appear as “A removed rule” so history is not silently dropped.
 * Days with no data are zeros — that is what a line chart needs — rather than
 * omitted points that would invent a slope across a gap.
 */
export function websiteTimeByDay(time, rules, { days = 14, today = todayISO() } = {}) {
  const dayCount = Math.max(1, Math.min(90, Math.round(Number(days) || 14)));
  const from = addDays(today, -(dayCount - 1));
  const dayList = Array.from({ length: dayCount }, (_, i) => addDays(from, i));

  const ruleList = Array.isArray(rules) ? rules : [];
  const byId = new Map(ruleList.map((rule) => [rule.id, rule]));
  const knownIds = new Set(byId.keys());

  // Collect orphan rule ids present in the retained days of the range.
  const orphans = new Set();
  for (const day of dayList) {
    const record = time?.days?.[day];
    if (!record?.rules) continue;
    for (const ruleId of Object.keys(record.rules)) {
      if (!knownIds.has(ruleId)) orphans.add(ruleId);
    }
  }

  const series = [];
  for (const rule of ruleList) {
    const points = dayList.map((day) => time?.days?.[day]?.rules?.[rule.id]?.seconds ?? 0);
    series.push({
      ruleId: rule.id,
      label: rule.label || rule.domain,
      domain: rule.domain,
      enabled: rule.enabled !== false,
      points,
      total: points.reduce((sum, value) => sum + value, 0),
    });
  }
  for (const ruleId of orphans) {
    const points = dayList.map((day) => time?.days?.[day]?.rules?.[ruleId]?.seconds ?? 0);
    series.push({
      ruleId,
      label: 'A removed rule',
      domain: '',
      enabled: false,
      points,
      total: points.reduce((sum, value) => sum + value, 0),
    });
  }

  series.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  const totals = dayList.map((_, index) => series.reduce((sum, row) => sum + row.points[index], 0));

  return {
    days: dayList,
    series,
    totals,
    grandTotal: totals.reduce((sum, value) => sum + value, 0),
  };
}
