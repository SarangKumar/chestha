# Chestha — agent guide

A local-first personal productivity workspace, plus a community side where people
write about how they work. This file is the canonical guide for any agent working
in this repo; `CLAUDE.md` points here.

**The product changed shape in v0.2.** It was account-free and backend-free by
design. It now has accounts, a MongoDB database and a Next.js server, because the
community features and cross-device sync cannot exist without them. Rules 2 and 3
below used to say the opposite; the owner reversed them deliberately. Anything
written before that still carrying "no backend, ever" is stale — this file wins.

**And again in v0.2.1: most of the workspace now needs an account.** v0.2 kept
the whole workspace usable signed out. It no longer is — only the widget board
and Settings are. The extension therefore requests `host_permissions` for the
website and asks it who is signed in, which v0.2 explicitly ruled out. Rule 2
and the "Signing in from the extension" section below are the current statement;
any older text promising a login-free workspace or "no host permissions" is
stale.

## Hard rules

1. **Never commit.** Leave all work uncommitted for manual review.
2. **The widget board works with no account; everything else needs one.**
   Reversed again in v0.2.1, deliberately, by the owner — this rule said the
   opposite twice before, so read it carefully rather than from memory. Signed
   out, two surfaces stay usable: the **dashboard widget board** and
   **Settings** (so export, import, theme and navigation are never trapped
   behind a sign-in). Tasks, the calendar, DSA, the Grove, productive time,
   Sounds and Read mode are gated.

   The policy is a table in `packages/core/src/account/gating.js` and nowhere
   else. Two rules go with it and are both tested:

   - **Unknown is not signed out.** `isSectionAllowed` fails *open*: only a
     definite answer from the website gates anything. A fresh offline install
     has no cached answer and no way to sign in, so treating that as signed out
     would be a wall with no door. Offline, the workspace behaves as the last
     known answer did.
   - **The gate is a page, not a redirect.** The rail, header and open sections
     stay reachable. Nothing bounces the user to the website.

   Signed out, gated sections are **not listed** in the rail or the palette, so
   the product does not advertise what it will refuse. The gate still exists
   because `#/calendar`, a keyboard shortcut and a stale bookmark all still
   reach it. One exception keeps that honest: the section you are *currently*
   on is always listed, gated or not, so arriving by link never leaves the rail
   without a current item. Palette commands declare `requires`, which is how
   that filter and the rail stay on one table.
3. **Ask before adding a runtime dependency.** The list is no longer "React and
   nothing else", but it is still short and deliberate: React, Next, NextAuth and
   the Prisma client. Password hashing uses `node:crypto` scrypt rather than
   bcrypt or argon2 precisely to avoid a native module — see
   `packages/db/src/password.js`.
4. **Never promise durability of browser storage.** It can be cleared or evicted.
   Product copy says so plainly. Sync makes a server copy possible; it does not
   make the local copy permanent, and the copy is only as good as the last sync.
5. **Don't invent requirements.** When a behaviour is ambiguous, flag it rather
   than silently picking. Several open decisions are recorded below.
6. **Secrets stay in the environment.** `apps/website/.env.example` documents every
   variable. Never commit a real `DATABASE_URL` or `AUTH_SECRET`.
   `apps/extension/.env.example` documents the extension app's own build-time
   values, which are public by definition — Vite inlines them into the bundle,
   so nothing secret may go there. `VITE_SITE_URL` is where the website lives,
   and **nothing in the app hardcodes that origin**: `SITE_URL` in
   `apps/extension/src/siteLinks.js` reads the variable with no fallback. The
   per-mode defaults are the committed `apps/extension/.env.development`
   (localhost) and `.env.production` (the deployed site) — the two exceptions to
   the ignored `.env.*`, allowed in `.gitignore` because they are public values
   and because a fresh clone must build correctly with no setup. `.env.local`
   overrides both and stays ignored. A missing or non-http(s) value **fails the
   build**, checked in `apps/extension/vite.config.js`, so it cannot become a
   `new URL()` throw on someone's New Tab.

## Commands

