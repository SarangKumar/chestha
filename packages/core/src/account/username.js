/**
 * A username is a public URL segment (`/user/sarang`), so it is part of the
 * site's route namespace and cannot be validated as a free-form display name.
 * Two rules follow from that and are enforced here rather than at the database:
 *
 * 1. The stored form is lowercase. Routes are matched case-sensitively but
 *    people type URLs in any case, so `handle` is the canonical lowercase key
 *    and `displayUsername` keeps what the user typed. A unique index on the
 *    lowercase form is what actually prevents `Sarang` and `sarang` coexisting.
 * 2. Reserved words are refused. Without this, a user called `settings` or
 *    `api` either shadows a real route or — worse — looks official.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** Letters, digits, underscore and hyphen; must start and end alphanumeric. */
const SHAPE = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;

/**
 * Route segments the site owns, plus words that would let an account pass
 * itself off as part of the product. Kept as one flat list because the cost of
 * reserving a word that is merely *probably* a route is a user picking another
 * handle, while the cost of missing one is a broken or impersonating page.
 */
export const RESERVED_USERNAMES = new Set([
  // Site routes, current and plainly coming.
  'about', 'admin', 'api', 'app', 'auth', 'bookmarks', 'calendar', 'changelog',
  'dashboard', 'discover', 'dsa', 'explore', 'extension', 'feed', 'grove',
  'guide', 'help', 'home', 'login', 'logout', 'new', 'notifications', 'onboarding',
  'post', 'posts', 'privacy', 'profile', 'register', 'reset', 'search', 'session',
  'settings', 'signin', 'signout', 'signup', 'sounds', 'static', 'tag', 'tags',
  'tasks', 'terms', 'topic', 'topics', 'user', 'users', 'websites', 'workspace',
  // Infrastructure and well-known paths.
  '_next', 'assets', 'cdn', 'favicon', 'images', 'public', 'robots', 'sitemap',
  'well-known',
  // Impersonation.
  'chestha', 'official', 'moderator', 'mod', 'staff', 'support', 'team', 'root',
  'security', 'billing', 'noreply', 'no-reply', 'postmaster', 'webmaster',
]);

/** Lowercase and trim; strips a leading `@` so a pasted handle works. */
export function normalizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

/**
 * @returns {{ ok: boolean, handle: string, reason: string | null }}
 *   `reason` is end-user copy — it is shown on the sign-up form as-is.
 */
export function validateUsername(raw) {
  const handle = normalizeUsername(raw);
  const fail = (reason) => ({ ok: false, handle, reason });

  if (!handle) return fail('Pick a username.');
  if (handle.length < USERNAME_MIN) return fail(`Usernames are at least ${USERNAME_MIN} characters.`);
  if (handle.length > USERNAME_MAX) return fail(`Usernames are at most ${USERNAME_MAX} characters.`);
  if (!SHAPE.test(handle)) {
    return fail('Use letters, numbers, hyphens and underscores; start and end with a letter or number.');
  }
  // A handle made only of digits would be ambiguous against any future
  // numeric id in the same position.
  if (/^\d+$/.test(handle)) return fail('Usernames need at least one letter.');
  if (RESERVED_USERNAMES.has(handle)) return fail('That username is reserved.');

  return { ok: true, handle, reason: null };
}

/**
 * Best-effort handle from an email or name, for pre-filling the sign-up field.
 * The result is only a suggestion: it is still validated, and may collide.
 */
export function suggestUsername(source) {
  const base = normalizeUsername(String(source ?? '').split('@')[0])
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .slice(0, USERNAME_MAX);
  if (!base || base.length < USERNAME_MIN || RESERVED_USERNAMES.has(base) || /^\d+$/.test(base)) {
    return '';
  }
  return base;
}
