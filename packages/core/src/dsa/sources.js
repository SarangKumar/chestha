/**
 * A manifest of the curated lists this feature knows about, and whether their
 * data actually ships with the app.
 *
 * What IS bundled (see scripts/build-dsa-pack.mjs, which regenerates it):
 *   - Question facts only: title, slug, difficulty, topic tags, question id.
 *     Problem statements are never bundled; those are LeetCode's copyrighted text.
 *   - Membership for lists whose fetched size matches the total each is
 *     documented to contain. The build refuses to emit a pack if any list's size
 *     disagrees, so a silently truncated source cannot ship.
 *
 * Question metadata and Blind/NeetCode/LeetCode-official memberships were
 * MIT-licensed when fetched. NeetCode 75 is the Blind 75 set ordered as in
 * NeetCode 150 (same MIT sheets). Grind 75/169 memberships come from an
 * ISC-licensed published template (jrddp/leet-cli), ordered as on
 * techinterviewhandbook.org/grind75.
 * The metadata dataset's README states its author scraped LeetCode — we consume
 * published datasets rather than scraping, and record that here so provenance
 * is visible rather than buried.
 *
 * Company lists come from github.com/liquidslr/leetcode-company-wise-problems,
 * which carries **no licence file** and is derived upstream from LeetCode's
 * company tags, a paid LeetCode feature. That is unlike every other bundled
 * source here, all of which are MIT or ISC, and it is shipped by an explicit
 * decision of the project owner rather than by the usual rule. Recorded here
 * so the exception is visible at the point of use. Only the company→question
 * mapping and its ranking order are kept; the Frequency and Acceptance Rate
 * columns are dropped.
 *
 * Striver's 180 Sheet is bundled from a hand transcription of the published
 * sheet's section listing (`scripts/data/striver-180.json`) — titles, sections
 * and Basic/Core/Pro tiers, no problem statements and no editorial text. It is
 * the one list here whose membership is our own reading of a published page
 * rather than a licensed dataset, so it is partial by construction: an entry
 * ships only where the sheet's problem IS a LeetCode problem, never where it
 * merely shares a technique. The 34 entries that are algorithm or
 * implementation exercises (Dijkstra, Kosaraju, heapify, Rabin-Karp, a DSU) are
 * recorded in that file with a reason each and are not shipped, because a
 * question here is identified by a LeetCode slug and inventing one would mean
 * shipping a dead link.
 *
 * What is NOT bundled: the Striver A2Z and SDE sheets, because no source was
 * found that publishes their membership with a usable licence and a verifiable
 * size. They remain ingestible via a user-supplied pack.
 */
export const SOURCES = [
  { id: 'blind-75', name: 'Blind 75', family: 'blind', expected: 75, bundled: true, licence: 'MIT (membership source)', note: 'Bundled. 75 of 75 verified against the documented total.' },
  { id: 'grind-75', name: 'Grind 75', family: 'blind', expected: 75, bundled: true, licence: 'ISC (membership source)', note: 'Bundled. First 75 of the Grind 75 pool (techinterviewhandbook.org/grind75), from a published ISC template.' },
  { id: 'grind-169', name: 'Grind 169', family: 'blind', expected: 169, bundled: true, licence: 'ISC (membership source)', note: 'Bundled. Full Grind 75 pool (169). Shares the blind family with Blind 75 / Grind 75.' },
  { id: 'neetcode-75', name: 'NeetCode 75', family: 'neetcode', expected: 75, bundled: true, licence: 'MIT (membership source)', note: 'Bundled. Blind 75 ∩ NeetCode 150 in NeetCode 150 order (75 of 75). Shares the neetcode family with NeetCode 150/250.' },
  { id: 'neetcode-150', name: 'NeetCode 150', family: 'neetcode', expected: 150, bundled: true, licence: 'MIT (membership source)', note: 'Bundled. 150 of 150 verified. Extends Blind 75, so it shares its family weighting.' },
  { id: 'neetcode-250', name: 'NeetCode 250', family: 'neetcode', expected: 250, bundled: true, licence: 'MIT (membership source)', note: 'Bundled. 250 of 250 verified. Extends NeetCode 150.' },
  { id: 'leetcode-75', name: 'LeetCode 75', family: 'leetcode-official', expected: 75, bundled: true, licence: 'MIT (membership source)', note: 'Bundled. 75 of 75 verified.' },
  { id: 'leetcode-top-interview-150', name: 'LeetCode Top Interview 150', family: 'leetcode-official', expected: 150, bundled: true, licence: 'MIT (membership source)', note: 'Bundled. 150 of 150 verified.' },
  { id: 'striver-180', name: "Striver's 180 Sheet", family: 'striver', expected: 145, bundled: true, licence: 'titles only, transcribed from the published sheet', note: "Bundled, partially. The sheet lists 179 entries under its 180 branding; the 145 that are a LeetCode problem ship as membership. The other 34 — Dijkstra, Kosaraju, heapify, Rabin-Karp, DSU and the like — are algorithm or implementation exercises with no LeetCode question to key them to, and this feature's identity is a LeetCode slug. scripts/data/striver-180.json records every entry and, for each omission, why." },
  { id: 'striver-a2z', name: "Striver's A2Z DSA Sheet", family: 'striver', expected: null, bundled: false, licence: 'unverified', note: 'Not bundled — published totals disagree between references (474 vs "450+"), so no size could be verified.' },
  { id: 'striver-sde', name: "Striver's SDE Sheet", family: 'striver', expected: null, bundled: false, licence: 'unverified', note: 'Not bundled — membership not verified against the publisher.' },
];

export function sourceById(id) {
  return SOURCES.find((s) => s.id === id) ?? null;
}

export function bundledSources() {
  return SOURCES.filter((s) => s.bundled);
}

/** The packs shipped in apps/extension/public/dsa-packs/, offered in the library. */
export const BUNDLED_PACKS = [
  {
    id: 'curated-core',
    name: 'Curated interview lists',
    url: '/dsa-packs/curated-core.json',
    description: "Blind 75, Grind 75, Grind 169, NeetCode 75/150/250, LeetCode 75, Top Interview 150 and the LeetCode-available part of Striver's 180 Sheet — curated memberships with shared question metadata.",
  },
  {
    id: 'companies',
    name: 'Company question lists',
    url: '/dsa-packs/companies.json',
    description: 'Questions tagged to each of 422 companies, ordered by how often they are reported. Import it to practise for a specific interview.',
  },
  {
    id: 'leetcode-index',
    name: 'Full LeetCode index',
    url: '/dsa-packs/leetcode-index.json',
    description: 'Title, difficulty and topics for all 3,511 public problems. No list membership — import it for breadth when searching.',
  },
];
