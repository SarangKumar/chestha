import { newId } from '../ids.js';
import { isValidISODate } from '../dates.js';
import { REWARD_SOURCES, defaultLedger } from './ledger.js';

/**
 * Five areas, split by how often they are written rather than by entity — the same
 * rule the dsa.* areas follow. A website segment arriving every minute rewrites
 * `grove.time` (a few KB) and never the ledger or the garden.
 *
 * It also decides what a storage failure costs. Unlocks and plants live in
 * `grove.garden`, not in the ledger, so the worst case — an unreadable ledger —
 * loses a number and a history, never the garden it paid for.
 */
export const GROVE_AREAS = ['grove.settings', 'grove.time', 'grove.ledger', 'grove.focus', 'grove.garden'];

/**
 * None. The dashboard widget needs the balance, the level and any running session on
 * first paint, so deferring these would only move the wait somewhere more visible.
 */
export const GROVE_LAZY_AREAS = [];

/** Bounds, so no area can grow without limit however long the app is used. */
export const LIMITS = {
  days: 90,          // grove.time, per-day website totals
  seenSegments: 5000,
  sessions: 500,
  plants: 400,
  rules: 200,
};

/**
 * Every tunable number in the reward system lives here rather than in the code that
 * applies it, so a change of economy is a settings edit and not a release.
 */
export const DEFAULT_GROVE_SETTINGS = {
  trackingEnabled: false,   // nothing is observed until it is asked for
  trackingPaused: false,
  idleSeconds: 60,
  rules: [],
  thresholds: [
    { minutes: 15, xp: 5 },
    { minutes: 30, xp: 10 },
    { minutes: 45, xp: 15 },
    { minutes: 60, xp: 20 },
  ],
  dailyWebsiteCapXp: 120,
  dailyTaskCapXp: 120,
  cappedTaskXp: 2,
  taskBaseXp: 10,
  taskPriorityBonus: { high: 5, medium: 2, low: 0, none: 0 },
  focus: {
    defaultMinutes: 25,
    options: [15, 25, 45, 60],
    xpPerMinute: 2,
    completionBonusPct: 25,
    maxEligibleMinutes: 90,
    suspendWebsiteXp: true,
  },
  soundMixId: null,
  chimeOnComplete: true,
};

export const PRIORITY_KEYS = ['high', 'medium', 'low', 'none'];
export const PLANT_STAGES = ['seed', 'sprout', 'young', 'mature'];
export const SESSION_OUTCOMES = ['running', 'completed', 'ended-early', 'recovered', 'abandoned'];

export function defaultGroveSettings() {
  return structuredClone(DEFAULT_GROVE_SETTINGS);
}

export function defaultGroveTime() {
  return { days: {}, seenSegments: [] };
}

export function defaultGroveFocus() {
  return { active: null, sessions: [] };
}

export function defaultGroveGarden() {
  return {
    unlocked: ['plant_sprout', 'env_night'],
    plants: [],
    selectedSpeciesId: 'plant_sprout',
    environmentId: 'env_night',
  };
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
  return Number.isNaN(new Date(v).getTime()) ? null : v;
};

/**
 * A rule's domain is a bare registrable host. Anything carrying a scheme, a path, a
 * port, a space or a credential is not one, and is rejected rather than repaired —
 * guessing what `https://leetcode.com/problems` was meant to mean is how a rule ends
 * up matching something the user never agreed to.
 *
 * `www.` is dropped from both sides at normalisation, so a rule for `github.com`
 * covers `www.github.com` without needing the subdomain switch.
 */
