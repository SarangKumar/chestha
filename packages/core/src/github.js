/**
 * Helpers for the GitHub activity widget.
 *
 * GitHub's REST API sends `Access-Control-Allow-Origin: *`, so a browser page
 * really can read public data from it — which is why this widget is possible at
 * all where a LeetCode one is not.
 *
 * It is still an external request, and this application otherwise makes none, so
 * the widget is opt-in: nothing is fetched until a username is entered.
 * Unauthenticated requests are limited to 60 per hour per IP, shared across
 * everything on that address, so failures are expected and must be shown rather
 * than swallowed.
 */
export const GITHUB_EVENTS_URL = 'https://api.github.com/users';

const USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function isValidGithubUsername(value) {
  return USERNAME.test(String(value ?? '').trim());
}

export function githubEventsUrl(username, perPage = 30) {
  return `${GITHUB_EVENTS_URL}/${encodeURIComponent(username)}/events/public?per_page=${perPage}`;
}

/** Most recently pushed first, which is the order that makes a short list useful. */
export function githubReposUrl(username, perPage = 12) {
  return `${GITHUB_EVENTS_URL}/${encodeURIComponent(username)}/repos`
    + `?sort=pushed&direction=desc&per_page=${Math.min(100, Math.max(1, Math.round(perPage)))}`;
}

/**
 * The shapes the widget can take.
 *
 * `calendar` is deliberately NOT called a contribution calendar. GitHub's own
 * contribution graph counts private contributions and a year of history, and is
 * only reachable through the GraphQL API, which requires a personal access
 * token. This counts public events from the REST feed instead — real data,
 * a different measure — so it is labelled for what it is. Storing someone's
 * token to make the number match was not worth it.
 */
export const GITHUB_FORMS = ['summary', 'calendar', 'repos'];

export const GITHUB_FORM_LABELS = {
  summary: 'Activity summary',
  calendar: 'Activity calendar',
  repos: 'Repositories',
};

export function coerceGithubForm(value) {
  return GITHUB_FORMS.includes(value) ? value : 'summary';
}

export function githubProfileUrl(username) {
  return `https://github.com/${encodeURIComponent(username)}`;
}

const KINDS = {
  PushEvent: 'pushes',
  PullRequestEvent: 'pullRequests',
  IssuesEvent: 'issues',
  IssueCommentEvent: 'comments',
  CreateEvent: 'created',
  WatchEvent: 'stars',
  ForkEvent: 'forks',
};

/**
 * Reduces the event feed to counts and a short recent list. Only public activity
 * is visible, and the feed is capped by GitHub at roughly the last 90 days or
 * 300 events — so this is "recent activity", never a complete history.
 */
export function summariseEvents(events) {
  const totals = { pushes: 0, pullRequests: 0, issues: 0, comments: 0, created: 0, stars: 0, forks: 0 };
  const repos = new Set();
  let commits = 0;
  const recent = [];

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue;
    const key = KINDS[event.type];
    if (key) totals[key] += 1;
    if (event.repo?.name) repos.add(event.repo.name);
    if (event.type === 'PushEvent') commits += Number(event.payload?.size) || 0;
    if (recent.length < 6 && event.repo?.name) {
      recent.push({
        id: String(event.id ?? `${event.type}-${recent.length}`),
        type: event.type,
        repo: event.repo.name,
        at: typeof event.created_at === 'string' ? event.created_at : null,
      });
    }
  }

  return { totals, commits, repoCount: repos.size, repos: [...repos].slice(0, 8), recent, events: Array.isArray(events) ? events.length : 0 };
}

export const EVENT_LABELS = {
  PushEvent: 'pushed to',
  PullRequestEvent: 'a pull request on',
  IssuesEvent: 'an issue on',
  IssueCommentEvent: 'commented on',
  CreateEvent: 'created',
  WatchEvent: 'starred',
  ForkEvent: 'forked',
  DeleteEvent: 'deleted a ref in',
  ReleaseEvent: 'released on',
};

export function describeEvent(type) {
  return EVENT_LABELS[type] ?? 'activity in';
}

/** Turns a failed response into something worth showing a person. */
export function describeGithubError(status, remaining) {
  if (status === 404) return 'No such public GitHub user.';
  if (status === 403 && remaining === '0') {
    return 'GitHub’s hourly limit for unauthenticated requests is used up. It resets within the hour.';
  }
  if (status === 403) return 'GitHub refused the request.';
  if (status >= 500) return 'GitHub is having trouble right now.';
  return `GitHub returned ${status}.`;
}

