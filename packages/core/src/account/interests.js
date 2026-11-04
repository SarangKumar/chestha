/**
 * Interests — the tags a person follows, picked once at onboarding.
 *
 * **Why these are a curated list when post tags are free-form.** A post's tags
 * describe one piece of writing and may be anything its author needs; an
 * interest is a thing the feed has to *match on*, and matching only works if
 * two people who mean the same thing pick the same string. Free-form interests
 * would give "js", "javascript" and "JavaScript" as three separate audiences.
 *
 * **Why not reuse categories.** Categories are the small, stable set a reader
 * filters the feed by, and a post carries at most three. Interests are meant to
 * be numerous and personal — picking eight categories would make the category
 * filter meaningless. Different jobs, different vocabularies; the overlap is
 * deliberate and harmless, because an interest is matched against a post's
 * `tags`, never against its `categories`.
 *
 * The slugs here are in the same shape `normalizePostTags` produces, which is
 * what lets an interest be compared to a post tag at all. `interestsTest` in
 * packages/core/test guards that.
 */

/**
 * The catalogue, grouped only for the picker's benefit — a group is a heading
 * in the UI and is never stored. Order within a group is rough popularity, so
 * the first row of a grid is the common case.
 *
 * This list is a product decision and is expected to grow. Adding one is safe;
 * *renaming* a slug is not, because existing users store the old string and
 * would silently lose that interest. Add a new slug instead and leave the old.
 */
export const INTEREST_GROUPS = [
  {
    id: 'languages',
    label: 'Languages',
    tags: ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c++', 'sql', 'kotlin', 'swift'],
  },
  {
    id: 'frontend',
    label: 'Frontend',
    tags: ['react', 'nextjs', 'vue', 'svelte', 'css', 'tailwind', 'accessibility', 'animation', 'design-systems'],
  },
  {
    id: 'backend',
    label: 'Backend & data',
    tags: ['databases', 'postgres', 'mongodb', 'redis', 'apis', 'graphql', 'caching', 'distributed-systems', 'data-engineering'],
  },
  {
    id: 'platform',
    label: 'Platform',
    tags: ['devops', 'docker', 'kubernetes', 'aws', 'serverless', 'ci-cd', 'observability', 'security', 'linux'],
  },
  {
    id: 'craft',
    label: 'Craft',
    tags: ['testing', 'refactoring', 'architecture', 'code-review', 'performance', 'debugging', 'open-source', 'git'],
  },
  {
    id: 'practice',
    label: 'Practice & interviews',
    tags: ['dsa', 'algorithms', 'system-design', 'interviews', 'leetcode', 'competitive-programming'],
  },
  {
    id: 'ai',
    label: 'AI',
    tags: ['ai', 'llms', 'machine-learning', 'prompting', 'ai-tooling'],
  },
  {
    id: 'working',
    label: 'Working well',
    tags: ['productivity', 'focus', 'habits', 'note-taking', 'learning', 'career', 'remote-work', 'burnout', 'writing'],
  },
];

/** Every interest slug, flat. The order is the groups', then within a group. */
export const INTEREST_TAGS = INTEREST_GROUPS.flatMap((group) => group.tags);

const INTEREST_SET = new Set(INTEREST_TAGS);

/**
 * How many to ask for before letting someone through.
 *
 * Three, not one: a feed built from a single interest is a filter, not a feed,
 * and someone who picks one tends to see nothing and conclude the product is
 * empty. It is still a floor on the *suggestion*, not a wall — the onboarding
 * step can be skipped outright, and `normalizeInterests` accepts any count.
 */
export const SUGGESTED_INTERESTS = 3;

/**
 * The ceiling. Generous, because interests cost nothing to carry and a wide
 * reader is the normal case — but not unbounded, since the whole catalogue
 * selected is the same as no filter at all, expressed expensively.
 */
export const MAX_INTERESTS = 24;

/**
 * Clean a submitted set: known slugs only, de-duplicated, catalogue order,
 * capped.
 *
 * Catalogue order rather than click order is deliberate. It makes the stored
 * array a function of *what* was picked and not of how, so two people with the
 * same interests store byte-identical arrays — which keeps a query planner
 * honest and makes the value comparable in a test.
 *
 * Unknown slugs are dropped rather than rejected. A form posting a tag that
 * has since left the catalogue is a stale page, not an attack, and failing the
 * whole submission over one would lose the other nine.
 */
export function normalizeInterests(raw) {
  const seen = new Set();
  for (const item of Array.isArray(raw) ? raw : []) {
    const tag = String(item ?? '').trim().toLowerCase().replace(/^#+/, '');
    if (INTEREST_SET.has(tag)) seen.add(tag);
  }
  return INTEREST_TAGS.filter((tag) => seen.has(tag)).slice(0, MAX_INTERESTS);
}

/** Whether a slug is in the catalogue — for rendering an unknown tag plainly. */
export function isInterestTag(tag) {
  return INTEREST_SET.has(String(tag ?? '').trim().toLowerCase().replace(/^#+/, ''));
}

/**
 * The display form. Tags are stored as slugs and shown with a hash, the way
 * people write them — `nextjs` reads as `#nextjs`, `ci-cd` as `#ci-cd`.
 */
export function interestLabel(tag) {
  return `#${String(tag ?? '').replace(/^#+/, '')}`;
}
