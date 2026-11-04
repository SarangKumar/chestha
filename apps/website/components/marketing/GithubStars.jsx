'use client';

import { useEffect, useState } from 'react';
import { GITHUB_REPO, formatStarCount } from '@chestha/core';
import { Icon } from './Icon';

/**
 * Repo link with a live stargazer count.
 *
 * Public GitHub API, no token. Offline, rate-limited or malformed answers
 * leave the count null, and the link renders as the icon alone — the number is
 * decoration, and a link that disappears because GitHub is busy would be worse
 * than one without a badge.
 */
export function GithubStars() {
  const [stars, setStars] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;

    (async () => {
      try {
        const res = await fetch(GITHUB_REPO.api, {
          headers: { Accept: 'application/vnd.github+json' },
          signal: ctrl?.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const count = Number(data?.stargazers_count);
        if (!cancelled && Number.isFinite(count) && count >= 0) setStars(count);
      } catch {
        // Offline or aborted — keep stars null.
      }
    })();

    return () => {
      cancelled = true;
      ctrl?.abort();
    };
  }, []);

  const label = formatStarCount(stars);

  return (
    <a
      href={GITHUB_REPO.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-meta font-medium text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
      aria-label={label ? `Chestha on GitHub, ${label} stars` : 'Chestha on GitHub'}
    >
      <Icon name="github" className="size-4" />
      {label ? <span className="tabular-nums text-meta">{label}</span> : null}
    </a>
  );
}
