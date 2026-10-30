'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export async function signInAction(_previous, formData) {
  const email = String(formData.get('email') ?? '');
  const redirectTo = String(formData.get('redirectTo') ?? '') || '/feed';

  try {
    await signIn('credentials', {
      email,
      password: String(formData.get('password') ?? ''),
      redirectTo,
    });
    return { ok: true, values: { email } };
  } catch (error) {
    if (error instanceof AuthError) {
      // Deliberately one message for every failure. Saying "no account with
      // that email" would turn this form into a way to discover who has one.
      return {
        ok: false,
        field: 'password',
        reason: 'That email and password do not match an account.',
        values: { email },
      };
    }
    throw error;
  }
}
