# Chestha

A local-first personal productivity workspace — tasks, a calendar, ambient sound, a
scratchpad dashboard and a DSA practice tracker, in one tab. No account, no backend,
no telemetry. Your data is stored by your browser, on your device, and an export file
is the only copy that survives a cleared browser.

Runs as a web app, or as a Chrome extension that replaces the New Tab page.

## Repository layout

```
packages/core/     Domain logic with no DOM: dates, task rules, recurrence,
                   the layout engine, storage, export/import, DSA scheduling
apps/web/          The web application (Vite + React + Tailwind, plain JSX)
apps/extension/    The MV3 manifest and service worker; the built web app is
                   copied in beside them, so it is the same app from a
                   chrome-extension:// origin
tools/             Development scripts — see Commands
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
| `npm run dev` | Vite dev server for the web app on <http://localhost:5173>, with hot reload. The ordinary way to work on the UI. |
| `npm test` | The whole suite — `packages/core/test` and `apps/web/test` — via `node --test`. No test framework and no browser; pure logic only. Run it before calling anything done. |
| `npm run build` | Production build. Regenerates the background manifest first (see `backgrounds`), then builds the web app into `apps/web/dist`. |
| `npm run preview` | Serves the already-built `apps/web/dist` locally. Use it to check the production bundle, not for development — it does not rebuild. |

### The Chrome extension

| Command | What it does |
| --- | --- |
| `npm run build:extension` | Runs `build`, then copies `apps/web/dist` plus `apps/extension/src` (the manifest and service worker) into `apps/extension/dist`. Prints how to load it unpacked. Chrome does not notice the rebuild by itself — press the reload icon on the extension's card afterwards. |
| `npm run watch:extension` | Vite's own watch mode plus the extension assembly, so `apps/extension/dist` is re-made after every change. Still needs the reload press in Chrome for manifest or worker changes; a page-only change just needs Cmd/Ctrl+R on the New Tab page. |
| `npm run pack:extension` | Builds the extension, then writes `release/chestha-<version>.zip` ready to upload to the Chrome Web Store. See below. |

#### What `pack:extension` strips, and why

The unpacked build is a development artefact: it carries whatever wallpaper and audio
you dropped into `apps/web/public`, plus the READMEs explaining how to add more. The
packing step removes them by default, for two reasons.

- **Licence.** Media you may use locally is not automatically media you may
  redistribute to every installer. Stripping is the default so shipping someone
  else's file is a deliberate act, not an accident.
- **Size.** A single bundled recording can be ~25 MB of a ~27 MB build, downloaded by
  everyone who installs whether or not they open the Sounds page. Stripped, the
  archive is well under 1 MB.

The `audio/catalog.json` and `backgrounds/catalog.json` files stay, rewritten with
empty lists — the app fetches them on load, and an empty list is a state it already
handles while a 404 is not. Also dropped: the two folder READMEs, and `icon.png`,
which the sized icons supersede and nothing references.

Pass `--keep-media` (`node tools/pack-extension.mjs --keep-media`) to include the
media anyway. Only do that if you hold redistribution rights for every file.

The pack script strips staging after writing `release/chestha-<version>.zip`; open that zip to see exactly what
went into the archive after the fact.

### Occasional, run by hand

| Command | What it does |
| --- | --- |
| `npm run backgrounds` | Rewrites `apps/web/public/backgrounds/catalog.json` from whatever image files are in that folder. A browser cannot list a directory, so the Settings picker needs an index. `npm run build` does this for you; run it alone after dropping an image in during a `dev` session. |
| `npm run dsa-pack` | Rebuilds the bundled DSA question packs in `apps/web/public/dsa-packs/` from public, permissively-licensed datasets (Blind 75, Grind 75, Grind 169, NeetCode 150/250, LeetCode 75, Top Interview 150, plus a full metadata index). **This is the only thing in the repository that makes a network request, and it is a development tool — the app itself never does.** Only facts are bundled (title, slug, difficulty, topic tags, question id); problem statements are LeetCode's copyrighted text and are never included. Re-check the source licences before refreshing; they are named at the top of `tools/build-dsa-pack.mjs`. |

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

The app makes no network requests, with two opt-in exceptions, both widgets:

- **GitHub** reads public activity or repositories from `api.github.com` once you
  enter a username.
- **Weather** reads a forecast from `open-meteo.com` once you set a location. No key
  and no account; only that place's coordinates are sent, and the browser's
  geolocation prompt is never used.

Both are inert until you configure them, both say so in their own edit panel, and
removing the widget ends the requests. Nothing else in the running app contacts the
internet. `npm run dsa-pack` does, but it is a build tool you run deliberately.
