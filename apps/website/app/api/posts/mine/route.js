import { POST_STATUSES, publishBlocker } from '@chestha/core';
import {
  changePostStatus, createDraft, deletePost, editPost, listCategories, listOwnPosts,
  statsForPosts,
} from '@/lib/posts';
import { currentUserId } from '@/lib/session';
import { extensionHeaders, extensionPreflight } from '@/lib/extensionCors';

/**
 * Authoring, for the extension.
 *
 * The website has no editor either — this is the first surface that can write
 * a post at all. Everything it does is already implemented in `lib/posts.js`
 * and `packages/core/src/posts/`; this route is the HTTP shape, and it
 * deliberately adds no rules. In particular it does **not** decide who owns a
 * post: `editPost`, `changePostStatus` and `deletePost` each re-check
 * ownership against the session id, because a post id in a request body is
 * attacker-controlled.
 *
 * Unlike `/api/posts`, which is public and uncredentialed, every method here
 * is answered for one account and carries no cache.
 */

const MAX_BODY_BYTES = 200_000;

function fail(request, status, message) {
  return Response.json({ error: message }, { status, headers: extensionHeaders(request, { methods: 'GET, POST, PATCH, DELETE, OPTIONS' }) });
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return { ok: false, reason: 'That post is too large.' };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: 'That request body is not valid JSON.' };
  }
}

/**
 * The author's own posts, drafts included, each with its numbers.
 *
 * `publishBlocker` is computed here rather than in the client so the editor
 * shows the same reason the server would give — the two cannot drift into
 * disagreeing about why a post will not publish.
 *
 * The category list rides along in the same response. It is read from the
 * database rather than from core's `SEED_CATEGORIES`, because `editPost`
 * validates against the database: a picker built from the seed list would
 * happily offer a category this deployment has never seeded, and the save
 * would then be rejected for a reason the author could do nothing about. An
 * empty list here is the truth — it means nobody has run `npm run db:seed` —
 * and the editor says so rather than offering choices that cannot be saved.
 */
export async function GET(request) {
  const userId = await currentUserId();
  if (!userId) return fail(request, 401, 'Sign in to see your posts.');

  try {
    const posts = await listOwnPosts(userId);
    const stats = await statsForPosts(posts.map((post) => post.id));
    const categories = await listCategories();

    return Response.json(
      {
        posts: posts.map((post) => ({
          ...post,
          stats: { views: post.views ?? 0, ...(stats[post.id] ?? {}) },
          blocker: publishBlocker(post),
        })),
        // Slug and name only: the blurb is editorial copy for the website's
        // own category pages and would just be unread bytes on every load.
        categories: categories.map((row) => ({ slug: row.slug, name: row.name })),
      },
      { headers: extensionHeaders(request, { methods: 'GET, POST, PATCH, DELETE, OPTIONS' }) },
    );
  } catch (error) {
    // Never the database's own words: a Prisma message can name hosts and
    // collections.
    console.error('[api/posts/mine] list failed', error);
    return fail(request, 503, 'Could not read your posts.');
  }
}

/** Create a draft. Always a draft — publishing is a separate, explicit move. */
export async function POST(request) {
  const userId = await currentUserId();
  if (!userId) return fail(request, 401, 'Sign in to write a post.');

  const parsed = await readBody(request);
  if (!parsed.ok) return fail(request, 400, parsed.reason);

  try {
    const post = await createDraft(userId, parsed.body ?? {});
    return Response.json({ post }, { status: 201, headers: extensionHeaders(request, { methods: 'GET, POST, PATCH, DELETE, OPTIONS' }) });
  } catch (error) {
    console.error('[api/posts/mine] create failed', error);
    return fail(request, 503, 'Could not create that draft.');
  }
}

/**
 * Edit a post, change its status, or both.
 *
 * Content first, then status: publishing requires a title and a body, so an
 * editor that writes both in one request must have the new text stored before
 * the transition is judged — otherwise "save and publish" fails against the
 * old, empty version.
 */
export async function PATCH(request) {
  const userId = await currentUserId();
  if (!userId) return fail(request, 401, 'Sign in to edit a post.');

  const parsed = await readBody(request);
  if (!parsed.ok) return fail(request, 400, parsed.reason);

  const { id, status, ...patch } = parsed.body ?? {};
  if (typeof id !== 'string' || !id) return fail(request, 400, 'That request names no post.');

  try {
    let result = { ok: true, post: null };

    if (Object.keys(patch).length > 0) {
      result = await editPost(userId, id, patch);
      if (!result.ok) return fail(request, 400, result.reason);
    }

    if (status !== undefined) {
      if (!POST_STATUSES.includes(status)) return fail(request, 400, 'That is not a post status.');
      result = await changePostStatus(userId, id, status);
      if (!result.ok) return fail(request, 400, result.reason);
    }

    if (!result.post) return fail(request, 400, 'That request changed nothing.');
    return Response.json(
      { post: { ...result.post, blocker: publishBlocker(result.post) } },
      { headers: extensionHeaders(request, { methods: 'GET, POST, PATCH, DELETE, OPTIONS' }) },
    );
  } catch (error) {
    console.error('[api/posts/mine] edit failed', error);
    return fail(request, 503, 'Could not save that post.');
  }
}

export async function DELETE(request) {
  const userId = await currentUserId();
  if (!userId) return fail(request, 401, 'Sign in to delete a post.');

  const parsed = await readBody(request);
  if (!parsed.ok) return fail(request, 400, parsed.reason);

  const id = parsed.body?.id;
  if (typeof id !== 'string' || !id) return fail(request, 400, 'That request names no post.');

  try {
    const result = await deletePost(userId, id);
    if (!result.ok) return fail(request, 400, result.reason);
    return Response.json({ ok: true }, { headers: extensionHeaders(request, { methods: 'GET, POST, PATCH, DELETE, OPTIONS' }) });
  } catch (error) {
    console.error('[api/posts/mine] delete failed', error);
    return fail(request, 503, 'Could not delete that post.');
  }
}

export function OPTIONS(request) {
  return extensionPreflight(request, { methods: 'GET, POST, PATCH, DELETE, OPTIONS' });
}
