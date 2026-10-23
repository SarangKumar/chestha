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
