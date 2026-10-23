import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendReward, appendRewards, availableSeeds, buildExport, cleanDomain, coerceArea,
  coerceGroveArea, computeLifetime, createStore, cumulativeXpForLevel,
  createSession, defaultLedger, eligibleMinutes, endSession, focusRewards, isPaused,
  levelFromXp, pauseSession, parseImport, reconcileLifetime, recoverSession,
  resumeSession, reverseReward, rollupLedger, sessionProgress, stageForProgress,
  taskReward, xpOnDay, xpForNextLevel,
  MAX_TICK_MS, applySegments, catalogueItem, creditableMs, hostOf,
  isUnlocked, matchRule, splitAtMidnight, unlockItem, unlockState,
} from '../src/index.js';

const DAY = '2026-10-23';

const award = (ledger, patch = {}) => appendReward(ledger, {
  key: 'task:t1', source: 'task', xp: 10, localDay: DAY, at: `${DAY}T09:00:00.000Z`, ...patch,
}).ledger;

// --- the ledger -------------------------------------------------------------

test('a key is paid once, and a retry changes nothing at all', () => {
  const once = award(defaultLedger());
  const retry = appendReward(once, { key: 'task:t1', source: 'task', xp: 10, localDay: DAY });

  assert.equal(retry.duplicate, true);
  assert.equal(retry.event, null);
  assert.equal(retry.ledger, once, 'the same object is returned, so no write is triggered');
  assert.equal(once.lifetime.xp, 10);
});

test('an award without a key is a programming error, not a silent no-op', () => {
  assert.throws(() => appendReward(defaultLedger(), { source: 'task', xp: 10 }), /idempotency key/);
});

test('a reversal cancels the award, keeps the history, and frees the key', () => {
  const earned = award(defaultLedger());
  const { ledger: undone, reversed } = reverseReward(earned, earned.events[0].id);

  assert.equal(reversed, true);
  assert.equal(undone.lifetime.xp, 0);
  assert.equal(undone.events.length, 2, 'the award stays visible alongside its reversal');

  // Undo must not become a punishment: genuinely doing the thing again earns again.
  const again = award(undone, { at: `${DAY}T18:00:00.000Z` });
  assert.equal(again.lifetime.xp, 10);
});

test('reversing the same event twice is refused, and the balance never goes negative', () => {
  const earned = award(defaultLedger());
  const first = reverseReward(earned, earned.events[0].id);
  const second = reverseReward(first.ledger, earned.events[0].id);

  assert.equal(second.reversed, false);
  assert.equal(second.ledger, first.ledger);
  assert.equal(second.ledger.lifetime.xp, 0);
});

test('the cached totals always equal the ledger they summarise', () => {
  let ledger = defaultLedger();
  for (let i = 0; i < 40; i += 1) {
    ledger = appendRewards(ledger, [
      { key: `task:t${i}`, source: 'task', xp: 10 + (i % 3), localDay: DAY },
      { key: `site:r1:${DAY}:${15 * ((i % 4) + 1)}`, source: 'website', xp: 5, localDay: DAY },
      { key: `focus:s${i}:time`, source: 'focus', xp: 50, seeds: 2, localDay: DAY },
      { key: `task:t${i}`, source: 'task', xp: 999, localDay: DAY },   // every retry a duplicate
    ]).ledger;
  }
  const { ledger: reversed } = reverseReward(ledger, ledger.events[0].id);

  assert.deepEqual(reversed.lifetime, { ...computeLifetime(reversed), seedsSpent: 0 });
  assert.equal(reconcileLifetime(reversed), reversed, 'nothing to repair');
  assert.equal(availableSeeds(reversed), 80);
});

test('a drifted cache is repaired from the events', () => {
  const ledger = award(defaultLedger());
  const drifted = { ...ledger, lifetime: { ...ledger.lifetime, xp: 9999 } };
  assert.equal(reconcileLifetime(drifted).lifetime.xp, 10);
});

