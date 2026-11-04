import Link from 'next/link';
import { redirect } from 'next/navigation';
import { INTEREST_GROUPS, SUGGESTED_INTERESTS, interestLabel } from '@chestha/core';
import { currentUser, currentUserId } from '@/lib/session';
import { getInterests } from '@/lib/social';
import { saveInterestsAction } from './actions';
import { buttonClass } from '@/components/ui/Button';

export const metadata = { title: 'Pick your interests' };

/**
 * The second step of signing up: what do you want to read about.
 *
 * **Checkboxes, not a JavaScript widget.** The whole page is one form posting
 * to a server action, so it works before hydration and on a slow connection —
 * which is exactly when a new account is most likely to give up. The styling
 * makes each checkbox look like a chip; `peer-checked` does the work, so there
 * is no state to get out of sync with what will actually be submitted.
 *
 * **Skip is a button, not a link you have to find.** An onboarding step that
 * cannot be skipped is a wall, and an empty interest list is a legitimate
 * answer that the normaliser already accepts.
 */
export default async function InterestsPage() {
  const user = await currentUser();
  if (!user) redirect('/signin?callbackUrl=%2Fonboarding%2Finterests');
  // Someone who has not named themselves yet is sent to do that first: the
  // feed they are about to get is addressed to a handle.
  if (!user.handle || !user.handleChosen) redirect('/onboarding/username');

  const userId = await currentUserId();
  const chosen = new Set(await getInterests(userId));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-page font-semibold tracking-tight text-ink">
          What do you want to read about?
        </h1>
        <p className="max-w-xl text-card leading-relaxed text-ink-muted">
          Pick at least {SUGGESTED_INTERESTS} — they match the tags people put on
          their posts, so the more you pick the better the feed gets. You can change
          these whenever you like.
        </p>
      </header>

      <form action={saveInterestsAction} className="mt-8">
        <div className="space-y-7">
          {INTEREST_GROUPS.map((group) => (
            <fieldset key={group.id}>
              <legend className="text-meta font-medium tracking-wide uppercase text-ink-faint">
                {group.label}
              </legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {group.tags.map((tag) => (
                  <label key={tag} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name="interests"
                      value={tag}
                      defaultChecked={chosen.has(tag)}
                      className="peer sr-only"
                    />
                    <span className="inline-flex rounded-chip border border-line bg-raised px-3 py-1.5 text-meta text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink peer-checked:border-transparent peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                      {interestLabel(tag)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="mt-9 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <button type="submit" className={buttonClass({ size: 'lg' })}>
            Save and continue
          </button>
          {/* A link, not a second submit. A submit inside this form would save
              whatever happens to be ticked, so someone who picked five tags and
              then changed their mind would have them stored anyway — the
              opposite of what the word promises. */}
          <Link href="/feed" className={buttonClass({ variant: 'ghost', size: 'lg' })}>
            Skip for now
          </Link>
        </div>
      </form>
    </div>
  );
}
