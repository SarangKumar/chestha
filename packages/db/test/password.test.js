import test from 'node:test';
import assert from 'node:assert/strict';
import { SCRYPT_PARAMS, hashPassword, needsRehash, verifyPassword } from '../src/password.js';

test('a password verifies against its own hash and nothing else', async () => {
  const stored = await hashPassword('four correct horse staples');
  assert.equal(await verifyPassword('four correct horse staples', stored), true);
  assert.equal(await verifyPassword('four correct horse staple', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('the same password hashes differently every time', async () => {
  // A per-password salt is what stops one rainbow table covering every user.
  const a = await hashPassword('four correct horse staples');
  const b = await hashPassword('four correct horse staples');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('four correct horse staples', b), true);
});

test('the stored form carries its own parameters, so cost can be raised later', async () => {
  const stored = await hashPassword('four correct horse staples');
  const [scheme, n, r, p] = stored.split('$');
  assert.equal(scheme, 'scrypt');
  assert.equal(Number(n), SCRYPT_PARAMS.N);
  assert.equal(Number(r), SCRYPT_PARAMS.r);
  assert.equal(Number(p), SCRYPT_PARAMS.p);
  assert.equal(stored.split('$').length, 6);
});

test('an account with no password fails verification instead of throwing', async () => {
  // An OAuth-created user has no password at all. Sign-in must read that as
  // wrong credentials, not as a server error that distinguishes the two.
  for (const absent of [null, undefined, '', 'not-a-hash', 'scrypt$x$8$1$aa$bb']) {
    assert.equal(await verifyPassword('anything', absent), false, `${absent} must not throw`);
  }
});

test('a tampered stored hash does not verify', async () => {
  const stored = await hashPassword('four correct horse staples');
  const parts = stored.split('$');
  // Swap the salt: the derived key no longer matches the recorded hash.
  parts[4] = Buffer.from('0'.repeat(16)).toString('base64');
  assert.equal(await verifyPassword('four correct horse staples', parts.join('$')), false);
  // A truncated hash must be refused, not compared against a short buffer.
  parts[5] = parts[5].slice(0, 8);
  assert.equal(await verifyPassword('four correct horse staples', parts.join('$')), false);
});

test('an N that is not a power of two is refused rather than passed to scrypt', async () => {
  assert.equal(await verifyPassword('x', 'scrypt$1000$8$1$YWJj$YWJj'), false);
  assert.equal(await verifyPassword('x', 'scrypt$0$8$1$YWJj$YWJj'), false);
});

test('unicode passwords match across composed and decomposed input', async () => {
  // The same keystrokes can arrive differently encoded on another device.
  const composed = 'contraseña-larga';      // ñ as one code point
  const decomposed = 'contraseña-larga';   // n + combining tilde
  const stored = await hashPassword(composed);
  assert.equal(await verifyPassword(decomposed, stored), true);
});

test('a hash made with weaker parameters is flagged for rehash', async () => {
  assert.equal(needsRehash(await hashPassword('four correct horse staples')), false);
  assert.equal(needsRehash('scrypt$16384$8$1$YWJj$YWJj'), true, 'lower N is behind');
  assert.equal(needsRehash('not-a-hash'), false, 'nothing to upgrade');
});

test('hashing refuses an empty or non-string password outright', async () => {
  await assert.rejects(() => hashPassword(''), TypeError);
  await assert.rejects(() => hashPassword(null), TypeError);
});
