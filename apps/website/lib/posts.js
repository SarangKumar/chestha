import {
  applyPostEdit, applyTransition, canChangeSlug, coercePost, createPost, slugFor,
} from '@chestha/core';
import { prisma } from '@chestha/db';

/**
 * Post data access.
 *
 * Every rule lives in `packages/core` and is applied here; this module only
 * reads and writes. Two invariants it is responsible for:
 *
 *  - **Only published posts leave the server for a public page.** The status
 *    filter is in the query, not in the caller, so a new page cannot forget it.
 *  - **Authorship is checked before every write.** A post id in a request body
 *    is attacker-controlled; the owner check is what makes it safe.
 */

/** Fields a public page needs. Body is included — a post page renders it. */
const PUBLIC_POST = {
  id: true, slug: true, title: true, body: true, excerpt: true, coverUrl: true,
  categories: true, tags: true, status: true, publishedAt: true,
  firstPublishedAt: true, createdAt: true, updatedAt: true,
  author: { select: { handle: true, displayUsername: true, name: true, image: true } },
};

export async function knownCategorySlugs() {
  const rows = await prisma.category.findMany({ select: { slug: true }, orderBy: { order: 'asc' } });
  return rows.map((row) => row.slug);
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { order: 'asc' } });
}

/** The public feed: published posts, newest first. */
export async function listPublishedPosts({ category, tag, take = 20, cursor } = {}) {
  return prisma.post.findMany({
    where: {
      status: 'published',
      ...(category ? { categories: { has: category } } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    select: PUBLIC_POST,
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

/**
 * A single post by slug. `viewerId` is what lets an author preview their own
 * draft: without a match, an unpublished post is indistinguishable from one
 * that does not exist.
 */
export async function getPostBySlug(slug, { viewerId = null } = {}) {
  const post = await prisma.post.findUnique({
    where: { slug: String(slug ?? '') },
    select: { ...PUBLIC_POST, authorId: true },
  });
  if (!post) return null;
  if (post.status !== 'published' && post.authorId !== viewerId) return null;
  return post;
}

/** Published posts by one author, for their profile card. */
export async function listPublishedPostsByHandle(handle) {
  return prisma.post.findMany({
    where: { status: 'published', author: { handle: String(handle ?? '').toLowerCase() } },
    orderBy: { publishedAt: 'desc' },
    select: PUBLIC_POST,
  });
}

/** Everything an author wrote, drafts included. Never used by a public page. */
export async function listOwnPosts(authorId) {
  return prisma.post.findMany({
    where: { authorId },
    orderBy: { updatedAt: 'desc' },
    select: { ...PUBLIC_POST, authorId: true, unpublishedAt: true },
  });
}

export async function createDraft(authorId, input = {}) {
  const known = await knownCategorySlugs();
  const draft = createPost({ ...input, authorId, knownCategories: known });

  // `slugFor` needs to know which candidates are already used, which only the
  // database knows. One query fetches every slug sharing this stem, so the
  // counter can skip them all at once instead of probing one at a time.
  const stem = draft.slug;
  const siblings = await prisma.post.findMany({
    where: { slug: { startsWith: stem } },
    select: { slug: true },
  });
  const taken = new Set(siblings.map((row) => row.slug));
  const slug = slugFor(draft.title || 'untitled', (candidate) => taken.has(candidate));

  // The unique index on `slug` remains the real guard: two requests can read
  // the same sibling set before either writes. P2002 is the signal for that.
  return prisma.post.create({
    data: {
      authorId,
      slug,
      title: draft.title,
      body: draft.body,
      excerpt: draft.excerpt,
      coverUrl: draft.coverUrl,
      categories: draft.categories,
      tags: draft.tags,
      status: 'draft',
    },
    select: PUBLIC_POST,
  });
}

/**
 * @returns {Promise<{ ok: true, post: object } | { ok: false, reason: string }>}
 */
export async function editPost(authorId, postId, patch = {}) {
  const owned = await requireOwnPost(authorId, postId);
  if (!owned.ok) return owned;

  const known = await knownCategorySlugs();
  const next = applyPostEdit(owned.post, patch, { knownCategories: known });

  const data = {
    title: next.title,
    body: next.body,
    excerpt: next.excerpt,
    coverUrl: next.coverUrl,
    categories: next.categories,
    tags: next.tags,
  };

  // A slug may only change while the post has never been public, because the
  // old slug is already in other people's hands.
  if (patch.slug !== undefined && canChangeSlug(owned.post)) {
    const candidate = slugFor(String(patch.slug));
    const clash = await prisma.post.findFirst({
      where: { slug: candidate, NOT: { id: postId } },
      select: { id: true },
    });
    if (clash) return { ok: false, reason: 'Another post already uses that address.' };
    data.slug = candidate;
  }

  const post = await prisma.post.update({ where: { id: postId }, data, select: PUBLIC_POST });
  return { ok: true, post };
}

/**
 * Publish, unpublish or re-publish. The legal moves and the publish
 * requirements both come from `applyTransition`, so this cannot drift from
 * what the editor UI shows as available.
 */
export async function changePostStatus(authorId, postId, to) {
  const owned = await requireOwnPost(authorId, postId);
  if (!owned.ok) return owned;

  const result = applyTransition(owned.post, to);
  if (!result.ok) return result;

  const post = await prisma.post.update({
    where: { id: postId },
    data: result.patch,
    select: PUBLIC_POST,
  });
  return { ok: true, post };
}

export async function deletePost(authorId, postId) {
  const owned = await requireOwnPost(authorId, postId);
  if (!owned.ok) return owned;
  await prisma.post.delete({ where: { id: postId } });
  return { ok: true };
}

/**
 * Loads a post and confirms the caller owns it.
 *
 * A missing post and someone else's post give the same answer on purpose: the
 * difference would let anyone enumerate which post ids exist.
 */
async function requireOwnPost(authorId, postId) {
  if (!authorId) return { ok: false, reason: 'Sign in to edit a post.' };
  const row = await prisma.post.findUnique({
    where: { id: String(postId ?? '') },
    select: { ...PUBLIC_POST, authorId: true, unpublishedAt: true },
  });
  if (!row || row.authorId !== authorId) {
    return { ok: false, reason: 'That post could not be found.' };
  }
  // Validated on read, in the same spirit as `coerceArea`: a record repaired
  // here cannot carry a bad status into a transition check.
  const { value } = coercePost(row, { knownCategories: row.categories });
  return { ok: true, post: { ...row, ...(value ?? {}) } };
}
