/**
 * A manifest of the curated lists this feature knows how to ingest. It records
 * what each source is and whether its data has actually been obtained — it is NOT
 * a claim that any of it ships with the app.
 *
 * `bundled: false` everywhere is deliberate and verified:
 *  - LeetCode's terms of service forbid crawling, scraping and spidering, so the
 *    problem index cannot be harvested.
 *  - A browser page cannot reach leetcode.com at all (no CORS grant), so there is
 *    no client-side path to live metadata even setting the terms aside.
 *  - Curated list *membership* is the editorial work of its author. No source
 *    below publishes a licence permitting redistribution of its selection.
 *
 * The supported path is therefore a user-supplied data pack (see packs.js) or
 * adding questions by URL. If permission is obtained for a given list, it becomes
 * a pack without any code change here.
 */
export const SOURCES = [
  { id: 'blind-75', name: 'Blind 75', family: 'blind', expected: 75, bundled: false, licence: 'unverified', note: 'Originally a Blind forum post; widely mirrored without a stated licence.' },
  { id: 'grind-75', name: 'Grind 75', family: 'blind', expected: 75, bundled: false, licence: 'unverified', note: 'Successor to Blind 75; generated as a weekly schedule on its own site.' },
  { id: 'neetcode-75', name: 'NeetCode 75', family: 'neetcode', expected: 75, bundled: false, licence: 'unverified', note: 'No official dataset or licence found.' },
  { id: 'neetcode-150', name: 'NeetCode 150', family: 'neetcode', expected: 150, bundled: false, licence: 'unverified', note: 'Extends Blind 75; no official dataset or licence found.' },
  { id: 'neetcode-250', name: 'NeetCode 250', family: 'neetcode', expected: 250, bundled: false, licence: 'unverified', note: 'Extends NeetCode 150.' },
  { id: 'leetcode-75', name: 'LeetCode 75', family: 'leetcode-official', expected: 75, bundled: false, licence: 'platform', note: "LeetCode's own study plan; lives on the platform under its terms." },
  { id: 'leetcode-top-interview-150', name: 'LeetCode Top Interview 150', family: 'leetcode-official', expected: 150, bundled: false, licence: 'platform', note: "LeetCode's own study plan." },
  { id: 'striver-a2z', name: "Striver's A2Z DSA Sheet", family: 'striver', expected: null, bundled: false, licence: 'unverified', note: 'A curriculum of steps; published problem counts disagree between sources (474 vs "450+"), so no count is asserted.' },
  { id: 'striver-sde', name: "Striver's SDE Sheet", family: 'striver', expected: null, bundled: false, licence: 'unverified', note: 'Structure not verified against the publisher.' },
];

export function sourceById(id) {
  return SOURCES.find((s) => s.id === id) ?? null;
}

export function bundledSources() {
  return SOURCES.filter((s) => s.bundled);
}
