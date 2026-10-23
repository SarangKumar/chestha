import { Icon } from './icons.jsx';
import { cx } from './ui.jsx';

// Primary destinations sit at the top; Settings is pinned to the bottom of the
// rail. The mobile bar keeps everything in one row, where there is no "bottom".
const PRIMARY = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'dsa', label: 'DSA', icon: 'dsa' },
  { id: 'sounds', label: 'Sounds', icon: 'sounds' },
];

const SETTINGS = { id: 'settings', label: 'Settings', icon: 'settings' };

const ITEMS = [...PRIMARY, SETTINGS];

/** A rail on wide screens, a bottom bar on phones. The same items either way. */
function RailButton({ item, section, onNavigate }) {
  const active = section === item.id;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      className={cx(
        'group relative flex size-10 shrink-0 items-center justify-center rounded-card transition-colors duration-150',
        active ? 'bg-accent-soft text-ink' : 'text-ink-faint hover:bg-hover hover:text-ink',
      )}
    >
      <Icon name={item.icon} />
      <span className="sr-only">{item.label}</span>
      {active && <span className="absolute -left-px h-5 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
    </button>
  );
}

export function NavRail({ section, onNavigate, onCapture }) {
  return (
    <>
      <nav
        aria-label="Sections"
        className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-canvas py-3.5 scrollbar-thin sm:flex"
      >
        <img
          src="/icon-192.png"
          alt=""
          aria-hidden="true"
          width="36"
          height="36"
          className="mb-3 size-9 rounded-chip"
        />

        <button
          type="button"
          onClick={onCapture}
          className="mb-3 flex size-10 items-center justify-center rounded-card border border-dashed border-line-strong text-ink-muted transition-colors duration-150 hover:border-line-strong hover:bg-hover hover:text-ink"
          aria-label="Quick capture a task"
          title="Quick capture (N)"
        >
          <Icon name="plus" />
        </button>

        {PRIMARY.map((item) => (
          <RailButton key={item.id} item={item} section={section} onNavigate={onNavigate} />
        ))}

        {/* mt-auto pins Settings to the bottom; overflow keeps it reachable on
            short viewports instead of pushing it off-screen. */}
        <div className="mt-auto flex flex-col items-center gap-1 pt-3">
          <RailButton item={SETTINGS} section={section} onNavigate={onNavigate} />
        </div>
      </nav>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        {ITEMS.map((item) => (
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
            <Icon name={item.icon} className="size-5" />
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
