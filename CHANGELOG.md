# Changelog

All notable changes to Chestha are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Kept as Unreleased rather than 0.2.0 on purpose: the package versions still read
0.1.1, and the accounts/posts foundation this builds on has not shipped either.
The website Changelog page (`apps/extension/src/site/changelog.js`) is deliberately
not updated yet — it is user-facing, and these are not released.

### Added
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
- `docs/enabling-google-auth.md` — the three steps to turn Google sign-in on, why
  it needs no migration, and four decisions to make first.
- `packages/db/test/oauth-ready.test.js` — locks the schema contract that makes
  Google sign-in a no-migration change. Those columns are written by nothing
  today, so nothing else would notice them being dropped.

### Changed
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
