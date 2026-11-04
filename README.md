# Chestha

A local-first personal productivity workspace — tasks, a calendar, ambient sound, a
scratchpad dashboard and a DSA practice tracker, in one tab. No telemetry. Your data
is stored by your browser, on your device, and an export file is the only copy that
survives a cleared browser.

The **widget board** works with no account. The other sections need a free one —
signing in changes who may use them, not where your data lives.

Runs as a web app, or as a Chrome extension that replaces the New Tab page.

## Repository layout

```
packages/core/     Domain logic with no DOM: dates, task rules, recurrence,
                   the layout engine, storage, export/import, DSA scheduling,
                   and the account, post and sync rules
packages/db/       Prisma schema, the client, and password hashing (server-only)
packages/ui/       The design tokens, shared by both apps
apps/website/      The website (Next.js + React + Tailwind, plain JSX):
                   accounts, posts, profiles
apps/extension/    The workspace application (Vite + React + Tailwind, plain
                   JSX) — the app the extension ships
scripts/           Development scripts — see Commands. `scripts/extension/`
                   holds the MV3 shell (manifest, service worker, tracker),
                   which is copied verbatim rather than bundled
dist/extension/    The assembled unpacked extension (generated, git-ignored):
                   the built app plus the MV3 shell, so it is the same app
                   from a chrome-extension:// origin
release/           Web Store archives (generated, git-ignored)
```

`packages/core` holds everything that can be reasoned about and tested without a
browser, which is why the behavioural rules live there rather than in components. It
is also why the test suite needs no browser or test framework.

## Commands

Run `npm install` once first. Everything below is run from the repository root.

### Day to day

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server for the **website** on <http://localhost:3000> — accounts, posts and profiles. Needs `apps/website/.env`. |
| `npm run dev:extension` | Vite dev server for the **extension app** (the workspace) on <http://localhost:5173>, with hot reload. The ordinary way to work on the workspace UI. |
| `npm test` | The whole suite — `packages/core/test`, `packages/db/test` and `apps/extension/test` — via `node --test`. No test framework and no browser; pure logic only. Run it before calling anything done. |
| `npm run build` | Production build of the website. |
| `npm run build:extension` | Production build of the extension app. Regenerates the background catalogue first (see `backgrounds`), then builds into `apps/extension/dist`. |
| `npm run preview` | Serves the already-built `apps/extension/dist` locally. Use it to check the production bundle, not for development — it does not rebuild. |

Both builds are worth running: they compile different trees and neither covers
the other.

### The database

| Script | What it does |
| --- | --- |
| `npm run db:generate` | Regenerates the Prisma client. Also runs automatically on `npm install`. |
| `npm run db:push` | Pushes the schema to MongoDB. There are no migration files — the Mongo connector does not use them. |
| `npm run db:seed` | Upserts the curated categories. Idempotent, and it will not resurrect a category you deleted. |
| `npm run db:studio` | Opens Prisma Studio to browse the data. |

### The Chrome extension

| Command | What it does |
| --- | --- |
| `npm run work` | Runs `build:extension`, then copies `apps/extension/dist` plus `scripts/extension` (the manifest, service worker and tracker) into `dist/extension`. Prints how to load it unpacked. Chrome does not notice the rebuild by itself — press the reload icon on the extension's card afterwards. |
| `npm run watch:work` | Vite's own watch mode plus the extension assembly, so `dist/extension` is re-made after every change. Still needs the reload press in Chrome for manifest or worker changes; a page-only change just needs Cmd/Ctrl+R on the New Tab page. |
| `npm run pack:work` | Builds the extension, then writes `release/chestha-<version>.zip` ready to upload to the Chrome Web Store. See below. |

#### What `pack:work` strips, and why

The unpacked build is a development artefact: it carries whatever wallpaper and extra
audio you dropped into `apps/extension/public`, plus the READMEs explaining how to add
more. The packing step removes those by default, for two reasons.

- **Licence.** Media you may use locally is not automatically media you may
  redistribute to every installer. Stripping is the default so shipping someone
  else's file is a deliberate act, not an accident.
- **Size.** A single bundled recording can be tens of megabytes, downloaded by
  everyone who installs whether or not they open the Sounds page.

The twelve-sound library is the exception and always ships. Those files *are* the
Sounds page — they are declared in `packages/core/src/sound.js`, licensed for
redistribution, and about 8.5 MB in total; stripping them would publish an extension
with an empty library and no way to fill it. The pack script reads its keep list from
`SOUNDS` and refuses the pack outright if a named file is missing from the build.

The `audio/catalog.json` and `backgrounds/catalog.json` files stay, rewritten with
empty lists — the app fetches them on load, and an empty list is a state it already
handles while a 404 is not. Also dropped: the two folder READMEs, and `icon.png`,
which the sized icons supersede and nothing references.

Pass `--keep-media` (`node scripts/pack-extension.mjs --keep-media`) to include your
own wallpaper and extra audio as well. Only do that if you hold redistribution rights
for every one of those files.

The pack script strips staging after writing `release/chestha-<version>.zip`; open that zip to see exactly what
went into the archive after the fact.

### Occasional, run by hand

