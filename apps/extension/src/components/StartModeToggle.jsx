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
 * **Two orientations, one control.** `vertical` is the nav rail, where this is
 * the first item and the rail is 64px wide, so it stacks and drops the labels.
 * `horizontal` is the header, which is where it still lives at phone width
 * because there is no rail there. Exactly one of the two is mounted at any
 * width — see `Shell` and `NavRail` — so the radiogroup is never duplicated.
 *
 * It renders the stored mode, not where you currently are: the mode is a
 * persisted setting that outlives the page you happen to be on, and in the rail
 * clicking an option also navigates to the start screen, which is the caller's
 * job rather than this component's.
 *
 * The hint carries the only spelled-out difference between the two, so it is on
 * the accessible name and not only in `title` — a title alone is unreachable by
 * keyboard and touch, and in the rail there is no visible label at all.
 */
export function StartModeToggle({ mode, onChange, orientation = 'horizontal' }) {
  const current = START_MODES.includes(mode) ? mode : 'board';
  const vertical = orientation === 'vertical';

  return (
    <div
      role="radiogroup"
      aria-label="Start screen"
      className={cx(
        'flex shrink-0 gap-0.5 rounded-control border border-line bg-surface p-0.5 shadow-card',
        vertical ? 'flex-col items-stretch' : 'items-center',
      )}
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
            aria-label={`${option.label} — ${option.hint}`}
            title={`${option.label} — ${option.hint}`}
            onClick={() => onChange(key)}
            className={cx(
              'flex items-center justify-center rounded-[0.5rem] text-xs font-medium',
              'transition-colors duration-150',
              // Square in the rail so the pair reads as one block aligned with
              // the section icons below it; label-width in the header.
              vertical ? 'size-9' : 'h-8 gap-1.5 px-2.5',
              active
                ? 'bg-accent text-on-accent'
                : 'text-ink-muted hover:bg-hover hover:text-ink',
            )}
          >
            <Icon name={option.icon} className="size-4" />
            {!vertical && <span className="hidden sm:inline">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
