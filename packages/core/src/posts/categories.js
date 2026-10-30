/**
 * Categories are a curated taxonomy, tags are free-form. The split matters:
 * a category is how a reader filters the feed and must stay a small stable set,
 * while tags are how an author describes one post and may be anything.
 *
 * The seed list below only bootstraps an empty database — categories are rows
 * in Mongo, so the set is editable without a deploy. Membership of the seed
 * list is a product decision the owner should review; see AGENTS.md.
 */
export const SEED_CATEGORIES = [
  { slug: 'productivity', name: 'Productivity', blurb: 'Systems, habits and getting things done.' },
  { slug: 'dsa', name: 'DSA & interviews', blurb: 'Algorithms, data structures and interview prep.' },
  { slug: 'engineering', name: 'Engineering', blurb: 'Building software, architecture and tooling.' },
  { slug: 'career', name: 'Career', blurb: 'Growth, hiring, and working with people.' },
  { slug: 'learning', name: 'Learning', blurb: 'How to study, read and remember.' },
  { slug: 'focus', name: 'Focus & wellbeing', blurb: 'Attention, rest and sustainable work.' },
  { slug: 'tools', name: 'Tools', blurb: 'Apps, setups and workflows.' },
  { slug: 'meta', name: 'Chestha', blurb: 'Notes on the product itself.' },
];

/** The most categories one post may carry, so a post cannot be in everything. */
export const MAX_CATEGORIES = 3;
/** Tags are cheap but not free; an unbounded list becomes keyword spam. */
export const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 24;

export function normalizeCategorySlug(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Keeps order, drops blanks and duplicates, and refuses anything not in
 * `known`. An unknown category is dropped rather than created implicitly:
 * silent creation is how a curated taxonomy turns into a tag list.
 *
 * @param {unknown} raw
 * @param {Iterable<string>} known Category slugs that exist.
 */
export function normalizeCategories(raw, known = SEED_CATEGORIES.map((c) => c.slug)) {
  const allowed = new Set([...known].map(normalizeCategorySlug));
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const slug = normalizeCategorySlug(item);
    if (!slug || seen.has(slug) || !allowed.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length === MAX_CATEGORIES) break;
  }
  return out;
}

/** Tags normalise like categories but are not checked against a known set. */
export function normalizePostTags(raw) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const tag = String(item ?? '').trim().toLowerCase()
      .replace(/^#+/, '')
      .replace(/[^a-z0-9+#.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}
