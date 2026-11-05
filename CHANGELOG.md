# Changelog

All notable changes to Chestha are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Kept as Unreleased rather than 0.2.0 on purpose: the package versions still read
0.1.1, and the accounts/posts foundation this builds on has not shipped either.
The website Changelog page (`apps/extension/src/site/changelog.js`) is deliberately
not updated yet — it is user-facing, and these are not released.

### Added
- **A category picker in the extension's post editor**, and the category list
  on `GET /api/posts/mine`. The list comes from the database rather than core's
  `SEED_CATEGORIES`, because `editPost` validates against the database: a picker
  built from the seed list would offer categories a deployment has never seeded
  and the save would fail for a reason the author could not act on. An empty
  list is reported as what it is — nobody has run `npm run db:seed` — instead of
  rendering an empty box.
- **A theme control in the navbar** — one icon opening a three-choice menu
  (System / Light / Dark), in both the workspace header and the marketing
  navbar. Theme is the one preference people change by mood, and it previously
  lived only in Settings.
- `packages/core/src/theme.js` — one definition of the three choices, the
  storage key, the dark-resolution rule and the media-query subscription, shared
  by the extension and the website. The two apps had each written their own, and
  only one of them was right. The two pre-paint bootstrap scripts still repeat
  the rule out of necessity — they run before any module loads — and both now
  say so.
- **Difficulty is coloured on every DSA tab** — Easy green, Medium amber, Hard
  red, from the existing `ok` / `warn` / `danger` tokens. Difficulty is an
  ordered scale people already read by colour, which is the test the design
  tokens set for using hue at all. The word is always shown as well, so the
  colour is a second channel rather than the only one.
- **Writing posts from the extension** — a gated `writing` section with a draft
  list, an editor and explicit publish / unpublish / delete. The website had no
  editor either, so this is the first surface in the product that can write a
  post at all; `lib/posts.js` and `packages/core/src/posts/` already held every
  rule, and only the HTTP shape and the UI were missing.
- `GET/POST/PATCH/DELETE /api/posts/mine` — the **sixth** network surface and
  the first that *writes*. Ownership is re-checked on every mutation against the
  session id rather than trusted from the body, because a post id in a request
  is attacker-controlled.
- **Post stats**: views, readers, upvotes and saves on each published post.
  `views` is a new counter on `Post`, incremented per page render and
  **excluding the author's own visits** — otherwise it mostly counts you
  checking your own work. Views and readers are two figures and are never
  summed: views counts everybody including anonymous readers and rises on a
  re-read, readers counts distinct signed-in people, and either alone would
  misstate the audience.
- `apps/website/lib/extensionCors.js` — one definition of the credentialed CORS
  rules, replacing hand-written copies in `/api/session` and `/api/profile`
  before a third could drift.
- **Striver's 180 Sheet in the bundled curated pack** — 145 memberships, the
  entries of the published sheet that are a LeetCode problem, in sheet order and
  sharing the `striver` family. Membership comes from
  `scripts/data/striver-180.json`, a checked-in hand transcription of the sheet's
  section listing (title, section, group, Basic/Core/Pro tier, LeetCode URL — no
  problem statements, no editorial text, nothing fetched). It ships partial on
  purpose: the other 34 of the sheet's 179 entries are algorithm or
  implementation exercises — Dijkstra, Kosaraju, heapify, Rabin-Karp, a disjoint
  set — with no LeetCode question to key them to, and each one records why in
  that file. A question's identity in this feature is a LeetCode slug, so the
  alternative was a made-up slug and a dead problem link.
- **Company question lists in the DSA section** — a Companies tab over 422
  companies and 16,898 memberships, each list ordered by how often the question
  is reported. Solving from there records the same `dsa.progress` event as
  solving anywhere else; there is no company-specific progress.
- `POST`/`GET /api/sync` — **the missing half of workspace sync.** `AREA_MERGE`,
  the revision scheme and the `WorkspaceArea` table had all been written, but
  nothing ever served them, so no device had sent an area anywhere and solved
  questions had never reached the database for *any* section. The route adds no
  rules of its own: every merge decision comes from `mergeArea`, the owner comes
  from the session and never from the body, revisions are server-assigned, and
  every blob is re-validated by `coerceArea` before it is stored.
- `apps/extension/src/app/sync.js` — the client half. Push-then-adopt rather
  than a continuous engine, debounced, flushed on `pagehide`, and silent on
  failure so nothing about the workspace depends on the network. **Only the DSA
  areas are wired** this pass: the endpoint serves every area, but pushing
  `tasks` or `settings` untested against a real database could lose work, while
  `dsa.progress` merges as an append-only event union that cannot.
