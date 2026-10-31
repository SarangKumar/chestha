'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '@chestha/core/account';
import { Field, SubmitButton } from '@/components/Field';
import { signUpAction } from './actions';

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUpAction, null);
  const errorFor = (field) => (state?.field === field ? state.reason : undefined);

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="text-page font-semibold tracking-tight">Create an account</h1>
      <p className="mt-1.5 text-card text-ink-muted">
        Your username is your public profile address.
      </p>

      <form action={action} className="mt-7 flex flex-col gap-4">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state?.values?.email}
          error={errorFor('email')}
        />
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          defaultValue={state?.values?.username}
          hint={`chestha.app/user/… · ${USERNAME_MIN}–${USERNAME_MAX} characters`}
          error={errorFor('username')}
          minLength={USERNAME_MIN}
          maxLength={USERNAME_MAX}
        />
        <Field
          label="Display name"
          name="name"
          autoComplete="name"
          defaultValue={state?.values?.name}
          required={false}
          hint="Optional — shown on your profile instead of your username."
          error={errorFor('name')}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters. A passphrase beats a short complicated one.`}
          error={errorFor('password')}
          minLength={PASSWORD_MIN}
        />
        <SubmitButton pending={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </SubmitButton>
      </form>

      <p className="mt-6 text-card text-ink-muted">
        Already have an account?{' '}
        <Link href="/signin" className="text-ink underline underline-offset-4">Sign in</Link>
      </p>
    </div>
  );
}
