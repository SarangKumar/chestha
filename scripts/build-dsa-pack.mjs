/**
 * Builds the bundled DSA question packs from public, permissively licensed
 * sources. Run with `node scripts/build-dsa-pack.mjs`.
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
 *   - Company membership: github.com/liquidslr/leetcode-company-wise-problems.
 *     **That repository carries no licence file**, so no licence is granted and
 *     default copyright applies; its own description says the lists come from
 *     LeetCode's company tags, which is a paid LeetCode feature. This is
 *     recorded here rather than buried because it is the one bundled source
 *     whose terms are not permissive, and the decision to ship it was taken
 *     deliberately by the project owner. We consume the published repository
 *     and do not scrape LeetCode ourselves. Only the company→slug mapping and
 *     its ranking order are kept; the per-question Frequency and Acceptance
 *     Rate columns are dropped, since those are the clearly premium-only
 *     numbers and nothing in the app reads them.
 *
 * Only facts are bundled: title, slug, difficulty, topic tags, question id.
 * Problem statements are never included — those are LeetCode's copyrighted text.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const METADATA_URL = 'https://huggingface.co/datasets/kaysss/leetcode-problem-set/resolve/main/data.csv';
const SHEETS_URL = 'https://raw.githubusercontent.com/leetnotion/vscode-leetnotion/HEAD/data/sheets.json';
const GRIND_URL = 'https://raw.githubusercontent.com/jrddp/leet-cli/main/data/grind75_template.json';
const COMPANY_TREE_URL = 'https://api.github.com/repos/liquidslr/leetcode-company-wise-problems/git/trees/main?recursive=1';
const COMPANY_RAW = 'https://raw.githubusercontent.com/liquidslr/leetcode-company-wise-problems/main';
/**
 * One window per company, not all five.
 *
 * The repository publishes Thirty Days / Three Months / Six Months / More Than
 * Six Months / All. "All" is the superset of the other four, and its row order
 * is already the frequency ranking — so taking it alone keeps every question
 * and the ordering signal while shipping a fifth of the bytes. The narrower
 * windows are a recency filter we can derive later from order if it is ever
 * wanted, and five lists per company times 470 companies is 2,350 lists, which
 * no picker can present usefully. The matching file is found in the tree, not
 * by name — see `companyFiles`.
 */
/**
 * Concurrent fetches. 470 sequential requests takes minutes.
 *
 * Five rather than eight: at eight, roughly a tenth of the requests came back
 * `ECONNRESET` — the files all exist, the connections were simply being
 * dropped. Fewer in flight plus the retries below gets a clean run.
 */
const COMPANY_CONCURRENCY = 5;

const OUT_DIR = new URL('../apps/extension/public/dsa-packs/', import.meta.url);

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

/**
 * Fetch with retries.
 *
 * Every source here is a large file or one of several hundred small ones over
 * the public internet, and a dropped connection part-way through is routine —
 * the metadata CSV alone is tens of megabytes. Without this the whole build
 * dies on one `ECONNRESET` after several minutes of successful work, which is
 * the most annoying possible failure. Backoff is linear and short: these are
 * transient transport faults, not rate limits to wait out.
 */
async function fetchWithRetry(url, { attempts = 4, label = url } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const wait = attempt * 1500;
      console.warn(`  retrying ${label} (${attempt}/${attempts - 1}): ${error.message}`);
      await new Promise((resolve) => { setTimeout(resolve, wait); });
    }
  }
  throw new Error(`could not fetch ${label}: ${lastError?.message ?? 'unknown error'}`);
}

const fetchText = async (url, options) => (await fetchWithRetry(url, options)).text();
const fetchJson = async (url, options) => (await fetchWithRetry(url, options)).json();

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

/** The company CSVs spell difficulty in caps; everything else is title case. */
const DIFFICULTY_BY_UPPER = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };

const fetchedAt = new Date().toISOString();

console.log('fetching question metadata…');
const csv = await fetchText(METADATA_URL, { label: 'question metadata' });
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
const sheets = await fetchJson(SHEETS_URL, { label: 'curated sheets' });

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
const grindRaw = await fetchJson(GRIND_URL, { label: 'grind template' });
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

// ─── Company lists ───────────────────────────────────────────────────────────

/** `Beyond Meat` → `company:beyond-meat`. The prefix is what `familyOf` keys on. */
function companyId(name) {
  const slug = name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `company:${slug}` : null;
}

/** `https://leetcode.com/problems/two-sum/` → `two-sum`. */
function slugFromLink(link) {
  const match = String(link ?? '').match(/leetcode\.com\/problems\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/** Run `work` over `items`, at most `limit` at a time. */
async function pooled(items, limit, work) {
  const out = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await work(items[index]);
    }
  }));
  return out;
}

console.log('fetching company list index…');
const tree = await fetchJson(COMPANY_TREE_URL, { label: 'company index' });

if (tree.truncated) {
  // GitHub caps a tree response. Taking a truncated list would silently ship
  // whichever companies happened to come first.
  problems.push('company lists: the source tree came back truncated');
}

