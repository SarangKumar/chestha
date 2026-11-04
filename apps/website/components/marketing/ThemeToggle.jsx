'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { buttonClass } from '../ui/Button';

const KEY = 'chestha.theme';

/**
 * Light / dark switch for the marketing chrome.
 *
 * The extension toggles theme through its workspace store; this app has no
 * store, so it writes the same `chestha.theme` key the blocking script in
 * `app/layout.jsx` reads on the next load. Key and values match
 * `apps/extension/public/theme-init.js` exactly, so someone moving between the
 * site and the extension sees the same two choices — though the value itself
 * does not travel, because they are separate origins.
 *
 * It renders nothing until mounted. The server cannot know which theme the
 * browser resolved, so rendering a sun on the server and a moon on the client
 * is a hydration mismatch — and the icon would be wrong half the time anyway.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(null);

  useEffect(() => {
    // The class is already correct: the blocking script set it before paint.
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(KEY, next ? 'dark' : 'light');
    } catch {
      /* private window, or site data blocked — the class still applies */
    }
  };

  // A fixed-size placeholder, so the header does not reflow when it appears.
  if (dark === null) return <span className="size-8" aria-hidden />;

  const nextTheme = dark ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      className={buttonClass({ variant: 'ghost', size: 'icon-sm' })}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      <Icon name={dark ? 'sun' : 'moon'} className="size-4" />
    </button>
  );
}
