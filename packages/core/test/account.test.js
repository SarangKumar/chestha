import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESERVED_USERNAMES, buildProfileCard, normalizeBio, normalizeEmail,
  normalizeProfileLink, normalizeUsername, passwordStrength, profileUrl,
  suggestUsername, validateEmail, validatePassword, validateUsername,
} from '../src/index.js';

// ─── Usernames share a namespace with the site's own routes ──────────────────

test('a username is stored lowercase, with a pasted @ stripped', () => {
  assert.equal(normalizeUsername('  @Sarang  '), 'sarang');
  assert.equal(validateUsername('SarangKumar').handle, 'sarangkumar');
});

test('route segments cannot be claimed as usernames', () => {
  // These would shadow a real page or make an account look official.
  for (const taken of ['settings', 'api', 'user', 'post', 'chestha', 'admin']) {
    const result = validateUsername(taken);
    assert.equal(result.ok, false, `${taken} must be reserved`);
    assert.equal(result.reason, 'That username is reserved.');
  }
  // `_next` is refused by shape before the reserved list is reached; what
  // matters is that it cannot be claimed, not which rule stops it.
  assert.equal(validateUsername('_next').ok, false);
  assert.ok(RESERVED_USERNAMES.has('support'));
});

test('usernames must start and end alphanumeric and carry a letter', () => {
  for (const bad of ['-sarang', 'sarang-', '_sarang', 'sa rang', 'sa.rang', 'sarang!', '123456']) {
    assert.equal(validateUsername(bad).ok, false, `${bad} must be refused`);
  }
  for (const good of ['sarang', 'sarang-kumar', 'sarang_01', 'a1b']) {
    assert.equal(validateUsername(good).ok, true, `${good} must be accepted`);
  }
});

test('username length bounds are inclusive', () => {
  assert.equal(validateUsername('ab').ok, false);
  assert.equal(validateUsername('abc').ok, true);
  assert.equal(validateUsername('a'.repeat(30)).ok, true);
  assert.equal(validateUsername('a'.repeat(31)).ok, false);
});

test('a suggestion is only ever a suggestion, and is blank when unusable', () => {
  assert.equal(suggestUsername('Sarang.Kumar@gmail.com'), 'sarang-kumar');
  assert.equal(suggestUsername('admin@example.com'), '', 'reserved words are not suggested');
  assert.equal(suggestUsername('42@example.com'), '', 'digit-only is not suggested');
  assert.equal(suggestUsername('a@example.com'), '', 'too short to suggest');
});

// ─── Credentials ─────────────────────────────────────────────────────────────

test('email is normalised to one stored form', () => {
  assert.equal(normalizeEmail('  Sarang@Example.COM '), 'sarang@example.com');
  assert.equal(validateEmail('sarang@example.com').ok, true);
  for (const bad of ['sarang', 'sarang@', '@example.com', 'a@b', 'a b@example.com', 'a@b..com']) {
    assert.equal(validateEmail(bad).ok, false, `${bad} must be refused`);
  }
});

test('password policy is length plus a blocklist, not a composition checklist', () => {
  // A long passphrase with no symbols or digits is accepted.
  assert.equal(validatePassword('four correct horse staples').ok, true);
  // A short "complex" one is not.
  assert.equal(validatePassword('Pw1!').ok, false);
  assert.equal(validatePassword('password123').ok, false);
  assert.equal(validatePassword('aaaaaaaaaaaa').ok, false, 'one repeated character');
});

test('a password may not echo the account it protects', () => {
  const context = { email: 'sarangkumar@example.com', username: 'sarangkumar', name: 'Sarang Kumar' };
  assert.equal(validatePassword('sarangkumar-2026', context).ok, false);
  assert.equal(validatePassword('my Sarang Kumar pet', context).ok, false);
  assert.equal(validatePassword('unrelated passphrase', context).ok, true);
});