/**
 * The exact path of each company's "All" file, from the tree rather than
 * assembled from a guessed filename. Every company currently has one named
 * `5. All.csv`, but a company that gains or loses a window would renumber it,
 * and a guessed path fails as a 404 that looks exactly like a network fault.
 */
const companyFiles = new Map();
for (const entry of tree.tree ?? []) {
  if (entry.type !== 'blob') continue;
  const cut = entry.path.lastIndexOf('/');
  if (cut < 0) continue;
  const dir = entry.path.slice(0, cut);
  const file = entry.path.slice(cut + 1);
  if (!/all\.csv$/i.test(file)) continue;
  if (dir.includes('/')) continue;
  companyFiles.set(dir, entry.path);
}

const companyNames = [...companyFiles.keys()].sort((a, b) => a.localeCompare(b));
if (companyNames.length === 0) {
  problems.push('company lists: the source repository returned no company directories');
}
console.log(`  ${companyNames.length} companies`);

const companyLists = [];
const companyMemberships = [];
const companySlugs = new Set();
// Questions the company lists reference that the metadata index does not know
// about — new problems, mostly. Their facts come from the CSV row itself so a
// company list is never silently short.
const extraQuestions = new Map();
// Two different things, deliberately counted apart. A company whose file
// could not be fetched is a fault. A company whose file is a bare header — 48
// of them are, upstream — is simply a company with no tagged questions, and
// making that an error would mean no pack ships at all.
let companyFailed = 0;
let companyEmpty = 0;
const failedNames = [];

const fetched = await pooled(companyNames, COMPANY_CONCURRENCY, async (name) => {
  // Each path segment is encoded separately: company names contain spaces and
  // the filename contains a space and a dot, and encoding the whole path would
  // escape the separators too.
  const url = `${COMPANY_RAW}/${companyFiles.get(name).split('/').map(encodeURIComponent).join('/')}`;
  try {
    return { name, rows: parseCsv(await fetchText(url, { attempts: 4, label: name })) };
  } catch {
    return { name, rows: null };
  }
});

for (const { name, rows } of fetched) {
  const id = companyId(name);
  if (!id || !rows) { companyFailed += 1; failedNames.push(name); continue; }

  const seen = new Set();
  let order = 0;
  for (const row of rows) {
    const slug = slugFromLink(row.Link);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    if (!bySlug.has(slug) && !extraQuestions.has(slug)) {
      // Facts only, from the row: title, difficulty, topics. The Frequency and
      // Acceptance Rate columns are deliberately not carried over.
      const difficulty = String(row.Difficulty ?? '').trim();
      extraQuestions.set(slug, {
        slug,
        title: String(row.Title ?? '').trim() || slug,
        difficulty: DIFFICULTY_BY_UPPER[difficulty.toUpperCase()] ?? null,
        topics: String(row.Topics ?? '').split(',').map((t) => t.trim()).filter(Boolean),
        leetcodeId: null,
        paidOnly: false,
      });
    }

    companySlugs.add(slug);
    companyMemberships.push({ listId: id, slug, order });
    order += 1;
  }

  // No rows upstream: no list, no error.
  if (seen.size === 0) { companyEmpty += 1; continue; }
  companyLists.push({
    id,
    name,
    family: 'company',
    source: 'leetcode-company-wise',
    sourceVersion: fetchedAt.slice(0, 10),
  });
}

// Every path came from the tree, so each one exists; a failure here is a
// transport fault that four retries could not get past. None are tolerated,
// because shipping a partial company set silently is worse than not shipping
// one — the missing companies would look like companies with no questions.
if (companyFailed > 0) {
  problems.push(`company lists: ${companyFailed} of ${companyNames.length} could not be fetched — ${failedNames.slice(0, 8).join(', ')}${failedNames.length > 8 ? ', …' : ''}`);
}
console.log(`  ${companyLists.length} company lists, ${companyMemberships.length} memberships (${companyEmpty} companies have no questions upstream)`);

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
  companies: {
    source: COMPANY_TREE_URL,
    licence: 'none stated',
    fetchedAt,
    note: 'Company→question mapping from a repository with no licence file, derived upstream from LeetCode company tags (a paid LeetCode feature). Shipped by an explicit decision of the project owner. Only the mapping and its ranking order are kept; the Frequency and Acceptance Rate columns are dropped.',
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

// The company pack carries its own question facts, because it is importable on
// its own: someone who imports only this must still get titles and difficulty
// rather than a list of bare slugs.
const companyQuestions = [...companySlugs].map(
  (slug) => bySlug.get(slug) ?? extraQuestions.get(slug),
).filter(Boolean);

writeFileSync(new URL('companies.json', OUT_DIR), JSON.stringify(
  pack('companies', 'Company question lists',
    'Questions tagged to each company, ordered by how often they are reported. One list per company.',
    companyQuestions, companyLists, companyMemberships),
));

console.log(`\nwrote curated-core.json  (${curatedQuestions.length} questions, ${lists.length} lists, ${memberships.length} memberships)`);
console.log(`wrote leetcode-index.json (${byId.size} questions)`);
console.log(`wrote companies.json      (${companyQuestions.length} questions, ${companyLists.length} companies, ${companyMemberships.length} memberships)`);
