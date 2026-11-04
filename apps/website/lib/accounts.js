import {
  normalizeEmail, suggestUsername, validatePassword, validatePasswordConfirmation,
  validateSignupEmail, validateUsername,
} from '@chestha/core';
import { hashPassword, needsRehash, verifyPassword } from '@chestha/db/password.js';
import { prisma } from '@chestha/db';

/**
 * Account creation and credential checking. Every rule applied here comes from
 * `packages/core`, which the sign-up form also uses, so the client and the
 * server cannot disagree about what a valid account is. The client checks are
 * for feedback only — these are the ones that decide.
 */

/**
 * @returns {Promise<{ ok: true, user: object } | { ok: false, field: string, reason: string }>}
 */
export async function registerUser({ email, password, confirmPassword, username, name } = {}) {
  // `validateSignupEmail`, not `validateEmail`: creating a password account is
  // restricted to the allowed domains, where signing in is not. See the note on
  // that function — an OAuth sign-up must not be put through this check.
  const emailCheck = validateSignupEmail(email);
  if (!emailCheck.ok) return { ok: false, field: 'email', reason: emailCheck.reason };

  const usernameCheck = validateUsername(username);
  if (!usernameCheck.ok) return { ok: false, field: 'username', reason: usernameCheck.reason };

  // Checked against the final handle, not the raw input, so a password cannot
  // echo the handle the account actually gets.
  const passwordCheck = validatePassword(password, { email, username: usernameCheck.handle, name });
  if (!passwordCheck.ok) return { ok: false, field: 'password', reason: passwordCheck.reason };

  // After the password's own rules, so someone who typed a too-short password
  // twice is told what is actually wrong with it rather than being sent to the
  // confirmation box. Required, not optional: a caller with no confirmation to
  // offer has to say so by not using this function.
  const confirmCheck = validatePasswordConfirmation(password, confirmPassword);
  if (!confirmCheck.ok) return { ok: false, field: 'confirmPassword', reason: confirmCheck.reason };

  const normalizedEmail = normalizeEmail(email);
  const handle = usernameCheck.handle;

  // Checked up front so the form can point at the offending field, but the
  // unique indexes below are what actually prevent a duplicate: two requests
  // can pass this check concurrently.
  const clash = await prisma.user.findFirst({
    where: { OR: [{ email: normalizedEmail }, { handle }] },
    select: { email: true, handle: true },
  });
  if (clash?.email === normalizedEmail) {
    return { ok: false, field: 'email', reason: 'An account with that email already exists.' };
  }
  if (clash?.handle === handle) {
    return { ok: false, field: 'username', reason: 'That username is taken.' };
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        handle,
        // Preserves the casing the user typed, while the URL stays canonical.
        displayUsername: String(username).trim().replace(/^@+/, '') || handle,
        // The sign-up form asked for a username, so it is the user's own.
        handleChosen: true,
        name: String(name ?? '').trim() || null,
      },
      select: { id: true, email: true, handle: true, displayUsername: true, name: true, image: true },
    });
    return { ok: true, user };
  } catch (error) {
    // P2002 is a unique-constraint violation: the race the check above cannot
    // close. `meta.target` names the field, so the form still points at it.
    if (error?.code === 'P2002') {
      const target = String(error.meta?.target ?? '');
      const field = target.includes('handle') ? 'username' : 'email';
      return {
        ok: false,
        field,
        reason: field === 'username' ? 'That username is taken.' : 'An account with that email already exists.',
      };
    }
    throw error;
  }
}

/**
 * Checks an email and password.
 *
 * Returns null for every kind of failure — unknown email, no password set
 * (an OAuth-only account), wrong password — so the response cannot be used to
 * discover which addresses are registered.
 *
 * @returns {Promise<object | null>}
 */
export async function verifyCredentials({ email, password } = {}) {
  if (typeof password !== 'string' || !password) return null;
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, passwordHash: true, handle: true, displayUsername: true, name: true, image: true },
  });
  if (!user?.passwordHash) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  // The one moment we hold the plaintext and know it is correct, so it is the
  // only chance to upgrade a hash made with weaker parameters.
  if (needsRehash(user.passwordHash)) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    } catch {
      // An upgrade is an optimisation; failing it must not fail the sign-in.
    }
  }

  const { passwordHash, ...safe } = user;
  return safe;
}


/**
 * A unique handle for a user who has not chosen one.
 *
 * `handle` is required and unique, but an OAuth provider supplies no username —
 * so the adapter has to put *something* there to create the row at all. The
 * value is marked provisional via `handleChosen: false`, which is what sends
 * the user to /onboarding/username to replace it.
 *
 * The suffix is random rather than a counter: a counter would need a read for
 * every candidate, and consecutive handles would leak roughly how many accounts
 * exist.
 */
export async function provisionalHandle({ email, name } = {}) {
  const stem = suggestUsername(name) || suggestUsername(email) || 'member';

  for (let attempt = 0; attempt < 8; attempt += 1) {
    // The first attempt tries the bare stem, so a free name stays readable.
    const candidate = attempt === 0
      ? stem
      : `${stem.slice(0, 24)}-${Math.random().toString(36).slice(2, 6)}`;
    const check = validateUsername(candidate);
    if (!check.ok) continue;
    const clash = await prisma.user.findUnique({
      where: { handle: check.handle },
      select: { id: true },
    });
    if (!clash) return check.handle;
  }

  // Exhausting eight attempts means something is badly wrong; a long random
  // handle is still better than failing the sign-in outright.
  return `member-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Replace a provisional handle with one the account actually chose.
 *
 * Separate from `registerUser` because the two are different moments: a
 * registration has an email and a password to validate, while this has one
 * field and an account that already exists. Sharing a function would mean one
 * of them carrying arguments it has no use for.
 *
 * `handleChosen` is the point of the write. It is what `/account` and the
 * extension's profile menu key on to stop sending someone back here, and it is
 * why the flag cannot simply be inferred from the handle looking reasonable.
 *
 * @returns {Promise<{ ok: true, handle: string } | { ok: false, field: string, reason: string }>}
 */
export async function claimUsername(userId, username) {
  const check = validateUsername(username);
  if (!check.ok) return { ok: false, field: 'username', reason: check.reason };

  const handle = check.handle;

  // Checked for a useful message; the unique index below is what actually
  // prevents the duplicate, since two requests can pass this concurrently.
  const taken = await prisma.user.findFirst({
    where: { handle, NOT: { id: userId } },
    select: { id: true },
  });
  if (taken) return { ok: false, field: 'username', reason: 'That username is taken.' };

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { handle, displayUsername: String(username).trim(), handleChosen: true },
    });
  } catch (error) {
    // P2002 is the unique violation that the check above raced with.
    if (error?.code === 'P2002') {
      return { ok: false, field: 'username', reason: 'That username is taken.' };
    }
    throw error;
  }

  return { ok: true, handle };
}