test('rolling up preserves every total exactly', () => {
  let ledger = defaultLedger();
  ledger = appendRewards(ledger, [
    { key: 'task:old', source: 'task', xp: 10, localDay: '2026-01-01' },
    { key: 'focus:old:time', source: 'focus', xp: 50, seeds: 2, localDay: '2026-01-01' },
    { key: 'site:r1:2026-01-02:15', source: 'website', xp: 5, localDay: '2026-01-02' },
    { key: 'task:new', source: 'task', xp: 10, localDay: DAY },
  ]).ledger;

  const before = ledger.lifetime;
  const rolled = rollupLedger(ledger, '2026-06-01');

  assert.equal(rolled.events.length, 1, 'only recent events stay explorable');
  assert.equal(rolled.rollups.length, 2);
  assert.deepEqual(computeLifetime(rolled), { ...before });
  assert.equal(xpOnDay(rolled, '2026-01-01', 'focus'), 50, 'a rolled-up day can still be queried');
  assert.equal(xpOnDay(rolled, DAY, 'task'), 10);
  assert.equal(rollupLedger(rolled, '2026-06-01'), rolled, 'rolling up again is a no-op');
});

// --- the level curve --------------------------------------------------------

test('levels land exactly on 100, 250, 450 and 700', () => {
  assert.deepEqual([2, 3, 4, 5].map(cumulativeXpForLevel), [100, 250, 450, 700]);
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(99).level, 1);
  assert.equal(levelFromXp(100).level, 2);
  assert.equal(levelFromXp(249).level, 2);
  assert.equal(levelFromXp(700).level, 5);
  assert.equal(levelFromXp(2700).level, 10);
  assert.equal(levelFromXp(2699).level, 9);
});

test('level progress describes the current level, not the whole journey', () => {
  const at = levelFromXp(150);
  assert.deepEqual(at, { level: 2, into: 50, needed: 150, nextAt: 250 });
  assert.equal(xpForNextLevel(1), 100);
  assert.equal(xpForNextLevel(4), 250);
});

test('the inverse agrees with the cost table at every boundary', () => {
  for (let level = 1; level <= 60; level += 1) {
    const floor = cumulativeXpForLevel(level);
    assert.equal(levelFromXp(floor).level, level, `${floor} XP is level ${level}`);
    if (level > 1) assert.equal(levelFromXp(floor - 1).level, level - 1);
  }
});

// --- domains and settings ---------------------------------------------------

test('a domain is a bare host, or it is rejected rather than repaired', () => {
  assert.equal(cleanDomain('LeetCode.com'), 'leetcode.com');
  assert.equal(cleanDomain('www.github.com'), 'github.com');
  assert.equal(cleanDomain('docs.python.org.'), 'docs.python.org');
  for (const bad of [
    'https://leetcode.com', 'leetcode.com/problems', 'leet code.com', 'localhost',
    'com', '', '  ', 'leetcode.com:443', 'user@leetcode.com', '-bad.com',
  ]) {
    assert.equal(cleanDomain(bad), '', `${bad || '(blank)'} is not a domain`);
  }
});

test('unusable rules are dropped with a reason, and good ones keep their shape', () => {
  const { value, issues } = coerceGroveArea('grove.settings', {
    rules: [
      { id: 'rule_a', domain: 'LeetCode.com', label: ' Practice ', category: 'Coding' },
      { domain: 'https://nope.com/x' },
      { id: 'rule_a', domain: 'github.com' },
    ],
  });

  assert.equal(value.rules.length, 2);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /unusable domain/);
  assert.deepEqual(value.rules[0], {
    id: 'rule_a', domain: 'leetcode.com', label: 'Practice', category: 'Coding',
    productive: true, includeSubdomains: true, dailyCapXp: null, enabled: true,
  });
  assert.notEqual(value.rules[1].id, 'rule_a', 'a duplicate id is re-issued, never merged');
});

test('thresholds are always ascending and never duplicated', () => {
  const { value } = coerceGroveArea('grove.settings', {
    thresholds: [{ minutes: 45, xp: 15 }, { minutes: 15, xp: 5 }, { minutes: 45, xp: 99 }],
  });
  assert.deepEqual(value.thresholds, [{ minutes: 15, xp: 5 }, { minutes: 45, xp: 15 }]);
});

test('every Grove area coerces rubbish into something valid without throwing', () => {
  for (const area of ['grove.settings', 'grove.time', 'grove.ledger', 'grove.focus', 'grove.garden']) {
    for (const raw of [undefined, null, 0, 'x', [], { junk: true }, { rules: 'no' }]) {
      const { value } = coerceGroveArea(area, raw);
      assert.ok(value && typeof value === 'object', `${area} survived ${JSON.stringify(raw)}`);
    }
  }
  assert.equal(coerceGroveArea('grove.settings').value.trackingEnabled, false, 'tracking starts off');
});

