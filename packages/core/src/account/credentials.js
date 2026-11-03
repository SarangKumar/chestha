/**
 * Pure credential *rules*. Nothing here hashes or verifies anything — the KDF
 * needs `node:crypto` and would break the browser bundle that imports this
 * package, so it lives server-side in `@chestha/db/password.js`. Keeping the
 * policy here means the sign-up form and the server enforce one definition
 * instead of drifting apart.
 */

export const PASSWORD_MIN = 10;
/** Bcrypt-era 72-byte truncation does not apply to scrypt, but an unbounded
 *  password is a cheap denial-of-service against a deliberately slow KDF. */
export const PASSWORD_MAX = 200;

/**
 * Deliberately not a character-class checklist. Composition rules push people
 * towards `Passw0rd!` while banning `four correct horse staples`, so length
 * plus a blocklist of obvious choices is the rule, matching current NIST
 * guidance (SP 800-63B).
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', '1234567890', '12345678',
  '123456789', 'qwertyuiop', 'qwerty123', 'letmein', 'iloveyou', 'admin123',
  'welcome1', 'welcome123', 'abc123456', 'football', 'monkey123', 'dragon123',
  'sunshine', 'princess', 'trustno1', 'starwars', 'whatever', 'changeme',
  'chestha', 'chestha123',
]);

/** Lowercased and trimmed. Email is the login key, so it has one stored form. */
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

/**
 * Pragmatic shape check, not RFC 5322. There is no verification step in this
 * product, so this only catches typos and junk; it must not reject the valid
 * addresses a stricter-looking regex tends to.
 */
export function isPlausibleEmail(raw) {
  const email = normalizeEmail(raw);
  if (!email || email.length > 254) return false;
  if (/\s/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64) return false;
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..')) return false;
  return /^[^@\s]+$/.test(local) && /^[a-z0-9.-]+$/.test(domain);
}

/** @returns {{ ok: boolean, reason: string | null }} — `reason` is user-facing. */
export function validateEmail(raw) {
  if (!normalizeEmail(raw)) return { ok: false, reason: 'Enter your email address.' };
  if (!isPlausibleEmail(raw)) return { ok: false, reason: "That doesn't look like an email address." };
  return { ok: true, reason: null };
}

/**
 * Which domains may register with an email and a password.
 *
 * One entry today, and the list is the whole policy — widening it is editing
 * this array, not finding every place a domain is checked.
 *
 * `googlemail.com` is deliberately absent. It is Google's alias domain and
 * reaches the same inbox, so adding it is defensible; it is left out because
 * the rule as asked for is gmail.com, and a silent second accepted domain is
 * worse than a narrow one the owner can widen.
 */
export const ALLOWED_SIGNUP_DOMAINS = ['gmail.com'];

/** The part after the `@`, normalised. Empty when there is not exactly one. */
export function emailDomain(raw) {
  const parts = normalizeEmail(raw).split('@');
  return parts.length === 2 ? parts[1] : '';
}

export function isAllowedSignupDomain(raw) {
  return ALLOWED_SIGNUP_DOMAINS.includes(emailDomain(raw));
}

/**
 * The email rule for **creating an account with a password**, which is a
 * stricter thing than a valid email address.
 *
 * Deliberately separate from `validateEmail`, and the distinction matters for
 * what comes next:
 *
 *  - **Sign-in must never use this.** It would lock out any account whose
 *    address stopped being allowed, and the whole point of a domain rule is
 *    that the list can change. `verifyCredentials` only normalises.
 *  - **An OAuth sign-in must never use this either.** Google hands back the
 *    account's real address, and a Google Workspace user's is their own
 *    company domain, not gmail.com. Running Workspace identities through a
 *    gmail-only check would reject exactly the users Google sign-in is meant
 *    to let in. Signing in *through Google* is already proof Google owns the
 *    address, which is what this rule is a proxy for.
 *
 * In short: this guards the password sign-up form, and nothing else.
 */
export function validateSignupEmail(raw) {
  const base = validateEmail(raw);
  if (!base.ok) return base;
  if (!isAllowedSignupDomain(raw)) {
    return {
      ok: false,
      reason: ALLOWED_SIGNUP_DOMAINS.length === 1
        ? `Use a @${ALLOWED_SIGNUP_DOMAINS[0]} address to sign up.`
        : `Sign up with one of: ${ALLOWED_SIGNUP_DOMAINS.map((d) => `@${d}`).join(', ')}.`,
    };
  }
  return { ok: true, reason: null };
}

/**
 * @param {string} password
 * @param {{ email?: string, username?: string, name?: string }} [context]
 *   Personal strings the password must not simply repeat.
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function validatePassword(password, context = {}) {
  if (typeof password !== 'string' || !password) {
    return { ok: false, reason: 'Choose a password.' };
  }
  // Counted in code points: a 10-emoji password is 10 characters to the user.
  const length = [...password].length;
  if (length < PASSWORD_MIN) {
    return { ok: false, reason: `Passwords are at least ${PASSWORD_MIN} characters.` };
  }
  if (length > PASSWORD_MAX) {
    return { ok: false, reason: `Passwords are at most ${PASSWORD_MAX} characters.` };
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return { ok: false, reason: 'That password is too common. Pick something else.' };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, reason: 'That password is a single repeated character.' };
  }
  for (const value of [context.email, context.username, context.name]) {
    const needle = String(value ?? '').trim().toLowerCase();
    // Short needles would false-positive; only block a meaningful echo.
    if (needle.length >= 4 && lower.includes(needle)) {
      return { ok: false, reason: 'Your password must not contain your name, username or email.' };
    }
  }
  const localPart = normalizeEmail(context.email).split('@')[0];
  if (localPart.length >= 4 && lower.includes(localPart)) {
    return { ok: false, reason: 'Your password must not contain your name, username or email.' };
  }
  return { ok: true, reason: null };
}

/**
 * Does the confirmation box match the password?
 *
 * Separate from `validatePassword` because it is a different kind of rule: the
 * password itself is either acceptable or not, while this compares two inputs
 * and belongs to the form that has two. A caller that has only one password —
 * an OAuth sign-up, a future password reset done by token — must not pretend
 * to pass it.
 *
 * Nothing is trimmed. Leading and trailing spaces are part of a password, so
 * trimming here would accept a pair the hash will later treat as different.
 *
 * Unicode *is* normalised, with **NFKC — the same form `hashPassword` in
 * `@chestha/db` applies**, and that match is the point rather than a detail.
 * Comparing raw strings, or normalising to a different form, would refuse a
 * pair that the KDF then considers identical: the user would be told the
 * passwords differ when the account they create would accept either. If that
 * normalisation ever changes, this changes with it.
 *
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function validatePasswordConfirmation(password, confirmation) {
  if (typeof confirmation !== 'string' || !confirmation) {
    return { ok: false, reason: 'Type your password again to confirm it.' };
  }
  const typed = typeof password === 'string' ? password.normalize('NFKC') : '';
  if (typed !== confirmation.normalize('NFKC')) {
    return { ok: false, reason: 'Those passwords do not match.' };
  }
  return { ok: true, reason: null };
}

/**
 * Advisory 0–4 score for a strength meter. Never gates submission —
 * `validatePassword` is the only thing that accepts or refuses.
 */
export function passwordStrength(password) {
  if (typeof password !== 'string' || !password) return 0;
  const length = [...password].length;
  let score = 0;
  if (length >= PASSWORD_MIN) score += 1;
  if (length >= 14) score += 1;
  if (length >= 20) score += 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (classes >= 3) score += 1;
  if (COMMON_PASSWORDS.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) return 0;
  return Math.min(4, score);
}
