import { ImageResponse } from 'next/og';
import { interestLabel } from '@chestha/core';
import { getProfileCard } from '@/lib/profile';

/**
 * The shareable card, as a PNG — the thing you paste into a GitHub README.
 *
 * A route rather than a page, in a segment literally named `devcard.png`, so
 * the URL ends in an extension that a Markdown image tag will accept and a
 * crawler will treat as an image. No rewrite is involved — the folder name is
 * the path. The page that shows it with a copyable embed snippet lives one
 * segment over at `/devcard`.
 *
 * **Drawn with plain flexbox.** Satori, which renders this, supports only a
 * subset of CSS: no grid, no `gap` on every axis, no external stylesheet. The
 * design tokens are therefore inlined as literals, which makes this and
 * `opengraph-image.jsx` the only hard-coded colours in the app — they have to
 * be updated by hand if the palette changes.
 *
 * **Cached for an hour at the edge.** A README image is requested by every
 * visitor to that README and by GitHub's own proxy, so this is the one profile
 * surface where a stale number is much cheaper than a database round trip. The
 * profile page itself is live; this is the souvenir.
 */
export const runtime = 'nodejs';

const WIDTH = 500;
const HEIGHT = 280;

const INK = '#fafafa';
const MUTED = '#8a8a8a';
const CANVAS = '#111111';
const SURFACE = '#1b1b1b';
const LINE = '#2f2f2f';

export async function GET(_request, { params }) {
  const { username } = await params;
  const profile = await getProfileCard(username);

  if (!profile) {
    // An image route cannot usefully 404 into a Markdown tag — the reader sees
    // a broken image icon and no explanation. A card that says so is kinder,
    // and still carries the 404 for anything that checks the status.
    return new ImageResponse(<Missing />, { width: WIDTH, height: HEIGHT, status: 404 });
  }

  const name = profile.name || `@${profile.displayUsername}`;
  const tags = (profile.topTags.length > 0 ? profile.topTags : profile.interests).slice(0, 4);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: CANVAS,
          color: INK,
          fontFamily: 'sans-serif',
          padding: 28,
          border: `1px solid ${LINE}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Avatar profile={profile} />
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 16, flex: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.6 }}>{name}</div>
            {/* One text child, not `@{handle}`. JSX would make that two
                children, and Satori refuses any element with more than one
                child unless it declares a display mode — which fails the whole
                image rather than that one line. */}
            <div style={{ fontSize: 16, color: MUTED, marginTop: 2 }}>
              {`@${profile.displayUsername}`}
            </div>
          </div>
          <div style={{ fontSize: 13, color: MUTED, letterSpacing: 0.4 }}>chestha</div>
        </div>

        {profile.bio ? (
          <div style={{ fontSize: 14, color: MUTED, marginTop: 14, lineHeight: 1.4 }}>
            {profile.bio.slice(0, 110)}
          </div>
        ) : null}

        {tags.length > 0 ? (
          <div style={{ display: 'flex', marginTop: 14, flexWrap: 'wrap' }}>
            {tags.map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 12,
                  color: MUTED,
                  backgroundColor: SURFACE,
                  border: `1px solid ${LINE}`,
                  borderRadius: 999,
                  padding: '3px 10px',
                  marginRight: 6,
                  marginBottom: 6,
                }}
              >
                {interestLabel(tag)}
              </div>
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            borderTop: `1px solid ${LINE}`,
            paddingTop: 14,
          }}
        >
          <Stat label="Posts" value={profile.stats.posts} />
          <Stat label="Followers" value={profile.stats.followers} />
          <Stat label="Read" value={profile.stats.postsRead} />
          <Stat label="Streak" value={profile.stats.readStreak} />
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}

function Avatar({ profile }) {
  const initial = (profile.name || profile.displayUsername || '?').trim().charAt(0).toUpperCase();
  const box = {
    display: 'flex',
    width: 64,
    height: 64,
    borderRadius: 16,
    border: `1px solid ${LINE}`,
  };

  if (profile.image) {
    return <img src={profile.image} alt="" style={{ ...box, objectFit: 'cover' }} />;
  }
  return (
    <div
      style={{
        ...box,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: SURFACE,
        fontSize: 28,
        fontWeight: 700,
        color: MUTED,
      }}
    >
      {initial}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginRight: 34 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {Number.isFinite(value) ? value : '—'}
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Missing() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: CANVAS,
        color: MUTED,
        fontFamily: 'sans-serif',
        border: `1px solid ${LINE}`,
      }}
    >
      <div style={{ fontSize: 20, color: INK }}>No such profile</div>
      <div style={{ fontSize: 14, marginTop: 8 }}>chestha</div>
    </div>
  );
}
