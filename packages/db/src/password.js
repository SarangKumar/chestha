import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

/**
 * Password hashing with `node:crypto`'s scrypt.
 *
 * scrypt rather than a dependency because it is memory-hard, in the standard
 * library, and needs no native build step — which keeps this repo's "no new
 * runtime dependencies without asking" rule intact for the one piece of
 * security-critical code here. bcrypt and argon2 are both fine choices; they
 * are simply not worth a native module when the platform ships an equivalent.
 *
 * The stored string carries its own parameters, so cost can be raised later
 * without invalidating existing hashes — `needsRehash` reports which hashes
 * are behind, and the sign-in path upgrades them transparently.
 */

/**
 * N=2^16 with r=8 means roughly 64 MiB per hash. That is deliberately
 * expensive: it is the single setting standing between a leaked database and
 * usable plaintext. `maxmem` must be raised to match, because Node's default
 * 32 MiB limit would reject these parameters outright.
 */
export const SCRYPT_PARAMS = { N: 2 ** 16, r: 8, p: 1, keylen: 64 };

const SALT_BYTES = 16;
const PREFIX = 'scrypt';

function maxmemFor({ N, r }) {
  // Node checks `128 * N * r > maxmem`; the headroom keeps it off the boundary.
  return 256 * N * r;
}

/**
 * @param {string} password
 * @returns {Promise<string>} `scrypt$N$r$p$salt$hash`, safe to store as one
 *   column — a split salt field is one more thing to get wrong.
 */
export async function hashPassword(password) {
  if (typeof password !== 'string' || !password) {
    throw new TypeError('hashPassword needs a non-empty password');
  }
  const { N, r, p, keylen } = SCRYPT_PARAMS;
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(normalize(password), salt, keylen, { N, r, p, maxmem: maxmemFor({ N, r }) });
  return [PREFIX, N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed or absent hash: an account
 * created through an OAuth provider has no password at all, and sign-in must
 * treat that as "wrong credentials", not as a server error that distinguishes
 * it from a real account.
 *
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || !password) return false;
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const { N, r, p, salt, hash } = parsed;
  let derived;
  try {
    derived = await scrypt(normalize(password), salt, hash.length, { N, r, p, maxmem: maxmemFor({ N, r }) });
  } catch {
    // Parameters outside what this Node will accept — treat as a failed
    // verification rather than leaking a different outcome to the caller.
    return false;
  }
  // Lengths are equal by construction above, but timingSafeEqual throws if
  // they ever are not, and a throw here would be an information leak.
  if (derived.length !== hash.length) return false;
  return timingSafeEqual(derived, hash);
}

/** True when a stored hash was made with weaker parameters than current. */
export function needsRehash(stored) {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  return parsed.N < SCRYPT_PARAMS.N || parsed.r < SCRYPT_PARAMS.r || parsed.p < SCRYPT_PARAMS.p;
}

/**
 * Unicode normalisation, so a password typed on a keyboard that emits
 * decomposed characters still matches the composed form it was created with.
 * Without this, the same keystrokes can fail to log in on another device.
 */
function normalize(password) {
  return password.normalize('NFKC');
}

function parseHash(stored) {
  if (typeof stored !== 'string') return null;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return null;
  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  // scrypt requires N to be a power of two greater than one.
  if (N < 2 || (N & (N - 1)) !== 0) return null;
  try {
    const salt = Buffer.from(rawSalt, 'base64');
    const hash = Buffer.from(rawHash, 'base64');
    if (!salt.length || !hash.length) return null;
    return { N, r, p, salt, hash };
  } catch {
    return null;
  }
}