```bash
npm install               # also runs `prisma generate` via postinstall
cp apps/website/.env.example apps/website/.env   # then fill DATABASE_URL and AUTH_SECRET
# apps/extension needs no env setup: .env.development and .env.production are committed.
# Copy .env.example to apps/extension/.env.local only to point at a different website.

npm run dev               # the website (Next.js) on http://localhost:3000
npm run dev:extension     # the extension app (Vite) on http://localhost:5173
npm run build             # production build of the website — its compile check
npm run build:extension   # production build of the extension app (Vite)
npm test                  # core + db + extension logic, node:test, no framework
npm run preview           # serve the built apps/extension/dist

npm run db:generate       # regenerate the Prisma client after a schema change
npm run db:push           # push the schema to MongoDB (no migration files on Mongo)
npm run db:seed           # upsert the curated categories; idempotent
npm run db:studio         # browse the database

npm run work              # build:extension, then assemble dist/extension (load unpacked)
npm run watch:work        # rebuild the unpacked extension on change
npm run pack:work         # write release/chestha-<version>.zip for the Web Store
npm run backgrounds       # regenerate apps/extension/public/backgrounds/catalog.json
npm run dsa-pack          # rebuild bundled DSA packs (dev tool, uses the network)
```

`npm run build` is the **website** build; the extension app's build is
`build:extension`. Both are worth running: they compile different trees and
neither covers the other. The three `*:work` scripts are the extension
*packaging* steps — `work` assembles the unpacked folder, `pack:work` zips it.

npm workspaces: `@chestha/website` (apps/website), `@chestha/extension` (apps/extension),
`packages/core`, `packages/db`, `packages/ui`. There is **no lint or type-check
script**; the list above is everything that exists. Plain JS throughout — no
TypeScript, by the owner's decision, including the Prisma and NextAuth wiring.

### Two version traps, both already sprung

**Prisma is pinned to 6.x on purpose — do not "upgrade" it.** Prisma 7 removed
`url` from the datasource and requires a driver adapter at runtime, and there is
no MongoDB driver adapter. Under 7 this schema still generates but cannot
connect to Mongo at all except through paid Accelerate. The pin is recorded in
`packages/db/prisma/schema.prisma` too. `@auth/prisma-adapter` declares
`@prisma/client` as a peer with an open range, so `apps/website` pins it as well —
without that, npm resolves a second, newer client and generates against one copy
while the app imports another.

**The Prisma CLI lives in the root `devDependencies`, not in `packages/db`.**
Nested in a workspace, npm silently dropped several of its transitive
dependencies (`fast-check`, `empathic`, `pathe`) and `prisma generate` died on a
missing module. Hoisted to the root it resolves flat and needs no workarounds.

## Layout

```
packages/core/     Domain logic, no DOM, no Node built-ins. Testable without a
                   browser, and imported by both apps.
packages/db/       Prisma schema, the client singleton, and scrypt password
                   hashing. Server-only — `password.js` is a separate entry
                   point so `node:crypto` can never reach a browser bundle.
packages/ui/       The design tokens, shared so the site and the extension
                   cannot drift into two palettes.
apps/website/      Next.js 16 App Router + Tailwind 4, plain JSX. The website,
                   accounts, posts and profiles.
apps/extension/    Vite 8 + React 19 + Tailwind 4, plain JSX. The workspace —
                   the app the extension ships as its New Tab page.
scripts/           Build, watch, pack, backgrounds and DSA-pack scripts, plus
                   `extension/` holding the MV3 shell: manifest.json, the
                   background service worker and the tracker content script.
                   They live here, not in apps/extension, because they are a
                   different runtime and must be copied verbatim rather than
                   bundled by Vite.
dist/extension/    The assembled unpacked extension (generated, git-ignored):
                   the Vite build plus the MV3 shell. It is at the root rather
                   than under apps/extension/ so build output is not nested
                   inside build output.
release/           Web Store archives (generated, git-ignored).
```

**Why two apps rather than one.** The extension New Tab page has to be a static
client bundle: MV3 cannot run a server, and its `script-src 'self'` CSP forbids
the inline script Next's runtime emits. So the Vite app stays, owning the
workspace, and the Next app owns everything that needs a server. `apps/` holds
exactly those two; nothing else belongs there. The design tokens and
all domain logic are shared through `packages/`, which is what keeps them from
becoming two products.

Logic belongs in `packages/core` with a test. Components should read state and
render; they should not own rules.

## Architecture decisions worth knowing

