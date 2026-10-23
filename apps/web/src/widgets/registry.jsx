import { useEffect, useMemo, useState } from 'react';
import {
  formatLongDate, goalState, questionUrl, selectCompletedOn, selectNoDate, selectOverdue,
  selectToday, selectUpcoming, sortTasks,
} from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { TaskList } from '../components/TaskItem.jsx';
import { Badge, Button, EmptyState, Meter, Select, Stat, cx } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

/** How many list rows comfortably fit a widget of this height. */
function rowBudget(span) {
  return Math.max(2, (span?.h ?? 1) * 4 - 1);
}

/**
 * Task lists need width for a title. Below roughly 11rem the widget shows only
 * its headline figure; from there up the list appears. This is a container
 * query, so it responds to the widget's own box rather than the viewport — a
 * one-column widget on a wide screen still gets its list.
 */
const LIST_SCROLL = 'hidden min-h-0 flex-1 overflow-y-auto scrollbar-thin @[11rem]:block';

function TodayWidget({ onOpenTask, onCapture, span }) {
  const { state, today, actions } = useWorkspace();
  const tasks = sortTasks(selectToday(state.tasks, today), 'due');
  const done = selectCompletedOn(state.tasks, today).length;

  const total = tasks.length + done;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3">
        <Stat
          value={tasks.length}
          label={tasks.length === 1 ? 'task left today' : 'tasks left today'}
          meter={total > 0 ? { value: done, max: total, label: `${done} of ${total} done today` } : undefined}
        />
        {total > 0 && (
          <p className="mt-1.5 hidden tabular text-meta text-ink-faint @[9rem]:block">{done} of {total} done</p>
        )}
      </div>
      <div className={LIST_SCROLL}>
        <TaskList
          tasks={tasks.slice(0, rowBudget(span))}
          today={today}
          compact
          onToggle={actions.setCompleted}
          onOpen={onOpenTask}
          emptyState={(
            <EmptyState
              title={done > 0 ? 'Nothing left today' : 'Nothing due today'}
              action={<Button size="sm" onClick={onCapture}>Add a task</Button>}
            />
          )}
        />
      </div>
    </div>
  );
}

function UpcomingWidget({ widget, onOpenTask, span }) {
  const { state, today, actions } = useWorkspace();
  const horizon = Number(widget.config.horizonDays) || state.settings.upcomingHorizonDays;
  const tasks = sortTasks(selectUpcoming(state.tasks, today, horizon), 'due');

  return (
    <div className="flex h-full flex-col">
      <Stat
        className="mb-3"
        value={tasks.length}
        label={`due in the next ${horizon} day${horizon === 1 ? '' : 's'}`}
      />
      <div className={LIST_SCROLL}>
        <TaskList
          tasks={tasks.slice(0, rowBudget(span))}
          today={today}
          compact
          onToggle={actions.setCompleted}
          onOpen={onOpenTask}
          emptyState={<EmptyState title="Nothing coming up" />}
        />
      </div>
    </div>
  );
}

function OverdueWidget({ onOpenTask, onNavigate, span }) {
  const { state, today, actions } = useWorkspace();
  const tasks = sortTasks(selectOverdue(state.tasks, today), 'due');

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="tabular text-display font-semibold text-ink">0</p>
        <p className="mt-1 text-meta text-ink-muted">nothing overdue</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Stat className="mb-3" value={tasks.length} label="overdue" tone="danger" />
      <div className={LIST_SCROLL}>
        <TaskList tasks={tasks.slice(0, rowBudget(span))} today={today} compact onToggle={actions.setCompleted} onOpen={onOpenTask} />
      </div>
      {tasks.length > rowBudget(span) && (
        <Button size="sm" tone="quiet" className="mt-1 hidden @[11rem]:inline-flex" onClick={() => onNavigate('tasks', 'overdue')}>
          See all {tasks.length}
        </Button>
      )}
    </div>
  );
}

