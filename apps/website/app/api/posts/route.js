import { FEED_PAGE_SIZE, derivedExcerpt, readingMinutes } from '@chestha/core';
import { listPublishedPosts } from '@/lib/posts';

/**
 * The public reading feed as JSON, for the extension's Read mode.
 *
 * Why this exists at all: the extension New Tab is a static client bundle on its
 * own origin (MV3 cannot run a server), so it cannot call a server component.
 * It needs a plain endpoint.
 *
 * Three things this route is responsible for:
 *
 *  - **Published only.** The filter lives inside `listPublishedPosts`, so this
 *    route inherits it rather than restating it and getting it wrong.
 *  - **No bodies.** `PUBLIC_POST` selects `body` because a post page renders it;
 *    a feed does not. The excerpt and the reading time are computed here and the
 *    body is dropped, which keeps the payload small and — more importantly —
 *    avoids handing unsanitised Markdown to a second renderer that has no
 *    sanitiser. Read mode links out to the website to read a post.
 *  - **Readable cross-origin, without credentials.** Everything here is already
 *    public, so `*` is honest. No cookie is read and none is accepted, so a
 *    signed-in reader is indistinguishable from an anonymous one and this route
 *    cannot leak anything personal.
 */

// Public data with no per-viewer variation, so it caches at the edge. Repeated
// New Tab opens are the expected traffic shape; without this they would each
// reach Mongo.
const CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // No `Allow-Credentials`: see above. Adding it would make `*` invalid anyway.
};

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return FEED_PAGE_SIZE;
  return Math.min(FEED_PAGE_SIZE, Math.max(1, Math.round(n)));
}

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const category = params.get('category')?.trim() || undefined;
  const take = clampLimit(params.get('limit'));

  try {
    const posts = await listPublishedPosts({ category, take });

    return Response.json(
      {
        posts: posts.map((post) => ({
          slug: post.slug,
          title: post.title,
          excerpt: derivedExcerpt(post, 200),
          readingMinutes: readingMinutes(post.body),
          categories: post.categories,
          publishedAt: post.publishedAt,
          author: {
            handle: post.author.handle,
            displayUsername: post.author.displayUsername || post.author.handle,
          },
        })),
      },
      { headers: { ...CORS, 'Cache-Control': CACHE_CONTROL } },
    );
  } catch (error) {
    // The reader gets a reason, never the database's own words — a Prisma error
    // string can name hosts and collections.
    console.error('[api/posts] feed read failed', error);
    return Response.json(
      { error: 'Could not read the feed.' },
      { status: 503, headers: { ...CORS, 'Cache-Control': 'no-store' } },
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