export function cleanDomain(value) {
  const raw = str(value).trim().toLowerCase().replace(/\.+$/, '');
  if (!raw || raw.length > 253) return '';
  if (/[\s/\\:@?#]/.test(raw)) return '';
  const host = raw.startsWith('www.') ? raw.slice(4) : raw;
  // At least two labels, each 1–63 chars of letters, digits or hyphens.
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return '';
  return host;
}

function coerceRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const domain = cleanDomain(raw.domain);
  if (!domain) return null;
  return {
    id: str(raw.id) || newId('rule'),
    domain,
    label: str(raw.label).trim().slice(0, 60) || domain,
    category: str(raw.category).trim().slice(0, 40),
    productive: bool(raw.productive, true),
    includeSubdomains: bool(raw.includeSubdomains, true),
    dailyCapXp: raw.dailyCapXp == null ? null : int(raw.dailyCapXp, null, 0, 10000),
    enabled: bool(raw.enabled, true),
  };
}

/** Ascending, deduplicated by minute, bounded. An out-of-order list would make the
 *  "award every threshold crossed, in order" rule ambiguous. */
function coerceThresholds(raw) {
  if (!Array.isArray(raw)) return structuredClone(DEFAULT_GROVE_SETTINGS.thresholds);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const minutes = int(item.minutes, 0, 1, 24 * 60);
    if (!minutes || seen.has(minutes)) continue;
    seen.add(minutes);
    out.push({ minutes, xp: int(item.xp, 0, 0, 10000) });
    if (out.length >= 12) break;
  }
  if (out.length === 0) return structuredClone(DEFAULT_GROVE_SETTINGS.thresholds);
  return out.sort((a, b) => a.minutes - b.minutes);
}

export function coerceGroveArea(area, raw) {
  switch (area) {
    case 'grove.settings': return coerceSettings(raw);
    case 'grove.time': return coerceTime(raw);
    case 'grove.ledger': return coerceLedger(raw);
    case 'grove.focus': return coerceFocus(raw);
    case 'grove.garden': return coerceGarden(raw);
    default: return { value: null, issues: [`Unknown Grove area "${area}"`] };
  }
}

function coerceSettings(raw) {
  if (!raw || typeof raw !== 'object') return { value: defaultGroveSettings(), issues: [] };
  const d = DEFAULT_GROVE_SETTINGS;
  const rules = [];
  const seenIds = new Set();
  let droppedRules = 0;
  for (const item of Array.isArray(raw.rules) ? raw.rules : []) {
    if (rules.length >= LIMITS.rules) break;
    const rule = coerceRule(item);
    if (!rule) { droppedRules += 1; continue; }
    if (seenIds.has(rule.id)) rule.id = newId('rule');
    seenIds.add(rule.id);
    rules.push(rule);
  }

  const focus = raw.focus && typeof raw.focus === 'object' ? raw.focus : {};
  const bonus = raw.taskPriorityBonus && typeof raw.taskPriorityBonus === 'object' ? raw.taskPriorityBonus : {};
  const options = (Array.isArray(focus.options) ? focus.options : d.focus.options)
    .map((m) => int(m, 0, 1, 180)).filter(Boolean);

  return {
    value: {
      trackingEnabled: bool(raw.trackingEnabled, d.trackingEnabled),
      trackingPaused: bool(raw.trackingPaused, d.trackingPaused),
      idleSeconds: int(raw.idleSeconds, d.idleSeconds, 15, 3600),
      rules,
      thresholds: coerceThresholds(raw.thresholds),
      dailyWebsiteCapXp: int(raw.dailyWebsiteCapXp, d.dailyWebsiteCapXp, 0, 100000),
      dailyTaskCapXp: int(raw.dailyTaskCapXp, d.dailyTaskCapXp, 0, 100000),
      cappedTaskXp: int(raw.cappedTaskXp, d.cappedTaskXp, 0, 1000),
      taskBaseXp: int(raw.taskBaseXp, d.taskBaseXp, 0, 1000),
      taskPriorityBonus: Object.fromEntries(
        PRIORITY_KEYS.map((key) => [key, int(bonus[key], d.taskPriorityBonus[key], 0, 1000)]),
      ),
      focus: {
        defaultMinutes: int(focus.defaultMinutes, d.focus.defaultMinutes, 1, 180),
        options: options.length ? [...new Set(options)].sort((a, b) => a - b) : [...d.focus.options],
        xpPerMinute: int(focus.xpPerMinute, d.focus.xpPerMinute, 0, 100),
        completionBonusPct: int(focus.completionBonusPct, d.focus.completionBonusPct, 0, 500),
        maxEligibleMinutes: int(focus.maxEligibleMinutes, d.focus.maxEligibleMinutes, 1, 1440),
        suspendWebsiteXp: bool(focus.suspendWebsiteXp, d.focus.suspendWebsiteXp),
      },
      soundMixId: raw.soundMixId == null ? null : str(raw.soundMixId).slice(0, 80) || null,
      chimeOnComplete: bool(raw.chimeOnComplete, d.chimeOnComplete),
    },
    issues: droppedRules > 0
      ? [`${droppedRules} website rule${droppedRules === 1 ? '' : 's'} had an unusable domain and ${droppedRules === 1 ? 'was' : 'were'} removed.`]
      : [],
  };
}

