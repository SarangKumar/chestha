import { useEffect, useState } from 'react';
import { GITHUB_REPO } from '../siteLinks.js';

// Re-exported so the one existing import site keeps working; the function
// itself lives in core now, beside the repo link it formats.
export { formatStarCount } from '@chestha/core';

/**
 * Live stargazer count for the product repo. Public GitHub API only — no token.
 * Offline / rate-limit / network errors leave `stars` null so the UI can hide
 * the number and still show the icon link.
 */
export function useGithubStars() {
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
        if (!cancelled && Number.isFinite(count) && count >= 0) {
          setStars(count);
        }
      } catch {
        // Offline or aborted — keep stars null.
      }
    })();

    return () => {
      cancelled = true;
      ctrl?.abort();
    };
  }, []);

  return stars;
}