test('password length is counted in code points, and bounded', () => {
  // Ten emoji are ten characters to the user, whatever their byte length.
  assert.equal(validatePassword('🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱').ok, true);
  assert.equal(validatePassword('🌱'.repeat(9)).ok, false);
  assert.equal(validatePassword('x'.repeat(201)).ok, false, 'unbounded input is a slow-KDF DoS');
});

test('strength is advisory and never contradicts acceptance with a zero', () => {
  assert.equal(passwordStrength('password'), 0);
  assert.equal(passwordStrength(''), 0);
  assert.ok(passwordStrength('four correct horse staples') >= 2);
  assert.ok(passwordStrength('Tr0ub4dour&3-longer-still') >= 3);
});

// ─── The profile card is the one public payload ──────────────────────────────

const user = {
  handle: 'sarang',
  displayUsername: 'Sarang',
  name: 'Sarang Kumar',
  email: 'sarang@example.com',
  bio: '  Builds   things.  ',
  createdAt: '2026-01-05T10:00:00.000Z',
  links: ['github.com/sarangkumar', 'javascript:alert(1)', 'not a url', 'localhost'],
};

const post = (over) => ({
  id: over.id, title: over.title ?? 'T', body: over.body ?? 'word '.repeat(220),
  categories: over.categories ?? ['dsa'], status: over.status, publishedAt: over.publishedAt ?? null,
});

test('a profile card never exposes drafts or the login email', () => {
  const card = buildProfileCard(user, [
    post({ id: 'a', status: 'published', publishedAt: '2026-02-01T00:00:00.000Z' }),
    post({ id: 'b', status: 'draft' }),
    post({ id: 'c', status: 'unpublished' }),
  ]);
  assert.deepEqual(card.posts.map((p) => p.id), ['a']);
  assert.equal(card.stats.posts, 1);
  assert.equal('email' in card, false, 'email is the login key and is not public');
});

test('published posts are newest first', () => {
  const card = buildProfileCard(user, [
    post({ id: 'old', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z' }),
    post({ id: 'new', status: 'published', publishedAt: '2026-03-01T00:00:00.000Z' }),
  ]);
  assert.deepEqual(card.posts.map((p) => p.id), ['new', 'old']);
});

test('profile links are scheme-checked, since they render as an href', () => {
  const card = buildProfileCard(user, []);
  assert.deepEqual(card.links.map((l) => l.label), ['GitHub']);
  assert.equal(card.links[0].href, 'https://github.com/sarangkumar');
  assert.equal(normalizeProfileLink('javascript:alert(1)'), null);
  assert.equal(normalizeProfileLink('data:text/html,<script>'), null);
  assert.equal(normalizeProfileLink('localhost'), null, 'a host with no dot is not a link');
  // A scheme-less host becomes https, so it can never resolve as a path on our
  // own origin — which is what makes an unvalidated href dangerous.
  assert.equal(normalizeProfileLink('elsewhere.example').href, 'https://elsewhere.example/');
  assert.equal(normalizeProfileLink('x.com/sarang').label, 'X');
});

test('card stats count breadth and reading time, and bio collapses whitespace', () => {
  const card = buildProfileCard(user, [
    post({ id: 'a', status: 'published', publishedAt: '2026-02-01T00:00:00.000Z', categories: ['dsa', 'career'] }),
    post({ id: 'b', status: 'published', publishedAt: '2026-02-02T00:00:00.000Z', categories: ['dsa'] }),
  ]);
  assert.equal(card.stats.categories, 2);
  assert.ok(card.stats.readingMinutes >= 2);
  assert.equal(card.bio, 'Builds things.');
  assert.equal(normalizeBio('a'.repeat(300)).length, 200);
});

test('a profile URL is absolute and encodes the handle', () => {
  assert.equal(profileUrl('sarang', 'https://chestha.vercel.app/'), 'https://chestha.vercel.app/user/sarang');
});
