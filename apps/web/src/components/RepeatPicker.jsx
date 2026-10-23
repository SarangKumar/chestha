import {
  EVERY_DAY, WEEKDAYS_ONLY, WEEKEND_ONLY, WEEKDAY_INITIALS, WEEKDAY_LABELS,
  createRecurrence, describeRecurrence, normalizeWeekdays,
} from '@vistaar/core';
import { Select, cx } from './ui.jsx';

/**
 * The alarm pattern: toggle the days, and the summary is derived from what is
 * selected. "Daily" is not a separate mode — it is all seven days — so the label
 * and the schedule cannot drift apart.
 */
const PRESETS = [
  { key: 'once', label: 'Once', match: (r) => !r },
  { key: 'daily', label: 'Daily', days: EVERY_DAY },
  { key: 'weekdays', label: 'Weekdays', days: WEEKDAYS_ONLY },
  { key: 'weekends', label: 'Weekends', days: WEEKEND_ONLY },
  { key: 'monthly', label: 'Monthly', match: (r) => r?.kind === 'monthly' },
];

const same = (a, b) => a.length === b.length && a.every((d, i) => d === b[i]);

function activePreset(recurrence) {
  if (!recurrence) return 'once';
  if (recurrence.kind === 'monthly') return 'monthly';
  for (const preset of PRESETS) {
    if (preset.days && same(recurrence.weekdays, preset.days)) return preset.key;
  }
  return 'custom';
}

export function RepeatPicker({ value, onChange, dueDate }) {
  const preset = activePreset(value);
  const weekdays = value?.kind === 'weekly' ? value.weekdays : [];

  const choosePreset = (key) => {
    if (key === 'once') return onChange(null);
    if (key === 'monthly') {
      const day = dueDate ? Number(dueDate.slice(8, 10)) : 1;
      return onChange(createRecurrence({ kind: 'monthly', monthDay: day }));
    }
    const found = PRESETS.find((p) => p.key === key);
    return onChange(createRecurrence({ weekdays: found.days }));
  };

  const toggleDay = (day) => {
    const next = normalizeWeekdays(
      weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day],
    );
    // Clearing every day means it no longer repeats, which is what an alarm does.
    onChange(next.length === 0 ? null : createRecurrence({ weekdays: next }));
  };

  return (
    <div className="space-y-3">
      <div role="group" aria-label="How often this repeats" className="flex flex-wrap gap-1.5">
        {PRESETS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => choosePreset(item.key)}
            aria-pressed={preset === item.key}
            className={cx(
              'rounded-chip border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
              preset === item.key
                ? 'border-line-strong bg-accent-soft text-ink'
                : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {value?.kind === 'monthly' ? (
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          On day
          <Select
            size="sm"
            value={String(value.monthDay)}
            onChange={(event) => onChange(createRecurrence({ kind: 'monthly', monthDay: Number(event.target.value) }))}
            className="w-auto"
            aria-label="Day of the month"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </Select>
        </label>
      ) : (
        <div role="group" aria-label="Days of the week" className="flex gap-1">
          {WEEKDAY_INITIALS.map((initial, day) => {
            const on = weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={on}
                aria-label={WEEKDAY_LABELS[day]}
                title={WEEKDAY_LABELS[day]}
                className={cx(
                  'size-8 rounded-full border text-xs font-semibold transition-colors duration-150',
                  on
                    ? 'border-transparent bg-accent text-on-accent'
                    : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
                )}
              >
                {initial}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-meta leading-relaxed text-ink-faint">
        {describeRecurrence(value)}
        {value && '. Completing it creates the next one; this occurrence keeps its own history.'}
        {value?.kind === 'monthly' && value.monthDay > 28
          && ' In a shorter month it falls on the last day.'}
      </p>
    </div>
  );
}