| Command | What it does |
| --- | --- |
| `npm run backgrounds` | Rewrites `apps/extension/public/backgrounds/catalog.json` from whatever image files are in that folder. A browser cannot list a directory, so the Settings picker needs an index. `npm run build:extension` does this for you; run it alone after dropping an image in during a `dev:extension` session. |
| `npm run dsa-pack` | Rebuilds the bundled DSA question packs in `apps/extension/public/dsa-packs/` from public, permissively-licensed datasets (Blind 75, Grind 75, Grind 169, NeetCode 75/150/250, LeetCode 75, Top Interview 150, plus a full metadata index). **This is the only thing in the repository that makes a network request, and it is a development tool — the app itself never does.** Only facts are bundled (title, slug, difficulty, topic tags, question id); problem statements are LeetCode's copyrighted text and are never included. Re-check the source licences before refreshing; they are named at the top of `scripts/build-dsa-pack.mjs`. |

## Decisions worth knowing before reading the code

**Dates have no time and no timezone.** A due date is a plain local calendar date
(`2026-10-22`). A task due Thursday is due Thursday wherever you are. This makes a
whole family of off-by-one-day bugs structurally impossible, at the cost of not being
able to represent "2pm standup". Event timestamps *are* instants, and are grouped
into days by `completedLocalDay`. See `packages/core/src/dates.js`.

**One authoritative task record.** The calendar renders tasks and stores nothing of
its own. Widgets, the sidebar and the calendar all read the same records, so there is
no reconciliation step and nothing can drift. Recurring tasks are the same: a repeat
is a rule on the task, projected onto the calendar by `occurrencesInRange`, so a
daily task appears on every day without a record existing for each one.

**Storage is per-area.** Tasks, tags, notes, dashboard, sound, settings and the four
`dsa.*` areas are separate IndexedDB records, each validated on read. One corrupt
area degrades to its default with a visible note instead of taking the app down. The
app must always open. The question library is large, so it is loaded lazily.

**Write failures are visible.** A silent failed write is the worst outcome in the
product, because it looks exactly like success. Quota exhaustion and blocked storage
surface as notices, and a browser that blocks storage entirely puts the app into a
labelled memory-only mode rather than pretending to save.

**The dashboard grid is positioned, not ordered.** A layout is a list of
`{ x, y, w, h }` widgets on a coordinate grid, because an ordered list cannot express
"bottom right" — which is what people actually want from a dashboard. A cell is a
square of about 48px: `columnsForWidth` takes the *nearest* whole number of columns
that fits, and `cellForWidth` divides the width evenly between them, so the grid ends
exactly at the right edge with no dead space. Slack under half a column is shared out;
slack over it becomes another column. That keeps the square within a couple of pixels
of 48 on any laptop or desktop, so narrowing the window changes how many columns fit
rather than how large a widget looks. The canonical grid is 48 columns wide — enough
that those squares reach the edge of a large desktop — and a layout wider than the
window is projected for display with its editing paused rather than overwritten.
`pinned` marks a deliberate placement that compaction may not lift. See
`packages/core/src/layout.js`.

**DSA progress has three independent axes.** Progress, revision and confidence are
stored separately, and the five labels shown in the UI are derived from them. Review
intervals come from a confidence-keyed ladder (3/7/21/60 days) rather than SM-2 or
FSRS, because a few dozen reviews is far too little data to fit those models'
parameters to.

**Widgets respond to their own box, not the viewport.** Sizing uses CSS container
queries (`@container`, `@[11rem]:`), since the same widget can be 1×1 in one corner
and 8×4 in another.

## Privacy

The app makes no network requests, with three opt-in exceptions and three that follow
from having an account — all three to our own site:

- **GitHub** reads public activity or repositories from `api.github.com` once you
  enter a username.
- **Weather** reads a forecast from `open-meteo.com` once you set a location. No key
  and no account; only that place's coordinates are sent, and the browser's
  geolocation prompt is never used.
- **Read mode** fetches the list of published posts from `chestha.vercel.app` once you
  switch the start screen from the board to Read. The request carries no account and
  no cookie, so the server cannot tell who asked; posts are cached locally, so the
  mode still works offline.

Those three are inert until you ask for them, each says so where you turn it on, and
reversing it — removing the widget, or switching back to the board — ends the
requests.

- **The sign-in check** asks `chestha.vercel.app/api/session` whether you are signed
  in, because most sections require an account and the workspace has to know which
  to show. It sends your Chestha session cookie and nothing else, goes only to our
  own origin, and is cached for ten minutes — so opening many tabs is one request,
  and the cached answer is what gates the workspace when you are offline. It is the
  reason the extension requests a host permission for `chestha.vercel.app`, and —
  with the profile card below — one of the two requests that identify you.
- **Writing a post** sends it to `chestha.vercel.app/api/posts/mine` — the only
  request the extension makes that *writes* anything. It happens when you open the
  Writing section, and when you save, publish or delete a post. It carries the same
  session cookie to the same origin, and it can only ever reach your own posts.
- **Your profile card** asks `chestha.vercel.app/api/profile` for your own handle,
  interests, post count, followers and reading streak — and only while a card is
  actually on screen, which is the card widget or the account menu. It sends the
  same session cookie to the same origin, answers only for your own account, and
  takes no username, so it cannot be used to look anyone else up. Remove the widget
  and close the menu and it stops.

Nothing else in the running app contacts the internet. `npm run dsa-pack` does, but
it is a build tool you run deliberately.

Signing in does not move your workspace off your device. It is still IndexedDB on
your own machine, and an export is still the only copy that survives a cleared
browser.
