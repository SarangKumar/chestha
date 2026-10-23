import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceArea, describeEvent, describeGithubError, githubEventsUrl, githubProfileUrl,
  isValidGithubUsername, normalizeLines, pickForDay, summariseEvents,
} from '../src/index.js';

// ─── Daily pick ──────────────────────────────────────────────────────────────

test('the daily pick is stable for a date and spreads across dates', () => {
  const lines = ['one', 'two', 'three', 'four'];
  assert.equal(pickForDay(lines, '2026-10-23'), pickForDay(lines, '2026-10-23'), 'same day, same line');
  const week = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']
    .map((d) => pickForDay(lines, d));
  assert.ok(new Set(week).size > 1, 'it does not pin to one line all week');
  assert.ok(week.every((line) => lines.includes(line)));
});

test('the daily pick copes with an empty or single list', () => {
  assert.equal(pickForDay([], '2026-10-23'), null);
  assert.equal(pickForDay(null, '2026-10-23'), null);
  assert.equal(pickForDay(['only'], '2026-10-23'), 'only');
});

test('user-entered lines are trimmed, bounded and stripped of blanks', () => {
  assert.deepEqual(normalizeLines(' a \n\n  b  \n'), ['a', 'b']);
  assert.deepEqual(normalizeLines(['x', '', '   ', 'y']), ['x', 'y']);
  assert.equal(normalizeLines(['a'.repeat(400)])[0].length, 280, 'a single line is capped');
  assert.equal(normalizeLines(Array.from({ length: 80 }, (_, i) => `l${i}`)).length, 50, 'the list is capped');
  assert.deepEqual(normalizeLines(null), []);
});

// ─── GitHub ──────────────────────────────────────────────────────────────────

test('GitHub usernames are validated before any request is made', () => {
  for (const ok of ['octocat', 'a', 'my-name', 'a1-b2']) {
    assert.equal(isValidGithubUsername(ok), true, `${ok} is valid`);
  }
  for (const bad of ['', '-leading', 'trailing-', 'two--dashes', 'has space', 'a'.repeat(40), '../etc']) {
    assert.equal(isValidGithubUsername(bad), false, `${bad} is rejected`);
  }
});

test('request URLs are built safely from the username', () => {
  assert.equal(githubEventsUrl('octocat', 5), 'https://api.github.com/users/octocat/events/public?per_page=5');
  assert.equal(githubProfileUrl('octocat'), 'https://github.com/octocat');
  // Even if validation were bypassed, the value is encoded rather than interpolated raw.
  assert.ok(!githubEventsUrl('a/../b').includes('/../'), 'path segments cannot be escaped');
});

test('the event feed is reduced to counts, repos and a short recent list', () => {
  const summary = summariseEvents([
    { id: '1', type: 'PushEvent', repo: { name: 'me/app' }, payload: { size: 3 }, created_at: '2026-10-23T09:00:00Z' },
    { id: '2', type: 'PushEvent', repo: { name: 'me/app' }, payload: { size: 2 } },
    { id: '3', type: 'PullRequestEvent', repo: { name: 'me/lib' } },
    { id: '4', type: 'IssuesEvent', repo: { name: 'other/thing' } },
    { id: '5', type: 'UnknownEvent', repo: { name: 'me/app' } },
    null,
    { id: '6' },
  ]);

  assert.equal(summary.commits, 5, 'push sizes are summed');
  assert.equal(summary.totals.pushes, 2);
  assert.equal(summary.totals.pullRequests, 1);
  assert.equal(summary.totals.issues, 1);
  assert.equal(summary.repoCount, 3, 'repos are counted uniquely');
  assert.ok(summary.recent.length <= 6);
  assert.ok(summary.recent.every((r) => r.repo), 'an event with no repo is not listed');
});

test('an empty or malformed feed summarises to zero rather than throwing', () => {
  for (const input of [[], null, 'nope', undefined]) {
    const summary = summariseEvents(input);
    assert.equal(summary.commits, 0);
    assert.equal(summary.repoCount, 0);
    assert.deepEqual(summary.recent, []);
  }
});

test('GitHub failures are explained, including the rate limit', () => {
  assert.match(describeGithubError(404), /no such public github user/i);
  assert.match(describeGithubError(403, '0'), /limit.*unauthenticated/i);
  assert.match(describeGithubError(403, '12'), /refused/i);
  assert.match(describeGithubError(502), /trouble/i);
  assert.match(describeGithubError(418), /418/);
  assert.equal(describeEvent('PushEvent'), 'pushed to');
  assert.ok(describeEvent('SomethingNew'), 'an unknown event still reads as something');
});

// ─── Background ──────────────────────────────────────────────────────────────

test('a background image is a local filename and nothing else', () => {
  const read = (background) => coerceArea('settings', { background }).value.background;

  assert.deepEqual(read({ kind: 'image', image: 'wall.jpg', dim: 0.5 }), { kind: 'image', image: 'wall.jpg', dim: 0.5 });

  // None of these may make the app load from outside its own folder.
  for (const bad of ['../../etc/passwd', '/etc/hosts', 'https://example.com/x.jpg', 'data:image/png;base64,AAA']) {
    const result = read({ kind: 'image', image: bad });
    assert.equal(result.image, '', `${bad} is stripped`);
    assert.equal(result.kind, 'none', 'and the mode falls back rather than pointing at nothing');
  }
});

test('an unusable background falls back instead of rendering blank', () => {
  const read = (background) => coerceArea('settings', { background }).value.background;
  assert.equal(read({ kind: 'image' }).kind, 'none', 'image mode with no file is not a background');
  assert.equal(read({ kind: 'nonsense' }).kind, 'none');
  assert.equal(read('rubbish').kind, 'none');
  assert.equal(read(null).kind, 'none');
  assert.equal(read({ kind: 'glow' }).kind, 'glow', 'the generated option needs no file');
});

test('the dim level is clamped so the interface stays readable', () => {
  const dim = (value) => coerceArea('settings', { background: { kind: 'glow', dim: value } }).value.background.dim;
  assert.equal(dim(5), 0.9, 'never fully opaque');
  assert.equal(dim(-1), 0);
  assert.equal(dim('x'), 0.45, 'unparseable falls back to the default');
});

test('settings saved before backgrounds existed still load', () => {
  const { value } = coerceArea('settings', { theme: 'dark', upcomingHorizonDays: 7 });
  assert.deepEqual(value.background, { kind: 'none', image: '', dim: 0.45 });
  assert.equal(value.theme, 'dark', 'existing preferences are untouched');
});
