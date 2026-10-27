import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  BASE_COLUMNS, DEFAULT_INTENTIONS, GITHUB_FORMS, GITHUB_FORM_LABELS, SOUNDS, activityDayLabels,
  activityLevel, activityMonthLabels, applyPreset,
  buildActivityCalendar, buildContributionYearCalendar, coerceGithubForm, coerceTemperatureUnit,
  coerceWeatherPlace, describeEvent, describeGithubError, describePlace, describeWeatherError,
  forecastUrl, formatLongDate, formatTemperature, formatTrackedDuration, geocodeUrl,
  githubContributionsUrl, githubEventsUrl, githubProfileUrl, githubReposUrl, goalState,
  isValidGithubUsername, normalizeLines, pickForDay, questionUrl, selectCompletedOn,
  selectNoDate, selectOverdue, selectToday, selectUpcoming, shortAge, sortTasks,
  summariseEvents, summariseGeocode, summariseRepos, summariseWeather, websiteTimeByDay,
} from '@kalpvan/core';
import {
  availableSeeds, isPaused as sessionPaused, levelFromXp, remainingMs, sessionProgress,
  stageForProgress, todayISO, xpOnDay,
} from '@kalpvan/core';
import * as engine from '../audio/engine.js';
import { Plant } from '../grove/plants.jsx';
import { DirtPad, GardenPlot, gridCell, gridSizeForCount } from '../grove/GardenPlot.jsx';
import {
  pauseSessionSound, resumeSessionSound, startSessionSound, stopSessionSound,
} from '../grove/sessionSound.js';
import { useSoundCatalogue } from '../app/useSoundCatalogue.js';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { TaskList } from '../components/TaskItem.jsx';
import { Badge, Button, EmptyState, Meter, Select, Stat, TextArea, cx } from '../components/ui.jsx';
import { Sparkline } from '../components/LineChart.jsx';
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
      <div className={cx(LIST_SCROLL, 'flex flex-col')}>
        <TaskList
          tasks={tasks.slice(0, rowBudget(span))}
          today={today}
          compact
          onToggle={actions.setCompleted}
          onOpen={onOpenTask}
          emptyState={(
            // h-full so the empty state fills the widget rather than leaving a
            // short box with dead space beneath it.
            <EmptyState
              className="h-full"
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

function ClockWidget({ widget, span }) {
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

  // Lock-screen proportions: the time dominates and the date recedes. The size
  // is chosen from the widget's own span rather than a container query, because
  // the limit here is height — a tall font in a one-row cell simply clips, and
  // container queries only see width.
  const wide = (span?.w ?? 1) > 1;
  const tall = (span?.h ?? 1) > 1;
  const timeSize = !wide
    ? 'text-2xl'
    : tall ? 'text-4xl @[22rem]:text-6xl' : 'text-3xl @[16rem]:text-4xl';

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-hidden text-center">
      <p className="flex items-baseline justify-center gap-1.5 whitespace-nowrap">
        <span className={cx('tabular font-bold leading-none tracking-tight text-ink', timeSize)}>
          {clock}
        </span>
        {meridiem && (
          <span className="text-[10px] font-medium uppercase text-ink-faint @[16rem]:text-xs">{meridiem}</span>
        )}
      </p>
      <p className="mt-2 hidden truncate text-meta text-ink-muted @[11rem]:block">{formatLongDate(today)}</p>
    </div>
  );
}

function NotesWidget({ span }) {
  const { state, actions } = useWorkspace();
  const roomy = (span?.w ?? 1) > 1 || (span?.h ?? 1) > 1;
  const text = state.notes.text;
  const [copied, setCopied] = useState(false);

  // The clipboard write is async and can be refused (no permission, no secure
  // context), so the confirmation waits for it to actually resolve.
  const copy = async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // One timer, cleared on unmount, so a copy just before a resize cannot set
  // state on a widget that is no longer mounted.
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1">
        <textarea
          value={text}
          onChange={(event) => actions.setNotes(event.target.value)}
          placeholder={roomy ? 'Anything you need for an hour — a link, a number, a half-thought.' : 'Notes…'}
          aria-label="Scratchpad"
          className="size-full min-h-24 resize-none rounded-control border border-line bg-inset p-3 pr-9 text-sm leading-relaxed text-ink transition-colors duration-150 placeholder:text-ink-faint hover:border-line-strong focus:border-line-strong"
        />
        {text.trim() !== '' && (
          <button
            type="button"
            onClick={copy}
            title={copied ? 'Copied' : 'Copy to clipboard'}
            aria-label={copied ? 'Scratchpad copied' : 'Copy scratchpad'}
            className="absolute right-1.5 top-1.5 rounded-control border border-line bg-surface p-1.5 text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            <Icon name={copied ? 'check' : 'copy'} className="size-3.5" />
          </button>
        )}
      </div>
      <p aria-live="polite" className="mt-2 hidden text-[10px] text-ink-faint @[12rem]:block">
        {copied ? 'Copied to clipboard.' : 'Saved as you type.'}
      </p>
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
function SearchWidget({ widget, span, editing }) {
  const [term, setTerm] = useState('');
  const inputRef = useRef(null);

  /**
   * Focus the field whenever the dashboard is opened, the way a browser's new
   * tab page does — this widget is the main reason to replace it.
   *
   * Three guards, each for a real case:
   *  - not while editing the layout, which would fight the drag controls;
   *  - not if something already holds focus, which also means a second search
   *    widget cannot steal it from the first;
   *  - not on a touch pointer, where it would pop the keyboard unasked.
   */
  useEffect(() => {
    if (editing) return;
    if (window.matchMedia?.('(pointer: coarse)').matches) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    inputRef.current?.focus();
  }, [editing]);
  const engines = {
    google: { name: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    duckduckgo: { name: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  };
  const engine = engines[widget.config.engine] ?? engines.google;

  return (
    <form
      className="flex h-full flex-col justify-center gap-2 px-[3px]"
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
          ref={inputRef}
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
 * LeetCode Problem of the Day.
 *
 * LeetCode itself does not grant CORS to a browser page, so the title/slug are
 * read from a public third-party mirror that already publishes the daily
 * challenge metadata. Only the link, title, id and difficulty are used — never
 * the problem statement. If the mirror is unreachable, the widget falls back to
 * a stable pick from the local DSA library so the card is never blank offline.
 */
const POTD_URL = 'https://alfa-leetcode-api.onrender.com/daily';

function DailyQuestionWidget({ onNavigate }) {
  const { state, today } = useWorkspace();
  const library = state['dsa.library'];
  const progress = state['dsa.progress'];
  const [potd, setPotd] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setPotd({ status: 'loading', data: null, error: null });
    fetch(POTD_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`POTD ${response.status}`);
        const payload = await response.json();
        if (cancelled) return;
        const title = typeof payload.questionTitle === 'string' ? payload.questionTitle.trim() : '';
        const slug = typeof payload.titleSlug === 'string' ? payload.titleSlug.trim() : '';
        if (!title || !slug) throw new Error('POTD missing fields');
        setPotd({
          status: 'ready',
          data: {
            title,
            slug,
            link: typeof payload.questionLink === 'string' && payload.questionLink.startsWith('https://leetcode.com/')
              ? payload.questionLink
              : `https://leetcode.com/problems/${encodeURIComponent(slug)}/`,
            difficulty: typeof payload.difficulty === 'string' ? payload.difficulty : '',
            leetcodeId: payload.questionFrontendId != null ? String(payload.questionFrontendId) : '',
            paidOnly: payload.isPaidOnly === true,
            date: typeof payload.date === 'string' ? payload.date : today,
          },
          error: null,
        });
      })
      .catch(() => {
        if (!cancelled) setPotd({ status: 'error', data: null, error: 'unavailable' });
      });
    return () => { cancelled = true; };
  }, [today]);

  const fallback = useMemo(() => {
    const questions = library.questions;
    if (questions.length === 0) return null;
    const solved = new Set(progress.events.filter((e) => e.kind === 'solve').map((e) => e.slug));
    const pool = questions.filter((q) => !solved.has(q.slug));
    const from = pool.length > 0 ? pool : questions;
    const seed = [...today].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const chosen = from[seed % from.length];
    return { question: chosen, alreadySolved: solved.has(chosen.slug) };
  }, [library.questions, progress.events, today]);

  if (potd.status === 'loading') {
    return <p className="flex h-full items-start pt-0.5 text-meta text-ink-faint">Loading today&rsquo;s LeetCode problem…</p>;
  }

  if (potd.status === 'ready' && potd.data) {
    const q = potd.data;
    const local = library.questions.find((item) => item.slug === q.slug);
    const solved = progress.events.some((e) => e.kind === 'solve' && e.slug === q.slug);
    return (
      <div className="flex h-full min-h-0 flex-col justify-start gap-1.5 overflow-hidden">
        <p className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
          LeetCode POTD
        </p>
        <a
          href={q.link}
          target="_blank"
          rel="noreferrer noopener"
          className="line-clamp-2 min-w-0 text-sm font-medium leading-snug text-ink underline-offset-2 hover:underline @[14rem]:line-clamp-3"
        >
          {q.title}
        </a>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {q.leetcodeId && <Badge tone="neutral">#{q.leetcodeId}</Badge>}
          {q.difficulty && (
            <Badge tone={q.difficulty === 'Hard' ? 'danger' : q.difficulty === 'Medium' ? 'warn' : 'ok'}>
              {q.difficulty}
            </Badge>
          )}
          {q.paidOnly && <Badge tone="warn"><Icon name="lock" className="size-3" /> Premium</Badge>}
          {solved && <Badge tone="ok">Solved</Badge>}
        </div>
        <div className="mt-auto hidden gap-2 pt-1 @[12rem]:flex">
          {local && (
            <Button size="sm" tone="quiet" onClick={() => onNavigate('dsa', 'library')}>In library</Button>
          )}
        </div>
      </div>
    );
  }

  // Mirror unreachable — honest fallback from the local library.
  if (!fallback) {
    return (
      <div className="flex h-full flex-col justify-start gap-2 overflow-hidden">
        <EmptyState
          title="Daily problem unavailable"
          description="The PotD feed could not be reached, and your library is empty. Import a pack in DSA, or try again later."
          action={<Button size="sm" onClick={() => onNavigate('dsa', 'library')}>Open the library</Button>}
        />
      </div>
    );
  }

  const { question } = fallback;
  return (
    <div className="flex h-full min-h-0 flex-col justify-start gap-1.5 overflow-hidden">
      <p className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
        Library pick · PotD offline
      </p>
      <a
        href={questionUrl(question)}
        target="_blank"
        rel="noreferrer noopener"
        className="line-clamp-2 min-w-0 text-sm font-medium leading-snug text-ink underline-offset-2 hover:underline @[14rem]:line-clamp-3"
      >
        {question.title}
      </a>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {question.leetcodeId && <Badge tone="neutral">#{question.leetcodeId}</Badge>}
        {question.difficulty && (
          <Badge tone={question.difficulty === 'Hard' ? 'danger' : question.difficulty === 'Medium' ? 'warn' : 'ok'}>
            {question.difficulty}
          </Badge>
        )}
        {question.paidOnly && <Badge tone="warn"><Icon name="lock" className="size-3" /> Premium</Badge>}
        {fallback.alreadySolved && <Badge tone="ok">Solved</Badge>}
      </div>
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
function shortcutHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/**
 * Just the tiles. Everything that edits the list — adding, removing, alignment,
 * icons — lives in the widget's edit drawer, where there is room for a form. A
 * 176px tile is not somewhere to type a URL.
 */
function ShortcutsWidget({ widget, editing }) {
  const links = Array.isArray(widget.config.links) ? widget.config.links : [];
  const showFavicons = widget.config.favicons === true;
  const flow = SHORTCUT_FLOWS[widget.config.flow] ?? SHORTCUT_FLOWS.ltr;

  if (links.length === 0) {
    return (
      <p className="py-2 text-meta leading-relaxed text-ink-faint">
        {editing
          ? 'No links yet — open this widget’s edit panel to add some.'
          : 'No links yet. Use Edit layout, then the pencil on this widget.'}
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <ul className={cx('flex h-full gap-1.5', flow.className)}>
        {links.map((link) => {
          const host = shortcutHost(link.url);
          return (
            <li key={link.id} className="w-14 shrink-0">
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                title={`${link.label} — ${host}`}
                className="flex flex-col items-center gap-1 rounded-control p-1.5 transition-colors duration-150 hover:bg-hover"
              >
                <span className="flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-chip border border-line bg-inset text-xs font-semibold uppercase text-ink-muted">
                  {showFavicons ? (
                    <img
                      src={`${new URL(link.url).origin}/favicon.ico`}
                      alt=""
                      width="20"
                      height="20"
                      className="size-5 object-contain"
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  ) : host.slice(0, 1)}
                </span>
                <span className="w-full truncate text-center text-[10px] text-ink-muted">{link.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Alignment, icons, and the links themselves — all in the drawer. */
function ShortcutsConfig({ widget, onChange }) {
  const links = Array.isArray(widget.config.links) ? widget.config.links : [];
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
    if (links.some((l) => l.url === parsed.toString())) {
      setError('That link is already here.');
      return;
    }
    onChange({
      links: [...links, {
        id: `lnk_${Date.now().toString(36)}`,
        url: parsed.toString(),
        label: label.trim() || parsed.hostname.replace(/^www\./, ''),
      }],
    });
    setUrl(''); setLabel(''); setError(null);
  };

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
          {Object.entries(SHORTCUT_FLOWS).map(([key, { label: name }]) => (
            <option key={key} value={key}>{name}</option>
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

      <div className="space-y-2 border-t border-line pt-3">
        <p className="text-meta font-medium text-ink">
          Links <span className="tabular text-ink-faint">{links.length}/{MAX_SHORTCUTS}</span>
        </p>

        {links.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
            {links.map((link) => (
              <li key={link.id} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-ink">{link.label}</span>
                  <span className="block truncate text-[10px] text-ink-faint">{shortcutHost(link.url)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onChange({ links: links.filter((l) => l.id !== link.id) })}
                  aria-label={`Remove ${link.label}`}
                  className="shrink-0 rounded-chip px-1.5 text-ink-faint hover:text-danger"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="space-y-2">
          <input
            value={url}
            onChange={(event) => { setUrl(event.target.value); setError(null); }}
            placeholder="example.com"
            aria-label="Link address"
            autoComplete="off"
            className="w-full rounded-control border border-line bg-inset px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint"
          />
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label (optional)"
            aria-label="Link label"
            autoComplete="off"
            className="w-full rounded-control border border-line bg-inset px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint"
          />
          {error && <p className="text-[10px] leading-relaxed text-danger">{error}</p>}
          <Button type="submit" size="sm" disabled={!url.trim() || links.length >= MAX_SHORTCUTS}>
            Add link
          </Button>
        </form>
      </div>
    </>
  );
}

/**
 * Both DSA daily targets as two compact figures. Designed for 1x1: it reads at
 * the smallest size and simply gains breathing room at larger ones.
 */
/**
 * Both daily targets, at whatever size the tile is.
 *
 * The figures are the content and the meters are the decoration, so the meters
 * are what gets dropped as the tile shrinks — at 1×1 there is room for two
 * fractions and nothing else. Rendering the full layout at every size was the
 * bug: the second row and its label were simply clipped, which made resizing
 * look broken when it was working exactly as asked.
 */
function DsaTodayWidget({ onNavigate, span }) {
  const { state, today } = useWorkspace();
  const goals = goalState(state['dsa.progress'].events, state['dsa.settings'], today);

  const w = span?.w ?? 1;
  const h = span?.h ?? 1;
  const tiny = w <= 1 && h <= 1;
  // Meters need a row of their own under each figure; below two rows there is
  // no such room, and a 2px bar in a clipped box is worse than none.
  const meters = h >= 2;
  // Side by side once there is width for it, which also frees vertical room.
  const sideBySide = w >= 4 && h <= 2;

  const rows = [
    { key: 'new', label: 'new', done: goals.newSolved, target: goals.newTarget, met: goals.newMet, aria: 'New questions today' },
    { key: 'revised', label: 'revised', done: goals.revisionsDone, target: goals.revisionTarget, met: goals.revisionMet, aria: 'Revisions today' },
  ];

  return (
    <button
      type="button"
      onClick={() => onNavigate('dsa', 'home')}
      className={cx(
        'flex h-full w-full rounded-control text-left transition-colors duration-150 hover:bg-hover',
        sideBySide ? 'flex-row items-center gap-4' : 'flex-col justify-center',
        !sideBySide && (tiny ? 'gap-0.5' : 'gap-2'),
      )}
      title={`DSA today — ${goals.newSolved}/${goals.newTarget} new, ${goals.revisionsDone}/${goals.revisionTarget} revised`}
    >
      {rows.map((row) => (
        <div key={row.key} className={cx('min-w-0', sideBySide && 'flex-1')}>
          <p className={cx('flex items-baseline gap-1.5', tiny && 'gap-1')}>
            <span className={cx(
              'tabular font-semibold',
              tiny ? 'text-sm leading-tight' : 'text-stat',
              row.met ? 'text-ok' : 'text-ink',
            )}>
              {row.done}/{row.target}
            </span>
            {/* The label is the first thing to go: the figure still reads, and
                a truncated word does not. */}
            {!tiny && (
              <span className="hidden truncate text-meta text-ink-muted @[8rem]:inline">{row.label}</span>
            )}
          </p>
          {meters && (
            <Meter
              value={row.done}
              max={Math.max(1, row.target)}
              label={row.aria}
              className="mt-1"
              tone={row.met ? 'ok' : 'default'}
            />
          )}
        </div>
      ))}
      {tiny && <span className="sr-only">new and revised, today’s DSA targets</span>}
    </button>
  );
}

/**
 * Something of your own to hold onto for the day.
 *
 * The lines are yours — nothing is bundled. A shipped quote library would mean
 * redistributing other people's writing, and a mantra someone else wrote is not
 * much of a mantra anyway.
 */
function InspirationWidget({ widget, onChange, editing, span }) {
  const { today } = useWorkspace();
  // No stored list means the starter prompts; an empty stored list means the
  // user cleared them deliberately, so that stays empty.
  const lines = normalizeLines(widget.config.lines ?? DEFAULT_INTENTIONS);
  const rotate = widget.config.rotate !== false;
  const [draft, setDraft] = useState('');

  const chosen = rotate ? pickForDay(lines, today) : lines[0] ?? null;

  if (lines.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-2">
        {editing ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const text = draft.trim();
              if (!text) return;
              onChange({ lines: [...lines, text] });
              setDraft('');
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="An intention for today…"
              aria-label="Add an intention"
              className="w-full rounded-control border border-line bg-inset px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint"
            />
            <Button type="submit" size="sm" disabled={!draft.trim()}>Add</Button>
          </form>
        ) : (
          <p className="text-meta leading-relaxed text-ink-faint">
            Nothing set. Open this widget’s edit panel to write an intention.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className={cx(
        'text-balance font-semibold leading-snug text-ink',
        (span?.h ?? 1) > 1 ? 'text-base @[20rem]:text-lg' : 'text-sm @[18rem]:text-base',
      )}>
        {chosen}
      </p>
    </div>
  );
}

function InspirationConfig({ widget, onChange }) {
  const lines = normalizeLines(widget.config.lines ?? DEFAULT_INTENTIONS);
  const [draft, setDraft] = useState('');

  return (
    <>
      <label className="flex items-center gap-2 text-meta text-ink-muted">
        <input
          type="checkbox"
          checked={widget.config.rotate !== false}
          onChange={(event) => onChange({ rotate: event.target.checked })}
          className="size-3.5 accent-[var(--app-accent)]"
        />
        Rotate daily
      </label>

      <div className="space-y-2 border-t border-line pt-3">
        <p className="text-meta font-medium text-ink">Your lines <span className="tabular text-ink-faint">{lines.length}</span></p>
        {lines.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
            {lines.map((line, index) => (
              <li key={`${line}-${index}`} className="flex items-start gap-2 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 text-xs leading-relaxed text-ink">{line}</span>
                <button
                  type="button"
                  onClick={() => onChange({ lines: lines.filter((_, i) => i !== index) })}
                  aria-label={`Remove “${line.slice(0, 30)}”`}
                  className="shrink-0 rounded-chip px-1.5 text-ink-faint hover:text-danger"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text) return;
            onChange({ lines: [...lines, text] });
            setDraft('');
          }}
        >
          <TextArea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="An intention, a reminder, something you want to keep in view"
            aria-label="Add a line"
            className="text-xs"
          />
          <Button type="submit" size="sm" disabled={!draft.trim()}>Add line</Button>
        </form>
      </div>
    </>
  );
}

/**
 * Recent public GitHub activity.
 *
 * This is the one widget that reaches the network, so it stays off until a
 * username is entered, and says so. GitHub allows browser requests and caps
 * unauthenticated callers at 60 per hour per IP, so a refusal is routine and is
 * reported rather than hidden.
 */
const EVENTS_PER_PAGE = 100;

/** GitHub-like contribution levels; colours come from `.gh-contrib` CSS variables. */
const HEAT = [
  'bg-[var(--gh-0)]',
  'bg-[var(--gh-1)]',
  'bg-[var(--gh-2)]',
  'bg-[var(--gh-3)]',
  'bg-[var(--gh-4)]',
];

function GithubWidget({ widget, editing, span }) {
  const { today, state: workspace } = useWorkspace();
  const username = String(widget.config.username ?? '').trim();
  const form = coerceGithubForm(widget.config.form);
  const [state, setState] = useState({ status: 'idle', data: null, error: null });

  // Three shapes, three sources: repos list, recent events summary, and the
  // public contribution-day mirror for a year-long calendar.
  const endpoint = form === 'repos' ? 'repos' : form === 'calendar' ? 'contributions' : 'events';

  useEffect(() => {
    if (!username || !isValidGithubUsername(username)) {
      setState({ status: 'idle', data: null, error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });

    const load = async () => {
      try {
        if (endpoint === 'repos') {
          const response = await fetch(githubReposUrl(username), {
            headers: { Accept: 'application/vnd.github+json' },
          });
          if (cancelled) return;
          if (!response.ok) {
            setState({
              status: 'error',
              data: null,
              error: describeGithubError(response.status, response.headers.get('x-ratelimit-remaining')),
            });
            return;
          }
          const payload = await response.json();
          if (cancelled) return;
          setState({ status: 'ready', data: { repos: summariseRepos(payload) }, error: null });
          return;
        }

        if (endpoint === 'contributions') {
          const response = await fetch(githubContributionsUrl(username));
          if (cancelled) return;
          if (!response.ok) {
            setState({
              status: 'error',
              data: null,
              error: response.status === 404
                ? 'No such public GitHub user.'
                : `Contribution calendar returned ${response.status}.`,
            });
            return;
          }
          const payload = await response.json();
          if (cancelled) return;
          const days = Array.isArray(payload?.contributions) ? payload.contributions : [];
          setState({
            status: 'ready',
            data: { contributions: days, totalsByYear: payload?.total ?? {} },
            error: null,
          });
          return;
        }

        const response = await fetch(githubEventsUrl(username, EVENTS_PER_PAGE), {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (cancelled) return;
        if (!response.ok) {
          setState({
            status: 'error',
            data: null,
            error: describeGithubError(response.status, response.headers.get('x-ratelimit-remaining')),
          });
          return;
        }
        const payload = await response.json();
        if (cancelled) return;
        const raw = Array.isArray(payload) ? payload : [];
        setState({
          status: 'ready',
          data: { events: raw, truncated: raw.length >= EVENTS_PER_PAGE, summary: summariseEvents(raw) },
          error: null,
        });
      } catch {
        if (!cancelled) {
          setState({
            status: 'error',
            data: null,
            error: endpoint === 'contributions'
              ? 'Could not reach the contribution calendar.'
              : 'Could not reach GitHub.',
          });
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [username, endpoint]);

  if (!username) {
    return (
      <div className="flex h-full flex-col justify-center">
        <p className="text-meta leading-relaxed text-ink-faint">
          {editing
            ? 'Add a GitHub username in the edit panel. Nothing is fetched until you do.'
            : 'No GitHub user set. Use Edit layout, then the pencil on this widget.'}
        </p>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <p className="flex h-full items-center text-meta text-ink-faint">
        {endpoint === 'repos'
          ? 'Reading public repositories…'
          : endpoint === 'contributions'
            ? 'Reading the last year of contributions…'
            : 'Reading public activity…'}
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full flex-col justify-center gap-1">
        <Badge tone="danger">Unavailable</Badge>
        <p className="text-meta leading-relaxed text-ink-muted">{state.error}</p>
      </div>
    );
  }

  if (!state.data) return null;

  const footer = (
    <a
      href={githubProfileUrl(username)}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-auto hidden shrink-0 pt-1.5 text-[10px] text-ink-faint underline-offset-2 hover:underline @[12rem]:block"
    >
      {username} · public {endpoint === 'repos' ? 'repositories' : endpoint === 'contributions' ? 'contributions' : 'activity'} only
    </a>
  );

  if (form === 'repos') {
    const { repos } = state.data;
    if (repos.length === 0) {
      return (
        <div className="flex h-full flex-col justify-center">
          <p className="text-meta leading-relaxed text-ink-faint">No public, non-forked repositories.</p>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col">
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-thin">
          {repos.slice(0, Math.max(2, rowBudget(span) + 1)).map((repo) => (
            <li key={repo.id}>
              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer noopener"
                className="block rounded-control px-1.5 py-1 transition-colors duration-150 hover:bg-hover"
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{repo.name}</span>
                  {repo.stars > 0 && (
                    <span className="tabular shrink-0 text-[10px] text-ink-faint">★ {repo.stars}</span>
                  )}
                </span>
                {/* Only where there is room for a second line: a truncated
                    description is noise, not information. */}
                {(span?.w ?? 1) > 2 && (repo.description || repo.language) && (
                  <span className="mt-0.5 hidden truncate text-[10px] text-ink-muted @[14rem]:block">
                    {repo.description || repo.language}
                  </span>
                )}
                {(span?.w ?? 1) > 3 && repo.pushedAt && (
                  <span className="mt-0.5 hidden text-[10px] text-ink-faint @[20rem]:block">
                    {repo.language && `${repo.language} · `}{shortAge(repo.pushedAt)}
                    {repo.archived && ' · archived'}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
        {footer}
      </div>
    );
  }

  if (form === 'calendar') {
    // Always aim for a year (~53 weeks). On narrow cards the grid scrolls
    // horizontally rather than dropping weeks, so the history stays intact.
    const available = Math.max(1, (span?.w ?? 1) * 52);
    const cell = available >= 640 ? 11 : available >= 420 ? 10 : 8;
    const gap = cell >= 10 ? 3 : 2;
    const weeks = 53;
    const weekStartsOn = workspace.settings.weekStartsOn;
    const calendar = buildContributionYearCalendar(
      state.data.contributions,
      today,
      weeks,
      weekStartsOn,
    );
    const months = activityMonthLabels(calendar.columns);
    const dayLabels = activityDayLabels(weekStartsOn);
    const labelW = 28;
    const monthH = 16;
    const gridW = weeks * cell + Math.max(0, weeks - 1) * gap;
    const gridH = 7 * cell + 6 * gap;
    const yearKey = today.slice(0, 4);
    const yearTotal = Number(state.data.totalsByYear?.[yearKey]);
    const shownTotal = Number.isFinite(yearTotal) ? yearTotal : calendar.total;

    return (
      <div className="gh-contrib flex h-full min-w-0 flex-col overflow-hidden">
        <p className="shrink-0 text-meta text-ink-muted">
          <span className="tabular font-medium text-ink">{shownTotal}</span> contribution{shownTotal === 1 ? '' : 's'}
          <span className="hidden @[14rem]:inline"> in the last year</span>
        </p>

        <div className="mt-2 min-h-0 min-w-0 flex-1 overflow-x-auto scrollbar-thin">
          <div
            role="img"
            aria-label={`${shownTotal} public GitHub contributions over the last year`}
            className="inline-block"
            style={{ minWidth: labelW + gridW }}
          >
            <div className="relative mb-1" style={{ height: monthH, marginLeft: labelW }}>
              {months.map((month) => (
                <span
                  key={`${month.label}-${month.index}`}
                  className="absolute top-0 text-[10px] leading-none text-ink-faint"
                  style={{ left: month.index * (cell + gap) }}
                >
                  {month.label}
                </span>
              ))}
            </div>

            <div className="flex" style={{ gap }}>
              <div className="relative shrink-0" style={{ width: labelW, height: gridH }}>
                {dayLabels.map((item) => (
                  <span
                    key={item.label}
                    className="absolute right-1 text-[9px] leading-none text-ink-faint"
                    style={{ top: item.row * (cell + gap) + 1 }}
                  >
                    {item.label}
                  </span>
                ))}
              </div>

              <div className="flex" style={{ gap }}>
                {calendar.columns.map((column) => (
                  <div key={column[0].date} className="flex flex-col" style={{ gap }}>
                    {column.map((day) => {
                      const level = day.future
                        ? null
                        : (day.level != null ? day.level : activityLevel(day.count, calendar.max));
                      return (
                        <span
                          key={day.date}
                          title={day.future
                            ? day.date
                            : `${day.date}: ${day.count} contribution${day.count === 1 ? '' : 's'}`}
                          className={cx(
                            'block rounded-[2px]',
                            day.future ? 'bg-transparent' : HEAT[level ?? 0],
                          )}
                          style={{ width: cell, height: cell }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-end gap-1 text-[10px] text-ink-faint" style={{ marginLeft: labelW }}>
              <span>Less</span>
              {HEAT.map((cls) => (
                <span key={cls} className={cx('rounded-[2px]', cls)} style={{ width: cell, height: cell }} />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>
        {footer}
      </div>
    );
  }

  const { summary } = state.data;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Stat value={summary.commits} label="commits" />
        <Stat value={summary.totals.pullRequests} label="PRs" />
        <Stat value={summary.repoCount} label="repos" />
      </div>

      {(span?.h ?? 1) > 1 && summary.recent.length > 0 && (
        <ul className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto scrollbar-thin">
          {summary.recent.map((item) => (
            <li key={item.id} className="truncate text-[11px] text-ink-muted">
              {describeEvent(item.type)}{' '}
              <span className="text-ink">{item.repo}</span>
            </li>
          ))}
        </ul>
      )}

      {footer}
    </div>
  );
}

function GithubConfig({ widget, onChange }) {
  const [draft, setDraft] = useState(widget.config.username ?? '');
  const valid = draft.trim() === '' || isValidGithubUsername(draft);
  const form = coerceGithubForm(widget.config.form);

  // Keep the field in step if config changes from elsewhere (e.g. undo).
  useEffect(() => {
    setDraft(widget.config.username ?? '');
  }, [widget.config.username]);

  return (
    <div className="space-y-2">
      <input
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const trimmed = next.trim();
          // Apply as soon as the value is usable so the card refetches live.
          if (trimmed === '' || isValidGithubUsername(trimmed)) {
            onChange({ username: trimmed });
          }
        }}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed === '' || isValidGithubUsername(trimmed)) {
            if (trimmed !== (widget.config.username ?? '')) onChange({ username: trimmed });
          }
        }}
        placeholder="github-username"
        aria-label="GitHub username"
        autoComplete="off"
        className="w-full rounded-control border border-line bg-inset px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint"
      />
      {!valid && <p className="text-[10px] text-danger">That is not a valid GitHub username.</p>}

      <Select
        size="sm"
        value={form}
        onChange={(event) => onChange({ form: event.target.value })}
        aria-label="What this widget shows"
      >
        {GITHUB_FORMS.map((key) => (
          <option key={key} value={key}>{GITHUB_FORM_LABELS[key]}</option>
        ))}
      </Select>

      <p className="text-[10px] leading-relaxed text-ink-faint">
        {form === 'calendar'
          ? 'Last year of the public contribution graph (same days a public profile shows). Private contributions still need a personal access token and are not included. Data comes from a public mirror of that graph.'
          : form === 'repos'
            ? 'Public repositories, most recently pushed first. Forks are left out. Each name links to the repository.'
            : 'Totals and the most recent public events.'}
      </p>
      <p className="text-[10px] leading-relaxed text-ink-faint">
        Reads from GitHub’s API. Leave the username empty and nothing is fetched. Unauthenticated
        access is limited to 60 requests an hour, shared with everything else on your connection.
      </p>
    </div>
  );
}

/** Starts a saved ambient mix without leaving the dashboard. */
function SoundsWidget({ onNavigate }) {
  const { state, actions, notify } = useWorkspace();
  const sound = state.sound;
  const catalogue = useSoundCatalogue();
  const knownIds = useMemo(() => catalogue.map((item) => item.id), [catalogue]);
  const audio = useSyncExternalStore(engine.subscribe, engine.getEngineState);
  const playing = audio.running && Object.keys(sound.lastMix ?? {}).length > 0;

  const play = async (preset) => {
    const { mix, missing } = applyPreset(preset, knownIds);
    actions.setSound({ lastMix: mix });
    engine.setCatalogue(catalogue);
    const ok = await engine.ensureContext();
    if (!ok) { notify('The browser blocked audio. Press play again.', { tone: 'danger' }); return; }
    engine.applyMix(mix, sound.masterVolume);
    if (missing.length) notify(`${missing.length} sound(s) in that preset are unavailable.`);
  };

  const stop = () => { engine.stopAll(); actions.setSound({ lastMix: {} }); };

  if (sound.presets.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-2">
        <p className="text-meta leading-relaxed text-ink-faint">No saved mixes yet.</p>
        <Button size="sm" onClick={() => onNavigate('sounds')}>Open sounds</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <ul className="space-y-1">
          {sound.presets.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => play(preset)}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors duration-150 hover:bg-hover"
              >
                <Icon name="play" className="size-3.5 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{preset.name}</span>
                <span className="tabular shrink-0 text-[10px] text-ink-faint">
                  {Object.keys(preset.mix).length}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {playing && (
        <Button size="sm" tone="quiet" className="mt-1 justify-start" onClick={stop}>
          <Icon name="pause" className="size-3.5" /> Stop
        </Button>
      )}
    </div>
  );
}

/** Widget configuration exists only where it changes meaning, never for decoration. */
/**
 * Current weather for a chosen place.
 *
 * Opt-in in the same way as the GitHub widget: nothing is fetched until a
 * location is set, and the config panel says so. The browser's geolocation
 * prompt is not used — a city name gets the same answer without handing over a
 * precise position.
 *
 * Refreshes on an hour, which is roughly how often the upstream model updates.
 * Polling faster would spend requests to redraw the same number.
 */
const WEATHER_REFRESH_MS = 60 * 60 * 1000;

function WeatherWidget({ widget, editing, span }) {
  const place = coerceWeatherPlace(widget.config.place);
  const unit = coerceTemperatureUnit(widget.config.unit);
  const [state, setState] = useState({ status: 'idle', weather: null, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!place) {
      setState({ status: 'idle', weather: null, error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading', weather: null, error: null });

    fetch(forecastUrl(place, unit))
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setState({ status: 'error', weather: null, error: describeWeatherError(response.status) });
          return;
        }
        const weather = summariseWeather(await response.json(), unit);
        if (cancelled) return;
        // A response without a current temperature is a failure, not a reading
        // of nothing.
        if (!weather) {
          setState({ status: 'error', weather: null, error: 'Open-Meteo sent no current reading.' });
          return;
        }
        setState({ status: 'ready', weather, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', weather: null, error: 'Could not reach Open-Meteo.' });
      });

    return () => { cancelled = true; };
    // `place` is rebuilt each render, so its fields are the dependency, not it.
  }, [place?.latitude, place?.longitude, unit, tick]);

  useEffect(() => {
    if (!place) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), WEATHER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [place?.latitude, place?.longitude]);

  const tiny = (span?.w ?? 1) <= 1 && (span?.h ?? 1) <= 1;

  if (!place) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <Icon name="cloudSun" className={tiny ? 'size-6 text-ink-faint' : 'size-8 text-ink-faint'} />
        {!tiny && (
          <p className="text-meta leading-relaxed text-ink-faint">
            {editing ? 'Set a location in the edit panel.' : 'No location set.'}
          </p>
        )}
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Icon name="cloudSun" className="size-6 animate-pulse text-ink-faint" />
        <span className="sr-only">Reading the forecast…</span>
      </div>
    );
  }

  if (state.status === 'error' || !state.weather) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <Icon name="alert" className="size-5 text-ink-faint" />
        {tiny ? (
          <span className="sr-only">{state.error}</span>
        ) : (
          <p className="text-meta leading-relaxed text-ink-muted">{state.error}</p>
        )}
      </div>
    );
  }

  const weather = state.weather;
  const reading = formatTemperature(weather.temperature, weather.symbol);

  // At 1×1 there is room for an icon and a number, and nothing else. Anything
  // more would be a truncated word, which tells you less than no word at all.
  if (tiny) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-0.5 overflow-hidden"
        title={`${weather.label}, ${reading} in ${describePlace(place)}`}
      >
        <Icon name={weather.icon} className="size-5 shrink-0 text-ink" />
        <span className="tabular text-sm font-semibold leading-none text-ink">{reading}</span>
        <span className="sr-only">{weather.label} in {describePlace(place)}</span>
      </div>
    );
  }

  const wide = (span?.w ?? 1) > 1;
  const tall = (span?.h ?? 1) > 1;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center overflow-hidden">
      <div className="flex items-center gap-2.5">
        <Icon name={weather.icon} className="size-8 shrink-0 text-ink @[14rem]:size-10" />
        <div className="min-w-0 flex-1">
          <p className="tabular text-2xl font-semibold leading-none text-ink @[14rem]:text-3xl">
            {reading}
          </p>
          <p className="mt-1 truncate text-meta text-ink-muted">{weather.label}</p>
        </div>
      </div>

      {wide && (weather.high !== null || weather.low !== null) && (
        <p className="mt-2 shrink-0 truncate text-meta text-ink-faint">
          {weather.high !== null && `H ${formatTemperature(weather.high, weather.symbol)}`}
          {weather.high !== null && weather.low !== null && ' · '}
          {weather.low !== null && `L ${formatTemperature(weather.low, weather.symbol)}`}
          {weather.apparent !== null && (
            <span className="hidden @[16rem]:inline">
              {' · feels '}{formatTemperature(weather.apparent, weather.symbol)}
            </span>
          )}
        </p>
      )}

      {tall && wide && (weather.humidity !== null || weather.wind !== null) && (
        <p className="mt-1 hidden shrink-0 truncate text-meta text-ink-faint @[16rem]:block">
          {weather.humidity !== null && `${weather.humidity}% humidity`}
          {weather.humidity !== null && weather.wind !== null && ' · '}
          {weather.wind !== null && `${Math.round(weather.wind)} ${weather.windUnit} wind`}
        </p>
      )}

      <p className="mt-auto shrink-0 truncate pt-1.5 text-[10px] text-ink-faint">
        {place.name}
      </p>
    </div>
  );
}

function WeatherConfig({ widget, onChange }) {
  const place = coerceWeatherPlace(widget.config.place);
  const unit = coerceTemperatureUnit(widget.config.unit);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ status: 'idle', places: [], error: null });

  // Searching on submit rather than per keystroke: a geocoder request for every
  // letter typed is a lot of traffic to answer a question nobody asked yet.
  const find = async (event) => {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) return;
    setSearch({ status: 'loading', places: [], error: null });
    try {
      const response = await fetch(geocodeUrl(term));
      if (!response.ok) {
        setSearch({ status: 'error', places: [], error: describeWeatherError(response.status) });
        return;
      }
      const places = summariseGeocode(await response.json());
      setSearch({
        status: 'ready',
        places,
        error: places.length === 0 ? `Nothing found for “${term}”.` : null,
      });
    } catch {
      setSearch({ status: 'error', places: [], error: 'Could not reach the place lookup.' });
    }
  };

  return (
    <div className="space-y-2">
      {place && (
        <div className="flex items-center gap-2 rounded-control border border-line bg-inset px-2.5 py-1.5">
          <Icon name="target" className="size-3.5 shrink-0 text-ink-faint" />
          <span className="min-w-0 flex-1 truncate text-xs text-ink">{describePlace(place)}</span>
          <button
            type="button"
            onClick={() => onChange({ place: null })}
            className="shrink-0 text-[10px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <form onSubmit={find} className="flex gap-1.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="City or town…"
          aria-label="Search for a place"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-control border border-line bg-inset px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint"
        />
        <Button type="submit" size="sm" disabled={query.trim().length < 2}>Find</Button>
      </form>

      {search.status === 'loading' && <p className="text-[10px] text-ink-faint">Searching…</p>}
      {search.error && <p className="text-[10px] text-ink-muted">{search.error}</p>}

      {search.places.length > 0 && (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto scrollbar-thin">
          {search.places.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ place: { ...option, id: undefined } });
                  setSearch({ status: 'idle', places: [], error: null });
                  setQuery('');
                }}
                className="w-full truncate rounded-control px-2 py-1 text-left text-xs text-ink hover:bg-hover"
              >
                {describePlace(option)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Select
        size="sm"
        value={unit}
        onChange={(event) => onChange({ unit: event.target.value })}
        aria-label="Temperature unit"
      >
        <option value="celsius">Celsius (°C)</option>
        <option value="fahrenheit">Fahrenheit (°F)</option>
      </Select>

      <p className="text-[10px] leading-relaxed text-ink-faint">
        Reads from Open-Meteo, which needs no account or key. Nothing is fetched until you pick a
        place, and only that place’s coordinates are sent. Your own location is never requested.
        Refreshes hourly.
      </p>
    </div>
  );
}


/**
 * The Grove on the dashboard: the plant, the timer and a way in. Deliberately not a
 * second copy of the session screen — everything else lives one click away.
 *
 * Container queries, not breakpoints: a narrow tile shows the plant and the clock, a
 * wider one earns the level meter, and a wider one still earns the duration chips.
 */
function GroveWidget({ onNavigate, span }) {
  const { state, actions, notify } = useWorkspace();
  const session = state['grove.focus'].active;
  const garden = state['grove.garden'];
  const ledger = state['grove.ledger'];
  const settings = state['grove.settings'];

  const [now, setNow] = useState(() => Date.now());
  const running = Boolean(session) && !sessionPaused(session);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const progress = session ? sessionProgress(session, now) : 0;
  const level = levelFromXp(ledger.lifetime.xp);
  const remaining = session ? remainingMs(session, now) : settings.focus.defaultMinutes * 60000;
  const total = Math.ceil(remaining / 1000);
  const clock = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  const w = span?.w ?? 1;
  const h = span?.h ?? 1;
  // 3×3 and up: stacked “start session” card. Smaller tiles stay compact.
  const mid = w >= 3 && h >= 3;
  const roomy = w >= 4 && h >= 3;

  const startSession = () => {
    setNow(Date.now());
    actions.startFocusSession();
    const preset = state.sound.presets.find((p) => p.id === settings.soundMixId);
    if (preset) startSessionSound(preset, state.sound.masterVolume);
  };

  const pauseToggle = () => {
    if (sessionPaused(session)) { actions.resumeFocusSession(); resumeSessionSound(); }
    else { actions.pauseFocusSession(); pauseSessionSound(); }
  };

  const endSession = () => {
    const result = actions.endFocusSession();
    if (!result) return;
    stopSessionSound({ chime: settings.chimeOnComplete });
    notify(`Ended · +${result.earned.xp} XP`);
  };

  if (!session && mid) {
    const recent = garden.plants.slice(-9);
    const showPlot = recent.length > 0;
    const plotSize = showPlot ? Math.min(3, gridSizeForCount(recent.length)) : 3;
    const capacity = plotSize * plotSize;
    const plotCells = showPlot
      ? recent.slice(-capacity).map((plant, index) => {
          const { col, row } = gridCell(index, plotSize);
          return {
            key: plant.id,
            col,
            row,
            node: (
              <Plant
                speciesId={plant.speciesId}
                stage={plant.stage}
                glow={false}
                className="size-full text-ink"
              />
            ),
          };
        })
      : [];

    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1.5 overflow-hidden px-1.5 py-1 text-center">
        {showPlot ? (
          <GardenPlot
            size={plotSize}
            cells={plotCells}
            framed={false}
            className={cx('w-full', roomy ? 'h-[7.5rem]' : 'h-[6.25rem]')}
            emptyLabel={`Focus Garden, ${recent.length} plants`}
          />
        ) : (
          <DirtPad>
            <Plant
              speciesId={garden.selectedSpeciesId}
              stage="sprout"
              className={cx('text-ink', roomy ? 'size-16 @[14rem]:size-20' : 'size-12 @[10rem]:size-14')}
            />
          </DirtPad>
        )}
        <p className={cx(
          'max-w-[14rem] text-balance leading-snug text-ink-muted',
          roomy ? 'text-sm' : 'text-[11px]',
        )}>
          Grow your focus, one session at a time
        </p>
        <Button size="sm" onClick={startSession}>
          <Icon name="play" className="size-4" /> Start session
        </Button>
        <div className="mt-auto w-full px-0.5 pt-0.5">
          <p className="mb-1 text-left text-[10px] text-ink-faint">
            Level {level.level} · {level.into}/{level.needed} XP
          </p>
          <Meter value={level.into} max={level.needed} label={`Level ${level.level}`} />
        </div>
      </div>
    );
  }

  // Compact / mid-with-session: stack on square tiles so 3×3 never clips.
  const stack = w <= 3 || h <= 3;

  return (
    <div className={cx(
      'flex h-full min-h-0 flex-col justify-center gap-1.5 overflow-hidden',
      stack ? 'items-center px-1.5 py-1 text-center' : 'items-stretch px-2',
    )}>
      <div className={cx(
        'flex min-h-0 w-full items-center gap-2',
        stack ? 'flex-col justify-center' : 'flex-row justify-center',
      )}>
        <DirtPad className="shrink-0">
          <Plant
            speciesId={garden.selectedSpeciesId}
            stage={session ? stageForProgress(progress) : 'sprout'}
            className={cx('text-ink', stack ? 'size-12 @[8rem]:size-14' : 'size-14 @[9rem]:size-16')}
          />
        </DirtPad>
        <div className={cx('min-w-0', stack ? 'text-center' : 'flex-1 text-left')}>
          <p className="tabular text-stat font-semibold leading-none text-ink">{clock}</p>
          <p className="mt-1 text-meta text-ink-faint">
            {session
              ? (sessionPaused(session) ? 'Paused' : `${session.plannedMinutes} min`)
              : `Level ${level.level}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {session ? (
            <>
              <Button size="sm" tone="quiet" className="rounded-full" onClick={pauseToggle}>
                <Icon name={sessionPaused(session) ? 'play' : 'pause'} className="size-4" />
              </Button>
              <Button size="sm" tone="quiet" className="rounded-full" onClick={endSession}>
                <Icon name="stop" className="size-4" />
              </Button>
            </>
          ) : (
            <Button size="sm" className="rounded-full" onClick={startSession}>
              <Icon name="play" className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-auto w-full px-0.5">
        <p className="mb-1 text-left text-[10px] text-ink-faint">
          Level {level.level} · {level.into}/{level.needed} XP
        </p>
        <Meter value={level.into} max={level.needed} label={`Level ${level.level}, ${level.into} of ${level.needed} XP`} />
      </div>
    </div>
  );
}

/** The numbers, kept out of the Grove widget so neither has to be two things. */
function XpSummaryWidget({ onNavigate }) {
  const { state } = useWorkspace();
  const ledger = state['grove.ledger'];
  const today = todayISO();
  const level = levelFromXp(ledger.lifetime.xp);

  const bySource = { task: 0, website: 0, focus: 0 };
  for (const event of ledger.events) {
    if (event.localDay === today && event.source in bySource) bySource[event.source] += event.xp;
  }

  return (
    <div className="flex h-full flex-col">
      <Stat value={xpOnDay(ledger, today)} label="XP today" meter={{ value: level.into, max: level.needed, label: `Level ${level.level}` }} />
      <dl className="mt-3 hidden grid-cols-3 gap-2 text-center @[11rem]:grid">
        {[['Tasks', bySource.task], ['Sites', bySource.website], ['Focus', bySource.focus]].map(([label, value]) => (
          <div key={label}>
            <dt className="text-meta text-ink-faint">{label}</dt>
            <dd className="tabular text-card font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="text-meta text-ink-faint">{availableSeeds(ledger)} seeds</span>
        <Button size="sm" tone="quiet" onClick={() => onNavigate('grove', 'stats')}>Details</Button>
      </div>
    </div>
  );
}


function WebsiteTimeWidget({ onNavigate, span }) {
  const { state, today } = useWorkspace();
  const settings = state['grove.settings'];
  const time = state['grove.time'];
  const days = (span?.w ?? 1) >= 4 ? 14 : 7;
  const chart = useMemo(
    () => websiteTimeByDay(time, settings.rules, { days, today }),
    [time, settings.rules, days, today],
  );
  const top = chart.series.filter((row) => row.total > 0).slice(0, Math.max(2, rowBudget(span) - 1));

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <Stat value={formatTrackedDuration(chart.grandTotal)} label={`last ${days} days`} />
      {top.length === 0 ? (
        <p className="mt-2 text-meta leading-relaxed text-ink-faint">
          No tracked time yet. Add sites on the Productive time page — the Chrome extension has to be running.
        </p>
      ) : (
        <ul className="mt-2 min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin">
          {top.map((row) => (
            <li key={row.ruleId} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-medium text-ink">{row.label}</span>
                <span className="tabular shrink-0 text-[11px] text-ink-muted">{formatTrackedDuration(row.total)}</span>
              </div>
              <Sparkline values={row.points} className="mt-0.5" />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-2">
        <Button size="sm" tone="quiet" onClick={() => onNavigate('websites')}>
          Open productive time
        </Button>
      </div>
    </div>
  );
}

export const WIDGETS = {
  today: {
    presentation: 'card',
    name: "Today's tasks",
    defaultSize: { w: 4, h: 4 },
    sizes: ['large', 'panel', 'block', 'column'],
    limits: { minW: 4, minH: 2, maxW: BASE_COLUMNS, maxH: 8 },
    description: 'Due today, plus everything overdue.',
    render: TodayWidget,
  },
  upcoming: {
    presentation: 'card',
    name: 'Upcoming',
    defaultSize: { w: 4, h: 2 },
    sizes: ['wide', 'large', 'panel', 'column'],
    limits: { minW: 4, minH: 2, maxW: BASE_COLUMNS, maxH: 8 },
    description: 'What is due within a horizon you choose.',
    render: UpcomingWidget,
    Config: HorizonConfig,
  },
  overdue: {
    presentation: 'card',
    name: 'Overdue',
    defaultSize: { w: 2, h: 2 },
    sizes: ['tiny', 'small', 'wide', 'large'],
    limits: { minW: 1, minH: 1, maxW: BASE_COLUMNS, maxH: 6 },
    description: 'A count, and the oldest few.',
    render: OverdueWidget,
  },
  clock: {
    // Reads better sitting directly on the dashboard than boxed in a card.
    presentation: 'transparent',
    name: 'Clock and date',
    defaultSize: { w: 2, h: 2 },
    sizes: ['tiny', 'small', 'wide', 'large', 'row'],
    limits: { minW: 1, minH: 1, maxW: BASE_COLUMNS, maxH: 4 },
    description: 'Local time and today’s date.',
    render: ClockWidget,
    Config: SecondsConfig,
  },
  weather: {
    presentation: 'card',
    name: 'Weather',
    description: 'Current weather for a place you choose. Contacts the internet once you set one.',
    defaultSize: { w: 1, h: 1 },
    sizes: ['tiny', 'small', 'wide', 'bar', 'large'],
    limits: { minW: 1, minH: 1, maxW: BASE_COLUMNS, maxH: 4 },
    render: WeatherWidget,
    Config: WeatherConfig,
  },
  notes: {
    presentation: 'card',
    name: 'Scratchpad',
    defaultSize: { w: 4, h: 2 },
    sizes: ['wide', 'large', 'panel', 'block', 'column', 'row'],
    limits: { minW: 4, minH: 2, maxW: BASE_COLUMNS, maxH: 8 },
    description: 'One plain note, saved as you type.',
    render: NotesWidget,
  },
  search: {
    // Transparent by default: a bare search field floating on the dashboard
    // reads as part of the page, where a card around it reads as a component
    // someone installed.
    presentation: 'transparent',
    name: 'Web search',
    description: 'A search box that opens results in the current tab.',
    defaultSize: { w: 8, h: 2 },
    // An input narrower than four columns cannot show a usable query, so the
    // narrow sizes are not offered.
    sizes: ['wide', 'bar', 'banner', 'row'],
    // maxH was 1, which excluded every preset in the vocabulary — the halved
    // grid made the shortest preset two rows tall, so the size controls came up
    // empty. Two rows is also what the field plus its hint actually needs.
    limits: { minW: 4, minH: 2, maxW: BASE_COLUMNS, maxH: 2 },
    render: SearchWidget,
    Config: SearchConfig,
  },
  daily: {
    presentation: 'card',
    name: 'Question of the day',
    description: 'LeetCode’s Problem of the Day (title and link). Falls back to your library if the feed is offline.',
    defaultSize: { w: 4, h: 2 },
    // Needs room for the card title plus the problem title without overlap.
    sizes: ['wide', 'bar', 'banner', 'panel', 'row', 'large'],
    limits: { minW: 2, minH: 2, maxW: 12, maxH: 4 },
    render: DailyQuestionWidget,
  },
  shortcuts: {
    presentation: 'card',
    name: 'Shortcuts',
    description: 'Your own links, as a grid of tiles.',
    defaultSize: { w: 2, h: 1 },
    // The add control only appears while editing, so a one-column widget is
    // three usable tiles rather than one tile and a button.
    sizes: ['small', 'wide', 'bar', 'banner', 'large', 'row'],
    limits: { minW: 1, minH: 1, maxW: 12, maxH: 3 },
    render: ShortcutsWidget,
    Config: ShortcutsConfig,
  },
  dsaToday: {
    presentation: 'card',
    name: 'DSA today',
    description: 'Both daily targets as two compact figures. Reads well at any size.',
    defaultSize: { w: 2, h: 2 },
    sizes: ['tiny', 'small', 'wide', 'tall', 'large'],
    limits: { minW: 1, minH: 1, maxW: BASE_COLUMNS, maxH: 4 },
    render: DsaTodayWidget,
  },
  inspiration: {
    presentation: 'card',
    name: 'Daily intention',
    description: 'A line of your own, optionally rotating each day.',
    defaultSize: { w: 4, h: 2 },
    sizes: ['wide', 'bar', 'banner', 'large', 'panel', 'row'],
    limits: { minW: 4, minH: 1, maxW: BASE_COLUMNS, maxH: 6 },
    render: InspirationWidget,
    Config: InspirationConfig,
  },
  github: {
    presentation: 'card',
    name: 'GitHub',
    description: 'Public activity for a GitHub user: summary, a year contribution calendar, or repositories. Contacts the internet once you set a username.',
    defaultSize: { w: 8, h: 3 },
    // The year calendar needs width; the repository list needs height.
    sizes: ['wide', 'bar', 'large', 'panel', 'banner', 'block', 'column', 'tall'],
    limits: { minW: 2, minH: 2, maxW: BASE_COLUMNS, maxH: 8 },
    render: GithubWidget,
    Config: GithubConfig,
  },
  sounds: {
    presentation: 'card',
    name: 'Ambient mixes',
    description: 'Start a saved sound mix without leaving the dashboard.',
    defaultSize: { w: 2, h: 4 },
    sizes: ['small', 'tall', 'wide', 'large', 'column'],
    limits: { minW: 2, minH: 2, maxW: BASE_COLUMNS, maxH: 8 },
    render: SoundsWidget,
  },
  grove: {
    presentation: 'card',
    name: 'Focus Garden',
    description: 'Focus Garden on the dashboard — plant, timer, and a way to start a session.',
    defaultSize: { w: 3, h: 3 },
    sizes: ['small', 'square', 'tall', 'wide', 'large', 'column'],
    limits: { minW: 2, minH: 2, maxW: BASE_COLUMNS, maxH: 8 },
    render: GroveWidget,
  },
  xpSummary: {
    presentation: 'card',
    name: 'XP today',
    description: 'What you have earned today, and from which of the three sources.',
    defaultSize: { w: 4, h: 2 },
    sizes: ['small', 'wide', 'bar', 'large'],
    limits: { minW: 2, minH: 2, maxW: BASE_COLUMNS, maxH: 4 },
    render: XpSummaryWidget,
  },
  undated: {
    presentation: 'card',
    name: 'No due date',
    defaultSize: { w: 2, h: 2 },
    sizes: ['tiny', 'small', 'wide', 'large'],
    limits: { minW: 1, minH: 1, maxW: BASE_COLUMNS, maxH: 6 },
    description: 'Open tasks that are not on the calendar.',
    render: UndatedWidget,
  },
  websiteTime: {
    presentation: 'card',
    name: 'Website time',
    description: 'Time spent on the sites you chose to track, with sparklines. Needs the Chrome extension.',
    defaultSize: { w: 4, h: 2 },
    sizes: ['wide', 'bar', 'large', 'panel', 'column'],
    limits: { minW: 2, minH: 2, maxW: BASE_COLUMNS, maxH: 6 },
    render: WebsiteTimeWidget,
  },
};

export const WIDGET_TYPES = Object.keys(WIDGETS);