**Dates are date-only.** A due date is a local calendar date string (`2026-10-22`)
with no time and no timezone — see `packages/core/src/dates.js`. A task due Thursday
is due Thursday wherever the user is. This makes a whole family of off-by-one-day
bugs structurally impossible. Event timestamps (completion) are instants, and views
group them by local day via `completedLocalDay`. Do not mix these up.

**One authoritative record.** The calendar renders tasks and stores nothing of its
own. Widgets, tasks views and calendar all read the same records. Progress, overdue
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

**Accounts are email and password, with the OAuth seam left open.**
`apps/website/auth.js` is the whole of it. Three choices there are load-bearing.
The Prisma adapter is installed even though credentials do not use it, because
it is what writes the `Account` row a provider needs — so adding Google or
GitHub is one entry in `providers` and no schema change. Its `createUser` is
wrapped, because `handle` is required and unique and no provider supplies one:
without that wrapping an OAuth sign-up fails at the insert, before any callback
could redirect anywhere. The wrapper assigns a provisional handle and sets
`handleChosen: false`, which is what routes the user to `/onboarding/username`
to pick their own. And sessions are JWTs,
not database rows, because NextAuth does not support database sessions with the
Credentials provider and the strategy cannot vary per provider. The `Session`
table is therefore empty by design. There is **no email verification step**, by
product decision; `emailVerified` is only ever set by a provider that vouches
for the address.

**Passwords use `node:crypto` scrypt, not bcrypt or argon2.** Memory-hard, in
the standard library, no native build step. The stored string carries its own
parameters (`scrypt$N$r$p$salt$hash`), so cost can be raised later without
invalidating existing hashes — `needsRehash` reports which are behind and the
sign-in path upgrades them in place, at the one moment the plaintext is known to
be correct. `verifyPassword` returns false rather than throwing for a missing or
malformed hash, because an OAuth-created account has no password and sign-in
must not distinguish that from a wrong one.

**Credential failures say one thing.** "No account with that email" turns a
sign-in form into a way to discover who has an account. Every failure — unknown
email, no password set, wrong password — returns the same message. The same
reasoning applies to posts: a post that does not exist and someone else's draft
give the same answer, so post ids cannot be enumerated.

**Usernames are route segments.** `/user/<handle>` shares a namespace with the
site's own pages, so `RESERVED_USERNAMES` in `packages/core/src/account/username.js`
refuses anything that would shadow a route or let an account look official.
`handle` is the canonical lowercase key and the unique index; `displayUsername`
keeps the casing the user typed. Add a top-level route, add its segment to that
list in the same change.

**One function decides what is public.** `buildProfileCard` filters to published
posts and omits the email itself, rather than trusting each page to pass a
pre-filtered list. The profile card is the one place where getting visibility
wrong leaks a draft publicly, so that reasoning lives in exactly one place.

**A post's status is stored; its visibility is derived.** Unlike the DSA
statuses, nothing in a post record implies whether its author *wants* it public,
so `status` is authorial intent and is stored. `draft` and `unpublished` are
deliberately distinct: both are invisible, but an unpublished post has been
public before, so its slug is already in other people's hands and stays frozen,
and `firstPublishedAt` survives so re-publishing does not reset its date.
Status moves only through `applyTransition`, never through an edit — which is
why `applyPostEdit` ignores a `status` key.

**Signing in from the extension rests on one Chromium rule.** The New Tab is a
static bundle on `chrome-extension://`, so it cannot read the website's session
cookie the way a page on the site can. It asks `GET /api/session` with
`credentials: 'include'`, and that request carries the `SameSite=Lax` NextAuth
cookie **only because** Chromium treats a request as first-party for SameSite
purposes when "the request initiator is an extension with access to the
requested URL" — `chrome/browser/extensions/extension_samesite_cookies_browsertest.cc`.
Two consequences, and getting either wrong fails silently with every user
appearing signed out:

- **The extension must declare `host_permissions` for the website origin.** It
  is not in the committed `scripts/extension/manifest.json`, because the origin
  is a build-time value (`VITE_SITE_URL`). `scripts/build-extension.mjs` injects
  it while assembling, reading `.site-origin` — a file the Vite build emits from
  the same `loadEnv` the bundle was built with. That indirection exists so the
  manifest cannot name a different origin than the bundle; do not re-resolve the
  env files in the assembly script, and do not hardcode the origin in the
  manifest.
