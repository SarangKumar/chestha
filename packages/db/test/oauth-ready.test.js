import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The schema's standing promise: **a Google or GitHub provider can be added
 * without touching the database.**
 *
 * `apps/website/auth.js` says adding one is three steps — a provider entry, two
 * environment variables, nothing else — and `schema.prisma` says the NextAuth
 * models "are what lets Google or GitHub be added later without a migration".
 * Those are claims about fields that nothing currently reads: the `Account`
 * table stays empty until a provider exists, so no test and no running code
 * would notice if a field were renamed or dropped. This file is what notices.
 *
 * It asserts the shape `@auth/prisma-adapter` requires, so if someone trims an
 * "unused" column the failure arrives now rather than on the day a provider is
 * switched on in production.
 *
 * It reads the schema as text deliberately. Parsing it with Prisma would need a
 * generated client and a database connection; the contract being protected is
 * the declaration itself.
 */
const SCHEMA = readFileSync(
  new URL('../prisma/schema.prisma', import.meta.url),
  'utf8',
);

/** The body of one `model X { ... }` block. */
function model(name) {
  const match = SCHEMA.match(new RegExp(`\\bmodel\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `model ${name} is missing from the schema`);
  return match[1];
}

/** A field's declared type, e.g. `String?`. */
function field(body, name) {
  const match = body.match(new RegExp(`^\\s*${name}\\s+(\\S+)`, 'm'));
  return match ? match[1] : null;
}

test('the Account model carries every field the NextAuth adapter writes', () => {
  const account = model('Account');

  // Required by the adapter for any OAuth provider.
  for (const name of ['userId', 'type', 'provider', 'providerAccountId']) {
    assert.ok(field(account, name), `Account.${name} is required by the adapter`);
  }

  // Optional, but written by Google's OIDC response. A missing column here is
  // not a crash — it is a token silently not persisted, which is worse.
  for (const name of [
    'refresh_token', 'access_token', 'expires_at',
    'token_type', 'scope', 'id_token', 'session_state',
  ]) {
    const declared = field(account, name);
    assert.ok(declared, `Account.${name} is written by OAuth providers`);
    assert.match(declared, /\?$/, `Account.${name} must be optional`);
  }
});

test('one provider identity maps to one account, enforced by the database', () => {
  // Without this, a replayed callback can create a second Account row for the
  // same Google user, and the adapter's lookup becomes non-deterministic.
  assert.match(
    model('Account'),
    /@@unique\(\[provider,\s*providerAccountId\]\)/,
    'Account needs a unique index on [provider, providerAccountId]',
  );
});

test('an OAuth user can exist with no password', () => {
  // Google sign-ups never set one. A required `passwordHash` would make the
  // very first Google sign-in fail at the insert.
  assert.equal(field(model('User'), 'passwordHash'), 'String?');
});

test('emailVerified exists, because an OAuth provider vouches for the address', () => {
  assert.equal(field(model('User'), 'emailVerified'), 'DateTime?');
});

test('a user who never chose a handle is distinguishable from one who did', () => {
  // No provider supplies a username, so the adapter assigns a provisional
  // handle; this flag is the only thing that routes them to /onboarding/username
  // rather than leaving them with a generated handle for good.
  const user = model('User');
  assert.equal(field(user, 'handleChosen'), 'Boolean');
  assert.match(user, /handleChosen\s+Boolean\s+@default\(false\)/);
});

test('the adapter can walk from a user to their linked providers', () => {
  assert.match(model('User'), /accounts\s+Account\[\]/);
  assert.match(
    model('Account'),
    /user\s+User\s+@relation\(fields:\s*\[userId\],\s*references:\s*\[id\]/,
  );
});

test('a provider link dies with its user, so no orphan row can be re-matched', () => {
  assert.match(model('Account'), /onDelete:\s*Cascade/);
});

test('the Session and VerificationToken models are present for later', () => {
  // Credentials sign-in uses a JWT, so these stay empty — but a provider using
  // database sessions, or an email link, needs them to already exist.
  assert.match(model('Session'), /sessionToken\s+String\s+@unique/);
  assert.ok(field(model('Session'), 'expires'));
  assert.match(model('VerificationToken'), /@@unique\(\[identifier,\s*token\]\)/);
});

test('email stays the unique account key, which is what links an OAuth identity', () => {
  assert.match(model('User'), /email\s+String\s+@unique/);
});
