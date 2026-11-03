import { describeGate, signInUrl, signUpUrl } from '@chestha/core';
import { SITE_URL } from '../siteLinks.js';
import { isExtensionRuntime } from '../app/platform.js';
import { Button } from './ui.jsx';
import { Icon } from './icons.jsx';

/**
 * What a gated section shows when there is no account.
 *
 * Three things it deliberately is not:
 *
 *  - **Not a redirect.** The workspace stays where it was, with its rail, its
 *    header and its other sections still reachable. Someone who opens a New Tab
 *    to glance at their widgets and lands on `#/calendar` should be one click
 *    from the board, not bounced to a website.
 *  - **Not a form.** Sign-in happens on the website, which owns the session
 *    cookie and the password handling. An input here would mean the extension
 *    collected a password, which is precisely the thing worth not doing.
 *  - **Not silent about the recheck.** The extension cannot be told when someone
 *    signs in on another tab, so this offers the recheck explicitly rather than
 *    leaving them to guess that reopening the tab is the fix.
 */
export function SignInGate({ section, onRecheck, onBack }) {
  const copy = describeGate(section);
  // In the extension the website is a different tab; on the website build it is
  // the same one. Same rule as every other outbound link in the app.
  const target = isExtensionRuntime() ? '_blank' : '_self';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-10 text-center">
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-card border border-line bg-raised text-ink-faint"
      >
        <Icon name="lock" className="size-5" />
      </span>

      <h1 className="mt-5 text-page font-semibold tracking-tight text-ink">{copy.title}</h1>
      <p className="mt-2 text-card leading-relaxed text-ink-muted">{copy.reason}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button
          as="a"
          href={signInUrl(SITE_URL, '/account')}
          target={target}
          rel="noopener noreferrer"
        >
          Sign in
          <Icon name="external" className="size-3.5" />
        </Button>
        <Button
          as="a"
          tone="quiet"
          href={signUpUrl(SITE_URL)}
          target={target}
          rel="noopener noreferrer"
        >
          Create an account
        </Button>
      </div>

      {/* Signing in happens in another tab, and nothing there can reach into
          this one. So the recheck is a button rather than something that
          happens on its own and appears not to have worked. */}
      <p className="mt-6 text-meta text-ink-faint">
        Signed in already?{' '}
        <button
          type="button"
          onClick={onRecheck}
          className="text-ink-muted underline underline-offset-4 transition-colors duration-150 hover:text-ink"
        >
          Check again
        </button>
      </p>

      <p className="mt-6 border-t border-line pt-5 text-meta leading-relaxed text-ink-faint">
        Your widget board works without an account, and everything already on this
        device stays on it.{' '}
        <button
          type="button"
          onClick={onBack}
          className="text-ink-muted underline underline-offset-4 transition-colors duration-150 hover:text-ink"
        >
          Back to the board
        </button>
      </p>
    </div>
  );
}
