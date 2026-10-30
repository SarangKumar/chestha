'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { registerUser } from '@/lib/accounts';

/**
 * Creates an account and signs the new user straight in — asking someone to
 * type the password they just chose a second time is friction with no benefit.
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
  const password = String(formData.get('password') ?? '');

  const result = await registerUser({ ...values, password });
  if (!result.ok) {
    return { ...result, values };
  }

  try {
    // `redirect: true` throws a redirect, which must not be caught below.
    await signIn('credentials', {
      email: values.email,
      password,
      redirectTo: `/user/${result.user.handle}`,
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
