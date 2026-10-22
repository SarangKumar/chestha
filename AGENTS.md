# Vistaar — agent guide

A local-first personal productivity workspace. No account, no backend, no telemetry.
This file is the canonical guide for any agent working in this repo; `CLAUDE.md`
points here.

## Hard rules

1. **Never commit.** Leave all work uncommitted for manual review. This directory
   is not currently a git repository.
2. **No backend, no account, no cloud sync, no analytics, no telemetry.** These are
   settled product decisions, not defaults. Core functionality must not depend on
   an external service.
3. **No new runtime dependencies.** The app ships React and nothing else. If one
   seems genuinely necessary, benchmark first and ask before adding it.
4. **Never promise durability.** Browser storage can be cleared or evicted. Product
   copy says so plainly; do not add language implying permanence or security.
5. **Don't invent requirements.** When a behaviour is ambiguous, flag it rather than
   silently picking. Several open decisions are recorded below.

## Commands

```bash
npm install
npm run dev     # web app on http://localhost:5173
npm run build   # production build — also the only "does it compile" check
npm test        # core logic, node:test, no framework
```

There is **no lint or type-check script**; those four are all that exist. Plain JS
throughout — no TypeScript, by the owner's decision.

## Layout

```
packages/core/     Domain logic, no DOM. Testable without a browser.
apps/web/          Vite 8 + React 19 + Tailwind 4, plain JSX.
apps/extension/    Chrome companion — not built yet.
```

Logic belongs in `packages/core` with a test. Components should read state and
render; they should not own rules.

## Architecture decisions worth knowing

**Dates are date-only.** A due date is a local calendar date string (`2026-10-22`)
with no time and no timezone — see `packages/core/src/dates.js`. A task due Thursday
is due Thursday wherever the user is. This makes a whole family of off-by-one-day
bugs structurally impossible. Event timestamps (completion) are instants, and views
group them by local day via `completedLocalDay`. Do not mix these up.

**One authoritative record.** The calendar renders tasks and stores nothing of its
own. Widgets, sidebar and calendar all read the same records. Progress, overdue
state and completion counts are **derived, never stored**.

**Storage is per-area.** `tasks`, `tags`, `notes`, `dashboard`, `sound`, `settings`
are separate IndexedDB records, each validated on read by `coerceArea` in
`schema.js`. One corrupt area degrades to its default with a visible note; the app
must always open. A blocked store falls back to a labelled memory-only mode.

**Write failures are visible.** A silent failed write looks exactly like success and
is the worst outcome in this product. Surface them, never swallow them.

**The dashboard grid is ordered, not positioned.** A layout is an ordered list of
widgets with a size each — never coordinates. The stored order is the visual order,
the reading order and the phone order, which is what makes keyboard reordering and
responsive layout fall out for free. Unknown widget types degrade visibly, never
fatally.

**Export carries a format version.** `transfer.js` refuses newer formats with a
specific reason. Import is all-or-nothing and snapshots the prior state first.

## Design system

Monochrome, dark-first, with a light counterpart (theme choice is an existing
feature — do not remove it).

- **Only semantic tokens.** Components never use raw palette classes. Surfaces:
  `canvas → surface → raised → overlay`, plus `inset` for input wells and `hover`
  for interactive states. Ink: `ink`, `ink-muted`, `ink-faint`. All defined in
  `apps/web/src/index.css` and mapped through `@theme inline`.
- **Accent is monochrome** — near-white on dark, near-black on light. The solid
  accent button pairs with `text-on-accent`.
- **Hue only where it means something**: `danger`, `warn`, `ok`. Never decoration,
  and never the only signal — pair it with text or an accessible name.
- **One radius scale**: `rounded-chip | rounded-control | rounded-card |
  rounded-panel`. Nothing off-scale.
- **Depth is layered surfaces plus `shadow-card`/`shadow-raised`/`shadow-overlay`.**
  No glassmorphism, no gradients, no neon.
- **Typography roles**, not ad-hoc sizes: `text-display | text-stat | text-page |
  text-card | text-meta`. Numbers get `.tabular`. Avoid uppercase labels.
- **Transitions are scoped and short** — `transition-colors duration-150`, never a
  bare `transition`. `prefers-reduced-motion` is honoured globally.

If you change a colour token, re-run the contrast check before shipping; contrast is
computable, so compute it rather than eyeballing it.

## Accessibility expectations

Every core flow must be completable by keyboard. Focus is always visible, trapped
inside dialogs, and returned on close (`Dialog` in `components/ui.jsx` does this —
reuse it). Icon-only controls carry an accessible name and a 32px hit area. Status is
never colour-alone.

## Verification reality

There is **no browser automation in this environment**. `npm run build` proves it
compiles; `npm test` proves the rules hold. Neither proves anything renders
correctly. Layout, responsive behaviour and interaction need a human with
`npm run dev`. Do not claim a visual or interaction check passed unless it was
actually performed — say what was not checked.

A computed layout audit lives in the session scratchpad pattern: parse the JSX
class names, resolve breakpoint variants, and sum child minimum widths against the
real content width (390px viewport gives 358px; 768px gives 656px; desktop caps at
`max-w-5xl`). That catches overflow arithmetically without a renderer.

## State of the work

- **Built:** dashboard with widget customization, tasks (five standing views,
  filters, sorting), calendar (month grid + day agenda + keyboard date movement),
  settings with export/import/reset, command palette, quick capture.
- **Not built:** ambient sounds (needs the synthesis-vs-bundled-loops decision and a
  licence budget) and the Chrome extension. The Sounds page says so honestly instead
  of showing a convincing stub — keep it that way.
- **Paused:** the DSA section. `packages/core/src/dsa/identity.js` and
  `questions.js` exist but are **not exported from `index.js` and not referenced by
  the app**. Do not resume unless asked.

## Open decisions — do not quietly resolve these

- Multi-tab behaviour (two tabs writing at once) is unresolved; the intended
  direction is a soft single-tab model.
- Recurring tasks are deliberately deferred.
- Keyboard shortcuts are fixed, not rebindable, on purpose.
- No PWA/service worker, to avoid cache-staleness bugs during development.
- For the DSA section, the question library ships **no bundled content**: LeetCode's
  terms forbid scraping, curated list membership is someone else's editorial work,
  and a browser page cannot reach `leetcode.com` anyway because of CORS. Automatic
  tracking is user-initiated file import only.