/** The local calendar day an instant falls on, matching the rest of the app. */
function localDay(instant) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Buckets public events into local days, newest column last, for a heatmap.
 *
 * `weeks` columns of seven, ending on the week containing `today`, so the grid
 * is rectangular and the last column is the current week — the same shape
 * GitHub's own graph has, which is what makes it readable at a glance.
 *
 * Days before the feed's horizon are returned with `known: false` rather than a
 * count of zero. A zero means "nothing happened"; an unknown day means "the API
 * does not go back this far", and painting the two the same way would claim a
 * quiet streak that may never have existed.
 *
 * Where that horizon sits depends on whether the feed was truncated. GitHub caps
 * the feed at roughly 90 days AND at the page size asked for, whichever bites
 * first. If fewer events came back than were asked for, the page is the whole
 * feed and every day inside the 90-day window is genuinely known, quiet days
 * included. If the page filled up, there may be older events that were cut off,
 * so nothing before the oldest event in hand can be trusted.
 */
export function buildActivityCalendar(events, today, weeks = 13, weekStartsOn = 0, { truncated = true, horizonDays = 90 } = {}) {
  const counts = new Map();
  let oldest = null;

  for (const event of Array.isArray(events) ? events : []) {
    const day = event?.created_at ? localDay(event.created_at) : null;
    if (!day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
    if (!oldest || day < oldest) oldest = day;
  }

  // The earliest day this feed can speak for. A truncated page knows nothing
  // before its own oldest event; a complete one knows the whole 90-day window.
  const windowStart = (() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - horizonDays);
    return localDay(d);
  })();
  const horizon = truncated ? (oldest ?? today) : windowStart;

  // Walk back to the start of the week containing `today`, then back `weeks - 1`
  // further, so the grid always begins on a week boundary.
  const end = new Date(`${today}T00:00:00`);
  const offset = (end.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(end);
  start.setDate(start.getDate() - offset - (weeks - 1) * 7);

  const columns = [];
  let max = 0;
  for (let w = 0; w < weeks; w += 1) {
    const column = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start);
      date.setDate(date.getDate() + w * 7 + d);
      const iso = localDay(date);
      const future = iso > today;
      const count = counts.get(iso) ?? 0;
      if (count > max) max = count;
      column.push({
        date: iso,
        count: future ? 0 : count,
        future,
        // Beyond the feed's reach, so silence here is not evidence of silence.
        known: !future && iso >= horizon,
      });
    }
    columns.push(column);
  }

  return { columns, max, total: [...counts.values()].reduce((a, b) => a + b, 0), oldest, weeks };
}

/** Five buckets, so the darkest shade means "a lot for this person", not a fixed number. */
export function activityLevel(count, max) {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  return Math.min(4, Math.ceil((count / max) * 4));
}

/**
 * Reduces the repository list to what a small card can show, dropping forks —
 * a list of other people's projects is not a portrait of what someone works on.
 */
export function summariseRepos(raw, limit = 8) {
  const list = [];
  for (const repo of Array.isArray(raw) ? raw : []) {
    if (!repo || typeof repo !== 'object' || repo.fork) continue;
    const name = typeof repo.name === 'string' ? repo.name : null;
    if (!name) continue;
    list.push({
      id: String(repo.id ?? name),
      name,
      fullName: typeof repo.full_name === 'string' ? repo.full_name : name,
      // Built from the owner and name rather than trusting `html_url`, so a
      // surprising value in the response cannot become a link target.
      url: `https://github.com/${encodeURIComponent(repo.owner?.login ?? '')}/${encodeURIComponent(name)}`,
      description: typeof repo.description === 'string' ? repo.description : '',
      language: typeof repo.language === 'string' ? repo.language : '',
      stars: Number(repo.stargazers_count) || 0,
      pushedAt: typeof repo.pushed_at === 'string' ? repo.pushed_at : null,
      archived: repo.archived === true,
    });
    if (list.length >= limit) break;
  }
  return list;
}

/** "3d", "2mo" — short enough for a badge beside a repository name. */
export function shortAge(instant, now = new Date()) {
  const then = new Date(instant);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.floor((now - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
