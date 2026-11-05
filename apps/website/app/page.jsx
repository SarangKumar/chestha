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
 * The page reads no session and renders the same for everyone, signed in or
 * out, for the reason it always did: the hero is what the product is, which
 * does not change once you have an account, and the header already says who
 * you are.
 *
 * Sections are composed here and nowhere else, so the order of the page is
 * readable in one screen.
 */
export default function HomePage() {
  return (
    <div className="flex flex-col">
      <HomeHero />
      <WorkspacePreview />
      <ProofCards />
      <FeatureBento />
      <ClosingCta />
    </div>
  );
}
