import { cleanDomain } from './schema.js';

/**
 * Which rule a host belongs to.
 *
 * Matching is on **label boundaries**, never substrings, which is the difference
 * between a rule for `leetcode.com` meaning what the user meant and it quietly
 * matching `notleetcode.com`. Paths, queries, ports and fragments play no part — a
 * rule is a domain, and the tracker never sees more than one.
 */

/** The host of a URL, normalised the way a rule's domain is. '' when untrackable. */
export function hostOf(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? ''));
  } catch {
    return '';
  }
  // Only ordinary web pages can belong to a rule. chrome://, chrome-extension://,
  // file:// and the rest are not sites the user can write a rule for, so they are
  // never attributed and never recorded.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  return cleanDomain(parsed.hostname);
}

export function ruleMatches(rule, host) {
  if (!rule?.enabled || !host) return false;
  if (host === rule.domain) return true;
  return rule.includeSubdomains === true && host.endsWith(`.${rule.domain}`);
}

/**
 * The most specific enabled rule, so time is attributed to exactly one.
 *
 * With rules for `youtube.com` and `music.youtube.com`, music belongs to the
 * specific one. An exact match always beats a subdomain match of the same length,
 * which is what makes the answer stable rather than dependent on rule order.
 */
export function matchRule(rules, host) {
  if (!host || !Array.isArray(rules)) return null;
  let best = null;
  let bestScore = -1;
  for (const rule of rules) {
    if (!ruleMatches(rule, host)) continue;
    const score = rule.domain.length * 2 + (host === rule.domain ? 1 : 0);
    if (score > bestScore) { best = rule; bestScore = score; }
  }
  return best;
}

/**
 * Rules that can never win, because a more specific rule covers everything they
 * would match. Surfaced in settings: a silently dead rule is worse than a warning.
 */
export function shadowedRules(rules) {
  const out = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const covering = rules.find((other) => other !== rule
      && other.enabled
      && !other.includeSubdomains
      && other.domain === rule.domain);
    if (covering) out.push({ rule, by: covering });
  }
  return out;
}

/** Validates a domain a user typed, with the reason it was refused. */
export function describeDomain(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, reason: 'Enter a website address.' };
  const domain = cleanDomain(raw);
  if (domain) return { ok: true, domain };
  if (/^[a-z]+:\/\//i.test(raw)) {
    const fromUrl = hostOf(raw);
    if (fromUrl) return { ok: true, domain: fromUrl };
    return { ok: false, reason: 'Use just the site, like leetcode.com — not a full address.' };
  }
  if (raw.includes('/')) return { ok: false, reason: 'Use just the site, without a path.' };
  if (!raw.includes('.')) return { ok: false, reason: 'That needs to look like a website, such as leetcode.com.' };
  return { ok: false, reason: 'That is not a website address this can track.' };
}
