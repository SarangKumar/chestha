import { READING_SECTION, isSectionAllowed, lockedSections } from '@chestha/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { useSession } from '../app/useSession.js';
import { SITE_URL } from '../siteLinks.js';
import { isExtensionRuntime } from '../app/platform.js';
import { Icon } from './icons.jsx';
import { ProfileMenu } from './ProfileMenu.jsx';
import { StartModeToggle } from './StartModeToggle.jsx';
import { cx } from './ui.jsx';

// Primary destinations sit at the top. On the rail, the bottom slot is the
// account menu, which holds Settings; the mobile bar has no "bottom" and no
// room for a popover, so there Settings stays a tab of its own.
//
// **The start screen is not in this list**, but it is the first thing in the
// rail: it is the Board/Read control above, not a destination icon. A plain
// icon for it was a button to go where you started, which is why it went; the
// mode control earns the slot because it does something a New Tab cannot, and
// it doubles as the way back to the start screen from any other section.
const PRIMARY = [
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'dsa', label: 'DSA', icon: 'dsa' },
  { id: 'grove', label: 'Grove', icon: 'leaf' },
  { id: 'websites', label: 'Productive time', icon: 'websites' },
  { id: 'sounds', label: 'Sounds', icon: 'sounds' },
];

// **Writing is deliberately not here.** It is still a section — routed in
// `App.jsx`, gated like the rest, and reachable from the command palette as
// "Go to writing" — it just does not hold a slot in the rail. Publishing to the
// website is an occasional act, not a daily destination, and the rail is the
// seven-item list someone reads at a glance. Because hiding only ever affected
// the rail, it also came out of `HIDEABLE_SECTIONS`: a checkbox to hide
// something that is not shown there would toggle nothing.

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
  const { state, actions } = useWorkspace();
  const { session } = useSession();
  const hidden = state.settings.hiddenSections ?? [];
  const startMode = state.settings.startMode ?? 'board';

  /**
   * Read mode needs an account, so the control that turns it on is not offered
   * without one — the same rule the rail applies to gated sections, and the
   * same condition `Shell` uses for its own copy of this control.
   *
   * The second clause is an escape hatch, not a loophole: someone who was on
   * Read and then signed out is looking at the gate, and this is the obvious
   * way back to their board. Hiding it there would leave them on a page they
   * did not choose with no visible way off it.
   */
  const showStartMode = isSectionAllowed(READING_SECTION, session.state) || startMode === 'read';

  // Both modes live on the start screen, so choosing one goes there as well as
  // setting it — otherwise picking "Read" from inside Tasks would appear to do
  // nothing at all.
  const chooseStartMode = (next) => {
    actions.setSetting('startMode', next);
    onNavigate('dashboard');
  };
  // Empty unless we positively know there is no account, so an offline New Tab
  // shows the full rail rather than hiding most of the product. Same fail-open
  // rule as the gate itself.
  const locked = lockedSections(session.state);

  // A section needing an account is not advertised until there is one: signed
  // out, the rail is Settings and whatever is open. The padlock remains for the
  // one case a locked item can still appear — the section you are looking at.
  //
  // The section you are currently looking at always shows, even if hidden or
  // locked: the alternative is a rail with no current item while its page fills
  // the screen, which reads as a bug. Arriving by palette or link is the normal
  // way in, and a deep link to a gated section lands on the gate.
  //
  // The start screen is the exception, and the one place a rail with no active
  // item is correct: it is not in `PRIMARY` at all, so this cannot bring it
  // back. Nothing is highlighted while it is open, the same way a home page is
  // not one of its own nav items.
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

        {/* First in the rail, above the sections and separated from them: it
            chooses what the start screen *is*, where everything below it is a
            place to go. */}
        {showStartMode && (
          <div className="mb-2 flex flex-col items-center">
            <StartModeToggle
              mode={startMode}
              onChange={chooseStartMode}
              orientation="vertical"
            />
          </div>
        )}

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