test('a session that already ended is history, not a live timer', () => {
  const { value } = coerceGroveArea('grove.focus', {
    active: { id: 'fs_1', startedAt: `${DAY}T09:00:00.000Z`, endedAt: `${DAY}T09:25:00.000Z`, outcome: 'completed' },
    sessions: [{ id: 'fs_1', startedAt: `${DAY}T09:00:00.000Z`, plannedMinutes: 25, outcome: 'completed' }],
  });
  assert.equal(value.active, null);
  assert.equal(value.sessions.length, 1);
});

test('the free plant and environment can never be lost', () => {
  const { value } = coerceGroveArea('grove.garden', { unlocked: ['plant_fern'], plants: 'no' });
  assert.deepEqual(value.unlocked.sort(), ['env_night', 'plant_fern', 'plant_sprout']);
  assert.deepEqual(value.plants, []);
});

// --- the whole state --------------------------------------------------------

test('an unreadable ledger costs the history, never the garden', () => {
  const ledger = coerceArea('grove.ledger', 'corrupt');
  const garden = coerceArea('grove.garden', {
    unlocked: ['plant_sprout', 'plant_fern'],
    plants: [{ id: 'pl_1', speciesId: 'plant_fern', stage: 'mature', plantedAt: `${DAY}T09:00:00.000Z` }],
  });

  assert.equal(ledger.value.lifetime.xp, 0);
  assert.match(ledger.issues[0], /stored separately and are unaffected/);
  assert.equal(garden.value.plants.length, 1, 'plants are owned, not computed from XP');
});

test('Grove data round-trips, and older backups still import', async () => {
  const store = createStore();
  await store.init();
  await store.ensureAllAreas();
  store.update('grove.ledger', (l) => award(l, { note: 'Completed “Review PRs”' }));
  store.update('grove.settings', (s) => ({ ...s, rules: [{ domain: 'leetcode.com' }] }));
  await store.flush();

  const payload = buildExport(store.getState());
  assert.equal(payload.version, 3);

  const result = parseImport(JSON.stringify(payload));
  assert.equal(result.ok, true);
  assert.equal(result.summary.groveXp, 10);
  assert.equal(result.summary.websiteRules, 1);
  assert.equal(result.data['grove.ledger'].events[0].note, 'Completed “Review PRs”');

  // A pre-Grove backup must still import, with the new areas defaulted.
  const v2 = {
    format: 'vistaar.workspace', version: 2, exportedAt: new Date().toISOString(),
    data: { tasks: [], tags: [], notes: { text: 'old' }, dashboard: { widgets: [] }, sound: {}, settings: {} },
  };
  const legacy = parseImport(JSON.stringify(v2));
  assert.equal(legacy.ok, true, 'version 2 files still import');
  assert.equal(legacy.data.notes.text, 'old');
  assert.equal(legacy.data['grove.ledger'].lifetime.xp, 0);
  assert.deepEqual(legacy.data['grove.garden'].plants, []);
});

// --- task rewards -----------------------------------------------------------

test('a task is paid once however often it is reopened and finished again', () => {
  const settings = coerceGroveArea('grove.settings').value;
  const task = { id: 'task_1', title: 'Review PRs', priority: 'high' };
  let ledger = defaultLedger();

  for (let i = 0; i < 5; i += 1) {
    ledger = appendReward(ledger, taskReward(settings, ledger, task, DAY)).ledger;
  }
  assert.equal(ledger.lifetime.xp, 15, 'base 10 plus the high-priority 5, once');
  assert.equal(ledger.events.length, 1);
});

test('priority prices the award, and the daily cap softens it rather than stopping it', () => {
  const settings = coerceGroveArea('grove.settings').value;
  let ledger = defaultLedger();
  const prices = [];

  for (let i = 0; i < 14; i += 1) {
    const reward = taskReward(settings, ledger, { id: `task_${i}`, title: 't', priority: 'medium' }, DAY);
    prices.push(reward.xp);
    ledger = appendReward(ledger, reward).ledger;
  }

  assert.equal(prices[0], 12, 'base 10 plus the medium bonus');
  assert.equal(prices[9], 12, 'still full at 108 XP');
  assert.equal(prices[13], 2, 'past 120 XP the award softens, it does not vanish');
  assert.ok(ledger.events.every((e) => e.source === 'task'));
});

