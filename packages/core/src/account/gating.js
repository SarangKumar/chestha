/**
 * Which parts of the workspace need an account, and how the workspace decides.
 *
 * This reverses what the product used to promise, so the reasoning matters more
 * than usual. Three rules hold it together:
 *
 *  - **Unknown is not signed out.** The workspace can be opened offline, on a
 *    fresh install, before any session check has ever succeeded. Treating that
 *    as signed out would put a wall in front of someone with no way to clear it
 *    — no network to sign in over, no cached answer to appeal to. So
 *    `isSectionAllowed` fails *open*: only a definite `signed-out` gates
 *    anything. A wall is shown when we know, never when we are merely unsure.
 *  - **The policy is a list, not a condition sprinkled through components.**
 *    Every surface that needs to know — the section router, the nav rail, the
 *    command palette — reads the same two arrays, so a section cannot be gated
 *    in one place and open in another.
 *  - **Read mode is a section here even though it is a setting in the app.**
 *    The start screen renders either the widget board or the published feed
 *    from one route, and only one of those needs an account. Giving the feed
 *    its own name in this table is what lets the board stay free without the
 *    router special-casing a setting.
 *
 * Nothing in this module touches storage or the network: it is a table and the
 * predicates over it, so the whole policy is testable without a browser.
 */

/** No check has succeeded yet — offline, fresh install, or still in flight. */
export const SESSION_UNKNOWN = 'unknown';
/** The website answered, and there is an account behind the cookie. */
export const SESSION_IN = 'signed-in';
/** The website answered, and there is not. The only state that gates. */
export const SESSION_OUT = 'signed-out';

export const SESSION_STATES = [SESSION_UNKNOWN, SESSION_IN, SESSION_OUT];

/**
 * Usable with no account, by product decision.
 *
 * The widget board is the one workspace surface that stays free: it is what the
 * New Tab page is for, and it reads only local data. `settings` is here because
 * export, import, theme and the navigation preferences are how someone gets
 * their data out and their tab usable — gating those would trap data behind a
 * sign-in, which is a different and worse thing than gating a feature. The
 * marketing routes are the website's own pages and were never part of the
 * workspace.
 */
export const OPEN_SECTIONS = [
  'dashboard',
  'settings',
  'home',
  'about',
  'changelog',
  'guide',
];

/**
 * Needs an account.
 *
 * `websites` is here with the Grove rather than on its own: productive time
 * exists to earn XP, and it writes to the same `grove.*` areas, so splitting
 * them would gate the ledger and leave the thing that feeds it open.
 */
export const GATED_SECTIONS = [
  'tasks',
  'calendar',
  'dsa',
  'grove',
  'websites',
  'sounds',
  'reading',
  // Posts live in the website's database, so writing one without an account
  // is not merely gated — there is nowhere to put it.
  'writing',
];

/** The feed's name in this table; a setting in the app, a section here. */
export const READING_SECTION = 'reading';

/**
 * How long a cached answer is trusted before the workspace asks again.
 *
 * Long enough that opening ten New Tabs in a row is one request, short enough
 * that signing out on the website is reflected the same session. A stale cache
 * is still *used* — it only stops suppressing the next check.
 */
export const SESSION_MAX_AGE_MS = 10 * 60 * 1000;

/** Where the workspace asks who it is talking to. Same shape as the feed URL. */
const SESSION_PATH = '/api/session';
const PROFILE_PATH = '/api/profile';
const OWN_POSTS_PATH = '/api/posts/mine';

export function requiresSignIn(section) {
  return GATED_SECTIONS.includes(section);
}

/**
 * The one predicate every surface asks.
 *
 * Note the asymmetry: an unrecognised section is allowed, because a section the
 * table has not heard of is a routing bug and a blank wall is a worse way to
 * find out than the page itself rendering.
 */
export function isSectionAllowed(section, state) {
  if (!requiresSignIn(section)) return true;
  return state !== SESSION_OUT;
}

/**
 * The section actually being rendered, given the start-screen setting.
 *
 * The router asks this rather than deciding for itself, so "Read mode needs an
 * account" lives in this file with the rest of the policy.
 */
export function effectiveSection(section, startMode) {
  if (section === 'dashboard' && startMode === 'read') return READING_SECTION;
  return section;
}

/**
 * `base` is the website origin, passed in for the same reason `postsFeedUrl`
 * takes it: it differs between development and production and is never baked in.
 */
export function sessionUrl(base) {
  return new URL(SESSION_PATH, base).toString();
}

/**
 * Where someone is sent to clear the gate.
 *
 * The parameter is `callbackUrl` because that is what `/signin` already reads
 * and hands to NextAuth — a second name for the same thing would silently do
 * nothing. It is kept relative: an absolute value here would turn the sign-in
 * page into an open redirect.
 */
export function signInUrl(base, callbackUrl = null) {
  const url = new URL('/signin', base);
  if (typeof callbackUrl === 'string' && callbackUrl.startsWith('/')) {
    url.searchParams.set('callbackUrl', callbackUrl);
  }
  return url.toString();
}

export function signUpUrl(base) {
  return new URL('/signup', base).toString();
}

/**
 * Where someone is sent to end their session.
 *
 * It is a real page rather than an endpoint because sign-out is a POST — a URL
 * that ends a session on GET can be triggered by any page that embeds it — so
 * the website shows a one-button form and does the work from there. The
 * extension links here instead of to `/signin`, which never signed anyone out.
 */
