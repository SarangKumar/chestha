/**
 * The level curve.
 *
 * Going from level L to L+1 costs `100 + 50 * (L - 1)`, so the cumulative cost of
 * reaching level L is a plain quadratic: 25L² + 25L − 50. Levels land on 100, 250,
 * 450, 700, 1 000 … — early ones arrive in a day or two, later ones take a week.
 *
 * The inverse is closed-form rather than a loop, so `levelFromXp` costs the same at
 * 50 XP as at 5 000 000 and can be called from a render without thought.
 */
export const LEVEL_BASE = 100;
export const LEVEL_STEP = 50;

/** XP to go from `level` to the next one. */
export function xpForNextLevel(level) {
  return LEVEL_BASE + LEVEL_STEP * (Math.max(1, Math.floor(level)) - 1);
}

/** Total XP needed to have reached `level`. Level 1 is free. */
export function cumulativeXpForLevel(level) {
  const L = Math.max(1, Math.floor(level));
  return 25 * L * L + 25 * L - 50;
}

/**
 * @returns {{ level: number, into: number, needed: number, nextAt: number }}
 *   `into`/`needed` describe progress through the current level, which is what a
 *   meter wants; `nextAt` is the absolute total the next level lands on.
 */
export function levelFromXp(xp) {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  // Positive root of 25L² + 25L − 50 ≤ total.
  const level = Math.max(1, Math.floor((-25 + Math.sqrt(625 + 100 * (total + 50))) / 50));
  const floor = cumulativeXpForLevel(level);
  const needed = xpForNextLevel(level);
  return { level, into: total - floor, needed, nextAt: floor + needed };
}
