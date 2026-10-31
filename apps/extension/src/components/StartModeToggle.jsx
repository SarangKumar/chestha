import { START_MODES } from '@chestha/core';
import { Icon } from './icons.jsx';
import { cx } from './ui.jsx';

const MODES = {
  board: { label: 'Board', icon: 'dashboard', hint: 'Your widgets' },
  read: { label: 'Read', icon: 'book', hint: 'Posts from the community' },
};

/**
 * Which surface the start screen shows: the widget board, or the reading feed.
 *
 * A radiogroup rather than two buttons or a switch: there are exactly two
 * named destinations and both are always visible, which is what a segmented
 * control is for. A switch would have to imply one mode is "on", and these are
 * peers.
 *
 * The label is shown next to the icon from `sm` up and the icon alone on a
 * phone, where the header is tight — the accessible name is on the control
 * either way, so it never depends on the visible text.
 */
export function StartModeToggle({ mode, onChange }) {
  const current = START_MODES.includes(mode) ? mode : 'board';

  return (
    <div
      role="radiogroup"
      aria-label="Start screen"
      className="flex shrink-0 items-center gap-0.5 rounded-control border border-line bg-surface p-0.5 shadow-card"
    >
      {START_MODES.map((key) => {
        const option = MODES[key];
        const active = current === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            // The hint is the only place the difference is spelled out, and a
            // title alone is unreachable by keyboard and touch.
            aria-label={`${option.label} — ${option.hint}`}
            title={option.hint}
            onClick={() => onChange(key)}
            className={cx(
              'flex h-8 items-center gap-1.5 rounded-[0.5rem] px-2.5 text-xs font-medium',
              'transition-colors duration-150',
              active
                ? 'bg-accent text-on-accent'
                : 'text-ink-muted hover:bg-hover hover:text-ink',
            )}
          >
            <Icon name={option.icon} className="size-4" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