function ClockWidget({ widget }) {
  const { today } = useWorkspace();
  const [now, setNow] = useState(() => new Date());
  const seconds = widget.config.showSeconds === true;

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), seconds ? 1000 : 20000);
    return () => clearInterval(interval);
  }, [seconds]);

  // AM/PM is split out so it can be rendered small. Kept together it is wide
  // enough to overflow a 1x1 tile at the larger font sizes.
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  }).formatToParts(now);

  const clock = parts
    .filter((part) => part.type !== 'dayPeriod' && part.type !== 'literal' ? true : part.type === 'literal' && part.value.trim() === ':')
    .map((part) => part.value)
    .join('');
  const meridiem = parts.find((part) => part.type === 'dayPeriod')?.value ?? '';

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-hidden text-center">
      <p className="flex items-baseline justify-center gap-1 whitespace-nowrap">
        <span className="tabular text-xl font-semibold tracking-tight text-ink @[9rem]:text-stat @[15rem]:text-display @[24rem]:text-5xl">
          {clock}
        </span>
        {meridiem && (
          <span className="text-[10px] font-medium uppercase text-ink-muted @[15rem]:text-xs">{meridiem}</span>
        )}
      </p>
      <p className="mt-1.5 hidden truncate text-meta text-ink-muted @[11rem]:block">{formatLongDate(today)}</p>
    </div>
  );
}

function NotesWidget({ span }) {
  const { state, actions } = useWorkspace();
  const roomy = (span?.w ?? 1) > 1 || (span?.h ?? 1) > 1;
  return (
    <div className="flex h-full flex-col">
      <textarea
        value={state.notes.text}
        onChange={(event) => actions.setNotes(event.target.value)}
        placeholder={roomy ? 'Anything you need for an hour — a link, a number, a half-thought.' : 'Notes…'}
        aria-label="Scratchpad"
        className="min-h-24 flex-1 resize-none rounded-control border border-line bg-inset p-3 text-sm leading-relaxed text-ink transition-colors duration-150 placeholder:text-ink-faint hover:border-line-strong focus:border-line-strong"
      />
      <p className="mt-2 hidden text-[10px] text-ink-faint @[12rem]:block">Saved as you type.</p>
    </div>
  );
}

function UndatedWidget({ onOpenTask, onNavigate, span }) {
  const { state, today, actions } = useWorkspace();
  const tasks = selectNoDate(state.tasks);
  return (
    <div className="flex h-full flex-col">
      <Stat className="mb-3" value={tasks.length} label="without a date" />
      <div className={LIST_SCROLL}>
        <TaskList
          tasks={tasks.slice(0, rowBudget(span))}
          today={today}
          compact
          showDate={false}
          onToggle={actions.setCompleted}
          onOpen={onOpenTask}
          emptyState={<EmptyState title="Every task has a date" />}
        />
      </div>
      {tasks.length > rowBudget(span) && (
        <Button size="sm" tone="quiet" className="mt-1 hidden @[11rem]:inline-flex" onClick={() => onNavigate('tasks', 'nodate')}>
          See all {tasks.length}
        </Button>
      )}
    </div>
  );
}

function HorizonConfig({ widget, onChange }) {
  return (
    <label className="flex items-center gap-2 text-meta text-ink-muted">
      Horizon
      <Select
        value={String(Number(widget.config.horizonDays) || 7)}
        onChange={(event) => onChange({ horizonDays: Number(event.target.value) })}
        size="sm"
        className="w-auto"
      >
        {[3, 7, 14, 30].map((days) => <option key={days} value={days}>{days} days</option>)}
      </Select>
    </label>
  );
}

function SecondsConfig({ widget, onChange }) {
  const on = widget.config.showSeconds === true;
  return (
    <label className="flex items-center gap-2 text-meta text-ink-muted">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => onChange({ showSeconds: event.target.checked })}
        className="size-3.5 accent-[var(--app-accent)]"
      />
      Show seconds
    </label>
  );
}

/**
 * Opens a web search in a new tab. The app makes no request itself — submitting
 * navigates away, so nothing is sent from here and no API key is involved.
 */
function SearchWidget({ widget, span }) {
  const [term, setTerm] = useState('');
  const engines = {
    google: { name: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    duckduckgo: { name: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  };
  const engine = engines[widget.config.engine] ?? engines.google;

  return (
    <form
      className="flex h-full flex-col justify-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const q = term.trim();
        if (!q) return;
        // Navigating the current tab leaves the app. That is safe: every change
        // is already persisted, and the store flushes any debounced write on
        // pagehide before the navigation completes.
        window.location.assign(engine.url(q));
      }}
    >
      <label className="sr-only" htmlFor={`search-${widget.id}`}>Search {engine.name}</label>
      <div className="relative">
        <input
          id={`search-${widget.id}`}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={(span?.w ?? 1) > 1 ? `Search ${engine.name}…` : 'Search…'}
          enterKeyHint="search"
          className="w-full rounded-control border border-line bg-inset py-2 pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint hover:border-line-strong focus:border-line-strong"
        />
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
          <Icon name="search" className="size-4" />
        </span>
      </div>
      <p className="hidden text-[10px] text-ink-faint @[14rem]:block">Press Enter to search.</p>
    </form>
  );
}

