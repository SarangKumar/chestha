import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GITHUB_FORMS, HIDEABLE_SECTIONS, TEMPERATURE_UNITS, activityDayLabels, activityLevel,
  activityMonthLabels, buildActivityCalendar, buildContributionYearCalendar,
  coerceArea, coerceGithubForm, coerceTemperatureUnit, coerceWeatherPlace, describeCondition,
  describeEvent, describeGithubError, describePlace, forecastUrl, formatTemperature, geocodeUrl,
  githubContributionsUrl, githubEventsUrl, githubProfileUrl, githubReposUrl, isValidGithubUsername, normalizeLines,
  pickForDay, shortAge, summariseEvents, summariseGeocode, summariseRepos, summariseWeather,
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
  assert.deepEqual(value.hiddenSections, [], 'nothing is hidden by default');
  assert.equal(value.glass, 0.55, 'and the glass level has a default');
});

// ─── Hidden sidebar sections ─────────────────────────────────────────────────

const hiddenFrom = (raw) => coerceArea('settings', { hiddenSections: raw }).value.hiddenSections;

test('only real, hideable sections can be hidden', () => {
  assert.deepEqual(hiddenFrom(['sounds', 'dsa']), ['dsa', 'sounds'], 'stored in a fixed order');
  assert.deepEqual(hiddenFrom(['nonsense', 'sounds']), ['sounds'], 'unknown ids are dropped');
  assert.deepEqual(hiddenFrom('sounds'), [], 'a non-list resets rather than throwing');
  assert.deepEqual(hiddenFrom(null), []);

  // Settings is the way back to this very switch, so it is not hideable.
  assert.ok(!HIDEABLE_SECTIONS.includes('settings'));
  assert.deepEqual(hiddenFrom(['settings']), [], 'and asking for it is ignored');
});

test('the last visible section cannot be hidden, so the rail is never empty', () => {
  const all = hiddenFrom([...HIDEABLE_SECTIONS]);
  assert.equal(all.length, HIDEABLE_SECTIONS.length - 1, 'one survives');
  assert.ok(HIDEABLE_SECTIONS.some((id) => !all.includes(id)));
});

test('the glass level is clamped to a fraction', () => {
  const glass = (value) => coerceArea('settings', { glass: value }).value.glass;
  assert.equal(glass(0), 0, 'fully solid is a valid choice');
  assert.equal(glass(1), 1);
  assert.equal(glass(9), 1, 'and cannot exceed it');
  assert.equal(glass(-3), 0);
  assert.equal(glass('frosted'), 0.55, 'unparseable falls back to the default');
});

// ─── GitHub widget forms ─────────────────────────────────────────────────────

test('an unknown widget form falls back to the summary rather than rendering nothing', () => {
  assert.deepEqual(GITHUB_FORMS, ['summary', 'calendar', 'repos']);
  assert.equal(coerceGithubForm('repos'), 'repos');
  assert.equal(coerceGithubForm('contributions'), 'summary', 'a form from a newer build');
  assert.equal(coerceGithubForm(undefined), 'summary');
});

test('the repository URL asks for the most recently pushed first, and escapes the name', () => {
  const url = githubReposUrl('octo-cat', 12);
  assert.ok(url.includes('/users/octo-cat/repos'));
  assert.ok(url.includes('sort=pushed'), 'order is what makes a short list useful');
  assert.ok(url.includes('per_page=12'));
  assert.ok(githubReposUrl('a b').includes('a%20b'), 'anything odd is escaped, not interpolated raw');
  assert.ok(githubReposUrl('x', 9999).includes('per_page=100'), 'GitHub’s own page cap');
});

test('repositories are reduced to what a card can show, forks left out', () => {
  const rows = summariseRepos([
    { id: 1, name: 'alpha', owner: { login: 'me' }, description: 'A thing', language: 'JavaScript', stargazers_count: 7, pushed_at: '2026-10-20T00:00:00Z' },
    { id: 2, name: 'someone-elses', owner: { login: 'me' }, fork: true },
    { id: 3, owner: { login: 'me' } },
    null,
  ]);

  assert.equal(rows.length, 1, 'the fork and the nameless entry are dropped');
  assert.equal(rows[0].name, 'alpha');
  assert.equal(rows[0].stars, 7);
  assert.equal(rows[0].url, 'https://github.com/me/alpha');
});

