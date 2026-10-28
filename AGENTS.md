# Chestha — agent guide

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
npm run dev               # web app on http://localhost:5173
npm run build             # production build — also the only "does it compile" check
npm test                  # core + web logic, node:test, no framework
npm run preview           # serve the built apps/web/dist
npm run build:extension   # build, then assemble apps/extension/dist (load unpacked)
npm run watch:extension   # rebuild the extension on change
npm run pack:extension    # write release/chestha-<version>.zip for the Web Store
npm run backgrounds       # regenerate apps/web/public/backgrounds/catalog.json
npm run dsa-pack          # rebuild bundled DSA packs (dev tool, uses the network)
```

npm workspaces: `@chestha/web` (apps/web) and `packages/core`. There is **no lint or
type-check script**; the list above is everything that exists. Plain JS
throughout — no TypeScript, by the owner's decision.

## Layout

```
packages/core/     Domain logic, no DOM. Testable without a browser.
apps/web/          Vite 8 + React 19 + Tailwind 4, plain JSX.
apps/extension/    MV3 manifest + service worker; the built web app is copied in
                   beside them to replace the New Tab page.
tools/             Build, watch, pack, backgrounds and DSA-pack scripts.
release/           Web Store archives (generated, git-ignored).
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
and the four `dsa.*` areas are separate IndexedDB records, each validated on read by
`coerceArea` in `schema.js`. One corrupt area degrades to its default with a visible
note; the app must always open. A blocked store falls back to a labelled memory-only
mode.

**`dsa.library` is lazy.** It is skipped by `store.init()` and loaded by
`ensureArea()` when the DSA section opens, so an unused feature never slows the
first paint. Anything that snapshots the whole state — export above all — must
`await store.ensureAllAreas()` first, or it will write a default over a populated
area. The DSA areas are split by write frequency, not by entity, so rating a
question rewrites a few KB of `dsa.progress` rather than the whole library.

**DSA keeps three axes, not one status.** Progress, revision state and confidence
are stored independently; the five display statuses (`not-started`, `attempted`,
`solved`, `needs-revision`, `mastered`) are *derived* in `dsa/status.js`. A question
is routinely solved, due for revision and low-confidence at once, which no single
enum can express.

**Write failures are visible.** A silent failed write looks exactly like success and
is the worst outcome in this product. Surface them, never swallow them.

**The dashboard is a coordinate grid with compaction** (`packages/core/src/layout.js`).
Each widget is `{x, y, w, h}` on a four-column grid; nothing is positioned in
pixels, so a layout is resolution-independent and every operation is deterministic
and testable. `compact()` floats widgets upward into free space keeping their
column — that is the rule that keeps the dashboard gap-free, including closing the
hole a moved widget leaves behind. `moveItem`/`resizeItem` push only what is
genuinely in the way, then compact. `isValidLayout()` is the invariant (in bounds,
no overlap) that every operation preserves; assert it in tests.

The stored layout is always at `BASE_COLUMNS` (4) and `projectToColumns()` reflows
it for narrower screens, so a phone never rewrites the desktop arrangement. Layout
editing is therefore enabled only at full width. Unknown widget types degrade
visibly, never fatally.

A v1 layout (ordered list with a `size` name) migrates on read via
`migrateOrderedLayout()`, which lays widgets out in their stored order so the
user's arrangement survives. Don't drop that path while old data can exist.

**Widgets declare their own presentation** (`card` / `transparent` / `inset`) in the
registry, overridable per instance via `config.presentation` and validated in
`schema.js`. The clock defaults to `transparent`; transparent widgets hide their card
header in normal use and regain a dashed outline in edit mode so they stay draggable.

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
`max-w-6xl`). That catches overflow arithmetically without a renderer.

## State of the work

- **Built:** dashboard with widget customization, tasks (five standing views,
  filters, sorting), calendar (month grid + day agenda + keyboard date movement),
  settings with export/import/reset, command palette, quick capture.
- **Sounds are built**: 14 synthesised in the browser across 6 groups
  (`packages/core/src/sound.js` holds the catalogue and preset rules;
  `apps/web/src/audio/engine.js` is the Web Audio engine). Each sound is a stack of
  layers — shaped noise or tones, optional filters, LFOs and scheduled grain
  bursts, which is what gives fire its crackle and thunder its rumble. No audio
  files, no licence to verify, works offline. Users can add their own recordings by
  dropping files in `apps/web/public/audio/` and listing them in `catalog.json`;
  the manifest rejects absolute paths, `..` and remote URLs, so it cannot make the
  app fetch from elsewhere. **Pixabay cannot be downloaded from automatically** —
  it returns 403 to automated requests, like LeetCode. The engine is a module singleton so navigation
  cannot duplicate a voice; each voice is scaled by 1/sqrt(n) and a compressor sits
  before the destination, so a busy mix cannot clip. Audio only starts from a user
  gesture — a paused mix is restored pre-armed and never shown as playing while
  silent.
- **Keyboard shortcuts are customisable.** `packages/core/src/shortcuts.js` is the
  single registry: actions, defaults, combo parsing, conflict detection, reserved
  browser combos and storage validation. `apps/web/src/app/useShortcutDispatch.js`
  is the **only** global key listener in the app — do not add another. Overrides
  persist in the existing `settings` area.
- **Chrome extension is built**: MV3 New Tab replacement, see `apps/extension/` and
  `npm run build:extension` / `pack:extension`.
- **DSA section — foundation only (increment B of F).** Wired in and navigable at
  `#/dsa`. The domain rules live in `packages/core/src/dsa/` with 31 tests. Shipped:
  canonical question records, shared solving history, the revision ladder, daily
  target counting, weak-topic rules, four storage areas, version-2 export. Not yet
  built: search/filters/sorting, URL-based adding, the data-pack importer, curated
  and personal list pages, solving and revision UI, analytics.
- **Bundled question data.** Two packs ship in `apps/web/public/dsa-packs/`,
  regenerated by `node tools/build-dsa-pack.mjs`: `curated-core.json` (Blind 75, Grind 75,
  Grind 169, NeetCode 150/250, LeetCode 75, Top Interview 150) and
  `leetcode-index.json` (full public problem metadata only). Both
  upstream sources were MIT- or ISC-licensed when fetched; the generator refuses to emit a
  pack if any list's size disagrees with its documented total. **Only facts are
  bundled** — title, slug, difficulty, topic tags, question id. Problem statements
  are LeetCode's copyrighted text and must never be included. NeetCode 75
  and the Striver sheets are not bundled: no source was found publishing their
  membership with a usable licence and a verifiable size.

## Open decisions — do not quietly resolve these

- Multi-tab behaviour (two tabs writing at once) is unresolved; the intended
  direction is a soft single-tab model.
- Recurring tasks are deliberately deferred.
- Keyboard shortcuts are fixed, not rebindable, on purpose.
- No PWA/service worker, to avoid cache-staleness bugs during development.
- For the DSA section: **never scrape LeetCode** — their terms forbid crawling, and
  the app must make no external request at runtime. Packs are fetched from the app's
  own origin. Live progress import is not possible from a page (no CORS grant), so
  automatic tracking is user-initiated file import only. Note that CORS is *not* a
  reason data cannot be bundled at build time — those are different questions.
