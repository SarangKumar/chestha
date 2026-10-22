# Vistaar

A local-first personal productivity workspace. No account, no backend, no telemetry.
Your data is stored by your browser, on your device, and an export file is the only
copy that survives a cleared browser.

## Repository layout

```
packages/core/     Domain logic with no DOM: dates, task rules, storage, export/import
apps/web/          The web application (Vite + React + Tailwind)
apps/extension/    Chrome companion — not built yet
```

`packages/core` holds everything that can be reasoned about and tested without a
browser, which is why the behavioural rules live there rather than in components.

## Commands

```bash
npm install
npm run dev       # web app on http://localhost:5173
npm run build     # production build
npm test          # core logic tests (node:test, no test framework)
```

## Decisions worth knowing before reading the code

**Dates have no time and no timezone.** A due date is a plain local calendar date
(`2026-10-22`). A task due Thursday is due Thursday wherever you are. This makes a
whole family of off-by-one-day bugs structurally impossible, at the cost of not being
able to represent "2pm standup". See `packages/core/src/dates.js`.

**One authoritative task record.** The calendar renders tasks and stores nothing of
its own. Widgets, the sidebar and the calendar all read the same records, so there is
no reconciliation step and nothing can drift.

**Storage is per-area.** Tasks, tags, notes, dashboard, sound and settings are
separate IndexedDB records, each validated on read. One corrupt area degrades to its
default with a visible note instead of taking the app down. The app must always open.

**Write failures are visible.** A silent failed write is the worst outcome in the
product, because it looks exactly like success. Quota exhaustion and blocked storage
surface as notices, and a browser that blocks storage entirely puts the app into a
labelled memory-only mode rather than pretending to save.

**The dashboard grid is ordered, not positioned.** A layout is a list of widgets with
a size each, not coordinates. The stored order is the visual order, the reading order
and the phone order, which is what makes keyboard reordering and responsive layout
fall out for free instead of being retrofitted.

## Not built yet

- **Sounds** — needs the synthesis-versus-bundled-loops decision and a licence budget.
  The section says so rather than showing a stub that looks finished.
- **Chrome extension** — the popup, the quick-capture outbox, and deep links into
  `#/tasks` etc. The web app's hash routes already support the deep links.
- **Recurring tasks** — deliberately deferred; the behaviour surface is large.
