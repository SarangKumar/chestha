import { currentUser } from '@/lib/session';
import { HomeHero } from '@/components/marketing/HomeHero';
import { WorkspacePreview } from '@/components/marketing/WorkspacePreview';
import { ProofCards } from '@/components/marketing/ProofCards';
import { FeatureBento } from '@/components/marketing/FeatureBento';
import { ClosingCta } from '@/components/marketing/ClosingCta';

/**
 * The landing.
 *
 * It used to be a port of `apps/extension/src/site/Landing.jsx` — the same
 * centred mark, title, tagline, chips and two buttons — so that the two builds
 * could not drift. **That is no longer true**, deliberately: this page now
 * follows a denser developer-product layout (big left-aligned hero with a
 * stacked CTA column, a framed product shot overlapping the hero, a four-card
 * proof row, a feature bento, a closing CTA band), and the extension's own
 * landing still renders the old centred hero. The shared pieces in
 * `packages/ui/src/marketing.css` were only added to, never changed, so that
 * divergence is one-way and the extension's page is untouched.
 *
 * The *description* of the product is the same for everyone — what Chestha is
 * does not change once you have an account. The **calls to action are not**:
 * asking someone who is signed in to "Create an account", and telling them
 * underneath that they can sign in if they already have one, is the page
 * contradicting the header. So the session is read once here and handed to the
 * two places that ask for something, and nowhere else.
 *
 * Sections are composed here and nowhere else, so the order of the page is
 * readable in one screen.
 */
export default async function HomePage() {
  const user = await currentUser();

  return (
    <div className="flex flex-col">
      <HomeHero user={user} />
      <WorkspacePreview />
      <ProofCards />
      <FeatureBento />
      <ClosingCta user={user} />
    </div>
  );
}
