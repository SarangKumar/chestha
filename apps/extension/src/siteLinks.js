/**
 * Public links used by app chrome (footer, About, landing, nav rail).
 *
 * The links themselves moved to `@chestha/core` when the website grew its own
 * marketing pages: both apps render them, and two copies would mean a renamed
 * repo or a moved store listing fixed in one place only. They are re-exported
 * here so every existing import keeps working and there is still one obvious
 * place to look from inside this app.
 */
export {
  BUY_ME_COFFEE,
  CHROME_STORE_URL,
  GITHUB_REPO,
  SITE_SOCIALS,
  formatStarCount,
} from '@chestha/core';

/**
 * Public marketing site — where posts are read and accounts live.
 *
 * This one stays local, because it is a *build* value rather than a shared
 * constant: `VITE_SITE_URL` is the only source, and there is deliberately no
 * fallback — a hardcoded origin is the thing this removes. The per-mode
 * defaults are committed as `apps/extension/.env.development` and
 * `.env.production` (public build values, not secrets), and `.env.local`
 * overrides either without being committed.
 *
 * A missing or unparseable value fails the build, in `vite.config.js` — a URL
 * is checked once there rather than discovered when a New Tab throws.
 */
export const SITE_URL = import.meta.env.VITE_SITE_URL.replace(/\/+$/, '');