- `companyFrequency` and `isCompanyList` in core, plus a `companies.json` pack
  built by `npm run dsa-pack`.

### Changed
- **The theme picker on the website offers System.** It had only light and dark:
  `system` was already the stored default and understood by the pre-paint
  script, but this control could not write it, so one click left `system` for
  good with no way back short of clearing site data. The same went for the
  extension's marketing navbar, whose button cycled light↔dark.
- `DifficultyBadge` replaces three different treatments of the same fact: the
  library coloured Hard and Medium but left Easy a neutral grey — so the
  cheapest wins were the hardest to spot — the lists tab rendered all three
  neutral, and the companies tab rendered difficulty as bare text with no badge.
- **The default board sits one row higher.** Clock, search, scratchpad and
  shortcuts all lift by one, so the bottom corners clear the edge instead of
  hugging it. `vOffset` now means something for the centred stack — it lifts the
  clock and search together, since splitting a stack whose whole point is that
  it is one thing would be strange to allow.
- **`familyOf` collapses every `company:` list into one family.** There are 422
  of them; left to the `other:<id>` fallback, a question tagged by forty
  companies would have scored forty families and buried the curated signal the
  family rule exists to protect — the exact failure it was written to prevent,
  arriving through a different door. "Asked by many companies" now counts once,
  alongside "in several curated lists", and the two are reported separately
  because they mean different things.
- `scripts/build-dsa-pack.mjs` retries every fetch. The metadata CSV is tens of
  megabytes and a dropped connection killed the whole build after minutes of
  successful work.

