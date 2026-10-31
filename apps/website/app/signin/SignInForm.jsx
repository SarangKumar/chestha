'use client';

import { useActionState } from 'react';
import { Field, SubmitButton } from '@/components/Field';
import { signInAction } from './actions';

const GENERIC_FAILURE = 'That email and password do not match an account.';

export function SignInForm({ callbackUrl, hadError }) {
  const [state, action, pending] = useActionState(signInAction, null);
  const failed = state?.ok === false || hadError;

  return (
    <form action={action} className="mt-7 flex flex-col gap-4">
      {/* Where to land after signing in. Validated server-side by NextAuth,
          which refuses an off-site callback. */}
      <input type="hidden" name="redirectTo" value={callbackUrl} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state?.values?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        // One wording for every failure. "No account with that email" would
        // turn this form into a way to discover who has one.
        error={failed ? (state?.reason ?? GENERIC_FAILURE) : undefined}
      />
      <SubmitButton pending={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </SubmitButton>
    </form>
  );
}
