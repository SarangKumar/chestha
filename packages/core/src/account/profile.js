import { readingMinutes } from '../posts/schema.js';
import { isPubliclyVisible } from '../posts/status.js';
import { normalizeInterests } from './interests.js';

/**
 * The profile card is a public, shareable artefact at `/user/<handle>`, which
 * makes it the one place where getting visibility wrong leaks a draft. So the
 * card is built by a single function that filters to published posts itself,
 * rather than trusting each caller to pass a pre-filtered list.
 */

export const BIO_MAX = 200;
export const DISPLAY_NAME_MAX = 60;

/** Link labels we render an icon for; anything else shows as a plain link. */
export const KNOWN_LINK_HOSTS = {
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'x.com': 'X',
  'twitter.com': 'X',
  'linkedin.com': 'LinkedIn',
  'leetcode.com': 'LeetCode',
  'dev.to': 'DEV',
  'medium.com': 'Medium',
  'news.ycombinator.com': 'Hacker News',
};

/**
 * A profile link is user-supplied and rendered as an anchor, so the scheme is
 * allow-listed here. `javascript:` and `data:` in an href are a scripting hole,
 * and a scheme-less string like `evil.com` would resolve as a relative path on
 * our own origin.
 */
export function normalizeProfileLink(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname.includes('.')) return null;
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  return { href: url.toString(), host, label: KNOWN_LINK_HOSTS[host] ?? host };
}

export function normalizeBio(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, BIO_MAX);
}

export function normalizeDisplayName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX);
}

/**
 * What a visitor sees on `/user/<handle>`. Email is deliberately absent: it is
 * the login identifier and never belongs in a public payload, even though the
 * user record it is built from carries one.
 *
 * @param {object} user
 * @param {object[]} posts Any posts by this author; drafts are filtered out here.
 * @param {object} [counts] Server-counted extras: followers, following,
 *   postsRead, readStreak. Omitted keys are omitted from `stats`.
 * @returns {object} A payload safe to serialise to the client.
 */
export function buildProfileCard(user, posts = [], counts = null) {
  const published = (Array.isArray(posts) ? posts : [])
    .filter(isPubliclyVisible)
    .sort((a, b) => Date.parse(b.publishedAt ?? 0) - Date.parse(a.publishedAt ?? 0));

  const links = (Array.isArray(user?.links) ? user.links : [])
    .map(normalizeProfileLink)
    .filter(Boolean);

  // Breadth of topics is a more honest signal on a card than a post count of 2.
  const categories = new Set();
  for (const post of published) for (const slug of post.categories ?? []) categories.add(slug);

  return {
    handle: user?.handle ?? '',
    displayUsername: user?.displayUsername || user?.handle || '',
    name: normalizeDisplayName(user?.name),
    bio: normalizeBio(user?.bio),
    image: user?.image ?? null,
    joinedAt: user?.createdAt ?? null,
    links,
    // Chosen, not inferred — what this person says they are interested in.
    interests: normalizeInterests(user?.interests),
    // Earned, not chosen — what they have actually written about. The two are
    // shown separately on the card because they mean different things, and a
    // card that silently merged them would let anyone claim expertise by
    // ticking a box.
    topTags: topTagsOf(published),
    stats: {
      posts: published.length,
      categories: categories.size,
      // Total minutes of reading published — the "written" counterpart to a
      // read streak, and cheap to compute from what we already have.
      readingMinutes: published.reduce((sum, post) => sum + readingMinutes(post.body), 0),
      // Counted by the caller, which is the only place that can see the
      // follow and read tables. Absent means "not counted", which renders as
      // a dash rather than as a confident zero.
      ...countsFrom(counts),
    },
    posts: published,
  };
}

/** How many tags a card shows before it stops being a card. */
export const TOP_TAGS_SHOWN = 6;

/**
 * The tags this author actually writes about, most used first.
 *
 * Ties break alphabetically rather than by encounter order, so the card is the
 * same on every render — a card whose tag order drifts between the page and
 * its shared image looks like two different people.
 */
export function topTagsOf(posts = []) {
  const counts = new Map();
  for (const post of Array.isArray(posts) ? posts : []) {
    for (const tag of post?.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_TAGS_SHOWN)
    .map(([tag]) => tag);
}

/**
 * Social and reading counts, which only the server can supply.
 *
 * A missing count stays missing. The alternative — defaulting to zero — states
 * something untrue when a query was simply not run, and "0 followers" on a
 * profile that has thousands is worse than no number at all.
 */
function countsFrom(counts) {
  const out = {};
  for (const key of ['followers', 'following', 'postsRead', 'readStreak']) {
    const value = Number(counts?.[key]);
    if (Number.isFinite(value) && value >= 0) out[key] = Math.floor(value);
  }
  return out;
}

/** Absolute URL of a profile, for share buttons and OG tags. */
export function profileUrl(handle, origin) {
  return `${String(origin ?? '').replace(/\/+$/, '')}/user/${encodeURIComponent(handle)}`;
}
