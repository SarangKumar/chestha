import { newId } from '../ids.js';
import { isValidISODate } from '../dates.js';
import { DIFFICULTIES, METADATA_SOURCES, normalizeTopics, topicKey } from './questions.js';
import { EVENT_KINDS } from './events.js';
import { LIST_KINDS } from './lists.js';
import { createSchedule } from './revision.js';

/**
 * Four areas, split by how often they are written rather than by entity. This
 * keeps every hot write small: rating a question's confidence rewrites `progress`
 * (a few KB), never the 3,000-question library.
 *
 * It also keeps imported library metadata in a different record from personal
 * history, so refreshing a question pack cannot erase progress.
 */
export const DSA_AREAS = ['dsa.library', 'dsa.progress', 'dsa.lists', 'dsa.settings'];

/** The library can be large and most sessions never open the DSA section. */
export const DSA_LAZY_AREAS = ['dsa.library'];

export const DEFAULT_DSA_SETTINGS = {
  dailyNewTarget: 2,
  dailyRevisionTarget: 3,
  topicState: {},
  lastPackImport: null,
};

export function defaultDsaLibrary() {
  return { questions: [], curatedLists: [], curatedMemberships: [] };
}

export function defaultDsaProgress() {
  return { events: [], schedules: {}, questionState: {} };
}

export function defaultDsaLists() {
  return { lists: [], memberships: [] };
}

export function defaultDsaSettings() {
  return { ...DEFAULT_DSA_SETTINGS, topicState: {} };
}

const str = (v, f = '') => (typeof v === 'string' ? v : f);
const bool = (v, f = false) => (typeof v === 'boolean' ? v : f);
const int = (v, f, min, max) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return f;
  return Math.min(max, Math.max(min, n));
};
const instant = (v) => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : v;
};

export function coerceDsaArea(area, raw) {
  switch (area) {
    case 'dsa.library': return coerceLibrary(raw);
    case 'dsa.progress': return coerceProgress(raw);
    case 'dsa.lists': return coerceLists(raw);
    case 'dsa.settings': return coerceSettings(raw);
    default: return { value: null, issues: [`Unknown DSA area "${area}"`] };
  }
}

function coerceLibrary(raw) {
  const issues = [];
  if (raw == null) return { value: defaultDsaLibrary(), issues };
  if (typeof raw !== 'object') {
    return { value: defaultDsaLibrary(), issues: ['The DSA question library was unreadable and was reset. Personal progress is stored separately and is unaffected.'] };
  }

  // Slug is identity: a duplicate slug is a duplicate question record, so the
  // first one wins and the rest are dropped rather than silently merged.
  const seen = new Set();
  const questions = [];
  let dropped = 0;
  for (const item of Array.isArray(raw.questions) ? raw.questions : []) {
    if (!item || typeof item !== 'object') { dropped += 1; continue; }
    const slug = str(item.slug).trim().toLowerCase();
    if (!slug || seen.has(slug)) { dropped += 1; continue; }
    seen.add(slug);
    questions.push({
      slug,
      title: str(item.title).trim() || slug,
      titleIsGuess: bool(item.titleIsGuess, false),
      difficulty: DIFFICULTIES.includes(item.difficulty) ? item.difficulty : null,
      topics: normalizeTopics(item.topics),
      leetcodeId: Number.isInteger(item.leetcodeId) ? item.leetcodeId : null,
      paidOnly: item.paidOnly === true,
      metadataSource: METADATA_SOURCES.includes(item.metadataSource) ? item.metadataSource : 'manual',
      verifiedAt: instant(item.verifiedAt),
      addedAt: instant(item.addedAt) ?? new Date().toISOString(),
    });
  }
  if (dropped > 0) issues.push(`${dropped} unreadable or duplicate question record${dropped === 1 ? '' : 's'} were skipped.`);

  const listIds = new Set();
  const curatedLists = [];
  for (const item of Array.isArray(raw.curatedLists) ? raw.curatedLists : []) {
    if (!item || typeof item !== 'object') continue;
    const id = str(item.id).trim();
    const name = str(item.name).trim();
    if (!id || !name || listIds.has(id)) continue;
    listIds.add(id);
    curatedLists.push({
      id, name,
      description: str(item.description),
      kind: 'curated',
      source: str(item.source) || id,
      sourceVersion: str(item.sourceVersion) || null,
      createdAt: instant(item.createdAt) ?? new Date().toISOString(),
    });
  }

  const curatedMemberships = coerceMemberships(raw.curatedMemberships, seen, listIds);
  return { value: { questions, curatedLists, curatedMemberships }, issues };
}

