# Changelog

All notable changes to Chestha are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
