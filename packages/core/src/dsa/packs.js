import { DIFFICULTIES, normalizeTopics } from './questions.js';
import { createList, diffCuratedMemberships } from './lists.js';

export const PACK_FORMAT = 'chestha.dsa.pack';
/** Older packs used pre-rename product slugs. Still accepted on import. */
export const LEGACY_PACK_FORMATS = Object.freeze(['kalpvan.dsa.pack', 'vistaar.dsa.pack']);
export const PACK_VERSION = 1;

function isKnownPackFormat(format) {
  return format === PACK_FORMAT || LEGACY_PACK_FORMATS.includes(format);
}

/**
 * A data pack carries question *facts* (title, slug, difficulty, topic tags) and
 * curated list membership. It never carries problem statements, and it never
 * carries personal progress — that lives in a different storage area entirely,
 * which is what makes refreshing a pack safe.
 *
 * @returns {{ ok: true, pack, summary } | { ok: false, error: string }}
 */
export function parsePack(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'That pack file is empty.' };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `That pack is not valid JSON (${error.message}).` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'That file does not contain a pack object.' };
  }
  if (!isKnownPackFormat(parsed.format)) {
    return {
      ok: false,
      error: parsed.format
        ? `That file reports its format as "${String(parsed.format).slice(0, 40)}", not a Chestha DSA pack.`
        : 'That file is missing its format marker, so it is not a Chestha DSA pack.',
    };
  }
  if (!Number.isInteger(parsed.version)) {
    return { ok: false, error: 'That pack has no version number, so it cannot be read safely.' };
  }
  if (parsed.version > PACK_VERSION) {
    return { ok: false, error: `That pack needs a newer version of Chestha (pack format ${parsed.version}, this build reads ${PACK_VERSION}).` };
  }
  if (!Array.isArray(parsed.questions)) {
    return { ok: false, error: 'That pack has no question list.' };
  }

  const questions = [];
  const slugs = new Set();
  let skipped = 0;
  for (const raw of parsed.questions) {
    if (!raw || typeof raw !== 'object') { skipped += 1; continue; }
    const slug = String(raw.slug ?? '').trim().toLowerCase();
    if (!slug || slugs.has(slug)) { skipped += 1; continue; }
    slugs.add(slug);
    questions.push({
      slug,
      title: String(raw.title ?? '').trim() || slug,
      difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : null,
      topics: normalizeTopics(raw.topics),
      leetcodeId: Number.isInteger(raw.leetcodeId) ? raw.leetcodeId : null,
      paidOnly: raw.paidOnly === true,
    });
  }

  const lists = [];
  const listIds = new Set();
  for (const raw of Array.isArray(parsed.lists) ? parsed.lists : []) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id ?? '').trim();
    const name = String(raw.name ?? '').trim();
    if (!id || !name || listIds.has(id)) continue;
    listIds.add(id);
    lists.push({ id, name, family: String(raw.family ?? '') || null, sourceVersion: String(raw.sourceVersion ?? '') || null });
  }

  const memberships = [];
  const pairs = new Set();
  for (const raw of Array.isArray(parsed.memberships) ? parsed.memberships : []) {
    if (!raw || typeof raw !== 'object') continue;
    const listId = String(raw.listId ?? '').trim();
    const slug = String(raw.slug ?? '').trim().toLowerCase();
    if (!listId || !slug || !listIds.has(listId) || !slugs.has(slug)) continue;
    const key = `${listId}|${slug}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    memberships.push({ listId, slug, order: Number.isFinite(raw.order) ? raw.order : null });
  }

  return {
    ok: true,
    pack: { id: String(parsed.id ?? 'pack'), name: String(parsed.name ?? 'Question pack'), questions, lists, memberships, provenance: parsed.provenance ?? null },
    summary: {
      questions: questions.length,
      lists: lists.length,
      memberships: memberships.length,
      paidOnly: questions.filter((q) => q.paidOnly).length,
      skipped,
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : null,
    },
  };
}

/**
 * Merges a pack into the library. Metadata the user entered or corrected by hand
 * is never clobbered: the pack fills blanks and refreshes imported records, but a
 * manual value wins.
 *
 * @returns {{ library, added, updated, listsAdded, membershipChanges }}
 */
export function applyPack(library, pack, stampISO = new Date().toISOString()) {
  const existing = new Map(library.questions.map((q) => [q.slug, q]));
  let added = 0;
  let updated = 0;

  for (const incoming of pack.questions) {
    const current = existing.get(incoming.slug);
    if (!current) {
      existing.set(incoming.slug, {
        slug: incoming.slug,
        title: incoming.title,
        titleIsGuess: false,
        difficulty: incoming.difficulty,
        topics: incoming.topics,
        leetcodeId: incoming.leetcodeId,
        paidOnly: incoming.paidOnly,
        metadataSource: 'imported',
        verifiedAt: stampISO,
        addedAt: stampISO,
      });
      added += 1;
      continue;
    }

    const manual = current.metadataSource === 'manual';
    const next = {
      ...current,
      // A guessed title is always worth replacing with a real one.
      title: manual && !current.titleIsGuess ? current.title : incoming.title,
      titleIsGuess: manual && !current.titleIsGuess ? current.titleIsGuess : false,
      difficulty: manual && current.difficulty ? current.difficulty : incoming.difficulty,
      topics: manual && current.topics.length ? current.topics : incoming.topics,
      leetcodeId: current.leetcodeId ?? incoming.leetcodeId,
      // Premium status is a platform fact, so the pack is authoritative.
      paidOnly: incoming.paidOnly,
      metadataSource: manual && (current.difficulty || current.topics.length) ? 'manual' : 'imported',
      verifiedAt: stampISO,
    };
    if (JSON.stringify(next) !== JSON.stringify(current)) updated += 1;
    existing.set(incoming.slug, next);
  }

  const lists = [...library.curatedLists];
  const known = new Set(lists.map((l) => l.id));
  let listsAdded = 0;
  for (const incoming of pack.lists) {
    if (known.has(incoming.id)) {
      const at = lists.findIndex((l) => l.id === incoming.id);
      lists[at] = { ...lists[at], name: incoming.name, sourceVersion: incoming.sourceVersion };
      continue;
    }
    lists.push(createList({ id: incoming.id, name: incoming.name, kind: 'curated', source: incoming.id, sourceVersion: incoming.sourceVersion }));
    known.add(incoming.id);
    listsAdded += 1;
  }

  // Each list is diffed, so a refresh reports additions and marks removals
  // instead of deleting memberships the user may have progress against.
  let memberships = library.curatedMemberships;
  const membershipChanges = [];
  for (const list of pack.lists) {
    const slugs = pack.memberships.filter((m) => m.listId === list.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((m) => m.slug);
    const result = diffCuratedMemberships(memberships, list.id, slugs, stampISO);
    memberships = result.memberships;
    if (result.added.length || result.removed.length) {
      membershipChanges.push({ listId: list.id, name: list.name, added: result.added.length, removed: result.removed.length });
    }
  }

  return {
    library: { ...library, questions: [...existing.values()], curatedLists: lists, curatedMemberships: memberships },
    added,
    updated,
    listsAdded,
    membershipChanges,
  };
}
