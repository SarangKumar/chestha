import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayISO } from '@vistaar/core';
import { StoreProvider, useWorkspace } from './app/StoreProvider.jsx';
import { useHashRoute } from './app/useHashRoute.js';
import { Shell } from './components/Shell.jsx';
import { CommandPalette } from './components/CommandPalette.jsx';
import { QuickCapture } from './components/QuickCapture.jsx';
import { TaskEditor } from './components/TaskEditor.jsx';
import { Dashboard } from './sections/Dashboard.jsx';
import { Tasks } from './sections/Tasks.jsx';
import { Calendar } from './sections/Calendar.jsx';
import { Sounds } from './sections/Sounds.jsx';
import { Settings } from './sections/Settings.jsx';

const TASK_VIEWS = ['today', 'upcoming', 'overdue', 'nodate', 'completed', 'all'];

export default function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  );
}

function Workspace() {
  const { state, status, actions, today } = useWorkspace();
  const [route, navigate] = useHashRoute();
  const [overlay, setOverlay] = useState(null); // 'palette' | 'capture' | null
  const [editor, setEditor] = useState(null); // { taskId } | { defaultDue }
  const [taskView, setTaskView] = useState('today');
  const [calendarDay, setCalendarDay] = useState(null);

  const { section, param } = route;

  // A section can carry a parameter, which is what the extension deep-links to.
  useEffect(() => {
    if (section === 'tasks' && param && TASK_VIEWS.includes(param)) setTaskView(param);
    if (section === 'calendar' && param) setCalendarDay(param);
  }, [section, param]);

  const openCapture = useCallback(() => setOverlay('capture'), []);
  const openPalette = useCallback(() => setOverlay('palette'), []);
  const closeOverlay = useCallback(() => setOverlay(null), []);
  const openTask = useCallback((taskId) => setEditor({ taskId }), []);
  const createOn = useCallback((due) => setEditor({ defaultDue: due }), []);

  const go = useCallback((target, targetParam) => navigate(target, targetParam), [navigate]);

  const commands = useMemo(() => [
    { id: 'new-task', label: 'New task', group: 'Actions', shortcut: 'N', keywords: 'add create capture', run: openCapture },
    { id: 'go-dashboard', label: 'Go to dashboard', group: 'Navigate', shortcut: 'G D', run: () => go('dashboard') },
    { id: 'go-tasks', label: 'Go to tasks', group: 'Navigate', shortcut: 'G T', run: () => go('tasks', 'today') },
    { id: 'go-upcoming', label: 'Go to upcoming tasks', group: 'Navigate', keywords: 'soon', run: () => go('tasks', 'upcoming') },
    { id: 'go-overdue', label: 'Go to overdue tasks', group: 'Navigate', keywords: 'late', run: () => go('tasks', 'overdue') },
    { id: 'go-nodate', label: 'Go to undated tasks', group: 'Navigate', keywords: 'no due date', run: () => go('tasks', 'nodate') },
    { id: 'go-completed', label: 'Go to completed tasks', group: 'Navigate', keywords: 'done', run: () => go('tasks', 'completed') },
    { id: 'go-calendar', label: 'Go to calendar', group: 'Navigate', shortcut: 'G C', run: () => go('calendar', todayISO()) },
    { id: 'go-sounds', label: 'Go to sounds', group: 'Navigate', run: () => go('sounds') },
    { id: 'go-settings', label: 'Go to settings', group: 'Navigate', shortcut: 'G S', run: () => go('settings') },
    {
      id: 'toggle-theme',
      label: `Switch to ${state.settings.theme === 'dark' ? 'light' : 'dark'} theme`,
      group: 'Preferences',
      keywords: 'appearance colour color',
      run: () => actions.setSetting('theme', state.settings.theme === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'toggle-sidebar',
      label: `${state.settings.sidebarOpen ? 'Hide' : 'Show'} the today panel`,
      group: 'Preferences',
      shortcut: '[',
      run: () => actions.setSetting('sidebarOpen', !state.settings.sidebarOpen),
    },
    { id: 'export', label: 'Export my data', group: 'Data', keywords: 'backup download save', run: () => go('settings') },
    { id: 'import', label: 'Import a backup', group: 'Data', keywords: 'restore upload', run: () => go('settings') },
  ], [state.settings, actions, go, openCapture]);

  useGlobalShortcuts({
    enabled: status.ready,
    onPalette: openPalette,
    onCapture: openCapture,
    onNavigate: go,
    onToggleSidebar: () => actions.setSetting('sidebarOpen', !state.settings.sidebarOpen),
    blocked: overlay !== null || editor !== null,
  });

  return (
    <>
      <Shell
        section={section}
        onNavigate={go}
        onCapture={openCapture}
        onPalette={openPalette}
        onOpenTask={openTask}
      >
        {section === 'dashboard' && (
          <Dashboard onOpenTask={openTask} onCapture={openCapture} onNavigate={go} />
        )}
        {section === 'tasks' && (
          <Tasks
            view={taskView}
            onChangeView={(view) => { setTaskView(view); navigate('tasks', view); }}
            onOpenTask={openTask}
            onCapture={openCapture}
          />
        )}
        {section === 'calendar' && (
          <Calendar
            selected={calendarDay ?? today}
            onSelect={setCalendarDay}
            onOpenTask={openTask}
            onCreateOn={createOn}
            onNavigate={go}
          />
        )}
        {section === 'sounds' && <Sounds />}
        {section === 'settings' && <Settings />}
      </Shell>

      <CommandPalette
        open={overlay === 'palette'}
        onClose={closeOverlay}
        commands={commands}
        onOpenTask={openTask}
      />
      <QuickCapture open={overlay === 'capture'} onClose={closeOverlay} />
      <TaskEditor
        open={editor !== null}
        taskId={editor?.taskId ?? null}
        defaultDue={editor?.defaultDue ?? null}
        onClose={() => setEditor(null)}
      />
    </>
  );
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Single-key shortcuts never fire while typing; the palette always works. */
function useGlobalShortcuts({ enabled, onPalette, onCapture, onNavigate, onToggleSidebar, blocked }) {
  useEffect(() => {
    if (!enabled) return undefined;
    let awaitingGo = false;
    let goTimer;

    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onPalette();
        return;
      }
      if (blocked || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if (awaitingGo) {
        const destination = { d: 'dashboard', t: 'tasks', c: 'calendar', s: 'settings', o: 'sounds' }[key];
        awaitingGo = false;
        clearTimeout(goTimer);
        if (destination) {
          event.preventDefault();
          onNavigate(destination);
        }
        return;
      }

      if (key === 'g') {
        awaitingGo = true;
        goTimer = setTimeout(() => { awaitingGo = false; }, 1500);
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        onCapture();
      } else if (key === '[') {
        event.preventDefault();
        onToggleSidebar();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(goTimer);
    };
  }, [enabled, onPalette, onCapture, onNavigate, onToggleSidebar, blocked]);
}
