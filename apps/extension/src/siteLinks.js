/**
 * Public links used by website chrome (footer, About, landing). Kept in one
 * place so labels and URLs cannot drift between surfaces.
 */
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

/**
 * Public marketing site — where posts are read and accounts live.
 *
 * `VITE_SITE_URL` is the only source, and there is deliberately no fallback
 * here: a hardcoded origin is the thing this removes. The per-mode defaults are
 * committed as `apps/extension/.env.development` and `.env.production`
 * (public build values, not secrets), and `.env.local` overrides either without
 * being committed.
 *
 * A missing or unparseable value fails the build, in `vite.config.js` — a URL
 * is checked once there rather than discovered when a New Tab throws.
 */
export const SITE_URL = import.meta.env.VITE_SITE_URL.replace(/\/+$/, '');