function coerceMemberships(raw, knownSlugs, knownListIds) {
  if (!Array.isArray(raw)) return [];
  const pairs = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const listId = str(item.listId).trim();
    const slug = str(item.slug).trim().toLowerCase();
    if (!listId || !slug) continue;
    // Memberships pointing at questions or lists that do not exist are dangling
    // references, and would show as phantom entries in list completion.
    if (knownSlugs && !knownSlugs.has(slug)) continue;
    if (knownListIds && !knownListIds.has(listId)) continue;
    const key = `${listId}|${slug}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    out.push({
      listId, slug,
      order: Number.isFinite(item.order) ? item.order : null,
      addedAt: instant(item.addedAt) ?? new Date().toISOString(),
      removedFromSource: instant(item.removedFromSource),
    });
  }
  return out;
}

function coerceProgress(raw) {
  const issues = [];
  if (raw == null) return { value: defaultDsaProgress(), issues };
  if (typeof raw !== 'object') {
    return { value: defaultDsaProgress(), issues: ['DSA solving history was unreadable and was reset.'] };
  }

  const ids = new Set();
  const events = [];
  let dropped = 0;
  for (const item of Array.isArray(raw.events) ? raw.events : []) {
    if (!item || typeof item !== 'object') { dropped += 1; continue; }
    const slug = str(item.slug).trim().toLowerCase();
    const at = instant(item.at);
    if (!slug || !at) { dropped += 1; continue; }
    let id = str(item.id);
    if (!id || ids.has(id)) id = newId('ev');
    ids.add(id);
    events.push({
      id, slug,
      kind: EVENT_KINDS.includes(item.kind) ? item.kind : 'solve',
      at,
      assisted: bool(item.assisted, false),
      confidence: [1, 2, 3, 4].includes(Number(item.confidence)) ? Number(item.confidence) : null,
      notes: str(item.notes),
    });
  }
  if (dropped > 0) issues.push(`${dropped} unreadable solving event${dropped === 1 ? '' : 's'} were skipped.`);

  const schedules = {};
  if (raw.schedules && typeof raw.schedules === 'object') {
    for (const [slug, value] of Object.entries(raw.schedules)) {
      if (!value || typeof value !== 'object') continue;
      const nextDue = isValidISODate(value.nextDue) ? value.nextDue : null;
      schedules[slug.toLowerCase()] = createSchedule({ ...value, nextDue });
    }
  }

  const questionState = {};
  if (raw.questionState && typeof raw.questionState === 'object') {
    for (const [slug, value] of Object.entries(raw.questionState)) {
      if (!value || typeof value !== 'object') continue;
      questionState[slug.toLowerCase()] = {
        bookmarked: bool(value.bookmarked, false),
        priority: int(value.priority, 0, -2, 2),
        notes: str(value.notes),
      };
    }
  }

  return { value: { events, schedules, questionState }, issues };
}

function coerceLists(raw) {
  if (!raw || typeof raw !== 'object') return { value: defaultDsaLists(), issues: [] };
  const ids = new Set();
  const lists = [];
  for (const item of Array.isArray(raw.lists) ? raw.lists : []) {
    if (!item || typeof item !== 'object') continue;
    const name = str(item.name).trim();
    if (!name) continue;
    let id = str(item.id).trim();
    if (!id || ids.has(id)) id = newId('list');
    ids.add(id);
    lists.push({
      id, name,
      description: str(item.description),
      kind: LIST_KINDS.includes(item.kind) ? item.kind : 'personal',
      source: null,
      sourceVersion: null,
      createdAt: instant(item.createdAt) ?? new Date().toISOString(),
    });
  }
  // Personal memberships may reference questions the library has not loaded yet,
  // so they are not filtered against a slug set here.
  return { value: { lists, memberships: coerceMemberships(raw.memberships, null, ids) }, issues: [] };
}

function coerceSettings(raw) {
  if (!raw || typeof raw !== 'object') return { value: defaultDsaSettings(), issues: [] };
  const topicState = {};
  if (raw.topicState && typeof raw.topicState === 'object') {
    for (const [key, value] of Object.entries(raw.topicState)) {
      if (!value || typeof value !== 'object') continue;
      topicState[topicKey(key)] = {
        weak: bool(value.weak, false),
        dismissed: bool(value.dismissed, false),
        note: str(value.note),
      };
    }
  }
  return {
    value: {
      dailyNewTarget: int(raw.dailyNewTarget, DEFAULT_DSA_SETTINGS.dailyNewTarget, 0, 50),
      dailyRevisionTarget: int(raw.dailyRevisionTarget, DEFAULT_DSA_SETTINGS.dailyRevisionTarget, 0, 50),
      topicState,
      lastPackImport: instant(raw.lastPackImport),
    },
    issues: [],
  };
}
