import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GATED_SECTIONS, OPEN_SECTIONS, READING_SECTION, SESSION_IN, SESSION_MAX_AGE_MS,
  SESSION_OUT, SESSION_UNKNOWN, coerceSession, describeGate, effectiveSection,
  isSectionAllowed, lockedSections, requiresSignIn, sessionUrl, shouldRecheck,
  signInUrl, signUpUrl, unknownSession,
} from '../src/index.js';

const SITE = 'https://chestha.vercel.app';

// ─── Unknown must never gate ─────────────────────────────────────────────────
// This is the rule a refactor is most likely to break, so it is asserted from
// several directions rather than once.

test('a gated section is allowed while the session is unknown', () => {
  for (const section of GATED_SECTIONS) {
    assert.equal(
      isSectionAllowed(section, SESSION_UNKNOWN), true,
      `${section} must stay open until we know there is no account`,
    );
  }
});

test('only a definite signed-out gates anything', () => {
  for (const section of GATED_SECTIONS) {
    assert.equal(isSectionAllowed(section, SESSION_IN), true);
    assert.equal(isSectionAllowed(section, SESSION_OUT), false);
  }
});

test('an open section is allowed in every session state', () => {
  for (const section of OPEN_SECTIONS) {
    for (const state of [SESSION_UNKNOWN, SESSION_IN, SESSION_OUT]) {
      assert.equal(isSectionAllowed(section, state), true, `${section} / ${state}`);
    }
  }
});

test('an unrecognised section is allowed rather than walled', () => {
  // A section missing from the table is a routing bug; a blank wall is a worse
  // way to discover it than the page rendering.
  assert.equal(requiresSignIn('nonsense'), false);
  assert.equal(isSectionAllowed('nonsense', SESSION_OUT), true);
});

test('the two lists are disjoint and cover every real section', () => {
  const overlap = OPEN_SECTIONS.filter((section) => GATED_SECTIONS.includes(section));
  assert.deepEqual(overlap, [], 'a section cannot be both open and gated');

  // The workspace's own routes, plus the pseudo-section for Read mode. Adding a
  // section to the app forces a decision here rather than defaulting to open.
  const everything = [
    'dashboard', 'tasks', 'calendar', 'dsa', 'grove', 'websites', 'sounds',
    'writing', 'settings', 'home', 'about', 'changelog', 'guide', READING_SECTION,
  ].sort();
  assert.deepEqual([...OPEN_SECTIONS, ...GATED_SECTIONS].sort(), everything);
});

// ─── Read mode is a setting in the app and a section in the policy ───────────

test('the start screen resolves to the board or the feed', () => {
  assert.equal(effectiveSection('dashboard', 'board'), 'dashboard');
  assert.equal(effectiveSection('dashboard', 'read'), READING_SECTION);
  // Only the start screen has two modes; the setting must not leak elsewhere.
  assert.equal(effectiveSection('calendar', 'read'), 'calendar');
  assert.equal(effectiveSection('settings', 'read'), 'settings');
});

test('the board stays free while the feed is gated', () => {
  assert.equal(isSectionAllowed(effectiveSection('dashboard', 'board'), SESSION_OUT), true);
  assert.equal(isSectionAllowed(effectiveSection('dashboard', 'read'), SESSION_OUT), false);
});

// ─── Coercion: a corrupt cache must not read as signed out ──────────────────

test('an unreadable payload is unknown, not signed out', () => {
  for (const raw of [null, undefined, '', 0, [], {}, { signedIn: 'yes' }, { signedIn: null }]) {
    assert.equal(coerceSession(raw).state, SESSION_UNKNOWN, `${JSON.stringify(raw)}`);
  }
});

test('signedIn false is the only thing that produces signed-out', () => {
  const session = coerceSession({ signedIn: false, checkedAt: '2026-11-03T10:00:00.000Z' });
  assert.equal(session.state, SESSION_OUT);
  assert.equal(session.handle, '');
  assert.equal(session.checkedAt, '2026-11-03T10:00:00.000Z');
});

