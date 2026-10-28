import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayISO } from '@chestha/core';
import { useShortcutDispatch } from './app/useShortcutDispatch.js';
import { useGroveDrain } from './grove/useGroveDrain.js';
import { useGroveMaintenance } from './grove/useGroveMaintenance.js';
import { StoreProvider, useWorkspace } from './app/StoreProvider.jsx';
import { useHashRoute } from './app/useHashRoute.js';
import { Shell } from './components/Shell.jsx';
import { CommandPalette } from './components/CommandPalette.jsx';
import { QuickCapture } from './components/QuickCapture.jsx';
import { TaskEditor } from './components/TaskEditor.jsx';
import { Dashboard } from './sections/Dashboard.jsx';
import { Tasks } from './sections/Tasks.jsx';
import { Calendar } from './sections/Calendar.jsx';
import { DsaSection } from './sections/dsa/DsaSection.jsx';
import { GroveSection } from './sections/grove/GroveSection.jsx';
import { Sounds } from './sections/Sounds.jsx';
import { Websites } from './sections/Websites.jsx';
import { Settings } from './sections/Settings.jsx';
import { About } from './sections/About.jsx';
import { Changelog } from './sections/Changelog.jsx';
import { Landing } from './site/Landing.jsx';
import { MarketingHeader } from './site/MarketingHeader.jsx';
import { MarketingFooter } from './site/MarketingFooter.jsx';
import { isExtensionRuntime } from './app/platform.js';
import { SITE_URL } from './siteLinks.js';

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
  const [dsaTab, setDsaTab] = useState('home');
  const [groveTab, setGroveTab] = useState('session');

  const { section, param } = route;

  // A section can carry a parameter, which is what the extension deep-links to.
  useEffect(() => {
    if (section === 'tasks' && param && TASK_VIEWS.includes(param)) setTaskView(param);
    if (section === 'calendar' && param) setCalendarDay(param);
    if (section === 'dsa' && param) setDsaTab(param);
    // The Grove's preferences moved into Settings; an old link follows them there
    // rather than quietly landing on a different tab.
    if (section === 'grove' && param === 'settings') navigate('settings');
    else if (section === 'grove' && param) setGroveTab(param);
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
    { id: 'go-dsa', label: 'Go to DSA', group: 'Navigate', keywords: 'algorithms leetcode practice', run: () => go('dsa', 'home') },
    { id: 'go-dsa-library', label: 'Go to the question library', group: 'Navigate', keywords: 'dsa questions', run: () => go('dsa', 'library') },
    { id: 'go-grove', label: 'Go to the Grove', group: 'Navigate', keywords: 'focus timer plant garden xp', run: () => go('grove') },
    { id: 'start-focus', label: 'Start a focus session', group: 'Actions', keywords: 'timer pomodoro grove', run: () => { actions.startFocusSession(); go('grove'); } },
    { id: 'end-focus', label: 'End the focus session', group: 'Actions', keywords: 'stop timer', run: () => actions.endFocusSession() },
    { id: 'go-sounds', label: 'Go to sounds', group: 'Navigate', run: () => go('sounds') },
    { id: 'go-websites', label: 'Go to productive time', group: 'Navigate', keywords: 'time tracking sites domains websites', shortcut: 'G W', run: () => go('websites') },
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
    {
      id: 'go-changelog',
      label: 'Changelog',
      group: 'Navigate',
      keywords: 'release notes version history whats new',
      run: () => go('changelog'),
    },
    {
      id: 'open-website',
      label: 'Open Chestha website',
      group: 'Navigate',
      keywords: 'home marketing landing chestha.vercel.app site',
      run: () => window.open(SITE_URL, '_blank', 'noopener,noreferrer'),
    },
    ...(!isExtensionRuntime() ? [{
      id: 'go-about',
      label: 'About Chestha',
      group: 'Navigate',
      keywords: 'version privacy credits licence license help what is this',
      run: () => go('about'),
    }] : []),
  ], [state.settings, actions, go, openCapture]);

  useGroveDrain();
  useGroveMaintenance();

  useShortcutDispatch({
    enabled: status.ready,
    overrides: state.settings.shortcuts,
    blocked: overlay !== null || editor !== null,
    handlers: {
      palette: openPalette,
      capture: openCapture,
      sidebar: () => actions.setSetting('sidebarOpen', !state.settings.sidebarOpen),
      'go-dashboard': () => go('dashboard'),
      'go-tasks': () => go('tasks', 'today'),
      'go-calendar': () => go('calendar', todayISO()),
      'go-dsa': () => go('dsa', 'home'),
      'go-sounds': () => go('sounds'),
      'go-websites': () => go('websites'),
      'go-settings': () => go('settings'),
      navigate: go,
    },
  });

  // Website marketing surfaces — never shown in the extension New Tab.
  // About lives only on the site (marketing chrome). Changelog uses the same
  // chrome on the website; the extension still opens #/changelog in the Shell.
  if (!isExtensionRuntime() && (section === 'home' || section === 'about' || section === 'changelog')) {
    if (section === 'home') {
      return <Landing onNavigate={go} />;
    }
    return (
      <div className="relative flex min-h-dvh flex-col bg-canvas text-ink">
        <MarketingHeader onNavigate={go} />
        <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {section === 'about' && <About onNavigate={go} />}
          {section === 'changelog' && <Changelog />}
        </main>
        <MarketingFooter onNavigate={go} />
      </div>
    );
  }

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
        {section === 'dsa' && (
          <DsaSection
            tab={dsaTab}
            onChangeTab={(next) => { setDsaTab(next); navigate('dsa', next); }}
          />
        )}
        {section === 'grove' && (
          <GroveSection
            tab={groveTab}
            onChangeTab={(next) => { setGroveTab(next); navigate('grove', next); }}
            onNavigate={go}
          />
        )}
        {section === 'websites' && <Websites />}
        {section === 'sounds' && <Sounds />}
        {section === 'settings' && <Settings />}
        {section === 'changelog' && <Changelog />}
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

