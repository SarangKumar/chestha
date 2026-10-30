/**
 * Post slugs are public URLs (`/post/why-date-only-dates`), so a slug must
 * survive editing: once a post has been published its slug is frozen, because
 * changing it breaks every link already shared. `slugFor` is therefore only
 * called when creating a post or while it is still a draft.
 */

const MAX_SLUG = 80;

/**
 * Deliberately ASCII-only. Percent-encoded non-Latin slugs are unreadable
 * once pasted, so a title with no transliterable characters falls back to a
 * short random suffix instead of producing an unreadable URL.
 */
export function slugify(input) {
  return String(input ?? '')
    .normalize('NFKD')
    // Strip combining marks so "déjà" becomes "deja" rather than "dj".
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '');
}

/**
 * Slugs that would collide with the site's own post-area routes.
 * `/user/*` handles are a separate namespace and are reserved elsewhere.
 */
export const RESERVED_SLUGS = new Set(['new', 'edit', 'draft', 'drafts', 'preview', 'feed', 'rss']);

/**
 * @param {string} title
 * @param {(slug: string) => boolean} [isTaken] Called with each candidate.
 * @returns {string} A slug that `isTaken` rejected nothing about.
 */
export function slugFor(title, isTaken = () => false) {
  const base = slugify(title);
  // An empty base means the title had no ASCII-representable characters.
  const root = base || 'post';
  let candidate = RESERVED_SLUGS.has(root) ? `${root}-post` : root;
  if (!isTaken(candidate)) return candidate;

  // `-2`, `-3`, … reads better than a hash for the common "same title twice"
  // case. The cap stops an unbounded loop if `isTaken` always returns true.
  for (let n = 2; n <= 50; n += 1) {
    candidate = `${root.slice(0, MAX_SLUG - 4)}-${n}`;
    if (!isTaken(candidate)) return candidate;
  }
  // Give up on readability rather than on correctness.
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${root.slice(0, MAX_SLUG - 7)}-${suffix}`;
}