// --- focus sessions ---------------------------------------------------------

const START = Date.parse('2026-10-23T09:00:00.000Z');
const after = (minutes) => new Date(START + minutes * 60000).toISOString();
const session25 = () => ({ ...createSession({ plannedMinutes: 25, startedAt: after(0) }), id: 'fs_1' });

test('paused time is excluded to the second, and an open pause keeps counting', () => {
  let session = session25();
  session = pauseSession(session, after(5));
  assert.equal(eligibleMinutes(session, START + 10 * 60000), 5, 'a 5-minute pause earns nothing');

  session = resumeSession(session, after(10));
  assert.equal(eligibleMinutes(session, START + 15 * 60000), 10);
  assert.equal(isPaused(session), false);
});

test('a finished timer left running cannot earn more than it promised', () => {
  const session = session25();
  assert.equal(eligibleMinutes(session, START + 90 * 60000), 25);
  assert.equal(sessionProgress(session, START + 90 * 60000), 1);
});

test('growth stages follow the fraction of the session that was kept', () => {
  const session = session25();
  const stageAt = (minutes) => stageForProgress(sessionProgress(session, START + minutes * 60000));
  assert.deepEqual([stageAt(1), stageAt(7), stageAt(16), stageAt(25)], ['seed', 'sprout', 'young', 'mature']);
});

test('ending early pays the time and withholds the bonus', () => {
  const settings = coerceGroveArea('grove.settings').value;
  const ended = endSession(session25(), { at: after(10) });

  assert.equal(ended.outcome, 'ended-early');
  const rewards = focusRewards(settings, ended);
  assert.equal(rewards.length, 1, 'no bonus event at all, rather than a zero one');
  assert.equal(rewards[0].xp, 20);
  assert.equal(rewards[0].seeds, 0);
});

test('completing in full pays the time, the bonus and a seed', () => {
  const settings = coerceGroveArea('grove.settings').value;
  const ended = endSession(session25(), { at: after(25) });

  assert.equal(ended.outcome, 'completed', 'the outcome is derived, not asserted by the caller');
  const rewards = focusRewards(settings, ended);
  assert.deepEqual(rewards.map((r) => r.xp), [50, 13]);
  assert.equal(rewards[0].seeds, 1);
});

test('a session recovered after a restart matches one that was watched throughout', () => {
  const settings = coerceGroveArea('grove.settings').value;
  const watched = endSession(session25(), { at: after(25) });
  const recovered = recoverSession(session25(), START + 3 * 60 * 60 * 1000);

  assert.equal(recovered.outcome, 'recovered');
  assert.equal(recovered.endedAt, watched.endedAt, 'it ends when it would have ended, not when it was found');
  assert.deepEqual(
    focusRewards(settings, recovered).map((r) => r.xp),
    focusRewards(settings, watched).map((r) => r.xp),
  );
});

test('settling a recovered session twice pays once', () => {
  const settings = coerceGroveArea('grove.settings').value;
  const recovered = recoverSession(session25(), START + 3 * 60 * 60 * 1000);
  const rewards = focusRewards(settings, recovered);

  let ledger = appendRewards(defaultLedger(), rewards).ledger;
  const paid = ledger.lifetime.xp;
  ledger = appendRewards(ledger, rewards).ledger;      // a second tab, a second reload
  assert.equal(ledger.lifetime.xp, paid);
});

test('a session left open overnight is written off with the time it earned', () => {
  const settings = coerceGroveArea('grove.settings').value;
  let session = session25();
  session = pauseSession(session, after(8));           // paused, so it never completes
  const abandoned = recoverSession(session, START + 20 * 60 * 60 * 1000);

  assert.equal(abandoned.outcome, 'abandoned');
  const rewards = focusRewards(settings, abandoned);
  assert.equal(rewards.length, 1, 'time only — the clock reached the end, not the person');
  assert.equal(rewards[0].xp, 16);
});

test('a session still within its window is left alone', () => {
  const session = session25();
  assert.equal(recoverSession(session, START + 60000), session, 'the same object, so no write happens');
});

// --- domain matching --------------------------------------------------------

const rule = (domain, patch = {}) => ({
  id: `rule_${domain}`, domain, label: domain, category: '', productive: true,
  includeSubdomains: true, dailyCapXp: null, enabled: true, ...patch,
});

