import { levelFromXp } from './level.js';
import { availableSeeds } from './ledger.js';

/**
 * The catalogue: what there is to own.
 *
 * Deliberately small. Six plants, four decorations, three environments is enough for
 * the loop to mean something and little enough that none of it is filler; the shape
 * here takes more without changing anything else.
 *
 * Two gates, and they do different jobs. A **level** says the content is available —
 * it is earned by everything you do, and can never be lost or spent. **Seeds** are
 * spent, and come only from focus sessions. So XP decides what you may have, seeds
 * decide what you take, and spending never costs you progress.
 */
export const CATALOGUE = [
  { id: 'plant_sprout', kind: 'plant', name: 'Sprout', unlockLevel: 1, seedCost: 0, note: 'Where everyone starts.' },
  { id: 'plant_fern', kind: 'plant', name: 'Fern', unlockLevel: 2, seedCost: 2, note: 'Patient, and happy in shade.' },
  { id: 'plant_bamboo', kind: 'plant', name: 'Bamboo', unlockLevel: 3, seedCost: 3, note: 'Grows in visible steps.' },
  { id: 'plant_cactus', kind: 'plant', name: 'Cactus', unlockLevel: 4, seedCost: 4, note: 'Survives a thin week.' },
  { id: 'plant_blossom', kind: 'plant', name: 'Cherry blossom', unlockLevel: 6, seedCost: 6, note: 'Brief, and worth it.' },
  { id: 'plant_moonflower', kind: 'plant', name: 'Moon flower', unlockLevel: 8, seedCost: 8, note: 'Opens after dark.' },

  { id: 'deco_stone', kind: 'decoration', name: 'Standing stone', unlockLevel: 2, seedCost: 2 },
  { id: 'deco_lantern', kind: 'decoration', name: 'Lantern', unlockLevel: 3, seedCost: 3 },
  { id: 'deco_pond', kind: 'decoration', name: 'Still pond', unlockLevel: 5, seedCost: 5 },
  { id: 'deco_log', kind: 'decoration', name: 'Fallen log', unlockLevel: 7, seedCost: 4 },

  { id: 'env_night', kind: 'environment', name: 'Night', unlockLevel: 1, seedCost: 0 },
  { id: 'env_mist', kind: 'environment', name: 'Mist', unlockLevel: 4, seedCost: 4 },
  { id: 'env_dawn', kind: 'environment', name: 'First light', unlockLevel: 6, seedCost: 6 },
];

export const CATALOGUE_KINDS = ['plant', 'decoration', 'environment'];

export function catalogueItem(id) {
  return CATALOGUE.find((item) => item.id === id) ?? null;
}

export function itemsOfKind(kind) {
  return CATALOGUE.filter((item) => item.kind === kind);
}

export function isUnlocked(garden, id) {
  return garden.unlocked.includes(id);
}

/**
 * Why an item is or is not available, in the words the UI shows. Locked items are
 * always visible with their requirement — locked is a goal, hidden is a mystery.
 */
export function unlockState(ledger, garden, item) {
  if (isUnlocked(garden, item.id)) return { owned: true, available: false, reason: 'Owned' };
  const { level } = levelFromXp(ledger.lifetime.xp);
  const seeds = availableSeeds(ledger);
  if (level < item.unlockLevel) {
    return { owned: false, available: false, reason: `Level ${item.unlockLevel}` };
  }
  if (seeds < item.seedCost) {
    return { owned: false, available: false, reason: `${item.seedCost} seeds · you have ${seeds}` };
  }
  return { owned: false, available: true, reason: `${item.seedCost} seeds` };
}

/**
 * Buys an item. Seeds are recorded as spent rather than deducted from what was
 * earned, so the lifetime totals stay a true record of what the work produced.
 *
 * @returns {{ ok: boolean, garden, ledger, reason: string }}
 */
export function unlockItem(ledger, garden, itemId) {
  const item = catalogueItem(itemId);
  if (!item) return { ok: false, garden, ledger, reason: 'There is no such thing to unlock.' };
  const state = unlockState(ledger, garden, item);
  if (!state.available) return { ok: false, garden, ledger, reason: state.reason };

  return {
    ok: true,
    reason: `${item.name} unlocked`,
    garden: { ...garden, unlocked: [...garden.unlocked, item.id] },
    ledger: {
      ...ledger,
      lifetime: { ...ledger.lifetime, seedsSpent: ledger.lifetime.seedsSpent + item.seedCost },
    },
  };
}

/**
 * Milestones, derived rather than stored — and deliberately not streaks. A counter
 * that resets to zero and says so is a punishment wearing a reward's clothes, and it
 * is the surest way to make a calm app stressful.
 */
export function milestones(sessions, garden) {
  const finished = sessions.filter((s) => s.endedAt);
  const minutes = finished.reduce((sum, s) => {
    const elapsed = (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60000;
    return sum + Math.max(0, Math.min(s.plannedMinutes, Math.round(elapsed)));
  }, 0);
  const longest = finished.reduce((best, s) => Math.max(best, s.plannedMinutes), 0);
  const days = new Set(finished.map((s) => s.endedAt.slice(0, 10)));

  return {
    sessions: finished.length,
    completed: finished.filter((s) => s.outcome === 'completed' || s.outcome === 'recovered').length,
    minutes,
    longestSession: longest,
    daysWithASession: days.size,
    plants: garden.plants.length,
    matured: garden.plants.filter((p) => p.stage === 'mature').length,
  };
}
