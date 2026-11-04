/**
 * The marketing nav, in one place so the desktop bar, the mobile sheet and the
 * footer cannot list different pages.
 *
 * "Workspace" is deliberately absent. The extension's marketing header had it,
 * pointing at the in-app dashboard; this site has no workspace to point at, so
 * the equivalent is Add to Chrome, which the header and hero both carry. A nav
 * item leading to a 404 is worse than one that is not there.
 */
export const MARKETING_NAV = [
  { href: '/feed', label: 'Read' },
  { href: '/about', label: 'About' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/guide', label: 'Guide' },
];
