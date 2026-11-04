import { notFound } from 'next/navigation';
import Link from 'next/link';
import { normalizeUsername } from '@chestha/core';
import { CopyField } from '@/components/CopyField';
import { getProfileCard } from '@/lib/profile';
import { siteUrl } from '@/lib/session';

export async function generateMetadata({ params }) {
  const { username } = await params;
  return { title: `@${normalizeUsername(username)} — card` };
}

/**
 * Where you come to put your card somewhere else.
 *
 * The page shows the real image rather than a styled imitation of it, because
 * the only question worth answering here is "what will people actually see",
 * and a preview that is not the artefact answers a different one.
 *
 * Three snippets, because the three places people paste this want three
 * syntaxes and getting one wrong is a broken image in public.
 */
export default async function DevCardPage({ params }) {
  const { username } = await params;
  const profile = await getProfileCard(username, { withCounts: false });
  if (!profile) notFound();

  const origin = siteUrl();
  const handle = profile.handle;
  const imageUrl = `${origin}/user/${handle}/devcard.png`;
  const profileLink = `${origin}/user/${handle}`;
  const alt = `${profile.name || `@${profile.displayUsername}`} on Chestha`;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-page font-semibold tracking-tight text-ink">Your card</h1>
        <p className="text-card leading-relaxed text-ink-muted">
          A picture of your profile that updates itself. Paste it into a README, a
          blog sidebar or a bio — it is fetched fresh each time, so the numbers stay
          current without you touching the snippet again.
        </p>
      </header>

      {/* The artefact itself, at its real size. */}
      <div className="flex justify-center rounded-panel border border-line bg-inset p-6">
        <img
          src={`/user/${handle}/devcard.png`}
          alt={alt}
          width={500}
          height={280}
          className="max-w-full rounded-card border border-line"
        />
      </div>

      <div className="space-y-5">
        <CopyField
          label="Markdown — for a GitHub README"
          value={`[![${alt}](${imageUrl})](${profileLink})`}
        />
        <CopyField
          label="HTML — for a blog or a site"
          value={`<a href="${profileLink}"><img src="${imageUrl}" alt="${alt}" width="500" height="280" /></a>`}
        />
        <CopyField label="Image URL — for anywhere else" value={imageUrl} />
      </div>

      <p className="text-meta text-ink-faint">
        The card is cached for an hour, so a post published just now shows up shortly.{' '}
        <Link
          href={`/user/${handle}`}
          className="text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
        >
          Back to your profile
        </Link>
      </p>
    </div>
  );
}