test('a repository link is built from owner and name, never from the response URL', () => {
  // A link target is the one field where trusting the payload would matter, so
  // it is constructed rather than copied.
  const [row] = summariseRepos([
    { id: 1, name: 'alpha', owner: { login: 'me' }, html_url: 'https://example.invalid/phish' },
  ]);
  assert.equal(row.url, 'https://github.com/me/alpha');
});

test('the activity calendar is a rectangle of whole weeks ending on today’s week', () => {
  const calendar = buildActivityCalendar([
    { created_at: '2026-10-22T10:00:00Z' },
    { created_at: '2026-10-22T18:00:00Z' },
  ], '2026-10-23', 13, 0, { truncated: false });

  assert.equal(calendar.columns.length, 13);
  assert.ok(calendar.columns.every((week) => week.length === 7), 'every column is a full week');
  assert.equal(calendar.total, 2);
  assert.equal(calendar.max, 2, 'both events landed on one day');

  const last = calendar.columns.at(-1);
  assert.ok(last.some((day) => day.date === '2026-10-23'), 'today is in the final column');
  assert.ok(last.every((day) => day.future || day.date <= '2026-10-23'));
});

test('days the feed cannot speak for are unknown, not quiet', () => {
  const events = [{ created_at: '2026-10-22T10:00:00Z' }];

  // A truncated page may be hiding older events, so nothing before its oldest
  // event can be called quiet.
  const cut = buildActivityCalendar(events, '2026-10-23', 13, 0, { truncated: true });
  const unknown = cut.columns.flat().filter((day) => !day.known && !day.future);
  assert.ok(unknown.length > 0, 'a truncated feed admits what it does not cover');
  assert.ok(unknown.every((day) => day.date < '2026-10-22'));

  // A short page is the whole feed, so its quiet days are real.
  const whole = buildActivityCalendar(events, '2026-10-23', 13, 0, { truncated: false });
  assert.equal(whole.columns.flat().filter((day) => !day.known && !day.future).length, 0);

  // Future days are never counted, whatever the feed says.
  assert.ok(whole.columns.flat().filter((day) => day.future).every((day) => day.count === 0));
});

test('heat levels are relative to the busiest day, so the scale fits the person', () => {
  assert.equal(activityLevel(0, 10), 0, 'nothing is never shaded');
  assert.equal(activityLevel(10, 10), 4, 'the busiest day is the darkest');
  assert.equal(activityLevel(1, 1), 4, 'one event is a busy day for someone with one');
  assert.equal(activityLevel(1, 100), 1, 'and a floor, so a single event still shows');
  for (const count of [1, 3, 17, 60]) {
    const level = activityLevel(count, 60);
    assert.ok(level >= 1 && level <= 4, `${count}/60 lands in range`);
  }
});

test('ages are short enough for a badge', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  assert.equal(shortAge('2026-10-23T09:00:00Z', now), 'today');
  assert.equal(shortAge('2026-10-22T09:00:00Z', now), 'yesterday');
  assert.equal(shortAge('2026-10-13T12:00:00Z', now), '10d ago');
  assert.equal(shortAge('2026-08-01T12:00:00Z', now), '2mo ago');
  assert.equal(shortAge('2024-01-01T12:00:00Z', now), '2y ago');
  assert.equal(shortAge('not a date', now), '', 'rather than "NaN ago"');
});

// ─── Weather ─────────────────────────────────────────────────────────────────

test('a place is only usable with real coordinates and a name', () => {
  const place = coerceWeatherPlace({ name: 'Bengaluru', region: 'Karnataka', country: 'India', latitude: 12.97194, longitude: 77.59369 });
  assert.equal(place.name, 'Bengaluru');
  // Rounded to about 100m: more precision is someone's street, and the forecast
  // is identical either way.
  assert.equal(place.latitude, 12.972);
  assert.equal(place.longitude, 77.594);

  assert.equal(coerceWeatherPlace(null), null);
  assert.equal(coerceWeatherPlace({ latitude: 1, longitude: 1 }), null, 'a nameless place');
  assert.equal(coerceWeatherPlace({ name: 'Nowhere' }), null, 'no coordinates');
  assert.equal(coerceWeatherPlace({ name: 'X', latitude: 91, longitude: 0 }), null, 'off the planet');
  assert.equal(coerceWeatherPlace({ name: 'X', latitude: 0, longitude: 181 }), null);
  assert.equal(coerceWeatherPlace({ name: 'X', latitude: 'north', longitude: 0 }), null);
});

