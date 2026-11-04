'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { registerUser } from '@/lib/accounts';

/**
 * Creates an account and signs the new user straight in.
 *
 * The password is typed twice. A sign-up is the one moment a typo is
 * unrecoverable — there is no password reset in this product yet, and the
 * address is never verified, so a mistyped password with a mistyped-but-valid
 * email would leave an account nobody can reach. The second box is checked on
 * the server, by `registerUser`, not only in the browser.
 *
 * Returns `{ field, reason }` so the form can mark the offending input. On
 * success it does not return at all: `signIn` redirects.
 */
export async function signUpAction(_previous, formData) {
  const values = {
    email: String(formData.get('email') ?? ''),
    username: String(formData.get('username') ?? ''),
    name: String(formData.get('name') ?? ''),
  };
  // Neither password is echoed back in `values`: a rejected form re-renders
  // with the other fields filled and both password boxes empty.
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  const result = await registerUser({ ...values, password, confirmPassword });
  if (!result.ok) {
    return { ...result, values };
  }

  try {
    // `redirect: true` throws a redirect, which must not be caught below.
    await signIn('credentials', {
      email: values.email,
      password,
      // Into the second onboarding step rather than onto an empty profile.
      // A brand-new account has nothing to show on /user/<handle>, and the
      // feed it is about to see is only as good as the interests behind it.
      redirectTo: '/onboarding/interests',
    });
    return { ok: true, values };
  } catch (error) {
    // Next signals redirects by throwing; re-throw anything that is not an
    // auth failure, or the browser never navigates.
    if (error instanceof AuthError) {
      return {
        ok: false,
        field: 'password',
        reason: 'Your account was created, but signing in failed. Try signing in.',
        values,
      };
    }
    throw error;
  }
}
