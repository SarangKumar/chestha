/**
 * Outbound links the product shows about itself.
 *
 * Shared because both apps render them: the extension's About page and the
 * website's marketing header, footer and landing. A second copy would mean a
 * renamed repo or a moved store listing fixed in one place and stale in the
 * other, which is exactly the drift this package exists to prevent.
 *
 * Deliberately not here: the website's own origin. That is a build value, read
 * from `VITE_SITE_URL` in the extension and `NEXT_PUBLIC_SITE_URL` on the
 * website, and hardcoding it is the thing those variables remove.
 */

/** Maker links — About page and marketing footer. */
export const SITE_SOCIALS = [
  { id: 'github', label: 'GitHub', href: 'https://github.com/SarangKumar' },
  { id: 'portfolio', label: 'Portfolio', href: 'https://sarangkumar.vercel.app/' },
];

/** Chrome Web Store listing for Add to Chrome CTAs. */
export const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/jenaklcokocgpgibjnildfgpaakhcfgd?utm_source=item-share-cb';

/** Buy Me a Coffee — mug icon only (not the wordmark). */
export const BUY_ME_COFFEE = {
  id: 'bmc',
  label: 'Buy me a coffee',
  href: 'https://buymeacoffee.com/sarangkumar',
  iconSrc: '/bmc-mug.png',
};

/** Product GitHub repository — navbar star count + icon link. */
export const GITHUB_REPO = {
  owner: 'SarangKumar',
  name: 'chestha',
  href: 'https://github.com/SarangKumar/chestha',
  api: 'https://api.github.com/repos/SarangKumar/chestha',
};

/** Compact star display: 1250 → "1.3k", small counts stay exact. */
export function formatStarCount(n) {
  if (n == null || !Number.isFinite(n)) return null;
  if (n < 1000) return String(Math.round(n));
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
}