function SearchConfig({ widget, onChange }) {
  return (
    <label className="flex items-center gap-2 text-meta text-ink-muted">
      Engine
      <Select
        value={widget.config.engine ?? 'google'}
        onChange={(event) => onChange({ engine: event.target.value })}
        size="sm"
        className="w-auto"
      >
        <option value="google">Google</option>
        <option value="duckduckgo">DuckDuckGo</option>
      </Select>
    </label>
  );
}

/**
 * A question to do today, chosen from the library you have imported.
 *
 * It is deliberately NOT LeetCode's official Daily Question: a browser page
 * cannot reach leetcode.com (no CORS grant) and their terms forbid scraping, so
 * claiming to show the official daily would be a lie. This picks deterministically
 * from your own library by date, so it is stable for the whole day and works
 * offline. Unsolved questions are preferred.
 */
function DailyQuestionWidget({ onNavigate }) {
  const { state, today } = useWorkspace();
  const library = state['dsa.library'];
  const progress = state['dsa.progress'];

  const pick = useMemo(() => {
    const questions = library.questions;
    if (questions.length === 0) return null;
    const solved = new Set(progress.events.filter((e) => e.kind === 'solve').map((e) => e.slug));
    const pool = questions.filter((q) => !solved.has(q.slug));
    const from = pool.length > 0 ? pool : questions;
    // A simple date hash keeps the choice stable across reloads on the same day.
    const seed = [...today].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const chosen = from[seed % from.length];
    return { question: chosen, alreadySolved: solved.has(chosen.slug), remaining: pool.length };
  }, [library.questions, progress.events, today]);

  if (!pick) {
    return (
      <div className="flex h-full flex-col justify-center">
        <EmptyState
          title="No questions yet"
          description="Import a pack in the DSA section and one will appear here each day."
          action={<Button size="sm" onClick={() => onNavigate('dsa', 'library')}>Open the library</Button>}
        />
      </div>
    );
  }

  const { question } = pick;
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <a
        href={questionUrl(question)}
        target="_blank"
        rel="noreferrer noopener"
        className="line-clamp-2 text-sm font-medium text-ink underline-offset-2 hover:underline @[16rem]:line-clamp-none @[16rem]:text-base"
      >
        {question.title}
      </a>
      <div className="flex flex-wrap items-center gap-1.5">
        {question.leetcodeId && <Badge tone="neutral">#{question.leetcodeId}</Badge>}
        {question.difficulty && (
          <Badge tone={question.difficulty === 'Hard' ? 'danger' : question.difficulty === 'Medium' ? 'warn' : 'neutral'}>
            {question.difficulty}
          </Badge>
        )}
        {question.paidOnly && <Badge tone="warn"><Icon name="lock" className="size-3" /> Premium</Badge>}
        {pick.alreadySolved && <Badge tone="ok">Solved</Badge>}
      </div>
      <p className="hidden text-[10px] leading-relaxed text-ink-faint @[14rem]:block">
        Picked from your library for {today}. Not LeetCode&rsquo;s official daily — that cannot be read from a browser.
      </p>
    </div>
  );
}

const MAX_SHORTCUTS = 12;

/**
 * Tile direction. Flex wrap handles all four with a single class, and because
 * the scroll container has a bounded height the column directions wrap into
 * columns rather than overflowing.
 */
const SHORTCUT_FLOWS = {
  ltr: { label: 'Left to right', className: 'flex-row flex-wrap' },
  rtl: { label: 'Right to left', className: 'flex-row-reverse flex-wrap' },
  ttb: { label: 'Top to bottom', className: 'flex-col flex-wrap content-start' },
  btt: { label: 'Bottom to top', className: 'flex-col-reverse flex-wrap content-start' },
};

/**
 * User-defined links.
 *
 * Favicons are OFF by default and must be switched on per widget: fetching one
 * reaches out to each site, which would tell those sites when you open your
 * dashboard. The default is a letter tile derived from the domain, which needs
 * no network at all.
 */