test('a stored place is re-validated on read, because it ends up in a request URL', () => {
  const widgets = [
    { id: 'a', type: 'weather', x: 0, y: 0, w: 1, h: 1, config: { place: { name: 'X', latitude: 999, longitude: 0 }, unit: 'kelvin' } },
    { id: 'b', type: 'weather', x: 1, y: 0, w: 1, h: 1, config: { place: { name: 'Paris', latitude: 48.85, longitude: 2.35 }, unit: 'fahrenheit' } },
  ];
  const { value } = coerceArea('dashboard', { version: 3, widgets });

  const bad = value.widgets.find((w) => w.id === 'a');
  assert.ok(!('place' in bad.config), 'an impossible place is dropped, not passed to a URL');
  assert.equal(bad.config.unit, 'celsius', 'and an unknown unit falls back');

  const good = value.widgets.find((w) => w.id === 'b');
  assert.equal(good.config.place.name, 'Paris', 'a usable place survives');
  assert.equal(good.config.unit, 'fahrenheit');
});

test('the forecast URL carries the place, the unit and nothing else identifying', () => {
  const place = coerceWeatherPlace({ name: 'Paris', latitude: 48.8566, longitude: 2.3522 });
  const url = new URL(forecastUrl(place, 'fahrenheit'));

  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('latitude'), '48.857');
  assert.equal(url.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.equal(url.searchParams.get('wind_speed_unit'), 'mph', 'units travel together');
  assert.equal(url.searchParams.get('timezone'), 'auto', 'the place’s day, not the viewer’s');
  assert.ok(!url.search.includes('Paris'), 'the name is not sent; only coordinates are needed');

  assert.equal(new URL(forecastUrl(place, 'nonsense')).searchParams.get('temperature_unit'), 'celsius');
  assert.deepEqual(TEMPERATURE_UNITS, ['celsius', 'fahrenheit']);
  assert.equal(coerceTemperatureUnit('F'), 'celsius');
});

test('a search term is escaped into the geocoder URL', () => {
  const url = new URL(geocodeUrl('São Paulo'));
  assert.equal(url.searchParams.get('name'), 'São Paulo');
  assert.ok(geocodeUrl('a&b=c').includes('a%26b%3Dc'), 'nothing can smuggle in a parameter');
});

test('geocoder rows that cannot be used are dropped rather than offered', () => {
  const places = summariseGeocode({
    results: [
      { name: 'Paris', admin1: 'Île-de-France', country: 'France', latitude: 48.85, longitude: 2.35 },
      { name: 'Broken', latitude: 'x', longitude: 2 },
      { admin1: 'Nameless', latitude: 1, longitude: 1 },
    ],
  });
  assert.equal(places.length, 1);
  assert.equal(describePlace(places[0]), 'Paris, Île-de-France, France');
  assert.deepEqual(summariseGeocode({}), [], 'an empty response is not an error');
  assert.deepEqual(summariseGeocode(null), []);
});

test('weather codes map to a label and an icon, and the dark ones differ', () => {
  assert.equal(describeCondition(0, true).icon, 'sun');
  assert.equal(describeCondition(0, false).icon, 'moon', 'no sun after dark');
  assert.equal(describeCondition(0, true).label, 'Clear');
  assert.equal(describeCondition(61, true).label, 'Rain');
  assert.equal(describeCondition(95, true).icon, 'cloudLightning');
  // Overcast has no night variant, because a cloud is a cloud.
  assert.equal(describeCondition(3, false).icon, 'cloud');

  // An unknown code must not be drawn as clear weather — that is the one
  // mistake here that would mislead someone deciding whether to take a coat.
  const unknown = describeCondition(1234, true);
  assert.equal(unknown.label, 'Unknown');
  assert.equal(unknown.icon, 'cloud');
});

test('a forecast with no current temperature reads as unavailable, not as zero', () => {
  assert.equal(summariseWeather({}, 'celsius'), null);
  assert.equal(summariseWeather({ current: {} }, 'celsius'), null);
  assert.equal(summariseWeather({ current: { temperature_2m: null } }, 'celsius'), null);
  assert.equal(summariseWeather(null, 'celsius'), null);
});

