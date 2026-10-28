import { newId } from '../ids.js';

export const LIST_KINDS = ['curated', 'personal'];

/**
 * Curated lists are grouped into families because they are not independent
 * opinions: NeetCode 150 extends Blind 75, NeetCode 250 extends 150, and Grind 75
 * descends from Blind 75. Counting raw list membership would charge one editorial
 * judgement several times over and systematically over-rank classic easy problems.
 */
export const LIST_FAMILIES = {
  'blind-75': 'blind',
  'grind-75': 'blind',
  'grind-169': 'blind',
  'neetcode-75': 'neetcode',
  'neetcode-150': 'neetcode',
  'neetcode-250': 'neetcode',
  'leetcode-75': 'leetcode-official',
  'leetcode-top-interview-150': 'leetcode-official',
  'striver-a2z': 'striver',
  'striver-sde': 'striver',
};

export function familyOf(listId) {
  return LIST_FAMILIES[listId] ?? `other:${listId}`;
}

export function createList(input = {}) {
  const kind = LIST_KINDS.includes(input.kind) ? input.kind : 'personal';
  const name = String(input.name ?? '').trim();
  if (!name) return null;
  return {
    id: String(input.id ?? '').trim() || newId('list'),
    name,
    description: String(input.description ?? ''),
    kind,
    source: typeof input.source === 'string' ? input.source : null,
    sourceVersion: typeof input.sourceVersion === 'string' ? input.sourceVersion : null,
    createdAt: new Date().toISOString(),
  };
}

export function createMembership(listId, slug, extra = {}) {
  return {
    listId,
    slug,
    order: Number.isFinite(extra.order) ? extra.order : null,
    addedAt: new Date().toISOString(),
    removedFromSource: typeof extra.removedFromSource === 'string' ? extra.removedFromSource : null,
  };
}

export function hasMembership(memberships, listId, slug) {
  return memberships.some((m) => m.listId === listId && m.slug === slug);
}

export function membershipsOfList(memberships, listId) {
  return memberships.filter((m) => m.listId === listId);
}

export function listsContaining(memberships, slug) {
  return memberships.filter((m) => m.slug === slug).map((m) => m.listId);
}

/**
 * Removing a membership touches memberships only. Solving history lives in a
 * different area entirely, so it cannot be collaterally affected.
 */
export function removeMembership(memberships, listId, slug) {
  return memberships.filter((m) => !(m.listId === listId && m.slug === slug));
}

export function removeList(memberships, listId) {
  return memberships.filter((m) => m.listId !== listId);
}

export function reorderMembership(memberships, listId, slug, order) {
  return memberships.map((m) => (m.listId === listId && m.slug === slug ? { ...m, order } : m));
}

/** List frequency, reported both raw and family-weighted so the UI can show both. */
export function listFrequency(curatedMemberships, slug) {
  const lists = curatedMemberships.filter((m) => m.slug === slug && !m.removedFromSource).map((m) => m.listId);
  const families = new Set(lists.map(familyOf));
  return { lists: lists.length, families: families.size, listIds: lists };
}

/**
 * Refreshing a curated source is a membership diff, never a delete: a question the
 * user has progress on is marked as dropped from the source and reported, so
 * completion percentages never change silently.
 */
export function diffCuratedMemberships(existing, listId, incomingSlugs, stampISO) {
  const current = existing.filter((m) => m.listId === listId);
  const currentSlugs = new Set(current.map((m) => m.slug));
  const incoming = new Set(incomingSlugs);

  const added = incomingSlugs.filter((slug) => !currentSlugs.has(slug));
  const removed = current.filter((m) => !incoming.has(m.slug) && !m.removedFromSource).map((m) => m.slug);

  const others = existing.filter((m) => m.listId !== listId);
  const kept = current.map((m) => (
    incoming.has(m.slug)
      ? { ...m, removedFromSource: null }
      : { ...m, removedFromSource: m.removedFromSource ?? stampISO }
  ));
  const fresh = added.map((slug, i) => createMembership(listId, slug, { order: incomingSlugs.indexOf(slug) ?? i }));

  return { memberships: [...others, ...kept, ...fresh], added, removed };
}
