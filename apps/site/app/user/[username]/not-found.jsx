import Link from 'next/link';

export default function ProfileNotFound() {
  return (
    <div className="mx-auto w-full max-w-sm px-4 py-20 text-center">
      <h1 className="text-page font-semibold tracking-tight">No such profile</h1>
      <p className="mt-2 text-card text-ink-muted">
        That username does not belong to anyone here.
      </p>
      <Link
        href="/feed"
        className="mt-6 inline-block rounded-control bg-accent px-4 py-2.5 text-card font-medium text-on-accent transition-colors duration-150 hover:opacity-90"
      >
        Browse posts
      </Link>
    </div>
  );
}