test('a rule matches on label boundaries, never on substrings', () => {
  const rules = [rule('leetcode.com')];
  assert.equal(matchRule(rules, 'leetcode.com').domain, 'leetcode.com');
  assert.equal(matchRule(rules, 'contest.leetcode.com').domain, 'leetcode.com');
  for (const host of ['notleetcode.com', 'myleetcode.com', 'leetcode.com.evil.test', 'leetcode.co']) {
    assert.equal(matchRule(rules, host), null, `${host} must not match`);
  }
});

test('subdomains only count when the rule says so', () => {
  const rules = [rule('github.com', { includeSubdomains: false })];
  assert.equal(matchRule(rules, 'github.com').domain, 'github.com');
  assert.equal(matchRule(rules, 'gist.github.com'), null);
});

test('the most specific rule wins, whatever order they are in', () => {
  const rules = [rule('youtube.com'), rule('music.youtube.com')];
  assert.equal(matchRule(rules, 'music.youtube.com').domain, 'music.youtube.com');
  assert.equal(matchRule([...rules].reverse(), 'music.youtube.com').domain, 'music.youtube.com');
  assert.equal(matchRule(rules, 'www.youtube.com').domain, 'youtube.com');
  assert.equal(matchRule([rule('x.com', { enabled: false })], 'x.com'), null, 'a disabled rule never wins');
});

test('only ordinary web pages can belong to a rule', () => {
  assert.equal(hostOf('https://www.LeetCode.com/problems/two-sum?x=1#y'), 'leetcode.com');
  for (const url of ['chrome://settings', 'chrome-extension://abc/index.html', 'file:///tmp/x.html', 'about:blank', 'not a url']) {
    assert.equal(hostOf(url), '', `${url} is never attributed`);
  }
});

// --- accrual ----------------------------------------------------------------

const settingsWith = (rules, patch = {}) => ({
  ...coerceGroveArea('grove.settings', { rules, ...patch }).value,
});
const seg = (patch) => ({ id: `seg_${Math.random()}`, host: 'leetcode.com', localDay: DAY, seconds: 60, closedAt: `${DAY}T09:00:00.000Z`, ...patch });

test('an interval is clamped, and a clock moved backwards credits nothing', () => {
  assert.equal(creditableMs(1000, 61_000), 60_000);
  assert.equal(creditableMs(1000, 10_000_000), MAX_TICK_MS, 'a sleeping worker cannot farm XP');
  assert.equal(creditableMs(61_000, 1000), 0, 'a backwards clock fabricates nothing');
});

test('an interval spanning midnight is split into the days it happened in', () => {
  const start = new Date(2026, 9, 23, 23, 50).getTime();
  const parts = splitAtMidnight(start, start + 20 * 60000);
  assert.deepEqual(parts.map((p) => p.localDay), ['2026-10-23', '2026-10-24']);
  assert.equal(parts[0].seconds + parts[1].seconds, 1200);
});

test('time accumulates across visits and pays every threshold it crosses, in order', () => {
  const settings = settingsWith([rule('leetcode.com')]);
  let time = coerceGroveArea('grove.time').value;

  // Four separate visits of 14 minutes: the first pays nothing, the rest cross in turn.
  const xp = [];
  for (let i = 0; i < 5; i += 1) {
    const result = applySegments(settings, time, [seg({ seconds: 14 * 60, closedAt: `${DAY}T1${i}:00:00.000Z` })]);
    time = result.time;
    xp.push(result.rewards.reduce((sum, r) => sum + r.xp, 0));
  }
  assert.deepEqual(xp, [0, 5, 10, 15, 20], 'thresholds pay once each, as they are reached');
  assert.equal(time.days[DAY].websiteXp, 50);
});

test('a single late reconciliation pays exactly what minute-by-minute would have', () => {
  const settings = settingsWith([rule('leetcode.com')]);
  const time = coerceGroveArea('grove.time').value;
  const result = applySegments(settings, time, [seg({ seconds: 61 * 60 })]);

  assert.deepEqual(result.rewards.map((r) => r.ref.minutes), [15, 30, 45, 60]);
  assert.equal(result.rewards.reduce((s, r) => s + r.xp, 0), 50);
  assert.equal(result.time.days[DAY].rules['rule_leetcode.com'].seconds, 3660);
});

