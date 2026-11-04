import { lockedSections } from '@chestha/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { useSession } from '../app/useSession.js';
import { SITE_URL } from '../siteLinks.js';
import { isExtensionRuntime } from '../app/platform.js';
import { Icon } from './icons.jsx';
import { ProfileMenu } from './ProfileMenu.jsx';
import { cx } from './ui.jsx';

// Primary destinations sit at the top. On the rail, the bottom slot is the
// account menu, which holds Settings; the mobile bar has no "bottom" and no
// room for a popover, so there Settings stays a tab of its own.
const PRIMARY = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'dsa', label: 'DSA', icon: 'dsa' },
  { id: 'grove', label: 'Grove', icon: 'leaf' },
  { id: 'websites', label: 'Productive time', icon: 'websites' },
  { id: 'sounds', label: 'Sounds', icon: 'sounds' },
  { id: 'writing', label: 'Writing', icon: 'book' },
];

const SETTINGS = { id: 'settings', label: 'Settings', icon: 'settings' };

/**
 * A rail on wide screens, a bottom bar on phones. The same items either way.
 *
 * A locked item still navigates. The gate is a page with an explanation and a
 * way through it, so letting someone reach it is more useful than a dead
 * control that gives no reason — and the padlock already sets the expectation
 * before they click. The lock is in the accessible name too, because a 10px
 * glyph in the corner of an icon is not a signal everyone gets.
 */
function RailButton({ item, section, locked, onNavigate }) {
  const active = section === item.id;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      aria-current={active ? 'page' : undefined}
      title={locked ? `${item.label} — needs an account` : item.label}
      className={cx(
        'group relative flex size-10 shrink-0 items-center justify-center rounded-card transition-colors duration-150',
        active ? 'bg-accent-soft text-ink' : 'text-ink-faint hover:bg-hover hover:text-ink',
      )}
    >
      <Icon name={item.icon} />
      <span className="sr-only">{locked ? `${item.label} — needs an account` : item.label}</span>
      {locked && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-canvas text-ink-faint"
        >
          <Icon name="lock" className="size-2.5" />
        </span>
      )}
      {active && <span className="absolute -left-px h-5 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
    </button>
  );
}

export function NavRail({ section, onNavigate, onCapture }) {
  const { state } = useWorkspace();
  const { session } = useSession();
  const hidden = state.settings.hiddenSections ?? [];
  // Empty unless we positively know there is no account, so an offline New Tab
  // shows the full rail rather than hiding most of the product. Same fail-open
  // rule as the gate itself.
  const locked = lockedSections(session.state);

  // A section needing an account is not advertised until there is one: signed
  // out, the rail is the board and Settings. The padlock remains for the one
  // case a locked item can still appear — the section you are looking at.
  //
  // The section you are currently looking at always shows, even if hidden or
  // locked: the alternative is a rail with no current item while its page fills
  // the screen, which reads as a bug. Arriving by palette or link is the normal
  // way in, and a deep link to a gated section lands on the gate.
  const primary = PRIMARY.filter(
    (item) => item.id === section || !(hidden.includes(item.id) || locked.includes(item.id)),
  );
  const items = [...primary, SETTINGS];
  const siteTarget = isExtensionRuntime() ? '_blank' : '_self';

  return (
    <>
      <nav
        aria-label="Sections"
        className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-canvas py-3.5 scrollbar-thin sm:flex"
      >
        <a
          href={SITE_URL}
          target={siteTarget}
          rel="noopener noreferrer"
          className="mb-3 flex size-9 items-center justify-center rounded-card transition-opacity duration-150 hover:opacity-90"
          title="Chestha website"
          aria-label="Open Chestha website"
        >
          <img
            src="/icon-mark-128.png"
            alt=""
            width="36"
            height="36"
            className="size-9"
          />
        </a>

        <button
          type="button"
          onClick={onCapture}
          className="mb-3 flex size-10 items-center justify-center rounded-card border border-dashed border-line-strong text-ink-muted transition-colors duration-150 hover:border-line-strong hover:bg-hover hover:text-ink"
          aria-label="Quick capture a task"
          title="Quick capture (N)"
        >
          <Icon name="plus" />
        </button>

        {primary.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            section={section}
            locked={locked.includes(item.id)}
            onNavigate={onNavigate}
          />
        ))}

        {/* mt-auto pins the account menu to the bottom; overflow keeps it
            reachable on short viewports instead of pushing it off-screen. */}
        <div className="mt-auto flex flex-col items-center gap-1 pt-3">
          <ProfileMenu section={section} onNavigate={onNavigate} />
        </div>
      </nav>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={section === item.id ? 'page' : undefined}
            className={cx(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors duration-150',
              section === item.id ? 'text-ink' : 'text-ink-faint',
            )}
          >
            <span className="relative">
              <Icon name={item.icon} className="size-5" />
              {locked.includes(item.id) && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -bottom-0.5 flex size-3 items-center justify-center rounded-full bg-canvas text-ink-faint"
                >
                  <Icon name="lock" className="size-2" />
                </span>
              )}
            </span>
            {/* The visible label stays short — "Productive time · locked" wraps
                badly in a 10px cell — so the lock is spoken, not written. */}
            {item.label}
            {locked.includes(item.id) && <span className="sr-only"> — needs an account</span>}
          </button>
        ))}
      </nav>
    </>
  );
}
