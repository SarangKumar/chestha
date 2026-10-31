import { signOut } from '@/auth';

/**
 * Sign-out is a POST, not a link. A GET that ends a session can be triggered
 * by any page that embeds the URL — a form keeps it an explicit action.
 */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/' });
      }}
    >
      <button
        type="submit"
        className="rounded-control px-2.5 py-1.5 text-card text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
      >
        Sign out
      </button>
    </form>
  );
}
