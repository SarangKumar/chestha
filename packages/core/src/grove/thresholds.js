/**
 * Threshold crossings.
 *
 * Rewards are incremental: each threshold is its own event with its own key, paid the
 * moment it is crossed. A reconciliation that lands twenty minutes at once pays every
 * threshold that span crosses, in ascending order, as separate events — the same
 * result as if they had been crossed one at a time, which is what makes a suspended
 * service worker indistinguishable from an attentive one.
 */

/** Thresholds reached by `seconds` that have not been paid yet, ascending. */
export function crossedThresholds(thresholds, awarded, seconds) {
  const paid = new Set(awarded ?? []);
  return thresholds
    .filter((t) => seconds >= t.minutes * 60 && !paid.has(t.minutes))
    .sort((a, b) => a.minutes - b.minutes);
}

/**
 * Reward inputs for one rule's new total on one day, honouring both caps.
 *
 * A capped award is still marked as paid: the threshold was reached, and leaving it
 * unmarked would make it fire again the moment the cap reset.
 *
 * @returns {{ rewards: object[], awarded: number[], xp: number }}
 */
export function websiteRewards({ settings, rule, localDay, seconds, awarded, dayWebsiteXp }) {
  const crossed = crossedThresholds(settings.thresholds, awarded, seconds);
  const rewards = [];
  const marked = [...(awarded ?? [])];
  let spent = 0;

  const globalRoom = () => Math.max(0, settings.dailyWebsiteCapXp - dayWebsiteXp - spent);
  const ruleRoom = () => (rule.dailyCapXp == null
    ? Infinity
    : Math.max(0, rule.dailyCapXp - ruleXpSoFar(settings, awarded) - spent));

  for (const threshold of crossed) {
    marked.push(threshold.minutes);
    const xp = Math.min(threshold.xp, globalRoom(), ruleRoom());
    if (xp <= 0) continue;
    spent += xp;
    rewards.push({
      key: `site:${rule.id}:${localDay}:${threshold.minutes}`,
      source: 'website',
      xp,
      localDay,
      ref: { ruleId: rule.id, minutes: threshold.minutes },
      note: `${threshold.minutes} minutes on ${rule.domain}`,
    });
  }

  return { rewards, awarded: marked.sort((a, b) => a - b), xp: spent };
}

/** What this rule has already been paid today, from the thresholds it has crossed. */
function ruleXpSoFar(settings, awarded) {
  const paid = new Set(awarded ?? []);
  return settings.thresholds.reduce((sum, t) => (paid.has(t.minutes) ? sum + t.xp : sum), 0);
}
