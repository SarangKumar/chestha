import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { siteUrl } from '@/lib/session';

export const metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Chestha — a calm place to work and to write',
    template: '%s · Chestha',
  },
  description:
    'A local-first productivity workspace, and a community writing about focus, '
    + 'engineering and learning in public.',
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f2' },
    { media: '(prefers-color-scheme: dark)', color: '#111111' },
  ],
};

/**
 * Theme is resolved before first paint.
 *
 * The class has to be on `<html>` *as the document parses*, or a dark-mode
 * visitor sees a white flash. That rules out doing it in React, so it is a
 * blocking inline script — the one place in this app where that is the right
 * trade. (apps/extension keeps the same code in a separate file instead, because
 * MV3's `script-src 'self'` blocks an inline script outright.)
 *
 * The key and the three-way logic match `apps/extension/public/theme-init.js`
 * exactly, including the `system` value, so the site and the extension behave
 * identically. The stored value itself does not carry across: they are
 * separate origins, so each remembers its own choice.
 */
const THEME_INIT = `
try {
  var stored = localStorage.getItem('chestha.theme');
  var dark = stored === 'dark'
    || ((!stored || stored === 'system')
      && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
} catch (error) {
  /* private window, or site data blocked — the page still renders */
}
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        {/* Keyboard users land here first: every core flow has to be
            completable without a mouse. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-raised focus:px-3 focus:py-2 focus:text-card focus:shadow-overlay"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
