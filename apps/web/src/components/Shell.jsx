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
  sounds: 'Sounds',
  settings: 'Settings',
};

export function Shell({ section, onNavigate, onCapture, onPalette, onOpenTask, children }) {
  const { state, today, actions } = useWorkspace();
  const sidebarOpen = state.settings.sidebarOpen;

  return (
    <div className="min-h-dvh bg-canvas">
      <NavRail section={section} onNavigate={onNavigate} onCapture={onCapture} />

      <RightSidebar
        open={sidebarOpen}
        onClose={() => actions.setSetting('sidebarOpen', false)}
        onOpenTask={onOpenTask}
        onCapture={onCapture}
        onNavigate={onNavigate}
      />

      <div className={cx('sm:pl-16', sidebarOpen && 'lg:pr-72')}>
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

        <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pb-12 sm:pt-8">
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
