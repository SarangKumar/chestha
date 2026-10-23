import { formatLongDate } from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { NavRail } from './NavRail.jsx';
import { RightSidebar } from './RightSidebar.jsx';
import { Notices, ExportReminder } from './Notices.jsx';
import { Toasts } from './Toasts.jsx';
import { IconButton, cx } from './ui.jsx';
import { Icon } from './icons.jsx';

const TITLES = {
  dashboard: 'Dashboard',
  tasks: 'Tasks',
  calendar: 'Calendar',
  dsa: 'DSA',
  grove: 'Grove',
  sounds: 'Sounds',
  settings: 'Settings',
  about: 'About',
};

// The dashboard is a workspace and uses the whole shell. Widget size is fixed by
// the grid's own cell cap, not by narrowing the page.
const FULL_WIDTH_SECTIONS = new Set(['dashboard']);

export function Shell({ section, onNavigate, onCapture, onPalette, onOpenTask, children }) {
  const { state, today, actions } = useWorkspace();
  const sidebarOpen = state.settings.sidebarOpen;

  const background = state.settings.background ?? { kind: 'none', image: '', dim: 0.45 };

  return (
    <div className="relative min-h-dvh">
      {/* Painted behind everything, inert, and dimmed so interface contrast —
          which was verified against the app's own surfaces — still holds. */}
      {background.kind !== 'none' && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
          {background.kind === 'image' && background.image ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              // encodeURI, because a filename may contain spaces.
              style={{ backgroundImage: `url("/backgrounds/${encodeURI(background.image)}")` }}
            />
          ) : (
            <div className={cx('absolute inset-0', `bg-pattern-${background.kind}`)} />
          )}
          <div className="absolute inset-0 bg-canvas" style={{ opacity: background.dim }} />
        </div>
      )}
      <NavRail section={section} onNavigate={onNavigate} onCapture={onCapture} />

      <RightSidebar
        open={sidebarOpen}
        onClose={() => actions.setSetting('sidebarOpen', false)}
        onOpenTask={onOpenTask}
        onCapture={onCapture}
        onNavigate={onNavigate}
      />

      {/* No right-hand padding: the today panel is an overlay, so the page keeps
          its full width whether or not it is open. */}
      <div className={cx('relative z-10', 'sm:pl-16')}>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-canvas/90 px-4 py-3.5 backdrop-blur-md sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-card font-semibold text-ink">{TITLES[section]}</h2>
            <p className="hidden text-meta text-ink-faint sm:block">{formatLongDate(today)}</p>
          </div>

          <button
            type="button"
            onClick={onPalette}
            className="flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs text-ink-muted shadow-card transition-colors duration-150 hover:bg-hover hover:text-ink"
          >
            <Icon name="search" className="size-4" />
            <span className="hidden sm:inline">Search or run a command</span>
            <kbd className="rounded border border-line bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={onCapture}
            className="flex h-9 items-center gap-1.5 rounded-control bg-accent px-3 text-xs font-medium text-on-accent transition-colors duration-150 hover:opacity-90 sm:hidden"
          >
            <Icon name="plus" className="size-4" /> Task
          </button>

          <IconButton
            label={sidebarOpen ? 'Hide the today panel' : 'Show the today panel'}
            aria-pressed={sidebarOpen}
            onClick={() => actions.setSetting('sidebarOpen', !sidebarOpen)}
            className="hidden lg:inline-flex"
          >
            <Icon name="sidebar" className="size-4" />
          </IconButton>
        </header>

        <main
          className={cx(
            'w-full px-4 pb-24 pt-6 sm:px-6 sm:pb-12 sm:pt-8',
            FULL_WIDTH_SECTIONS.has(section) ? 'max-w-none' : 'mx-auto max-w-5xl',
          )}
        >
          <div className="mb-6 space-y-2 empty:mb-0">
            <Notices onNavigate={onNavigate} />
            <ExportReminder onNavigate={onNavigate} />
          </div>
          {children}
        </main>
      </div>

      <Toasts />
    </div>
  );
}