test('a forecast is reduced to the fields the widget shows', () => {
  // Shaped exactly like a live Open-Meteo response.
  const weather = summariseWeather({
    current: {
      time: '2026-10-23T16:00',
      temperature_2m: 24.8,
      apparent_temperature: 27.5,
      weather_code: 1,
      is_day: 1,
      relative_humidity_2m: 76,
      wind_speed_10m: 8,
    },
    daily: { temperature_2m_max: [25.1], temperature_2m_min: [19.9] },
  }, 'celsius');

  assert.equal(weather.temperature, 24.8);
  assert.equal(weather.high, 25.1);
  assert.equal(weather.low, 19.9);
  assert.equal(weather.isDay, true);
  assert.equal(weather.icon, 'cloudSun');
  assert.equal(weather.label, 'Mainly clear');
  assert.equal(weather.symbol, '°C');
  assert.equal(weather.windUnit, 'km/h');

  // Missing optional fields are null, so the widget can omit a row rather than
  // print "NaN" or a misleading 0.
  const bare = summariseWeather({ current: { temperature_2m: 10, weather_code: 3, is_day: 0 } }, 'fahrenheit');
  assert.equal(bare.high, null);
  assert.equal(bare.apparent, null);
  assert.equal(bare.isDay, false);
  assert.equal(bare.symbol, '°F');
  assert.equal(bare.windUnit, 'mph');
});

test('temperatures are whole degrees, and a missing one is visibly missing', () => {
  assert.equal(formatTemperature(24.8, '°C'), '25°C');
  assert.equal(formatTemperature(-0.4, '°C'), '0°C', 'and never the absurd "-0°C"');
  assert.equal(formatTemperature(-7.5, '°C'), '-7°C', 'while real negatives keep their sign');
  assert.equal(formatTemperature(0, '°C'), '0°C', 'a genuine zero still reads as zero');
  assert.equal(formatTemperature(null, '°C'), '—', 'never a bare 0 standing in for no data');
  assert.equal(formatTemperature(undefined), '—');
  assert.equal(formatTemperature('warm'), '—');
});


test('activity month and day labels match GitHub’s contribution layout', () => {
  const calendar = buildActivityCalendar([], '2026-10-23', 8, 0, { truncated: false });
  const months = activityMonthLabels(calendar.columns);
  assert.ok(months.length >= 1);
  assert.equal(months[0].index, 0);
  assert.match(months[0].label, /^[A-Z][a-z]{2}$/);
  // Sunday-start weeks: Mon/Wed/Fri sit on rows 1, 3 and 5.
  assert.deepEqual(activityDayLabels(0), [
    { row: 1, label: 'Mon' },
    { row: 3, label: 'Wed' },
    { row: 5, label: 'Fri' },
  ]);
  // Monday-start weeks: those same weekdays sit on rows 0, 2 and 4.
  assert.deepEqual(activityDayLabels(1), [
    { row: 0, label: 'Mon' },
    { row: 2, label: 'Wed' },
    { row: 4, label: 'Fri' },
  ]);
});


test('contribution year calendar fills ~53 weeks from day rows', () => {
  const days = [
    { date: '2026-10-20', count: 2, level: 1 },
    { date: '2026-10-21', count: 0, level: 0 },
    { date: '2026-10-22', count: 5, level: 3 },
    { date: '2026-10-23', count: 1, level: 1 },
  ];
  const calendar = buildContributionYearCalendar(days, '2026-10-23', 53, 0);
  assert.equal(calendar.weeks, 53);
  assert.equal(calendar.columns.length, 53);
  assert.equal(calendar.columns[0].length, 7);
  assert.equal(calendar.source, 'contributions');
  const cell = calendar.columns.flat().find((d) => d.date === '2026-10-22');
  assert.ok(cell);
  assert.equal(cell.count, 5);
  assert.equal(cell.known, true);
  assert.equal(cell.level, 3);
  const future = calendar.columns.flat().filter((d) => d.future);
  assert.ok(future.every((d) => d.count === 0));
});

test('contribution calendar URL is built from the username only', () => {
  assert.equal(
    githubContributionsUrl('octocat'),
    'https://github-contributions-api.jogruber.de/v4/octocat',
  );
  assert.ok(githubContributionsUrl('a b').includes('a%20b'));
});