test('past sixty minutes a site earns nothing more that day', () => {
  const settings = settingsWith([rule('leetcode.com')]);
  const first = applySegments(settings, coerceGroveArea('grove.time').value, [seg({ seconds: 60 * 60 })]);
  const second = applySegments(settings, first.time, [seg({ seconds: 60 * 60, closedAt: `${DAY}T18:00:00.000Z` })]);
  assert.deepEqual(second.rewards, [], 'a tab left open all day cannot keep earning');
});

test('a re-drained segment credits nothing, however often it arrives', () => {
  const settings = settingsWith([rule('leetcode.com')]);
  const segment = seg({ seconds: 20 * 60 });
  const first = applySegments(settings, coerceGroveArea('grove.time').value, [segment]);
  const second = applySegments(settings, first.time, [segment, segment]);

  assert.equal(first.rewards.length, 1);
  assert.deepEqual(second.rewards, []);
  assert.deepEqual(second.accepted, []);
  assert.equal(second.time.days[DAY].rules['rule_leetcode.com'].seconds, 1200, 'the seconds are not doubled either');
});

test('the global daily cap holds however many sites are configured', () => {
  const rules = ['a.com', 'b.com', 'c.com'].map((d) => rule(d));
  const settings = settingsWith(rules);
  let time = coerceGroveArea('grove.time').value;
  let total = 0;
  for (const host of ['a.com', 'b.com', 'c.com']) {
    const result = applySegments(settings, time, [seg({ host, seconds: 60 * 60 })]);
    time = result.time;
    total += result.rewards.reduce((sum, r) => sum + r.xp, 0);
  }
  assert.equal(total, 120, 'two sites at 50 plus 20 of the third, then the cap');
});

test('time inside a focus session is recorded for the history and earns nothing', () => {
  const settings = settingsWith([rule('leetcode.com')]);
  const result = applySegments(settings, coerceGroveArea('grove.time').value, [seg({ seconds: 30 * 60, duringFocus: true })]);

  assert.deepEqual(result.rewards, [], 'the session is how that time is paid for');
  const record = result.time.days[DAY].rules['rule_leetcode.com'];
  assert.equal(record.focusCoveredSeconds, 1800);
  assert.equal(record.seconds, 0);
});

test('a host with no rule is not recorded at all', () => {
  const settings = settingsWith([rule('leetcode.com')]);
  const result = applySegments(settings, coerceGroveArea('grove.time').value, [seg({ host: 'reddit.com', seconds: 3600 })]);
  assert.deepEqual(result.rewards, []);
  assert.deepEqual(result.time.days, {}, 'nothing about an unconfigured site is kept');
});

test('a rule marked not productive is tracked and never paid', () => {
  const settings = settingsWith([rule('news.com', { productive: false })]);
  const result = applySegments(settings, coerceGroveArea('grove.time').value, [seg({ host: 'news.com', seconds: 3600 })]);
  assert.deepEqual(result.rewards, []);
  assert.equal(result.time.days[DAY].rules['rule_news.com'].seconds, 3600);
});

// --- the garden -------------------------------------------------------------

test('a level gates what is available and seeds pay for it, and XP never drops', () => {
  const garden = coerceGroveArea('grove.garden').value;
  let ledger = defaultLedger();
  ledger = appendReward(ledger, { key: 'focus:s1:time', source: 'focus', xp: 600, seeds: 6, localDay: DAY }).ledger;

  const fern = catalogueItem('plant_fern');
  assert.equal(unlockState(ledger, garden, fern).available, true);

  const result = unlockItem(ledger, garden, 'plant_fern');
  assert.equal(result.ok, true);
  assert.equal(result.ledger.lifetime.xp, 600, 'spending seeds cannot cost XP');
  assert.equal(availableSeeds(result.ledger), 4);
  assert.equal(isUnlocked(result.garden, 'plant_fern'), true);

  const again = unlockItem(result.ledger, result.garden, 'plant_fern');
  assert.equal(again.ok, false, 'owning something twice is not a thing');
});

test('an item above your level is visible with its requirement, not hidden', () => {
  const garden = coerceGroveArea('grove.garden').value;
  const ledger = appendReward(defaultLedger(), { key: 'k', source: 'focus', xp: 10, seeds: 50, localDay: DAY }).ledger;
  const state = unlockState(ledger, garden, catalogueItem('plant_moonflower'));

  assert.equal(state.available, false);
  assert.equal(state.reason, 'Level 8', 'the requirement is the message');
  assert.equal(unlockItem(ledger, garden, 'plant_moonflower').ok, false);
});
