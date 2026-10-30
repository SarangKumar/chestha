/**
 * Builds the bundled DSA question packs from public, permissively licensed
 * sources. Run with `node tools/build-dsa-pack.mjs`.
 *
 * This is a development tool, not application code: the app itself never makes
 * an external request. Keeping it in the repo makes the bundled data auditable
 * and refreshable rather than a mystery blob.
 *
 * Sources (re-check licences before refreshing):
 *   - Question metadata: huggingface.co/datasets/kaysss/leetcode-problem-set (MIT).
 *     Note: that dataset's own README states it was scraped from LeetCode. We
 *     consume a published dataset rather than scraping, and record the fact here
 *     so the provenance is visible instead of buried.
 *   - Curated list membership (Blind / NeetCode / LeetCode official): 
 *     github.com/leetnotion/vscode-leetnotion (data/sheets.json, MIT), keyed by
 *     LeetCode's frontendQuestionId.
 *   - Grind 75 / Grind 169 membership: github.com/jrddp/leet-cli
 *     (data/grind75_template.json, ISC) — ordered problem URLs for the full
 *     Grind 75 pool (169). Grind 75 is the first 75 in that order; Grind 169 is
 *     the full list. Origin list: techinterviewhandbook.org/grind75. We do not
 *     scrape LeetCode HTML.
 *   - NeetCode 75 membership: derived from the same MIT sheets — the Blind 75
 *     set ordered as in NeetCode 150 (Blind 75 ∩ NeetCode 150). That intersection
 *     is exactly 75 and matches NeetCode's presentation of the set; we do not
 *     scrape LeetCode or neetcode.io.
 *
 * Only facts are bundled: title, slug, difficulty, topic tags, question id.
 * Problem statements are never included — those are LeetCode's copyrighted text.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const METADATA_URL = 'https://huggingface.co/datasets/kaysss/leetcode-problem-set/resolve/main/data.csv';
const SHEETS_URL = 'https://raw.githubusercontent.com/leetnotion/vscode-leetnotion/HEAD/data/sheets.json';
const GRIND_URL = 'https://raw.githubusercontent.com/jrddp/leet-cli/main/data/grind75_template.json';
const OUT_DIR = new URL('../apps/web/public/dsa-packs/', import.meta.url);

/** Lists we ship from leetnotion sheets.json. A list whose fetched size
 *  disagrees with its documented total is rejected rather than shipped. */
const LISTS = [
  { sheet: 'Blind 75', id: 'blind-75', name: 'Blind 75', family: 'blind', expected: 75 },
  { sheet: 'Neetcode 150', id: 'neetcode-150', name: 'NeetCode 150', family: 'neetcode', expected: 150 },
  { sheet: 'Neetcode 250', id: 'neetcode-250', name: 'NeetCode 250', family: 'neetcode', expected: 250 },
  { sheet: 'LeetCode 75', id: 'leetcode-75', name: 'LeetCode 75', family: 'leetcode-official', expected: 75 },
  { sheet: 'Top Interview 150', id: 'leetcode-top-interview-150', name: 'LeetCode Top Interview 150', family: 'leetcode-official', expected: 150 },
];

/** Grind lists — membership from GRIND_URL (ordered slugs). */
const GRIND_LISTS = [
  { id: 'grind-75', name: 'Grind 75', family: 'blind', expected: 75, take: 75 },
  { id: 'grind-169', name: 'Grind 169', family: 'blind', expected: 169, take: 169 },
];

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** The CSV stores topic tags as a Python-style list literal. */
function parseTopics(raw) {
  if (!raw) return [];
  const out = [];
  for (const m of raw.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
    const value = (m[1] ?? m[2] ?? '').replace(/\\(.)/g, '$1').trim();
    if (value) out.push(value);
  }
  return out;
}

const fetchedAt = new Date().toISOString();

console.log('fetching question metadata…');
const csv = await (await fetch(METADATA_URL)).text();
const meta = parseCsv(csv);

