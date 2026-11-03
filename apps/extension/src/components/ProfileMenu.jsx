import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SESSION_IN, SESSION_OUT, signInUrl, signUpUrl } from '@chestha/core';
import { SITE_URL } from '../siteLinks.js';
import { useSession } from '../app/useSession.js';
import { isExtensionRuntime } from '../app/platform.js';
import { Icon } from './icons.jsx';
import { cx } from './ui.jsx';

/**
 * The account control at the foot of the nav rail, and the only route to
 * Settings there.
 *
 * **This used to be deliberately ignorant of the session**, because the
 * extension runs on its own `chrome-extension://` origin and the website's
 * cookie was not readable from here. That changed when gated sections arrived:
 * the extension now declares `host_permissions` for the site and asks
 * `/api/session` who it is talking to, so this menu can name the account and
 * offer the right action instead of linking out and letting the website decide.
 * See `apps/extension/src/app/session.js` for why that request works from an
 * extension page and only from an extension page.
 *
 * Three states, not two: `unknown` is its own case, and it must not be rendered
 * as signed out. Offering "Sign in" to someone who already is — which is what
 * an offline New Tab would do if unknown collapsed into signed-out — sends them
 * to a form they do not need. Unknown shows the neutral items instead.
 *
 * Settings lives in this menu rather than beside it: the rail had one icon in
 * this slot and still does.
 */
export function ProfileMenu({ section, onNavigate }) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const { session, recheck, forget } = useSession();

  const active = section === 'settings';
  const target = isExtensionRuntime() ? '_blank' : '_self';
  const signedIn = session.state === SESSION_IN;
  const signedOut = session.state === SESSION_OUT;
  // A provisional handle is not a chosen one — the same rule `/account` applies,
  // so a fresh OAuth account is sent to the form, not to a profile it never
  // named.
  const named = signedIn && session.handle && session.handleChosen;

  /**
   * Anchor the menu to the trigger, in viewport coordinates.
   *
   * The menu is rendered through a portal rather than beside the button, because
   * the rail is a `w-16` scroll container: `overflow-y-auto` forces `overflow-x`
   * to compute to `auto` rather than `visible`, so anything positioned at
   * `left-full` is outside the 64px box and gets clipped. No z-index fixes that
   * — a clip is not a stacking question — so the menu has to leave the rail's
   * subtree entirely, which means positioning it by hand.
   */
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Bottom-aligned with the trigger and opening to its right, which is where
    // it opened before. Clamped so a short viewport cannot push it off-screen.
    const bottom = Math.max(8, window.innerHeight - rect.bottom);
    setAnchor({ left: Math.round(rect.right + 8), bottom: Math.round(bottom) });
  }, []);

  // Layout effect, so the menu is never painted at the wrong place first.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      // Two subtrees now: the trigger in the rail, and the menu under <body>.
      // Checking only the former would dismiss the menu on its own clicks.
      if (rootRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    // Capture, because the rail scrolls independently of the page and a
    // scroll event on it does not bubble to the window.
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={signedIn && named ? `@${session.displayUsername} — account and settings` : 'Account and settings'}
        className={cx(
          'group relative flex size-10 shrink-0 items-center justify-center rounded-card transition-colors duration-150',
          open || active ? 'bg-accent-soft text-ink' : 'text-ink-faint hover:bg-hover hover:text-ink',
        )}
      >
        <Icon name="user" />
        <span className="sr-only">
          {signedIn && named ? `Account and settings — signed in as ${session.displayUsername}` : 'Account and settings'}
        </span>
        {/* A dot, not a count: the only thing worth surfacing on a 40px icon is
            whether there is an account behind it. Absent while unknown, so an
            offline New Tab makes no claim either way. */}
        {signedIn && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 size-1.5 rounded-full bg-accent"
          />
        )}
        {active && <span className="absolute -left-px h-5 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
      </button>

      {open && anchor && createPortal(
        // Under <body>, so the rail's overflow clip and stacking context are
        // both out of the picture. z-50 matches the dialogs: this is an overlay,
        // and the only thing entitled to cover it is a modal.
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account and settings"
          style={{ left: anchor.left, bottom: anchor.bottom }}
          className="fixed z-50 w-60 overflow-hidden rounded-card border border-line bg-surface shadow-overlay"
        >
          <p className="border-b border-line px-3 py-2.5 text-meta text-ink-faint">
            {signedIn && named
              ? `Signed in as @${session.displayUsername}. Your widget board also works signed out.`
              : signedOut
                ? 'Signed out. Your widget board works as it is; the other sections need an account.'
                : 'Your widget board works on this device. An account unlocks the other sections and the posts on the website.'}
          </p>

          {signedIn ? (
            <>
              <MenuLink
                href={named ? `${SITE_URL}/user/${session.handle}` : `${SITE_URL}/onboarding/username`}
                target={target}
                icon="user"
                onDone={() => setOpen(false)}
              >
                {named ? 'Your profile' : 'Pick a username'}
              </MenuLink>
              {/* The sign-out itself happens on the website, which owns the
                  cookie. Clearing the cached answer here means the next check
                  asks rather than trusting a session that may be gone — and
                  until it answers, `unknown` fails open rather than locking
                  someone out of a workspace they are still signed into. */}
              <MenuLink
                href={`${SITE_URL}/signin`}
                target={target}
                icon="external"
                onDone={() => { setOpen(false); forget(); }}
              >
                Sign out on the website
              </MenuLink>
            </>
          ) : (
            <>
              <MenuLink
                href={signInUrl(SITE_URL, '/account')}
                target={target}
                icon="user"
                onDone={() => setOpen(false)}
              >
                Sign in
              </MenuLink>
              <MenuLink href={signUpUrl(SITE_URL)} target={target} icon="plus" onDone={() => setOpen(false)}>
                Create an account
              </MenuLink>
            </>
          )}

          {/* Signing in happens in another tab, which cannot reach into this
              one, so the recheck is offered rather than left to be guessed at. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); recheck(); }}
            className="flex w-full items-center gap-2.5 border-t border-line px-3 py-2.5 text-left text-card text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
          >
            <Icon name="repeat" className="size-4 shrink-0" />
            Check my account again
          </button>

          <div className="border-t border-line">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onNavigate('settings'); }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-card text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              <Icon name="settings" className="size-4 shrink-0" />
              Settings
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function MenuLink({ href, target, icon, onDone, children }) {
  return (
    <a
      href={href}
      target={target}
      rel="noopener noreferrer"
      role="menuitem"
      onClick={onDone}
      className="flex items-center gap-2.5 px-3 py-2.5 text-card text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
    >
      <Icon name={icon} className="size-4 shrink-0" />
      <span className="flex-1">{children}</span>
      {/* The website is a different place, and in the extension a different
          tab, so every account item says so rather than surprising you. */}
      <Icon name="external" className="size-3.5 shrink-0 text-ink-faint" />
    </a>
  );
}
