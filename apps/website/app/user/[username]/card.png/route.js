import { ImageResponse } from 'next/og';
import { interestLabel } from '@chestha/core';
import { getProfileCard } from '@/lib/profile';

/**
 * The shareable profile card, as a PNG — the thing you paste into a README.
 *
 * A route rather than a page, in a segment literally named `card.png`, so the
 * URL ends in an extension that a Markdown image tag will accept and a crawler
 * will treat as an image. No rewrite is involved — the folder name is the path.
 * The page that shows it with a copyable embed snippet lives one segment over
 * at `/card`.
 *
 * **It carries both tag rows, labelled, for the reason the website card does.**
 * What someone writes about is counted from published posts — a fact. What they
 * are interested in is chosen — a claim. The image used to show one row that
 * silently fell back from the first to the second, which let a ticked checkbox
 * read as a body of work. Two labelled rows cost one line of pixels and say
 * which is which. Interests already counted as tags are dropped from the second
 * row rather than printed twice.
 *
 * **Drawn with plain flexbox.** Satori, which renders this, supports only a
 * subset of CSS: no grid, no external stylesheet, and every element with more
 * than one child must declare a display mode. The design tokens are therefore
 * inlined as literals, which makes this and `opengraph-image.jsx` the only
 * hard-coded colours in the app — they have to be updated by hand if the
 * palette changes.
 *
 * **Cached for an hour at the edge.** A README image is requested by every
 * visitor to that README and by GitHub's own proxy, so this is the one profile
 * surface where a stale number is much cheaper than a database round trip. The
 * profile page itself is live; this is the souvenir.
 */
export const runtime = 'nodejs';

// 16:9, and wide enough for two tag rows without either wrapping. A README
// renders it inline at whatever width the column allows, so the ratio matters
// more than the pixels.
const WIDTH = 640;
const HEIGHT = 360;

const INK = '#fafafa';
const MUTED = '#8a8a8a';
const FAINT = '#6b6b6b';
const CANVAS = '#0f0f0f';
const SURFACE = '#1b1b1b';
const RAISED = '#232323';
const LINE = '#2f2f2f';

/**
 * As many tags as fit on one line, measured in characters rather than pixels.
 *
 * Satori has no layout read-back, so a row that overflows cannot be detected
 * after the fact — it just wraps and pushes the stats off the card. A character
 * budget is crude but stable, and the cap is what keeps a card with forty tags
 * looking like the card with four.
 */
function fitRow(tags, { budget = 46, max = 5 } = {}) {
  const picked = [];
  let used = 0;
  for (const tag of tags) {
    const cost = interestLabel(tag).length + 3;
    if (picked.length >= max || used + cost > budget) break;
    picked.push(tag);
    used += cost;
  }
  return picked;
}

export async function GET(_request, { params }) {
  const { username } = await params;
  const profile = await getProfileCard(username);

  if (!profile) {
    // An image route cannot usefully 404 into a Markdown tag — the reader sees
    // a broken image icon and no explanation. A card that says so is kinder,
    // and still carries the 404 for anything that checks the status.
    return new ImageResponse(<Missing />, { width: WIDTH, height: HEIGHT, status: 404 });
  }

  // With no display name the heading *is* the handle, and printing it twice
  // reads as a rendering fault rather than as emphasis.
  const handle = `@${profile.displayUsername}`;
  const name = profile.name || handle;
  const writes = fitRow(profile.topTags ?? []);
  // A tag already shown as a fact must not reappear as a claim.
  const counted = new Set(writes);
  const interests = fitRow((profile.interests ?? []).filter((tag) => !counted.has(tag)));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: CANVAS,
          // The one piece of hue-free decoration: a soft lift behind the
          // identity, which is where the eye lands first anyway.
          backgroundImage: `radial-gradient(900px 300px at 12% -20%, ${SURFACE} 0%, ${CANVAS} 70%)`,
          color: INK,
          fontFamily: 'sans-serif',
          padding: 34,
          border: `1px solid ${LINE}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Avatar profile={profile} />
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 18, paddingRight: 14, flex: 1 }}>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.8 }}>
              {name.slice(0, 26)}
            </div>
            {/* One text child, not `@{handle}`. JSX would make that two
                children, and Satori refuses any element with more than one
                child unless it declares a display mode — which fails the whole
                image rather than that one line. */}
            {profile.name ? (
              <div style={{ fontSize: 16, color: MUTED, marginTop: 3 }}>{handle}</div>
            ) : null}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 12,
              color: FAINT,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              border: `1px solid ${LINE}`,
              borderRadius: 999,
              padding: '5px 12px',
            }}
          >
            chestha
          </div>
        </div>

        {profile.bio ? (
          <div style={{ fontSize: 15, color: MUTED, marginTop: 18, lineHeight: 1.45 }}>
            {profile.bio.length > 104 ? `${profile.bio.slice(0, 104).trimEnd()}…` : profile.bio}
          </div>
        ) : null}

        {/* A little more air under a bio than between the two rows, so the
            prose and the chips do not read as one block. */}
        {writes.length > 0 ? (
          <TagRow label="Writes about" tags={writes} gapTop={profile.bio ? 24 : 20} solid />
        ) : null}
        {interests.length > 0 ? (
          <TagRow
            label="Interested in"
            tags={interests}
            gapTop={writes.length > 0 ? 20 : 24}
          />
        ) : null}

        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            borderTop: `1px solid ${LINE}`,
            paddingTop: 18,
          }}
        >
          <Stat label="Posts" value={profile.stats.posts} />
          <Stat label="Followers" value={profile.stats.followers} />
          <Stat label="Following" value={profile.stats.following} />
          <Stat label="Read" value={profile.stats.postsRead} />
          <Stat label="Streak" value={profile.stats.readStreak} last />
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

/**
 * A labelled row of chips.
 *
 * `solid` is the counted row: filled chips in full ink, because those tags were
 * earned. The chosen row is outlined and muted — the same two weights the
 * website card uses, so the image and the page do not disagree about which
 * claim is which.
 */
function TagRow({ label, tags, gapTop = 20, solid = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: gapTop }}>
      <div style={{ fontSize: 10, color: FAINT, letterSpacing: 1.4, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', marginTop: 7 }}>
        {tags.map((tag) => (
          <div
            key={tag}
            style={{
              display: 'flex',
              fontSize: 13,
              color: solid ? INK : MUTED,
              backgroundColor: solid ? RAISED : 'transparent',
              border: `1px solid ${LINE}`,
              borderRadius: 999,
              padding: '4px 11px',
              marginRight: 7,
            }}
          >
            {interestLabel(tag)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Avatar({ profile }) {
  const initial = (profile.name || profile.displayUsername || '?').trim().charAt(0).toUpperCase();
  const box = {
    display: 'flex',
    width: 76,
    height: 76,
    borderRadius: 20,
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
        fontSize: 32,
        fontWeight: 700,
        color: MUTED,
      }}
    >
      {initial}
    </div>
  );
}

function Stat({ label, value, last = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginRight: last ? 0 : 38 }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>
        {/* Not counted is not zero: `buildProfileCard` omits a stat it could
            not count, and a dash says so rather than claiming a 0. */}
        {Number.isFinite(value) ? String(value) : '—'}
      </div>
      <div style={{ fontSize: 10, color: FAINT, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 4 }}>
        {label}
      </div>
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
      <div style={{ fontSize: 22, color: INK }}>No such profile</div>
      <div style={{ fontSize: 13, marginTop: 10, letterSpacing: 1.6 }}>CHESTHA</div>
    </div>
  );
}