test('a signed-in payload keeps the handle and falls back for the display name', () => {
  const full = coerceSession({
    signedIn: true,
    user: { handle: 'sarang', displayUsername: 'SarangKumar' },
  });
  assert.equal(full.state, SESSION_IN);
  assert.equal(full.handle, 'sarang');
  assert.equal(full.displayUsername, 'SarangKumar');

  // No display name stored: the handle is the name, as on the profile card.
  const bare = coerceSession({ signedIn: true, user: { handle: 'sarang' } });
  assert.equal(bare.displayUsername, 'sarang');

  // Signed in is signed in even if the user object is missing — the gate turns
  // on the session, not on the profile fields.
  assert.equal(coerceSession({ signedIn: true }).state, SESSION_IN);
});

test('handleChosen is false only when the website says so', () => {
  // A missing key must not route someone to onboarding they already completed.
  assert.equal(coerceSession({ signedIn: true, user: { handle: 'a' } }).handleChosen, true);
  assert.equal(coerceSession({ signedIn: true }).handleChosen, true);
  assert.equal(
    coerceSession({ signedIn: true, user: { handle: 'a', handleChosen: false } }).handleChosen,
    false,
  );
});

test('unknownSession is the empty answer', () => {
  assert.deepEqual(unknownSession(), {
    state: SESSION_UNKNOWN, handle: '', displayUsername: '', handleChosen: true, checkedAt: null,
  });
});

// ─── Rechecking ──────────────────────────────────────────────────────────────

test('an unknown session is always worth asking about', () => {
  // Otherwise a fresh install would wait out the window before its first check.
  assert.equal(shouldRecheck(unknownSession()), true);
  assert.equal(shouldRecheck(null), true);
});

test('a fresh answer suppresses the next check, a stale one does not', () => {
  const now = Date.parse('2026-11-03T12:00:00.000Z');
  const at = (ms) => ({ state: SESSION_IN, checkedAt: new Date(now - ms).toISOString() });

  assert.equal(shouldRecheck(at(0), now), false);
  assert.equal(shouldRecheck(at(SESSION_MAX_AGE_MS - 1000), now), false);
  assert.equal(shouldRecheck(at(SESSION_MAX_AGE_MS), now), true);
  assert.equal(shouldRecheck(at(SESSION_MAX_AGE_MS + 1), now), true);
});

test('an unparseable timestamp is rechecked rather than trusted forever', () => {
  assert.equal(shouldRecheck({ state: SESSION_IN, checkedAt: 'not a date' }), true);
  assert.equal(shouldRecheck({ state: SESSION_OUT, checkedAt: null }), true);
});

// ─── URLs ────────────────────────────────────────────────────────────────────

test('the session endpoint resolves against the site origin', () => {
  assert.equal(sessionUrl(SITE), 'https://chestha.vercel.app/api/session');
  assert.equal(sessionUrl('http://localhost:3000'), 'http://localhost:3000/api/session');
});

test('sign-in carries a relative return path and refuses an absolute one', () => {
  assert.equal(signInUrl(SITE), 'https://chestha.vercel.app/signin');
  // `callbackUrl` is the name /signin already reads; any other would no-op.
  assert.equal(
    signInUrl(SITE, '/account'),
    'https://chestha.vercel.app/signin?callbackUrl=%2Faccount',
  );
  // An absolute value would turn the sign-in page into an open redirect.
  assert.equal(signInUrl(SITE, 'https://evil.example/x'), 'https://chestha.vercel.app/signin');
  assert.equal(signUpUrl(SITE), 'https://chestha.vercel.app/signup');
});

// ─── Copy and rail state ─────────────────────────────────────────────────────

test('every gated section has its own wall copy', () => {
  for (const section of GATED_SECTIONS) {
    const copy = describeGate(section);
    assert.ok(copy.title, `${section} needs a title`);
    assert.ok(copy.reason, `${section} needs a reason`);
    assert.notEqual(copy.title, 'This needs an account', `${section} fell back to generic copy`);
  }
});

test('describeGate never returns null', () => {
  const copy = describeGate('nonsense');
  assert.equal(typeof copy.title, 'string');
  assert.equal(typeof copy.reason, 'string');
});

test('the rail shows padlocks only when we know there is no account', () => {
  assert.deepEqual(lockedSections(SESSION_UNKNOWN), []);
  assert.deepEqual(lockedSections(SESSION_IN), []);
  assert.deepEqual(lockedSections(SESSION_OUT), GATED_SECTIONS);
});

test('lockedSections hands back a copy, not the live table', () => {
  const locked = lockedSections(SESSION_OUT);
  locked.push('settings');
  assert.equal(GATED_SECTIONS.includes('settings'), false);
});