### Removed
- **The start screen's rail icon.** In the extension a New Tab already opens it,
  so the icon was a button to go where you started. It stays reachable by `G D`,
  by "Go to dashboard" in the palette, and by opening a tab — but note that on
  the web build, where there is no New Tab, the rail no longer offers a route
  back to the board and the palette (or the marketing header's Workspace link)
  is the way. The rail now highlights nothing while the start screen is open,
  the way a home page is not one of its own nav items.
- `dashboard` from `HIDEABLE_SECTIONS`. It is no longer a rail item, so "hide it
  from the rail" had nothing left to do, and a switch that changes nothing is
  worse than no switch.
- **The right-hand "Today" panel**, and with it the header icon that opened it,
  the `[` shortcut, the `toggle-sidebar` palette command and the `sidebarOpen`
  setting. It was a third view of tasks that the Tasks section, the calendar and
  the dashboard widgets already covered, and the coordination it required —
  Dashboard closing the widget edit panel whenever it opened, and the reverse —
  outlived its usefulness. A stored `sidebarOpen` is now simply dropped on read.
  The theme picker takes its place in the header.

### Fixed
- **A post could not be published from anywhere.** Publishing requires at least
  one category; the extension's editor had no category control and its copy said
  they were "set on the website", but no website editor exists — so the only
  authoring surface in the product dead-ended at its last step. `editPost`
  already accepted and validated categories, so the gap was entirely in the UI
  and in what the API chose to return.
- Every hideable section needs a label and an icon in Settings, and `writing`
  had neither — its row read a lowercase "writing" beside a blank space, since
  both maps fall back to the raw id. Added, with a test over both directions,
  because nothing was watching the two lists for drift.

- Lifting the sketch exposed the same off-by-one in two places:
  `isShippedDefaultLayout` and `shouldReanchorDefault` both inferred the grid
  height from the scratchpad's bottom edge, so a lifted board stopped being
  recognised as the shipped default and re-anchored on every render. They now
  share one `rowsBehind` helper instead of repeating the arithmetic.
- The pack generator treated 48 companies whose upstream CSV is a bare header as
  *failures*, which tripped the verification guard and meant no pack shipped at
  all. A company with no tagged questions is now a company with no questions;
  only an unreachable file is an error, and none are tolerated.

### Added
- **Profile cards**, on the website and in the extension. `/user/<handle>` is
  rebuilt around one, and `/user/<handle>/devcard.png` renders the same facts as
  a 500×280 PNG for a README or a sidebar, with `/user/<handle>/devcard` offering
  Markdown, HTML and bare-URL snippets. The image is cached for an hour — a
  README image is fetched by every visitor to that README — while the page itself
  is live, which is also why the page gave up its `revalidate`: a follow button's
  state belongs to the viewer, so a cached page would serve one visitor's answer
  to everyone.
- **Interests**, chosen at onboarding from a curated catalogue
  (`packages/core/src/account/interests.js`) rather than typed. They are matched
  against post *tags*, and a match only works if two people who mean the same
  thing pick the same string — free-form interests would give "js", "javascript"
  and "JavaScript" as three separate audiences. A test asserts every catalogue
  slug survives `normalizePostTags` unchanged, which is the whole contract.
- **A real username form at `/onboarding/username`.** It was a note saying the
  form would arrive "in the pass that adds Google and GitHub sign-in", which made
  the entire onboarding chain a dead end for any account arriving without a
  chosen handle. Sign-up now lands on the interests step rather than on an empty
  profile.
- **Reading history** at `/history`: posts you opened, grouped by day, with
  per-entry and wholesale removal. One row per person per post, rewritten on a
  re-read, so a post appears once at the last time it was opened rather than
  buried under its own refreshes. Days are cut in UTC and the page says so — the
  server cannot learn a visitor's zone during a render, and guessing would file
  posts under the wrong heading for half the world.
- **Following**, using the `Follow` model that had been in the schema unused
  since v0.2. A "Following" tab on the feed shows nothing rather than falling
  back to everything when you follow nobody, because the fallback hides the fact
  that the tab is empty because of a choice not yet made.
- `GET /api/profile` — the signed-in person's own card for the extension. A
  second endpoint rather than a wider `/api/session` on purpose: the session
  check is one boolean asked by every New Tab, this is several queries asked only
  when a card is on screen. It takes no handle, so it cannot enumerate accounts.
  The **fifth** network surface, and the first that widened nothing: same origin,
  same cookie, no new permission.
- A **"Your card" dashboard widget** and a card at the head of the account
  popover, both rendering the same `ProfileCard` from the same payload the
  website uses.
- `PostRead` in the schema, and `interests` on `User`.

### Changed
- **`MAX_TAGS` is 10, up from 5.** Five forced authors to drop real signal from
  posts that are legitimately about several things, and tags are the surface
  interests match against — a wider tag set makes the feed better at finding a
  reader, which is the actual reason to raise it.
- The profile card separates **"Writes about"** (counted from published posts)
  from **"Interested in"** (chosen). Merging them would let anyone look expert in
  anything by ticking a box.
- `buildProfileCard` takes server-counted extras. A count that was not taken is
  **omitted**, and renders as a dash rather than as a confident zero.
- One `PostList` now backs the feed, profiles and history. The three had drifted
  into different excerpt lengths and different metadata; a post should look like
  the same post wherever it appears.

### Fixed
- The shareable card image failed to render at all for any real profile:
  `@{handle}` in JSX is **two** children, and Satori refuses an element with more
  than one child unless it declares a display mode. Found by rendering it, not by
  building it.

### Added
- A sign-in gate (`apps/extension/src/components/SignInGate.jsx`) for gated
  sections: a page inside the shell, not a redirect, so the rail and the open
  sections stay reachable. It carries per-section copy saying what the section
  does rather than only that it is locked, a link out to sign in, and an explicit
  "Check again" — nothing in another tab can tell this one that a sign-in
  happened.
- `GET /api/session` on the website: whether there is an account behind the
  cookie, plus the handle. No email, no id, no token, and `no-store`, since a
  cached `signedIn: true` on a shared CDN would be a session leak. A failure
  answers 503 **without** a `signedIn` key, so a database hiccup coerces to
  `unknown` and fails open instead of locking the workspace.
- `apps/extension/src/app/session.js` — the cached session, hydrated from
  `chrome.storage.local` and read synchronously at first paint, so the board
  never waits on the network. Two constraints are load-bearing and commented as
  such: the fetch must run on the extension **page**, because Chromium only
  exempts a cross-origin request from SameSite when the initiator is an extension
  page with host access (a service worker has no initiator frame and would see no
  cookie at all), and every failure path must coerce to `unknown` rather than to
  signed-out.
- Signed out, the nav rail, the command palette and the Board / Read toggle show
  only what an account can reach: gated sections are **not listed**, rather than
  listed and locked. Three things keep that from becoming a trap. The section
  you are currently on is always listed even when gated, so a deep link never
  leaves the rail with no current item, and it keeps its padlock. Palette entries
  are dropped rather than disabled, because a search result that cannot run is
  worse than no result — each command declares the section it `requires`, so the
  palette and the rail read the same table. And the toggle that turns Read mode
  *on* is hidden while the toggle back to the board is not, so nobody is stranded
  on the reading gate.
- Leaving the reading gate clears `startMode`. Read mode is a persisted setting
  rather than a route, so navigating to the start screen without resetting it
  lands straight back on the gate.
- Start screen has two modes. A Board / Read switch in the shell header chooses
  between the widget board and a reading feed; the choice persists locally in
  `settings.startMode` and the board stays the default. `#/dashboard` honours the
  stored mode, so it is a preference rather than a route. Also on the command
  palette.
- Read mode (`apps/extension/src/sections/Reading.jsx`): published posts from the
  website, with category chips, author links and reading times. Cached in a new
  lazy `reading` storage area, so it paints before the network answers and keeps
  working offline with a visible "Updated <when>" note.
- `GET /api/posts` on the website — the public feed as JSON, readable
  cross-origin without credentials. Excerpts and reading times are computed
  server-side and **bodies are never sent**, since the extension has no Markdown
  sanitiser.
- `packages/core/src/posts/remote.js`: feed URLs, response normalising, cache-age
  and error wording. 30 tests in `packages/core/test/reading.test.js`.
- An account menu at the foot of the nav rail
  (`apps/extension/src/components/ProfileMenu.jsx`), in the slot the settings cog
  held. It links out to the website for a profile or a new account, and holds
  Settings, so the rail still has one icon there. It does **not** detect whether
  you are signed in: that would need `host_permissions` for the site and a
  request on every New Tab open. The website decides when a link is followed.
  *(Superseded later in this same Unreleased block — gated sections made that
  detection necessary, and the host permission was added.)*
- A **Confirm password** field on sign-up. `validatePasswordConfirmation` in
  `packages/core/src/account/credentials.js` is the rule and `registerUser`
  applies it, so the browser is not the only thing checking. It normalises with
  NFKC to match `hashPassword`, and trims nothing. Worth the friction while
  there is no password reset and no email verification: a typo today is an
  unreachable account.
- `/account` on the website — a redirect, not a page: to the signed-in user's
  profile, to username onboarding if the handle is still provisional, or to
  `/signin?callbackUrl=/account`. It exists so the extension can link to "my
  profile" without knowing who, or whether, anyone is signed in. `account` is
  now in `RESERVED_USERNAMES`.
- `docs/enabling-google-auth.md` — the three steps to turn Google sign-in on, why
  it needs no migration, and four decisions to make first.
- `packages/db/test/oauth-ready.test.js` — locks the schema contract that makes
  Google sign-in a no-migration change. Those columns are written by nothing
  today, so nothing else would notice them being dropped.

### Changed
- **Most of the workspace now requires an account.** Signed out, the **dashboard
  widget board** and **Settings** work as before; tasks, the calendar, DSA, the
  Grove, productive time, Sounds and Read mode show a sign-in gate instead. This
  reverses the previous rule that no section was ever behind a login; Settings is
  on the free side specifically so export, import, theme and navigation are never
  trapped behind one.

  The policy is one table — `packages/core/src/account/gating.js`, 21 tests in
  `packages/core/test/gating.test.js` — read by the section router, the nav rail
  and the account menu, so a section cannot be gated in one place and open in
  another. **An unknown session never gates**: offline, on a fresh install, or
  before the first check answers, every section stays open. The alternative is a
  wall with no door, since signing in needs the network the user does not have.
- The extension now requests **`host_permissions` for the website origin** — one
  origin, our own, and the first host permission it has ever asked for. It is not
  in the committed manifest, because the origin is a build-time value;
  `scripts/build-extension.mjs` injects it from `.site-origin`, which the Vite
  build emits from the same `loadEnv` the bundle used. That indirection is there
  so the manifest can never name an origin the bundle does not talk to.
- The account menu **does detect whether you are signed in**, which the entry
  below said it deliberately did not. It names the account, offers the right
  action for the state, and treats `unknown` as its own case rather than as
  signed out — offering "Sign in" to someone who already is would be worse than
  saying nothing.
- `README.md`, `TERMS.md`, `About.jsx` and
  `docs/chrome-store/PRIVACY-PRACTICES.md` all restate the network surfaces: the
  sign-in check is a **fourth**, it is the first that identifies the user, and it
  is the first that is not opt-in. The "no host permissions, no content scripts"
  line is now "one host permission, no content scripts", and the store disclosure
  changes from "the developer collects essentially nothing" to "authentication
  information only".
- The extension app's site origin comes from the environment
  (`VITE_SITE_URL`) and is **nowhere hardcoded in the source** — `SITE_URL` in
  `siteLinks.js` reads the variable with no fallback. The defaults are the
  committed `apps/extension/.env.development` (localhost:3000) and
  `.env.production` (the deployed site), which `.gitignore` now excepts from the
  ignored `.env.*` because they are public build values and a fresh clone must
  build with no setup; `.env.local` overrides both. A dev build therefore points
  at `http://localhost:3000`, so Read mode and the rail's links reach the
  website you are actually running. `vite.config.js` fails the build if the
  value is missing or not an absolute http(s) URL, rather than letting it become
  a `new URL()` throw on a New Tab.
- **The sound library is now recordings, not synthesis.** The eighteen sounds
  generated from filtered noise and tones are gone, replaced by twelve bundled
  `.m4a` recordings across five groups (Rain & water, Fire, Night & wildlife,
  City, Eerie), licensed from Mixkit under the Mixkit Free License. The
  synthesised set was accurate as noise but never restful. `SOUNDS` in
  `packages/core/src/sound.js` now names a file per sound, and the Web Audio
  engine's noise, tone, filter, LFO and grain code is deleted — the
  end-of-session chime is the only thing it still generates. Sound ids changed
  wholesale, so a preset saved before this reports its sounds as unavailable
  rather than loading them.
- `scripts/pack-extension.mjs` always ships the sound library. It still strips
  the author's wallpaper and any extra audio they added, but the twelve shipped
  files are the Sounds page now, so stripping them would publish an empty
  library. The keep list is read from `SOUNDS`, and the pack refuses outright if
  a named file is missing from the build.
- Privacy, terms, About, the store listing and the guide no longer say audio is
  generated in the browser with no recordings shipped. They now say the files are
  bundled and play from the device — still no network request for audio.
- Signing up with a password now requires a `@gmail.com` address
  (`ALLOWED_SIGNUP_DOMAINS` in `packages/core/src/account/credentials.js` is the
  whole policy). The rule guards **sign-up only** — sign-in stays
  domain-agnostic, so no existing account can be locked out, and a future Google
  sign-in must not use it either, since Workspace addresses are not gmail.com.
- The DSA section is hidden from the navigation rail by default, since it is still
  being built. It stays reachable from `#/dsa` and the command palette, and
  Settings → Navigation turns it back on. Existing profiles are untouched — only
  a profile with no stored settings gets the new default.
- Read mode is the third opt-in network surface, after the GitHub and weather
  widgets. Nothing is requested while the start screen is on the board. The
  privacy practices, terms, README and About page now state this.
- Privacy and terms copy no longer claims there is no server or no account — the
  v0.2 community side has both. The workspace still needs neither.
- The terms' network-request list now also names the GitHub and weather widgets,
  which it had omitted since those widgets were added.

## [0.1.1] — 2026-10-28

### Changed
- Renamed the product from Kalpvan to Chestha across the app, extension, and docs.
- Website marketing shell: landing hero, sticky navbar, and footer.
- Marketing content width uses `max-w-6xl`; the extension dashboard stays full-bleed beside the nav rail.
- Default New Tab layout: clock and search sit as a centred stack (horizontally and vertically); each is one column wider (clock 9, search 11) so the pair reads as the middle of the board.
- Landing workspace preview keeps the left page rail in the embed so the shot looks like a real workspace (marketing header/footer still stay off).
- Guide, README, AGENTS, and `llms.txt` list the curated DSA sheets the pack actually ships.
- Removed LinkedIn from marketing footer and About maker links; dropped unused `SiteFooter` component.

### Added
- About page with privacy notes and maker links (GitHub, portfolio).
- Changelog page on the website (`#/changelog`), with a calmer version picker.
- Guide page (`#/guide`) plus SEO bits: robots, sitemap, llms, Open Graph / meta.
- Buy me a coffee control in the hero and chrome, with the mug mark.
- Chrome Web Store and GitHub (with stars) in the marketing navbar.
- Curated DSA pack now includes Grind 75, Grind 169, and NeetCode 75 alongside Blind 75, NeetCode 150/250, LeetCode 75, and Top Interview 150 (facts only — no problem statements).
- Workspace preview loading layer so the iframe does not flash empty.

### Fixed
- Default dashboard sketch re-anchors to the live column count so corner widgets reach the edges on a wide New Tab.
- Site footer no longer appears under the website workspace shell (marketing pages keep it).
- Button hover styles keep readable contrast.

## [0.1.0] — 2026-10

### Added
- Local-first workspace: tasks, calendar, dashboard widgets, Grove focus garden, DSA practice, ambient sounds, productive-time tracker.
- Chrome New Tab extension and standalone web app (separate origins; export/import to move data).
- No account — data stays in this browser on this device.