- **The fetch must happen on the extension *page*, not in the service worker.**
  A worker has no initiator frame and gets no exemption. The fetch lives in
  `apps/extension/src/app/session.js`, which runs on the New Tab document. Do
  not move it into `background.js`.

This is daily.dev's pattern — scoped host permission, a cookie'd boot call, a
cached answer — and it was chosen over a token handed to the extension because a
copied token goes stale and cannot be revoked. It is also the **fourth** opt-in
network surface and the first that identifies the user, so unlike the other
three it is not opt-in at all: it fires on New Tab open whenever the cached
answer is older than `SESSION_MAX_AGE_MS`. `README.md`, `TERMS.md`, `About.jsx`
and `docs/chrome-store/PRIVACY-PRACTICES.md` all had to change, including the
"no host permissions, no content scripts" line that is no longer true of the
first half.

`/api/profile` is the **fifth**, added with the profile card. It rides the same
mechanism — same origin, same cookie, same exemption — and is deliberately a
*second* endpoint rather than a wider `/api/session`: the session check is one
boolean asked by every New Tab, while this is several queries asked only when a
card is on screen. It answers only for the cookie's own owner and takes no
handle, so it cannot be used to enumerate accounts. Being on an already-declared
origin, it adds no permission and no destination — which is why the docs state
*five surfaces to two destinations*, not five destinations.

`/api/posts/mine` is the **sixth**, added with writing from the extension. Same
origin, same cookie, same exemption again, and the first that *writes*: a post
is created, edited, published and deleted through it. Nothing about it widens
the extension's reach, but it is the surface where an ownership bug would be
worst — so `editPost`, `changePostStatus` and `deletePost` each re-check
ownership against the session id rather than trusting the id in the body. The
credentialed CORS rules for all three cookie'd routes now live in one place,
`apps/website/lib/extensionCors.js`; a fourth copy of that allowlist was the
drift this consolidation was meant to prevent.

The cached answer lives in `chrome.storage.local` (`localStorage` on the website
build) and is read synchronously at first paint, so the board never waits on the
network and an offline New Tab gates as the last answer did. Every failure path
— offline, 503, malformed body, corrupt cache — coerces to `unknown`, which
fails open. A 503 from `/api/session` deliberately carries no `signedIn` key for
that reason: a database hiccup must not lock the workspace.

**Workspace sync is per-area, with revisions rather than clocks.** It is built
on the fact that storage is already per-area, so each area syncs independently
and a conflict in `settings` cannot endanger `tasks`. Each area carries a
server-assigned integer `rev`; a push on the current revision is a
fast-forward, anything else is a real concurrent edit. Device clocks disagree,
and a skewed clock silently discards real work, which is why revisions decide
*whether* to merge even though timestamps decide *what wins* inside one.

`AREA_MERGE` in `packages/core/src/sync/areas.js` gives every area a strategy
chosen by the shape of what it stores, not by its name — only `tasks` is a bare
id-keyed list, `tags` is plain strings, and the other record collections sit
nested beside derived caches. A test asserts the table covers `AREAS` exactly,
so adding an area forces that decision rather than defaulting to overwriting
user data.

Two things there are easy to get wrong. **Deletes need tombstones**: a record
deleted on one device is merely absent from its list, and merging with a device
that still has it resurrects it — so the local store has to log
`{ id, deletedAt }` rather than just splicing the array. And **tie-breaks must
be commutative**: breaking an equal-timestamp tie by side ("remote wins") is
not, so two devices merging the same pair in opposite positions would each keep
a different record and never converge. Ties are broken on content instead.

## Design system

Monochrome, dark-first, with a light counterpart (theme choice is an existing
feature — do not remove it).

- **Only semantic tokens.** Components never use raw palette classes. Surfaces:
  `canvas → surface → raised → overlay`, plus `inset` for input wells and `hover`
  for interactive states. Ink: `ink`, `ink-muted`, `ink-faint`. All defined in
  `apps/extension/src/index.css` and mapped through `@theme inline`.
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

