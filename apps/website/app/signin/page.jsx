import Link from 'next/link';
import { SignInForm } from './SignInForm';

export const metadata = { title: 'Sign in' };

/**
 * The query string is read here, on the server, and passed down as props.
 * Reading it in the client form with `useSearchParams` would opt the whole
 * route out of static prerendering unless it were wrapped in a Suspense
 * boundary — props are simpler and keep the page static.
 */
export default async function SignInPage({ searchParams }) {
  const { callbackUrl, error } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="text-page font-semibold tracking-tight">Sign in</h1>

      <SignInForm
        callbackUrl={typeof callbackUrl === 'string' ? callbackUrl : '/feed'}
        hadError={Boolean(error)}
      />

      <p className="mt-6 text-card text-ink-muted">
        New here?{' '}
        <Link href="/signup" className="text-ink underline underline-offset-4">Create an account</Link>
      </p>
    </div>
  );
}