function coerceTime(raw) {
  if (!raw || typeof raw !== 'object') return { value: defaultGroveTime(), issues: [] };
  const days = {};
  const entries = Object.entries(raw.days && typeof raw.days === 'object' ? raw.days : {})
    .filter(([day]) => isValidISODate(day))
    .sort(([a], [b]) => (a < b ? 1 : -1))      // newest first, so the prune keeps recent days
    .slice(0, LIMITS.days);

  for (const [day, value] of entries) {
    if (!value || typeof value !== 'object') continue;
    const rules = {};
    for (const [ruleId, record] of Object.entries(value.rules && typeof value.rules === 'object' ? value.rules : {})) {
      if (!record || typeof record !== 'object') continue;
      const awarded = (Array.isArray(record.awarded) ? record.awarded : [])
        .map((m) => int(m, 0, 1, 24 * 60)).filter(Boolean);
      rules[ruleId] = {
        seconds: int(record.seconds, 0, 0, 86400),
        awarded: [...new Set(awarded)].sort((a, b) => a - b),
        focusCoveredSeconds: int(record.focusCoveredSeconds, 0, 0, 86400),
      };
    }
    days[day] = {
      rules,
      // websiteXp is a deliberate cache: the daily cap has to be applied while
      // folding segments, which happens without the ledger in hand. Task XP needs no
      // such thing and is derived from the ledger, so it is not stored here.
      websiteXp: int(value.websiteXp, 0, 0, 1000000),
    };
  }

  const seen = (Array.isArray(raw.seenSegments) ? raw.seenSegments : [])
    .filter((id) => typeof id === 'string' && id.length <= 64);

  return {
    value: { days, seenSegments: seen.slice(-LIMITS.seenSegments) },
    issues: [],
  };
}

function coerceLedger(raw) {
  if (raw == null) return { value: defaultLedger(), issues: [] };
  if (typeof raw !== 'object') {
    return {
      value: defaultLedger(),
      issues: ['Your XP history was unreadable and was reset. Plants and unlocks are stored separately and are unaffected.'],
    };
  }

  const seenIds = new Set();
  const events = [];
  let dropped = 0;
  for (const item of Array.isArray(raw.events) ? raw.events : []) {
    if (!item || typeof item !== 'object') { dropped += 1; continue; }
    const key = str(item.key);
    const at = instant(item.at);
    if (!key || !at) { dropped += 1; continue; }
    let id = str(item.id);
    if (!id || seenIds.has(id)) id = newId('rw');
    seenIds.add(id);
    events.push({
      id,
      key,
      at,
      localDay: isValidISODate(item.localDay) ? item.localDay : at.slice(0, 10),
      source: REWARD_SOURCES.includes(item.source) ? item.source : 'adjustment',
      xp: int(item.xp, 0, -1000000, 1000000),
      seeds: int(item.seeds, 0, -100000, 100000),
      ref: item.ref && typeof item.ref === 'object' ? { ...item.ref } : {},
      reverses: str(item.reverses) || null,
      note: str(item.note).slice(0, 160),
    });
  }

  const rollups = [];
  for (const item of Array.isArray(raw.rollups) ? raw.rollups : []) {
    if (!item || typeof item !== 'object' || !isValidISODate(item.localDay)) continue;
    const bySource = {};
    const source = item.bySource && typeof item.bySource === 'object' ? item.bySource : {};
    for (const name of REWARD_SOURCES) {
      if (name in source) bySource[name] = int(source[name], 0, -1000000, 1000000);
    }
    rollups.push({
      localDay: item.localDay,
      xp: int(item.xp, 0, -1000000, 1000000),
      seeds: int(item.seeds, 0, -100000, 100000),
      bySource,
    });
  }

  // The cached totals are rebuilt from what survived, so a dropped event can never
  // leave a balance that the history cannot account for.
  const lifetimeRaw = raw.lifetime && typeof raw.lifetime === 'object' ? raw.lifetime : {};
  let xp = 0;
  let seeds = 0;
  for (const row of rollups) { xp += row.xp; seeds += row.seeds; }
  for (const event of events) { xp += event.xp; seeds += event.seeds; }

  const issues = [];
  if (dropped > 0) issues.push(`${dropped} unreadable XP record${dropped === 1 ? '' : 's'} were skipped.`);

  return {
    value: {
      events,
      rollups: rollups.sort((a, b) => (a.localDay < b.localDay ? -1 : 1)),
      lifetime: {
        xp: Math.max(0, xp),
        seeds: Math.max(0, seeds),
        seedsSpent: int(lifetimeRaw.seedsSpent, 0, 0, 1000000),
      },
    },
    issues,
  };
}

function coerceSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const startedAt = instant(raw.startedAt);
  if (!startedAt) return null;
  const pauses = [];
  for (const item of Array.isArray(raw.pauses) ? raw.pauses : []) {
    const pausedAt = instant(item?.pausedAt);
    if (!pausedAt) continue;
    pauses.push({ pausedAt, resumedAt: instant(item?.resumedAt) });
    if (pauses.length >= 100) break;
  }
  return {
    id: str(raw.id) || newId('fs'),
    startedAt,
    plannedMinutes: int(raw.plannedMinutes, 25, 1, 180),
    taskId: str(raw.taskId) || null,
    pauses,
    endedAt: instant(raw.endedAt),
    outcome: SESSION_OUTCOMES.includes(raw.outcome) ? raw.outcome : 'running',
    plantInstanceId: str(raw.plantInstanceId) || null,
  };
}

function coerceFocus(raw) {
  if (!raw || typeof raw !== 'object') return { value: defaultGroveFocus(), issues: [] };
  const sessions = [];
  const seen = new Set();
  for (const item of Array.isArray(raw.sessions) ? raw.sessions : []) {
    const session = coerceSession(item);
    if (!session || seen.has(session.id)) continue;
    seen.add(session.id);
    sessions.push(session);
  }
  const active = coerceSession(raw.active);
  return {
    value: {
      // A stored "active" session that already ended is history, not a live timer.
      active: active && active.outcome === 'running' && !active.endedAt ? active : null,
      sessions: sessions.slice(-LIMITS.sessions),
    },
    issues: [],
  };
}

function coerceGarden(raw) {
  if (!raw || typeof raw !== 'object') return { value: defaultGroveGarden(), issues: [] };
  const defaults = defaultGroveGarden();
  const unlocked = new Set(defaults.unlocked);   // the free species and environment are never lost
  for (const id of Array.isArray(raw.unlocked) ? raw.unlocked : []) {
    if (typeof id === 'string' && id.length <= 64) unlocked.add(id);
  }

  const plants = [];
  const seen = new Set();
  for (const item of Array.isArray(raw.plants) ? raw.plants : []) {
    if (!item || typeof item !== 'object') continue;
    const speciesId = str(item.speciesId);
    const plantedAt = instant(item.plantedAt);
    if (!speciesId || !plantedAt) continue;
    let id = str(item.id);
    if (!id || seen.has(id)) id = newId('pl');
    seen.add(id);
    plants.push({
      id,
      speciesId,
      sessionId: str(item.sessionId) || null,
      stage: PLANT_STAGES.includes(item.stage) ? item.stage : 'seed',
      plantedAt,
      x: int(item.x, 0, -1000, 1000),
      y: int(item.y, 0, -1000, 1000),
    });
  }

  return {
    value: {
      unlocked: [...unlocked],
      plants: plants.slice(-LIMITS.plants),
      selectedSpeciesId: str(raw.selectedSpeciesId) || defaults.selectedSpeciesId,
      environmentId: str(raw.environmentId) || defaults.environmentId,
    },
    issues: [],
  };
}
