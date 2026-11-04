'use client';

import { useActionState } from 'react';
import { Field, SubmitButton } from '@/components/Field';
import { chooseUsernameAction } from './actions';

export function UsernameForm({ suggestion }) {
  const [state, action, pending] = useActionState(chooseUsernameAction, null);

  return (
    <form action={action} className="mt-7 flex flex-col gap-4">
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        // The provisional handle, so the field is never empty — someone who is
        // happy with what they were given can press the button.
        defaultValue={state?.values?.username ?? suggestion}
        hint="Letters, numbers, hyphens and underscores. This becomes your profile address."
        error={state?.ok === false ? state.reason : undefined}
      />
      <SubmitButton pending={pending}>
        {pending ? 'Saving…' : 'Continue'}
      </SubmitButton>
    </form>
  );
}