- **Accounts, posts and profiles — foundation (pass 1 of 2).** Shipped: the
  Next.js app, the Prisma schema, email/password sign-up and sign-in, the public
  profile at `/user/<handle>` with its share button and OG image, the feed and
  post pages, and the whole domain layer with 63 tests
  (`packages/core/src/{account,posts,sync}`, `packages/db/src/password.js`).
  **Not yet built:** the post editor, the draft/publish/unpublish controls, an
  author's own post list, bookmarks, upvotes, follows, and the sync transport.
  The data access for posts (`apps/website/lib/posts.js`) is written and ready for
  that UI.

  **Password sign-up is gmail-only.** `ALLOWED_SIGNUP_DOMAINS` in
  `packages/core/src/account/credentials.js` is the entire policy, applied by
  `validateSignupEmail` and used only by `registerUser`. Two rules go with it:
  sign-in uses plain `validateEmail` so a change to the list can never lock out
  an existing account, and **an OAuth sign-in must never use
  `validateSignupEmail`** — a Google Workspace address is a company domain, so a
  gmail-only check there would reject the users Google sign-in exists to admit.
  See `docs/enabling-google-auth.md`.

  **The sign-up form asks for the password twice**, and
  `validatePasswordConfirmation` is checked by `registerUser`, not only in the
  browser. It is a required argument rather than an optional one, so a new
  caller with no confirmation to offer has to be deliberate about it. The
  comparison normalises with **NFKC, matching `hashPassword` in
  `@chestha/db`** — any other form would report a mismatch for a pair the KDF
  then treats as the same password. There is no password reset yet, and no
  email verification, which is why the second box is worth its friction.

  **The editor is now the blocking item.** Read mode on the start screen reads the
  published feed, and until there is a way to publish, it correctly shows its empty
  state to everyone. The surface is finished; the content pipeline is not.
- **Sign-in gating (v0.2.1).** Shipped: the policy table and its 21 tests, the
  `/api/session` endpoint, the cached session reader, the gate page, nav-rail
  hiding of gated sections, the session-aware account menu, the injected host
  permission, and
  every privacy document restated. The free surfaces are the widget board and
  Settings; everything else is gated.

  Two scope calls were mine, not the owner's, and are worth revisiting:
  **`tasks` is gated** (it was named in neither list, and keeping it free was
  declined), and **`websites` is gated with the Grove** because productive time
  exists to earn XP and writes the same `grove.*` areas. Either can move by
  editing one array in `gating.js`.

  **What is not done:** nothing signs the user out from inside the workspace —
  the account menu links to the website and clears the cached answer, because
  the cookie is the website's to clear. Widgets are not gated, so a tasks widget
  on the free board still reads and completes tasks while the tasks *section* is
  behind the gate; hiding a section has never hidden its widgets, and that rule
  was left alone.
- **Verification status for sign-in gating.** `npm test` (423 tests),
  `npm run build`, `npm run build:extension`, `npm run work` and
  `npm run pack:work` all pass, and the assembled manifest was read back to
  confirm the injected `host_permissions`. **Nothing has been exercised in a
  browser or against a real MongoDB.** In particular: the SameSite exemption
  that the whole mechanism rests on is confirmed only from Chromium's test
  suite, not observed here; `/api/session` has never answered a real request;
  and no gate, rail or account menu has been rendered — including the account
  popover, which was moved into a portal to escape the rail's overflow clip and
  whose hand-computed position has not been seen on screen. Loading the unpacked
  extension against a running website with a `DATABASE_URL` is the first real
  check, and the thing to watch is whether the session cookie actually arrives.
- **Verification status for pass 1.** `npm test`, `npm run build` and
  `npm run build:extension` all pass. **Nothing has been exercised against a real
  MongoDB** — there was no database in the environment — so every query in
  `apps/website/lib/` is unproven at runtime, and no page has been rendered in a
  browser. Sign-up, sign-in and the profile page need a human with a
  `DATABASE_URL` before they can be called working.
