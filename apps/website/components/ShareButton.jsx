'use client';

import { useState } from 'react';

/**
 * Copies the profile URL. The clipboard API needs a user gesture and a secure
 * context, and it rejects outright in a few browsers, so the fallback is to
 * select the URL in a field the visitor can copy manually — never a dead
 * button with no feedback.
 */
export function ShareButton({ url, label }) {
  const [state, setState] = useState('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('failed');
    }
  }

  if (state === 'failed') {
    return (
      <label className="flex flex-col gap-1 sm:w-48">
        <span className="text-meta text-ink-faint">Copy this link</span>
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="rounded-control border border-line bg-inset px-2.5 py-1.5 text-meta text-ink"
        />
      </label>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className="shrink-0 self-start rounded-control border border-line bg-raised px-3 py-1.5 text-meta font-medium text-ink transition-colors duration-150 hover:bg-hover"
    >
      {/* `aria-live` so the change is announced, not just seen. */}
      <span aria-live="polite">{state === 'copied' ? 'Link copied' : 'Share'}</span>
    </button>
  );
}
