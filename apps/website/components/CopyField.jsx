'use client';

import { useState } from 'react';
import { buttonClass } from './ui/Button';

/**
 * A read-only snippet with a copy button.
 *
 * The input is `readOnly` rather than `disabled`: a disabled field cannot be
 * focused or selected, which takes away the manual fallback exactly when the
 * clipboard API is the thing that failed. Clicking it selects everything, so
 * the keyboard path is one ⌘C.
 *
 * The clipboard needs a user gesture and a secure context and still rejects in
 * some browsers, so a failure says so and leaves the text selected rather than
 * reporting a success that did not happen.
 */
export function CopyField({ label, value }) {
  const [state, setState] = useState('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-meta font-medium text-ink-muted">{label}</label>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-control border border-line bg-inset px-3 py-2 font-mono text-meta text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button type="button" onClick={copy} className={buttonClass({ variant: 'outline', size: 'sm' })}>
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Press ⌘C' : 'Copy'}
        </button>
      </div>
      {/* Announced, not just coloured — the button label changing is the only
          feedback a sighted user gets, and a screen reader gets none. */}
      <p aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Copy failed, the text is selected' : ''}
      </p>
    </div>
  );
}