function ShortcutsWidget({ widget, onChange, editing }) {
  const links = Array.isArray(widget.config.links) ? widget.config.links : [];
  const showFavicons = widget.config.favicons === true;
  const flow = SHORTCUT_FLOWS[widget.config.flow] ?? SHORTCUT_FLOWS.ltr;
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState(null);

  const add = (event) => {
    event.preventDefault();
    let parsed;
    try {
      parsed = new URL(url.includes('://') ? url : `https://${url}`);
    } catch {
      setError('That is not a web address.');
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      setError('Only http and https addresses can be opened.');
      return;
    }
    if (links.length >= MAX_SHORTCUTS) {
      setError(`A shortcuts widget holds up to ${MAX_SHORTCUTS} links.`);
      return;
    }
    onChange({
      links: [...links, {
        id: `lnk_${Date.now().toString(36)}`,
        url: parsed.toString(),
        label: label.trim() || parsed.hostname.replace(/^www\./, ''),
      }],
    });
    setUrl(''); setLabel(''); setError(null); setAdding(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {links.length === 0 ? (
          <p className="py-2 text-meta text-ink-faint">
            {editing ? 'No links yet — add one below.' : 'No links yet. Use Edit layout to add some.'}
          </p>
        ) : (
          <ul className={cx('flex h-full gap-1.5', flow.className)}>
            {links.map((link) => {
              let host = link.url;
              try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
              return (
                <li key={link.id} className="group relative w-14 shrink-0">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={`${link.label} — ${host}`}
                    className="flex flex-col items-center gap-1 rounded-control p-1.5 transition-colors duration-150 hover:bg-hover"
                  >
                    {/* shrink-0 keeps the tile square: it is a flex item in a
                        column, so without it the height compresses when vertical
                        space is tight and the tile turns into a rectangle. */}
                    <span className="flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-chip border border-line bg-inset text-xs font-semibold uppercase text-ink-muted">
                      {showFavicons ? (
                        <img
                          src={`${new URL(link.url).origin}/favicon.ico`}
                          alt=""
                          width="20"
                          height="20"
                          // object-contain so a non-square favicon fits rather
                          // than being stretched to fill the box.
                          className="size-5 object-contain"
                          onError={(event) => { event.currentTarget.style.display = 'none'; }}
                        />
                      ) : host.slice(0, 1)}
                    </span>
                    <span className="w-full truncate text-center text-[10px] text-ink-muted">{link.label}</span>
                  </a>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => onChange({ links: links.filter((l) => l.id !== link.id) })}
                      aria-label={`Remove ${link.label}`}
                      className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full border border-line bg-surface text-[10px] text-ink-muted hover:text-danger"
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!editing ? null : adding ? (
        <form onSubmit={add} className="mt-2 space-y-1.5">
          <input
            value={url}
            onChange={(event) => { setUrl(event.target.value); setError(null); }}
            placeholder="example.com"
            autoComplete="off"
            className="w-full rounded-control border border-line bg-inset px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint"
          />
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label (optional)"
            autoComplete="off"
            className="w-full rounded-control border border-line bg-inset px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint"
          />
          {error && <p className="text-[10px] text-danger">{error}</p>}
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" tone="primary" disabled={!url.trim()}>Add</Button>
            <Button type="button" size="sm" tone="quiet" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button size="sm" tone="quiet" className="mt-2 justify-start" onClick={() => setAdding(true)}>
          <Icon name="plus" className="size-3.5" /> Add link
        </Button>
      )}
    </div>
  );
}

function ShortcutsConfig({ widget, onChange }) {
  return (
    <>
      <label className="flex items-center gap-2 text-meta text-ink-muted">
        Align
        <Select
          value={widget.config.flow ?? 'ltr'}
          onChange={(event) => onChange({ flow: event.target.value })}
          size="sm"
        className="w-auto"
        >
          {Object.entries(SHORTCUT_FLOWS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-2 text-meta text-ink-muted">
      <input
        type="checkbox"
        checked={widget.config.favicons === true}
        onChange={(event) => onChange({ favicons: event.target.checked })}
        className="size-3.5 accent-[var(--app-accent)]"
      />
      <span title="Each site is contacted for its icon, which tells it when you open your dashboard.">
        Load site icons
      </span>
      </label>
    </>
  );
}

/**
 * Both DSA daily targets as two compact figures. Designed for 1x1: it reads at
 * the smallest size and simply gains breathing room at larger ones.
 */
function DsaTodayWidget({ onNavigate }) {
  const { state, today } = useWorkspace();
  const goals = goalState(state['dsa.progress'].events, state['dsa.settings'], today);

  return (
    <button
      type="button"
      onClick={() => onNavigate('dsa', 'home')}
      className="flex h-full w-full flex-col justify-center gap-2 rounded-control text-left transition-colors duration-150 hover:bg-hover"
      title="Open the DSA overview"
    >
      <div>
        <p className="flex items-baseline gap-1.5">
          <span className={cx('tabular text-stat font-semibold', goals.newMet ? 'text-ok' : 'text-ink')}>
            {goals.newSolved}/{goals.newTarget}
          </span>
          <span className="truncate text-meta text-ink-muted">new</span>
        </p>
        <Meter value={goals.newSolved} max={Math.max(1, goals.newTarget)} label="New questions today" className="mt-1" tone={goals.newMet ? 'ok' : 'default'} />
      </div>
      <div>
        <p className="flex items-baseline gap-1.5">
          <span className={cx('tabular text-stat font-semibold', goals.revisionMet ? 'text-ok' : 'text-ink')}>
            {goals.revisionsDone}/{goals.revisionTarget}
          </span>
          <span className="truncate text-meta text-ink-muted">revised</span>
        </p>
        <Meter value={goals.revisionsDone} max={Math.max(1, goals.revisionTarget)} label="Revisions today" className="mt-1" tone={goals.revisionMet ? 'ok' : 'default'} />
      </div>
    </button>
  );
}

/** Widget configuration exists only where it changes meaning, never for decoration. */
export const WIDGETS = {
  today: {
    presentation: 'card',
    name: "Today's tasks",
    defaultSize: { w: 2, h: 2 },
    limits: { minW: 1, minH: 1, maxW: 4, maxH: 4 },
    description: 'Due today, plus everything overdue.',
    render: TodayWidget,
  },
  upcoming: {
    presentation: 'card',
    name: 'Upcoming',
    defaultSize: { w: 2, h: 1 },
    limits: { minW: 1, minH: 1, maxW: 4, maxH: 4 },
    description: 'What is due within a horizon you choose.',
    render: UpcomingWidget,
    Config: HorizonConfig,
  },
  overdue: {
    presentation: 'card',
    name: 'Overdue',
    defaultSize: { w: 1, h: 1 },
    limits: { minW: 1, minH: 1, maxW: 4, maxH: 3 },
    description: 'A count, and the oldest few.',
    render: OverdueWidget,
  },
  clock: {
    // Reads better sitting directly on the dashboard than boxed in a card.
    presentation: 'transparent',
    name: 'Clock and date',
    defaultSize: { w: 1, h: 1 },
    limits: { minW: 1, minH: 1, maxW: 4, maxH: 2 },
    description: 'Local time and today’s date.',
    render: ClockWidget,
    Config: SecondsConfig,
  },
  notes: {
    presentation: 'card',
    name: 'Scratchpad',
    defaultSize: { w: 2, h: 1 },
    limits: { minW: 1, minH: 1, maxW: 4, maxH: 4 },
    description: 'One plain note, saved as you type.',
    render: NotesWidget,
  },
  search: {
    presentation: 'card',
    name: 'Web search',
    description: 'A search box that opens results in the current tab.',
    defaultSize: { w: 2, h: 1 },
    // An input narrower than two columns cannot show a usable query, so the
    // one-column sizes are not offered.
    limits: { minW: 2, minH: 1, maxW: 4, maxH: 2 },
    render: SearchWidget,
    Config: SearchConfig,
  },
  daily: {
    presentation: 'card',
    name: 'Question of the day',
    description: 'One question from your library, chosen fresh each day.',
    defaultSize: { w: 2, h: 1 },
    // The content is a question title; one column cannot show enough of it.
    limits: { minW: 2, minH: 1, maxW: 4, maxH: 2 },
    render: DailyQuestionWidget,
  },
  shortcuts: {
    presentation: 'card',
    name: 'Shortcuts',
    description: 'Your own links, as a grid of tiles.',
    defaultSize: { w: 2, h: 1 },
    // The add control only appears while editing, so a one-column widget is
    // three usable tiles rather than one tile and a button.
    limits: { minW: 1, minH: 1, maxW: 4, maxH: 3 },
    render: ShortcutsWidget,
    Config: ShortcutsConfig,
  },
  dsaToday: {
    presentation: 'card',
    name: 'DSA today',
    description: 'Both daily targets as two compact figures. Reads well at any size.',
    defaultSize: { w: 1, h: 1 },
    limits: { minW: 1, minH: 1, maxW: 4, maxH: 2 },
    render: DsaTodayWidget,
  },
  undated: {
    presentation: 'card',
    name: 'No due date',
    defaultSize: { w: 1, h: 1 },
    limits: { minW: 1, minH: 1, maxW: 4, maxH: 3 },
    description: 'Open tasks that are not on the calendar.',
    render: UndatedWidget,
  },
};

export const WIDGET_TYPES = Object.keys(WIDGETS);