const byId = new Map();
for (const r of meta) {
  const id = (r.frontendQuestionId ?? '').trim();
  const slug = (r.titleSlug ?? '').trim();
  if (!id || !slug) continue;
  byId.set(id, {
    slug,
    title: (r.title ?? '').trim() || slug,
    difficulty: ['Easy', 'Medium', 'Hard'].includes((r.difficulty ?? '').trim()) ? r.difficulty.trim() : null,
    topics: parseTopics(r.topicTags),
    leetcodeId: /^\d+$/.test(id) ? Number(id) : null,
    paidOnly: (r.paidOnly ?? '').trim().toLowerCase() === 'true',
  });
}
console.log(`  ${byId.size} questions`);

const bySlug = new Map([...byId.values()].map((q) => [q.slug, q]));

console.log('fetching curated lists…');
const sheets = await (await fetch(SHEETS_URL)).json();

const lists = [];
const memberships = [];
const usedSlugs = new Set();
const problems = [];

for (const spec of LISTS) {
  const sheet = sheets[spec.sheet];
  if (!sheet) { problems.push(`${spec.sheet}: absent from the source`); continue; }

  const ids = [...new Set(Object.values(sheet).flat().map(String))];
  const missing = ids.filter((id) => !byId.has(id));
  if (ids.length !== spec.expected) {
    problems.push(`${spec.sheet}: ${ids.length} entries, expected ${spec.expected}`);
    continue;
  }
  if (missing.length) {
    problems.push(`${spec.sheet}: ${missing.length} ids could not be matched to a slug`);
    continue;
  }

  lists.push({ id: spec.id, name: spec.name, family: spec.family, source: spec.id, sourceVersion: fetchedAt.slice(0, 10) });
  ids.forEach((id, order) => {
    const slug = byId.get(id).slug;
    usedSlugs.add(slug);
    memberships.push({ listId: spec.id, slug, order });
  });
  console.log(`  ${spec.name}: ${ids.length} verified`);
}

console.log('deriving NeetCode 75 (Blind 75 ∩ NeetCode 150, NeetCode 150 order)…');
{
  const blindSheet = sheets['Blind 75'];
  const n150Sheet = sheets['Neetcode 150'];
  if (!blindSheet || !n150Sheet) {
    problems.push('NeetCode 75: Blind 75 or Neetcode 150 absent from the source');
  } else {
    const blindIds = new Set(Object.values(blindSheet).flat().map(String));
    const n150Ids = [...new Set(Object.values(n150Sheet).flat().map(String))];
    const nc75Ids = n150Ids.filter((id) => blindIds.has(id));
    if (nc75Ids.length !== 75) {
      problems.push(`NeetCode 75: ${nc75Ids.length} entries, expected 75`);
    } else if (blindIds.size !== 75 || ![...blindIds].every((id) => nc75Ids.includes(id))) {
      problems.push('NeetCode 75: intersection does not equal Blind 75');
    } else {
      const missing = nc75Ids.filter((id) => !byId.has(id));
      if (missing.length) {
        problems.push(`NeetCode 75: ${missing.length} ids could not be matched to a slug`);
      } else {
        lists.push({
          id: 'neetcode-75',
          name: 'NeetCode 75',
          family: 'neetcode',
          source: 'neetcode-75',
          sourceVersion: fetchedAt.slice(0, 10),
        });
        nc75Ids.forEach((id, order) => {
          const slug = byId.get(id).slug;
          usedSlugs.add(slug);
          memberships.push({ listId: 'neetcode-75', slug, order });
        });
        console.log(`  NeetCode 75: ${nc75Ids.length} verified`);
      }
    }
  }
}