- **The start screen has two modes.** `#/dashboard` renders either the widget board
  or Read mode, chosen by the `startMode` setting and switched from a segmented
  control in the shell header. It is a persisted preference, **not a route**, so a
  deep link to the start screen honours whichever the user last chose. The board is
  the default and `Dashboard.jsx` is untouched by the split — the branch sits above
  it in `App.jsx`.

  Read mode (`apps/extension/src/sections/Reading.jsx`) lists published posts from
  `/api/posts` on the website, caching them in the lazy `reading` area so it paints
  instantly and still works offline. Three rules hold it together:
  **nothing is requested until that component mounts** — which is the entire privacy
  argument, so do not hoist the fetch or the `ensureArea` call into the Shell;
  **the cache paints before the network is consulted**, so a failed revalidation is a
  note beside stale content rather than an error page; and **posts are read on the
  website**, because bodies are Markdown and the extension has no sanitiser, so the
  feed carries no bodies at all.

  This made Read mode the **third** opt-in network surface, after the GitHub and
  weather widgets. The sign-in check is the **fourth** — and the one that breaks
  the pattern: it identifies the user and it is not opt-in, because the gate
  cannot work without it. The profile card's `/api/profile` is the **fifth**,
  and the first that did *not* widen anything: same origin, same cookie, no new
  permission. `README.md`, `TERMS.md`, `About.jsx` (both copies — the extension
  section and the website page) and `docs/chrome-store/PRIVACY-PRACTICES.md` all
  state the count; all of them have been updated. Writing from the extension
  added the **sixth** (`/api/posts/mine`), which is also the first that writes;
  the same files were updated again, and a seventh must update them again.
- **Built:** dashboard with widget customization, tasks (five standing views,
  filters, sorting), calendar (month grid + day agenda + keyboard date movement),
  settings with export/import/reset, command palette, quick capture.
- **Sounds are built**: 12 bundled recordings across 5 groups
  (`packages/core/src/sound.js` holds the catalogue and preset rules;
  `apps/extension/src/audio/engine.js` is the Web Audio engine). Every sound is a
  file in `apps/extension/public/audio/`, fetched from the app's own origin and
  decoded once, so playback works offline and nothing leaves the machine. **The
  synthesised library was removed** — 18 sounds built from filtered noise, tones,
  LFOs and grain bursts, accurate as noise but never restful. Don't reintroduce
  it; the engine no longer has a synthesis path, and the only thing still
  generated there is the end-of-session chime. The shipped files are AAC `.m4a`
  (`afconvert -f m4af -d aac -b 112000 -s 3`), under 10 MB in total, licensed from
  Mixkit under the Mixkit Free License, and **`scripts/pack-extension.mjs` always
  ships them** while still stripping the author's other media — it reads the keep
  list from `SOUNDS` and refuses the pack if a named file is missing. Users can add
  their own recordings by dropping files in that folder and listing them in
  `catalog.json`; the manifest rejects absolute paths, `..` and remote URLs, so it
  cannot make the app fetch from elsewhere. **Pixabay cannot be downloaded from
  automatically** — it returns 403 to automated requests, like LeetCode. The engine
  is a module singleton so navigation cannot duplicate a voice; each voice is
  scaled by 1/sqrt(n) and a compressor sits before the destination, so a busy mix
  cannot clip. Audio only starts from a user gesture — a paused mix is restored
  pre-armed and never shown as playing while silent.
- **Keyboard shortcuts are customisable.** `packages/core/src/shortcuts.js` is the
  single registry: actions, defaults, combo parsing, conflict detection, reserved
  browser combos and storage validation. `apps/extension/src/app/useShortcutDispatch.js`
  is the **only** global key listener in the app — do not add another. Overrides
  persist in the existing `settings` area.
- **Chrome extension is built**: MV3 New Tab replacement, see `apps/extension/` and
  `npm run build:extension` / `pack:work`.
- **DSA section — foundation only (increment B of F), and hidden by default.**
  `DEFAULT_SETTINGS.hiddenSections` ships as `['dsa']`, so a new profile does not
  meet the least finished part of the product first. This is a default and not a
  removal: Settings → Navigation turns it back on, and `#/dsa` and the command
  palette still reach it, as they do for any hidden section. It only affects
  profiles with no stored settings — an existing `hiddenSections` is left alone,
  because an empty list cannot be told apart from a deliberate "show everything".
  The `dsaToday` and `daily` widgets remain in the picker; hiding a section has
  never hidden its widgets, and both work standalone.

  Wired in and navigable at
  `#/dsa`. The domain rules live in `packages/core/src/dsa/` with 37 tests. Shipped:
  canonical question records, shared solving history, the revision ladder, daily
  target counting, weak-topic rules, four storage areas, version-2 export. Not yet
  built: search/filters/sorting, URL-based adding, the data-pack importer, curated
  and personal list pages, solving and revision UI, analytics.
