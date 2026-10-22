# CLAUDE.md

**See [AGENTS.md](AGENTS.md) for the full guide.** It is the canonical reference for
this repo; this file exists so Claude Code picks it up and is kept deliberately thin
to avoid drifting out of sync.

The rules most easily got wrong, repeated here:

- **Never commit.** Leave changes uncommitted for manual review.
- **No backend, account, cloud sync, analytics or telemetry.** Settled decisions.
- **No new runtime dependencies** without asking first.
- **Plain JS, not TypeScript.** `npm run build` and `npm test` are the only checks
  that exist — there is no lint or type-check script.
- **Dates are date-only local calendar strings**; completion timestamps are instants.
  Don't conflate them.
- **Only semantic design tokens**, one radius scale, monochrome accent, hue only
  where it carries meaning.
- **No browser automation exists here.** Building successfully is not visual
  verification — say what you could not check.
- **The DSA section is paused** and its two core files are intentionally unwired.
