# CLAUDE.md

**See [AGENTS.md](AGENTS.md) for the full guide.** It is the canonical reference for
this repo; this file exists so Claude Code picks it up and is kept deliberately thin
to avoid drifting out of sync.

The rules most easily got wrong, repeated here:

- **Never commit.** Leave changes uncommitted for manual review.
- **There is a backend now** — Next.js, MongoDB, Prisma and accounts, added in
  v0.2. The old "no backend, ever" rule was reversed deliberately.
- **Most of the workspace needs an account, as of v0.2.1.** Signed out, only the
  **widget board** and **Settings** work. Tasks, calendar, DSA, Grove,
  productive time, Sounds and Read mode are gated. The policy is the table in
  `packages/core/src/account/gating.js` and nowhere else, and **unknown is not
  signed out** — the gate fails open, so a fresh offline install is never
  walled. This reverses what v0.2 promised; the extension now does request
  `host_permissions`.
- **The extension injects a content script into every page**, added with the
  island (the notch on the top edge). Every older "no content scripts, ever"
  line is stale — including the test that pinned it, which now pins the
  overlay's *shape* instead. What still holds, and is tested at source level:
  `scripts/extension/island.js` reads nothing from the page. See "The island"
  in AGENTS.md before changing either half of it.
- **Ask before adding a runtime dependency.** Still a short, deliberate list.
- **Plain JS, not TypeScript**, including the Prisma and NextAuth wiring.
  `npm test`, `npm run build` (the website) and `npm run build:extension`
  (the extension app)
  are the only checks that exist — there is no lint or type-check script. Run
  both builds; neither covers the other.
- **Secrets stay in the environment.** Never commit a real `DATABASE_URL` or
  `AUTH_SECRET`; `apps/website/.env.example` documents them.
- **Dates are date-only local calendar strings**; completion timestamps are instants.
  Don't conflate them.
- **Only semantic design tokens**, one radius scale, monochrome accent, hue only
  where it carries meaning. They live in `packages/ui/src/tokens.css` and are
  shared by both apps — don't fork them.
- **No browser automation exists here**, and there is no database in this
  environment either. Building successfully is not visual verification, and
  nothing in `apps/website/lib/` has been run against a real MongoDB — say what you
  could not check.
- **The DSA section is paused** and its two core files are intentionally unwired.