export function signOutUrl(base) {
  return new URL('/signout', base).toString();
}

/**
 * The signed-in person's own card, for the extension's profile surfaces.
 *
 * Deliberately parameterless: the subject is whoever the cookie belongs to.
 * See the note on the route itself for why it is separate from the session
 * check rather than folded into it.
 */
export function profileCardUrl(base) {
  return new URL(PROFILE_PATH, base).toString();
}

/** A person's public profile on the website. */
export function profilePageUrl(base, handle) {
  return new URL(`/user/${encodeURIComponent(handle)}`, base).toString();
}

/**
 * The share-your-card page, where the embeddable image lives.
 *
 * Named for what it is — a profile card — rather than for a kind of person:
 * the card carries what someone writes about, what they are interested in and
 * how much they read, none of which is specific to developers.
 */
export function shareCardUrl(base, handle) {
  return new URL(`/user/${encodeURIComponent(handle)}/card`, base).toString();
}

/**
 * The author's own posts — list, create, edit, delete.
 *
 * Cookie'd, like the session and profile endpoints, and for the same reason:
 * it answers for one account and takes no author parameter.
 */
export function ownPostsUrl(base) {
  return new URL(OWN_POSTS_PATH, base).toString();
}

/** Reading history — the extension links out to it rather than hosting one. */
export function historyUrl(base) {
  return new URL('/history', base).toString();
}

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalise a session payload — from the network or from the cache, which are
 * deliberately the same shape so a cached answer needs no second coercion.
 *
 * An unreadable or missing payload becomes `unknown`, never `signed-out`: a
 * corrupt cache must not gate the workspace. Only an explicit
 * `signedIn: false` from the website does that.
 */
export function coerceSession(raw) {
  const empty = (state, checkedAt = null) => ({
    state, handle: '', displayUsername: '', handleChosen: true, checkedAt,
  });

  if (!raw || typeof raw !== 'object') return empty(SESSION_UNKNOWN);

  const checkedAt = str(raw.checkedAt) || null;
  if (raw.signedIn !== true && raw.signedIn !== false) return empty(SESSION_UNKNOWN, checkedAt);
  if (raw.signedIn === false) return empty(SESSION_OUT, checkedAt);

  const handle = str(raw.user?.handle);
  return {
    state: SESSION_IN,
    handle,
    displayUsername: str(raw.user?.displayUsername) || handle,
    // Only false when the website says so: a missing key must not route someone
    // to onboarding they have already done.
    handleChosen: raw.user?.handleChosen !== false,
    checkedAt,
  };
}

/** A session with no answer in it, for first paint and for a cleared cache. */
export function unknownSession() {
  return coerceSession(null);
}

/**
 * Whether the cached answer is old enough to re-ask.
 *
 * `unknown` is always worth asking about, which is what makes a fresh install
 * check once on its first New Tab rather than waiting out the window first.
 */
export function shouldRecheck(session, now = Date.now()) {
  if (!session || session.state === SESSION_UNKNOWN) return true;
  if (!session.checkedAt) return true;
  const then = Date.parse(session.checkedAt);
  if (Number.isNaN(then)) return true;
  return now - then >= SESSION_MAX_AGE_MS;
}

/**
 * What the wall says, per section.
 *
 * The copy is here rather than in the component because it is a product
 * statement about why a feature needs an account, and because a table is easier
 * to keep consistent than seven JSX branches. Each line says what the section
 * does, not merely that it is locked.
 */
const GATE_COPY = {
  tasks: {
    title: 'Tasks need an account',
    reason: 'Your task list syncs across the devices you sign in on.',
  },
  calendar: {
    title: 'The calendar needs an account',
    reason: 'It renders the same tasks, so it follows them to the server.',
  },
  dsa: {
    title: 'DSA practice needs an account',
    reason: 'Solving history and revision schedules are worth keeping beyond one browser.',
  },
  grove: {
    title: 'The Grove needs an account',
    reason: 'XP, seeds and your garden are tied to the account that earned them.',
  },
  websites: {
    title: 'Productive time needs an account',
    reason: 'It feeds Grove XP, and the rules travel with your account.',
  },
  sounds: {
    title: 'Sounds need an account',
    reason: 'Your mixes and presets are saved to your account.',
  },
  writing: {
    title: 'Writing needs an account',
    reason: 'A post is published to the website under your name, so it needs one to be published under.',
  },
  [READING_SECTION]: {
    title: 'Reading needs an account',
    reason: 'Posts are written and read by people with accounts on the website.',
  },
};

const FALLBACK_COPY = {
  title: 'This needs an account',
  reason: 'Sign in on the website to use it.',
};

/**
 * @returns {{ title: string, reason: string }} never null, so a caller cannot
 * render an empty wall by gating a section nobody wrote copy for.
 */
export function describeGate(section) {
  return GATE_COPY[section] ?? FALLBACK_COPY;
}

/**
 * The gated sections, for a nav rail that marks them.
 *
 * Returns an empty list unless we positively know there is no account — same
 * fail-open rule as `isSectionAllowed`, so the rail never sprouts padlocks
 * because someone opened a New Tab on a train.
 */
export function lockedSections(state) {
  return state === SESSION_OUT ? [...GATED_SECTIONS] : [];
}
