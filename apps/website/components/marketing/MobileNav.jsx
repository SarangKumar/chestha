'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CHROME_STORE_URL } from '@chestha/core';
import { BrandMark } from './BrandMark';
import { MARKETING_NAV } from './nav';
import { buttonClass } from '../ui/Button';

function MenuIcon() {
  return (
    <span className="flex w-3.5 flex-col gap-0.5" aria-hidden>
      <span className="block h-0.5 w-full rounded bg-ink" />
      <span className="block h-0.5 w-full rounded bg-ink" />
      <span className="block h-0.5 w-full rounded bg-ink" />
    </span>
  );
}

/**
 * The narrow-screen menu.
 *
 * The extension opens a Radix sheet here. This app has no Radix, and one panel
 * is not worth the dependency, so it is a plain fixed panel with the two
 * behaviours that actually matter: Escape closes it, and a click outside does
 * too. Body scroll is locked while it is open, because a drawer that scrolls
 * the page behind it feels broken.
 */
export function MobileNav({ children }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => { if (!panelRef.current?.contains(e.target)) setOpen(false); };

    document.addEventListener('keydown', onKey);
    // Timeout, or the click that opened the panel closes it again.
    const timer = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      clearTimeout(timer);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClass({ variant: 'outline', size: 'icon-sm' })}
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        <MenuIcon />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px]" aria-hidden />
          <div
            ref={panelRef}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-4">
              <BrandMark className="size-7" width={28} height={28} alt="" />
              <span className="flex flex-col leading-tight">
                <span className="chestha-display text-card text-ink">Chestha</span>
                <span className="text-meta font-normal text-ink-muted">
                  Local-first workspace
                </span>
              </span>
            </div>

            <nav className="flex flex-col gap-1 overflow-y-auto p-3" aria-label="Mobile">
              {MARKETING_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-control px-3 py-2.5 text-card font-medium text-ink transition-colors duration-150 hover:bg-hover"
                >
                  {item.label}
                </Link>
              ))}
              <a
                href={CHROME_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="rounded-control px-3 py-2.5 text-card font-medium text-ink transition-colors duration-150 hover:bg-hover"
              >
                Add to Chrome
              </a>

              {/* The account controls, handed down from the server component
                  that already knows who is signed in. */}
              <div className="mt-2 border-t border-line pt-2">{children}</div>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
