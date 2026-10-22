import { Icon } from './icons.jsx';
import { cx } from './ui.jsx';

const ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'dsa', label: 'DSA', icon: 'dsa' },
  { id: 'sounds', label: 'Sounds', icon: 'sounds' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

/** A rail on wide screens, a bottom bar on phones. The same items either way. */
export function NavRail({ section, onNavigate, onCapture }) {
  return (
    <>
      <nav
        aria-label="Sections"
        className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center gap-1 border-r border-line bg-canvas py-3.5 sm:flex"
      >
        <img
          src="/icon-192.png"
          alt=""
          aria-hidden="true"
          width="36"
          height="36"
          className="mb-3 size-9 rounded-card"
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

        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={section === item.id ? 'page' : undefined}
            title={item.label}
            className={cx(
              'group relative flex size-10 items-center justify-center rounded-card transition-colors duration-150',
              section === item.id
                ? 'bg-accent-soft text-ink'
                : 'text-ink-faint hover:bg-hover hover:text-ink',
            )}
          >
            <Icon name={item.icon} />
            <span className="sr-only">{item.label}</span>
            {section === item.id && (
              <span className="absolute -left-px h-5 w-0.5 rounded-full bg-accent" aria-hidden="true" />
            )}
          </button>
        ))}
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
