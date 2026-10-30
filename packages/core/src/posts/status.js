/**
 * A post's status is authorial intent, so unlike the DSA statuses it is stored
 * rather than derived — nothing in the record implies whether an author *wants*
 * a post public. What *is* derived is visibility and the set of legal next
 * moves, so no caller has to re-implement "can this be unpublished".
 *
 * `unpublished` is kept distinct from `draft` on purpose. Both are invisible,
 * but an unpublished post has been public before: its slug is already in the
 * wild and must stay frozen, and `firstPublishedAt` must survive so
 * re-publishing does not reset its original date.
 */
export const POST_STATUSES = ['draft', 'published', 'unpublished'];

export const POST_STATUS_LABELS = {
  draft: 'Draft',
  published: 'Published',
  unpublished: 'Unpublished',
};

/** The same statuses as they read inside a sentence, article included. */
const STATUS_PHRASE = {
  draft: 'a draft',
  published: 'published',
  unpublished: 'unpublished',
};

/** Only published posts appear in feeds, profiles and search. */
export function isPubliclyVisible(post) {
  return post?.status === 'published';
}

/** A slug may only change while it has never been public. */
export function canChangeSlug(post) {
  return post?.status === 'draft' && !post?.firstPublishedAt;
}

const TRANSITIONS = {
  draft: ['published'],
  published: ['unpublished'],
  unpublished: ['published'],
};

export function nextStatuses(post) {
  return TRANSITIONS[post?.status] ?? [];
}

export function canTransition(post, to) {
  return nextStatuses(post).includes(to);
}

/**
 * Applies a status change, returning the fields to persist. Pure: the caller
 * writes them. Refusals carry user-facing copy for the same reason the
 * credential rules do.
 *
 * @returns {{ ok: true, patch: object } | { ok: false, reason: string }}
 */
export function applyTransition(post, to, now = new Date().toISOString()) {
  if (!POST_STATUSES.includes(to)) {
    return { ok: false, reason: `Unknown status "${to}".` };
  }
  if (post?.status === to) {
    return { ok: false, reason: `This post is already ${STATUS_PHRASE[to]}.` };
  }
  if (!canTransition(post, to)) {
    const from = STATUS_PHRASE[post?.status] ?? 'a post';
    return { ok: false, reason: `Something ${from} cannot become ${STATUS_PHRASE[to]}.` };
  }
  if (to === 'published') {
    const problem = publishBlocker(post);
    if (problem) return { ok: false, reason: problem };
    return {
      ok: true,
      patch: {
        status: 'published',
        publishedAt: now,
        // Set once, ever: the canonical date the post entered the world.
        firstPublishedAt: post.firstPublishedAt ?? now,
        unpublishedAt: null,
      },
    };
  }
  return { ok: true, patch: { status: 'unpublished', unpublishedAt: now } };
}

/**
 * Why a post cannot go public yet, or null. Separate from `coercePost` because
 * a draft is allowed to be incomplete — these are publish-time requirements.
 */
export function publishBlocker(post) {
  if (!String(post?.title ?? '').trim()) return 'Give the post a title before publishing.';
  if (!String(post?.body ?? '').trim()) return 'Write something before publishing.';
  if (!Array.isArray(post?.categories) || post.categories.length === 0) {
    return 'Pick at least one category before publishing.';
  }
  return null;
}
