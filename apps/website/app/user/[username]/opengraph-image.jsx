import { ImageResponse } from 'next/og';
import { getProfileCard } from '@/lib/profile';

/**
 * The image that appears when a profile link is pasted into Slack, X or
 * WhatsApp — the thing that makes the card worth sharing at all.
 *
 * Drawn with plain flexbox because Satori, which renders this, supports only a
 * subset of CSS: no grid, no `gap` shorthand on every axis, and no external
 * stylesheet. The design tokens are therefore inlined as literals here; they
 * are the only hard-coded colours in the app, and they must be updated by hand
 * if the palette changes.
 */
export const alt = 'Chestha profile';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }) {
  const { username } = await params;
  const profile = await getProfileCard(username);

  const name = profile?.name || (profile ? `@${profile.displayUsername}` : 'Chestha');
  const handle = profile ? `@${profile.displayUsername}` : '';
  const bio = profile?.bio ?? '';
  const stats = profile?.stats ?? { posts: 0, categories: 0, readingMinutes: 0 };

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#111111',
          color: '#fafafa',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 28, color: '#8a8a8a', letterSpacing: -0.5 }}>chestha</div>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, marginTop: 28 }}>
            {name}
          </div>
          {handle && name !== handle ? (
            <div style={{ fontSize: 34, color: '#8a8a8a', marginTop: 10 }}>{handle}</div>
          ) : null}
          {bio ? (
            <div style={{ fontSize: 32, color: '#c4c4c4', marginTop: 26, lineHeight: 1.35 }}>
              {/* Satori does not line-clamp, so the text is cut here instead. */}
              {bio.length > 120 ? `${bio.slice(0, 120).trimEnd()}…` : bio}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <Stat value={stats.posts} label={stats.posts === 1 ? 'post' : 'posts'} />
          <Stat value={stats.categories} label="topics" />
          <Stat value={stats.readingMinutes} label="minutes written" />
        </div>
      </div>
    ),
    size,
  );
}

function Stat({ value, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginRight: 72 }}>
      <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1.5 }}>{value}</div>
      <div style={{ fontSize: 26, color: '#8a8a8a', marginTop: 4 }}>{label}</div>
    </div>
  );
}
