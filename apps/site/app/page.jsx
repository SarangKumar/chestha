import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-20">
      <h1 className="text-display font-semibold tracking-tight text-ink">
        A calm place to work, and to write about it.
      </h1>
      <p className="mt-4 max-w-xl text-card text-ink-muted">
        Chestha is a local-first productivity workspace — tasks, a calendar, focus
        sessions and interview practice, all kept in your own browser. The
        community side is where people write about how they actually work.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-control bg-accent px-4 py-2.5 text-card font-medium text-on-accent transition-colors duration-150 hover:opacity-90"
        >
          Create an account
        </Link>
        <Link
          href="/feed"
          className="rounded-control border border-line bg-raised px-4 py-2.5 text-card font-medium text-ink transition-colors duration-150 hover:bg-hover"
        >
          Read posts
        </Link>
      </div>

      {/* The marketing landing still lives in apps/web (src/site/Landing.jsx)
          and has not been ported yet — this is a placeholder so the route
          tree is navigable. */}
    </div>
  );
}
