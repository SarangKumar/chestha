# Start screen modes and Read mode — manual verification checklist

`npm test` proves the normalising, coercion and wording rules hold. `npm run build`
and `npm run build:extension` prove both apps compile. **None of that proves a
request was or was not made, that anything renders, or that the cache survives a
reload.** This file covers what only a person at a browser can establish.

Run it after any change to `apps/extension/src/sections/Reading.jsx`,
`apps/extension/src/components/StartModeToggle.jsx`,
`packages/core/src/posts/remote.js`, the `reading` area in
`packages/core/src/schema.js`, or `apps/website/app/api/posts/route.js`.

Record the date and the Chrome version at the bottom.

## Setup

Read mode needs posts, and the post editor does not exist yet, so a published post
has to be made by hand:

1. A `DATABASE_URL` pointing at a real MongoDB, and `npm run db:seed` for the
   categories.
2. At least two posts with `status: 'published'` and a `publishedAt`, one of them
   carrying a category, inserted directly. Add one `draft` as well — R9 checks it
   never appears.
3. `npm run dev` for the website, and the extension loaded unpacked from `dist/`
   after `npm run build:extension`.

If `SITE_URL` in `apps/extension/src/siteLinks.js` still points at production, Read
mode will read production rather than your local server. Point it at `localhost`
for these checks, and remember to put it back.

## A. The privacy guarantee

This is the one that matters. The extension's store listing, terms and About page
all promise that nothing is requested until the user asks.

| # | Do this | Expect |
| --- | --- | --- |
| R1 | Fresh profile. Open a New Tab with the start screen on **Board**, DevTools Network open, and use the app for a minute | **No request to the website at all.** Not on open, not on navigation, not on idle. This check failing means the promise in `PRIVACY-PRACTICES.md` is false |
| R2 | Switch to **Read** | Exactly one request to `/api/posts`. It carries **no `Cookie` header** — confirm in the request headers, not just by trusting `credentials: 'omit'` |
| R3 | Switch back to **Board**, then open several New Tabs | The requests stop. Reversing the choice reverses the behaviour |
| R4 | Sign in on the website, then open Read mode in the extension | Still no cookie on the request; the response is identical. A signed-in reader must be indistinguishable from an anonymous one |

## B. Cache and offline

| # | Do this | Expect |
| --- | --- | --- |
| R5 | In Read mode, reload the New Tab | Posts are on screen **before** the network resolves — no spinner, no flash of an empty list. `reading` is present in IndexedDB |
| R6 | Go offline (DevTools → Network → Offline) and reload | The cached posts still render, with a note reading `Updated <when>` or an offline reason. **Not** an error page replacing the content |
| R7 | Offline, press **Refresh** | The list stays; the note becomes the offline reason. Nothing is cleared |
| R8 | Fresh profile, offline, switch straight to Read | A readable empty state explaining it will fill in once online — not a crash and not a bare "no posts" |

## C. Content and correctness

| # | Do this | Expect |
| --- | --- | --- |
| R9 | Compare Read mode against `/feed` in a browser | The same posts in the same order. **The draft appears in neither** |
| R10 | Inspect the `/api/posts` response | No `body` field on any post. Excerpt and `readingMinutes` are present and look right |
| R11 | Click a post title | Opens `/post/<slug>` on the website in a **new tab** from the extension; same tab on the website build |
| R12 | Click an author handle | Opens `/user/<handle>` |
| R13 | Use the category chips | Only chips for categories the loaded posts actually have. Filtering narrows the list; "All" restores it |
| R14 | A post whose author has no display name | Shows the handle rather than `@` with nothing after it |

## D. The switch itself

| # | Do this | Expect |
| --- | --- | --- |
| R15 | Reload after switching to Read | Opens in Read mode. The choice persisted |
| R16 | Open `#/dashboard` directly while Read is selected | Read mode, not the board. The mode is a preference, not a route |
| R17 | Switch back to Board | Grid, drag, resize, edit mode, the add/config drawers and Reset all behave exactly as before. Widget layout is unchanged |
| R18 | Command palette → "Show reading on the start screen" / "Show the widget board" | Switches, navigates to the start screen, and the label flips |
| R19 | Tab to the switch and use the keyboard | Reachable, both options announce as a radio with a checked state, and the accessible name says what each mode is |
| R20 | At phone width | Labels collapse to icons, the header does not wrap or overflow, and the Read list is still legible |
| R21 | Light theme, and with a background image set | Both modes stay legible; the Read list sits on the painted background without a dark rectangle |
| R22 | Export, then import into a fresh profile | `startMode` round-trips. A pre-Read-mode backup still imports and lands on the board |

---

## Known limits — not bugs

- **Read mode needs the network the first time.** There is no bundled content, so a
  profile that has never been online in Read mode has nothing to show. The empty
  state says so.
- **The cache is not a reader.** Bodies are never fetched, so a post cannot be read
  offline — only its title and excerpt. Opening one needs the website.
- **Category names come from the seed list** (`packages/core/src/posts/categories.js`),
  not from the database, because the extension cannot query Mongo. A category added
  in the database shows its slug until it is added to the seed list.
- **The cache holds 60 posts.** Read mode is a glance at what is recent, not an
  archive; `/feed` on the website is the full list.
- **Edge caching means Read mode can lag `/feed` by up to five minutes**
  (`s-maxage=300` in the route). That is deliberate — the alternative is every New
  Tab reaching Mongo.

---

Last run: [DATE] · Chrome [VERSION] · by [WHO]