console.log('fetching Grind 75 / 169 membership…');
const grindRaw = await (await fetch(GRIND_URL)).json();
if (!Array.isArray(grindRaw)) {
  problems.push('Grind template: expected an array of problems');
} else {
  const grindSlugs = [];
  for (const row of grindRaw) {
    const url = typeof row?.url === 'string' ? row.url : '';
    const match = url.match(/leetcode\.com\/problems\/([^/?#]+)/i);
    if (!match) {
      problems.push(`Grind template: could not parse slug from ${url || '(missing url)'}`);
      break;
    }
    grindSlugs.push(match[1]);
  }
  if (!problems.some((p) => p.startsWith('Grind template:'))) {
    if (grindSlugs.length !== 169) {
      problems.push(`Grind template: ${grindSlugs.length} entries, expected 169`);
    }
    const missing = grindSlugs.filter((slug) => !bySlug.has(slug));
    if (missing.length) {
      problems.push(`Grind template: ${missing.length} slugs missing from metadata (e.g. ${missing.slice(0, 3).join(', ')})`);
    }
    if (new Set(grindSlugs).size !== grindSlugs.length) {
      problems.push('Grind template: duplicate slugs');
    }
  }
  if (!problems.some((p) => p.startsWith('Grind'))) {
    for (const spec of GRIND_LISTS) {
      const slugs = grindSlugs.slice(0, spec.take);
      if (slugs.length !== spec.expected) {
        problems.push(`${spec.name}: ${slugs.length} entries, expected ${spec.expected}`);
        continue;
      }
      lists.push({
        id: spec.id,
        name: spec.name,
        family: spec.family,
        source: spec.id,
        sourceVersion: fetchedAt.slice(0, 10),
      });
      slugs.forEach((slug, order) => {
        usedSlugs.add(slug);
        memberships.push({ listId: spec.id, slug, order });
      });
      console.log(`  ${spec.name}: ${slugs.length} verified`);
    }
  }
}

if (problems.length) {
  console.error('\nRefusing to write a pack — source verification failed:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const provenance = {
  questions: { source: METADATA_URL, licence: 'MIT', fetchedAt, note: 'Upstream README states the data was scraped from LeetCode by that dataset’s author.' },
  lists: { source: SHEETS_URL, licence: 'MIT', fetchedAt, note: 'Membership keyed by LeetCode frontendQuestionId and joined locally to slugs.' },
  grind: {
    source: GRIND_URL,
    licence: 'ISC',
    fetchedAt,
    note: 'Ordered Grind 75 pool (169). Grind 75 = first 75; Grind 169 = full list. Origin: techinterviewhandbook.org/grind75. Not scraped from LeetCode.',
  },
  neetcode75: {
    source: SHEETS_URL,
    licence: 'MIT',
    fetchedAt,
    note: 'Blind 75 ∩ NeetCode 150 in NeetCode 150 order (75). Same MIT sheets as Blind / NeetCode lists; not scraped from LeetCode or neetcode.io.',
  },
};

const pack = (id, name, description, questions, packLists, packMemberships) => ({
  format: 'chestha.dsa.pack',
  version: 1,
  id, name, description,
  generatedAt: fetchedAt,
  provenance,
  questions,
  lists: packLists,
  memberships: packMemberships,
});

const curatedQuestions = [...usedSlugs].map((slug) => {
  const q = [...byId.values()].find((v) => v.slug === slug);
  return q;
});

mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(new URL('curated-core.json', OUT_DIR), JSON.stringify(
  pack('curated-core', 'Curated interview lists',
    'Blind 75, Grind 75, Grind 169, NeetCode 75/150/250, LeetCode 75 and Top Interview 150, with the metadata for every question they contain.',
    curatedQuestions, lists, memberships),
));

writeFileSync(new URL('leetcode-index.json', OUT_DIR), JSON.stringify(
  pack('leetcode-index', 'Full LeetCode index',
    'Title, slug, difficulty and topic tags for every public LeetCode problem. No list membership.',
    [...byId.values()], [], []),
));

console.log(`\nwrote curated-core.json  (${curatedQuestions.length} questions, ${lists.length} lists, ${memberships.length} memberships)`);
console.log(`wrote leetcode-index.json (${byId.size} questions)`);
