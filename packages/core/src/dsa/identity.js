// A LeetCode problem slug is this feature's identity for a question. It is
// stable, it is what the URL contains, and it is how two curated lists naming
// the same problem are recognised as the same problem.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTS = new Set(['leetcode.com', 'www.leetcode.com', 'leetcode.cn', 'www.leetcode.cn']);

/**
 * Pulls the slug out of a LeetCode problem URL.
 * Refusals are specific: a vague "invalid URL" is not a useful answer when the
 * user has just pasted forty lines.
 * @returns {{ ok: true, slug: string, host: string } | { ok: false, reason: string }}
 */
export function extractSlug(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, reason: 'Empty line.' };

  // A bare slug is accepted, since it is unambiguous and easy to paste.
  if (!raw.includes('/') && !raw.includes(' ') && SLUG.test(raw)) {
    return { ok: true, slug: raw, host: 'leetcode.com' };
  }

  let url;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: 'Not a URL, and not a plain problem slug.' };
  }

  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) {
    return { ok: false, reason: `Not a LeetCode address (${url.hostname}).` };
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('problems');
  if (at === -1) {
    const what = parts[0] ?? 'the site root';
    return { ok: false, reason: `A LeetCode link, but not to a problem (it points at ${what}).` };
  }

  const slug = (parts[at + 1] ?? '').toLowerCase();
  if (!slug) return { ok: false, reason: 'The link has no problem name after /problems/.' };
  if (!SLUG.test(slug)) return { ok: false, reason: `“${slug}” is not a valid problem name.` };

  return { ok: true, slug, host };
}

/** Only ever built from a known slug. A URL guessed from a title is a dead link. */
export function problemUrl(slug) {
  return `https://leetcode.com/problems/${slug}/`;
}

/** A starting point for the title field, clearly editable — never a claim. */
export function titleGuessFromSlug(slug) {
  return String(slug ?? '')
    .split('-')
    .filter(Boolean)
    .map((word) => (/^\d+$/.test(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}

/** Splits pasted input into candidate lines; users paste lists, not single URLs. */
export function splitPastedInput(text) {
  return String(text ?? '')
    .split(/[\n\r,;\s]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}
