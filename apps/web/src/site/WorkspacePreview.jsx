/**
 * Laptop-ratio product shot for the landing page. Embeds the real dashboard
 * (no seeded demo data) in a framed browser chrome at ~16:10.
 */
export function WorkspacePreview() {
  const src = `${window.location.pathname}?embed=1#/dashboard`;

  return (
    <section
      className="chestha-fade-up chestha-fade-up-delay-3 mx-auto w-full max-w-6xl px-4 sm:px-6"
      aria-label="Workspace preview"
    >
      <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-raised">
        <div className="flex h-9 items-center gap-2 border-b border-line bg-raised px-3">
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="size-2 rounded-full bg-line-strong" />
            <span className="size-2 rounded-full bg-line-strong" />
            <span className="size-2 rounded-full bg-line-strong" />
          </span>
          <div className="mx-auto flex h-6 min-w-0 max-w-md flex-1 items-center justify-center rounded-control bg-inset px-3">
            <span className="truncate text-[11px] text-ink-faint">chestha · dashboard</span>
          </div>
          <span className="w-10" aria-hidden />
        </div>
        <div className="relative aspect-[16/10] w-full bg-canvas">
          <iframe
            title="Chestha workspace"
            src={src}
            className="absolute inset-0 h-full w-full border-0"
            loading="lazy"
            referrerPolicy="same-origin"
          />
        </div>
      </div>
    </section>
  );
}
