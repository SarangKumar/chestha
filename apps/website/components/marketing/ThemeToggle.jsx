'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { THEME_CHOICES, readStoredTheme, storeTheme, themeIcon, watchTheme } from '@chestha/core';
import { Icon } from './Icon';
import { buttonClass } from '../ui/Button';

/**
 * The theme control for the marketing chrome: one icon, three choices.
 *
 * This app has no workspace store, so the choice lives in localStorage under
 * the key the blocking script in `app/layout.jsx` reads before paint. The key,
 * the three values and the dark-resolution rule all come from
 * `@chestha/core`'s theme module, shared with the extension, so the two cannot
 * drift apart. The value itself does not travel between them — separate
 * origins, each remembering its own choice.
 *
 * **It used to offer only light and dark.** `system` was already a value the
 * bootstrap script understood and the default for anyone who had never
 * clicked, but this control could not write it: one click left `system` for
 * good, with no way back short of clearing site data. That is the bug this
 * replaces, not just a nicer menu.
 *
 * Nothing renders until mounted. The server cannot know which theme the browser
 * resolved, so committing to an icon during SSR is a hydration mismatch — and
 * would be the wrong icon about half the time regardless.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  // Read once on mount: the class on <html> is already correct by now, and this
  // only needs to recover *which choice* produced it, which the class cannot say.
  useEffect(() => { setTheme(readStoredTheme()); }, []);

  // Re-applied on every change so `system` keeps following the OS live, which
  // a one-shot read at mount would not do.
  useEffect(() => (theme === null ? undefined : watchTheme(theme)), [theme]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A fixed-size placeholder, so the header does not reflow when it appears.
  if (theme === null) return <span className="size-8" aria-hidden />;

  const choose = (id) => {
    setTheme(id);
    storeTheme(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClass({ variant: 'ghost', size: 'icon-sm' })}
        aria-label="Theme"
        title="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        {/* The choice, not the resolved theme: on System this stays a screen
            however the OS currently resolves it. */}
        <Icon name={themeIcon(theme)} className="size-4" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="absolute top-full right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-card border border-line bg-overlay p-1 shadow-overlay"
        >
          {THEME_CHOICES.map((choice) => {
            const active = choice.id === theme;
            return (
              <button
                key={choice.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(choice.id)}
                title={choice.hint}
                className={[
                  'flex w-full items-center gap-2.5 rounded-chip px-2.5 py-2 text-left text-card transition-colors duration-150',
                  active ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink',
                ].join(' ')}
              >
                <Icon name={choice.icon} className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                {active && <Icon name="check" className="size-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
