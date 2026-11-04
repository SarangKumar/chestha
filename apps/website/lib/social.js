import { HISTORY_PAGE_SIZE, normalizeInterests } from '@chestha/core';
import { prisma } from '@chestha/db';

/**
 * Follows, reading history and interests — the three things that turn a list
 * of posts into somebody's feed.
 *
 * Same split as `posts.js`: every rule lives in `packages/core` and is applied
 * here, and this module only reads and writes. Two invariants it owns:
 *
 *  - **A viewer id always comes from the session, never from a request.** Each
 *    function takes the id as an argument and the callers pass `currentUserId()`;
 *    nothing here accepts a user id from a form, so no request can act as
 *    somebody else.
 *  - **Every write is idempotent.** Following twice, reading twice and
 *    unfollowing nothing are all normal things for a browser to do — a double
 *    submit, a back button, a retried request — and none of them should be an
 *    error the user has to see.
 */

/** Fields a feed row or a history row needs. Body is included for the excerpt. */
const FEED_POST = {
  id: true, slug: true, title: true, body: true, excerpt: true, coverUrl: true,
  categories: true, tags: true, status: true, publishedAt: true,
  author: { select: { handle: true, displayUsername: true, name: true, image: true } },
};

// ─── Interests ───────────────────────────────────────────────────────────────

/**
 * Store a person's interests. Returns the normalised list that was saved, so
 * the caller renders what is in the database rather than what was submitted.
 */
export async function saveInterests(userId, raw) {
  const interests = normalizeInterests(raw);
  await prisma.user.update({ where: { id: userId }, data: { interests } });
  return interests;
}

export async function getInterests(userId) {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { interests: true },
  });
  return normalizeInterests(row?.interests);
}

// ─── Follows ─────────────────────────────────────────────────────────────────

/**
 * Follow someone, by handle.
 *
 * Self-follow is refused here rather than hidden in the UI: a profile page can
 * be reached with a crafted form post, and a row where follower and following
 * are the same person would inflate both counts and put you in your own feed.
 */
export async function followUser(followerId, handle) {
  const target = await prisma.user.findUnique({
    where: { handle: String(handle ?? '').toLowerCase() },
    select: { id: true },
  });
  if (!target || target.id === followerId) return false;

  // The unique index is the real guard; `upsert` makes a repeat submit a no-op
  // instead of a crash.
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId, followingId: target.id } },
    create: { followerId, followingId: target.id },
    update: {},
  });
  return true;
}

export async function unfollowUser(followerId, handle) {
  const target = await prisma.user.findUnique({
    where: { handle: String(handle ?? '').toLowerCase() },
    select: { id: true },
  });
  if (!target) return false;

  // deleteMany, not delete: deleting a row that is not there is the expected
  // outcome of a double submit, not an exception.
  await prisma.follow.deleteMany({
    where: { followerId, followingId: target.id },
  });
  return true;
}

/** Whether `viewerId` follows the user with this id. Null viewer: false. */
export async function isFollowing(viewerId, targetId) {
  if (!viewerId || !targetId || viewerId === targetId) return false;
  const row = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: targetId } },
    select: { id: true },
  });
  return Boolean(row);
}

export async function followCounts(userId) {
  const [followers, following] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);
  return { followers, following };
}

/** Ids this person follows — the input to their following feed. */
export async function followingIds(userId) {
  const rows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  return rows.map((row) => row.followingId);
}

/**
 * Published posts by the people someone follows.
 *
 * Returns an empty array for someone who follows nobody rather than falling
 * back to the public feed — "your following feed is empty" is information, and
 * silently showing everything hides the fact that nothing is followed yet.
 */
export async function listFollowingPosts(userId, { take = 20 } = {}) {
  const ids = await followingIds(userId);
  if (ids.length === 0) return [];
  return prisma.post.findMany({
    where: { status: 'published', authorId: { in: ids } },
    orderBy: { publishedAt: 'desc' },
    select: FEED_POST,
    take,
  });
}

// ─── Reading history ─────────────────────────────────────────────────────────

/**
 * Record that someone opened a post.
 *
 * One row per person per post, rewritten on a re-read — so the history page
 * shows each post once, at the last time it was opened. Writing a row per
 * visit would bury a post under its own refreshes.
 *
 * Failures are swallowed on purpose. This is called while rendering a post,
 * and a history write that cannot complete must not take down the page someone
 * came to read; losing one row is a smaller harm than a 500.
 */
export async function recordRead(userId, postId) {
  if (!userId || !postId) return;
  try {
    await prisma.postRead.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: { readAt: new Date() },
    });
  } catch (error) {
    console.error('[history] could not record a read', error);
  }
}

/**
 * The history page: posts this person has read, most recent first.
 *
 * A post deleted since it was read leaves a row whose `post` is null; those
 * are dropped here rather than rendered as a gap.
 */
export async function listHistory(userId, { take = HISTORY_PAGE_SIZE, skip = 0 } = {}) {
  const rows = await prisma.postRead.findMany({
    where: { userId },
    orderBy: { readAt: 'desc' },
    take,
    skip,
    select: { id: true, readAt: true, post: { select: FEED_POST } },
  });
  return rows
    .filter((row) => row.post)
    .map((row) => ({ id: row.id, readAt: row.readAt, post: row.post }));
}

export async function historyCount(userId) {
  return prisma.postRead.count({ where: { userId } });
}

/**
 * Every read instant for a person, for the streak.
 *
 * Only the timestamps, because that is all `readStreak` needs — and a streak
 * query that pulled whole posts would be the most expensive thing on the card.
 */
export async function readInstants(userId) {
  const rows = await prisma.postRead.findMany({
    where: { userId },
    orderBy: { readAt: 'desc' },
    select: { readAt: true },
    // A streak cannot be longer than the number of days it covers; a year of
    // daily reading is well inside this, and it bounds the query.
    take: 500,
  });
  return rows.map((row) => row.readAt);
}

/**
 * Remove one entry. Scoped to the owner in the `where`, so a guessed id
 * belonging to someone else matches nothing instead of deleting their row.
 */
export async function forgetRead(userId, readId) {
  await prisma.postRead.deleteMany({ where: { id: String(readId ?? ''), userId } });
}

export async function clearHistory(userId) {
  await prisma.postRead.deleteMany({ where: { userId } });
}
