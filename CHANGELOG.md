# Changelog

All notable changes to Chestha are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Kept as Unreleased rather than 0.2.0 on purpose: the package versions still read
0.1.1, and the accounts/posts foundation this builds on has not shipped either.
The website Changelog page (`apps/extension/src/site/changelog.js`) is deliberately
not updated yet — it is user-facing, and these are not released.

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
- Padlocks on gated items in the nav rail, spoken as well as drawn, and only when
  the session is positively known to be absent.
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