- **Bundled question data.** Two packs ship in `apps/extension/public/dsa-packs/`,
  regenerated by `node scripts/build-dsa-pack.mjs`: `curated-core.json` (Blind 75, Grind 75,
  Grind 169, NeetCode 75/150/250, LeetCode 75, Top Interview 150, Striver 180) and
  `leetcode-index.json` (full public problem metadata only). Both
  upstream sources were MIT- or ISC-licensed when fetched; the generator refuses to emit a
  pack if any list's size disagrees with its documented total.

  **`companies.json` is the exception to the licence rule, and a deliberate one.**
  Company→question membership comes from
  `github.com/liquidslr/leetcode-company-wise-problems`, which carries **no licence
  file** — so no licence is granted and default copyright applies — and which is
  derived upstream from LeetCode's company tags, a paid LeetCode feature. Every other
  bundled source here is MIT or ISC. It ships by an explicit decision of the project
  owner, taken after the conflict with this rule and with "never scrape LeetCode" was
  raised. Only the mapping and its ranking order are kept; the Frequency and
  Acceptance Rate columns are dropped. If that decision is ever revisited, the
  generator stage and the `BUNDLED_PACKS` entry are the two places to remove. **Only facts are
  bundled** — title, slug, difficulty, topic tags, question id. Problem statements
  are LeetCode's copyrighted text and must never be included.

  **Striver's 180 Sheet is the one list whose membership is our own reading of a
  published page**, and it ships deliberately partial. `scripts/data/striver-180.json`
  is a hand transcription of the sheet's section listing — title, section, group,
  Basic/Core/Pro tier, and the matched problem's LeetCode URL, nothing else — so
  that stage of the build is offline and auditable by reading the file. 145 of the
  179 entries are a LeetCode problem and ship as membership; the other 34 are
  algorithm or implementation exercises (Dijkstra, Kosaraju, heapify, Rabin-Karp,
  a DSU) with no LeetCode question to key them to, and each records its reason
  there. **Do not fill those in with a problem that merely shares the technique**,
  and do not invent a 180th entry: the sheet is branded 180 and its own counters
  sum to 179. A question's identity here is a LeetCode slug, so a mapping is only
  allowed where the sheet's problem *is* that LeetCode problem. The build fails if
  the entry or mapped count moves without `STRIVER_EXPECTED` being updated to
  match, or if an entry's `url` and `slug` disagree.

  The Striver **A2Z and SDE** sheets are still not bundled: no source was found
  publishing their membership with a usable licence and a verifiable size.

## Open decisions — do not quietly resolve these

- **The sync transport does not exist yet.** `planSync` and `mergeArea` decide
  what *should* happen and are tested; nothing calls them. The API routes, the
  client scheduler and the tombstone log in the local store are the next pass.
  Until that lands, `WorkspaceArea` is never written.
- **`notes` merges last-write-wins.** It is a single text blob, and merging two
  edits of one document needs a text-level three-way diff. The loser is handed
  back rather than dropped, which is the honest interim answer, not a good one.
- **`grove.time.days` merges last-write-wins per day.** If the same day was
  tracked on two devices at once, neither summing (double-counts the overlap)
  nor picking one (loses the other) is correct without per-session detail.
  Picking one is the lesser harm for now.
- **The seed category list is a product decision** that has not been reviewed.
  `SEED_CATEGORIES` only bootstraps an empty database; categories are rows and
  editable without a deploy.
- **Post bodies are authored as Markdown but rendered as plain paragraphs.**
  Rendering untrusted Markdown as HTML needs a sanitiser, and that is a
  dependency decision for the editor pass. Do not render it as HTML before then.
- **`Bookmark`, `Upvote` and `Follow` exist in the schema with no UI.** They are
  there so the feed can grow into them without a migration; nothing reads them.
- Multi-tab behaviour (two tabs writing at once) is unresolved; the intended
  direction is a soft single-tab model. Sync makes this sharper, not softer —
  two tabs are two writers against the same local store.
- Recurring tasks are deliberately deferred.
- Keyboard shortcuts are fixed, not rebindable, on purpose.
- No PWA/service worker, to avoid cache-staleness bugs during development.
- For the DSA section: **never scrape LeetCode** — their terms forbid crawling, and
  the app must make no external request at runtime. Packs are fetched from the app's
  own origin. Live progress import is not possible from a page (no CORS grant), so
  automatic tracking is user-initiated file import only. Note that CORS is *not* a
  reason data cannot be bundled at build time — those are different questions.
