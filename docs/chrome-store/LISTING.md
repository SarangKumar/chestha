# Chrome Web Store — Listing copy (Kalpvan v0.1.0)

Paste these fields into the Chrome Web Store Developer Dashboard → **Store listing**.
Keep claims faithful to the shipped product: local-first, no account, no telemetry, no sync/cloud.

Official image guide: https://developer.chrome.com/docs/webstore/images

---

## Item name

**Kalpvan**

- Limit: ≤ 45 characters
- Matches `manifest.json` `name` / `short_name`

---

## Summary (short description)

**A local-first New Tab workspace for tasks, calendar, ambient sound, and DSA practice — on your device, no account.**

- Limit: ≤ 132 characters
- Current length: 109 characters
- Polished from the manifest description; accurate (no sync, no cloud)

Manifest description (for reference, not the Store short field):

> A local-first personal productivity workspace. Opens your tasks, calendar, sounds and DSA practice in one tab.

---

## Detailed description

Copy everything between the markers into the **Detailed description** field.

```
Kalpvan replaces your New Tab with a personal productivity workspace: tasks, calendar, focus tools, ambient sound, and interview-prep tracking — all in one calm screen that opens every time you start something new.

Why install it
• Stop bouncing between apps just to see what’s due today, what’s next on the calendar, and where you left a note.
• Keep a dashboard you actually control — drag widgets, hide titles, pin what matters — instead of a generic New Tab.
• Stay local-first: no account, no cloud account to maintain, no telemetry. Your work stays in your browser on your device.
• Build focus habits with Grove: timed sessions grow a small garden, with optional XP from websites you choose to track (off until you turn it on).
• Practice DSA with progress, revision, and confidence tracked beside the rest of your day — then jump to the problem when you’re ready.

What it does
• New Tab dashboard — weather, clock, search, intention, scratchpad, shortcuts, Focus Garden, and more on a rearrangeable grid.
• Tasks & calendar — one task list powers the calendar view, including recurring work, so nothing drifts between places.
• Ambient sound — focus mixes generated in the browser for the built-in engine.
• Productive time (optional) — see time on sites you add rules for; used for insight and Grove XP, never for ads or analytics to us.
• DSA practice — track what you’ve done and what’s due for review.
• Settings for appearance, Grove, export/import, and privacy controls that match a local-only product.

Privacy, briefly
Kalpvan does not require sign-in and does not send your tasks, notes, or practice history to a Kalpvan server — there isn’t one. Optional network features (GitHub public activity, weather forecast, shortcut icons) only run after you opt in. Website timing stores domain + local date + seconds on your device for sites you listed.

Export regularly from Settings so a cleared browser profile doesn’t take your data with it.

Kalpvan is not affiliated with LeetCode, NeetCode, takeUforward, GitHub, Google, or other named services. Trademarks belong to their owners.
```

---

## Category

**Productivity**

---

## Language

**English**

---

## Homepage URL

`[YOUR SITE OR GITHUB]`

Replace with a public page or repository URL before publish.

---

## Support email

`[SUPPORT EMAIL]`

Must be an inbox you monitor; the Store shows it to users.

---

## Assets in this folder (exact sizes)

Place finished graphics beside this file under `release/chrome-store/`.

| File (suggested name) | Required? | Exact size | Format | Notes |
| --- | --- | --- | --- | --- |
| `store-icon-128.png` | **Yes** (ZIP + listing) | **128 × 128** | PNG | Artwork ideally ~96×96 with ~16px transparent padding per side. Works on light and dark. **Already present** in this folder. |
| `screenshot-01-dashboard-1280x800.png` | **Yes** (≥1, up to 5) | **1280 × 800** (or 640 × 400) | PNG or JPEG | Full bleed, square corners, no padding. Prefer 1280×800. Show the New Tab dashboard. |
| `screenshot-02-tasks-calendar-1280x800.png` | Recommended | **1280 × 800** | PNG or JPEG | Tasks and/or calendar. |
| `screenshot-03-grove-1280x800.png` | Recommended | **1280 × 800** | PNG or JPEG | Grove / Focus Garden. |
| `screenshot-04-dsa-1280x800.png` | Optional | **1280 × 800** | PNG or JPEG | DSA practice view. |
| `screenshot-05-sounds-or-settings-1280x800.png` | Optional | **1280 × 800** | PNG or JPEG | Sounds or Settings / export. |
| `promo-small-440x280.png` | Strongly recommended | **440 × 280** | PNG or JPEG | Small promo tile. Prefer brand graphics over a raw screenshot; avoid heavy text. |
| `promo-marquee-1400x560.png` | Optional (needed to be featured in marquee) | **1400 × 560** | PNG or JPEG | Marquee promo. Fill the region; defined edges; works at half size. |
| `icon-512-source.png` | Source only (not uploaded as-is) | **512 × 512** | PNG | Master mark. **Already present** — use to derive promo art / padded 128 icon if needed. |

Also required inside the extension ZIP (from `npm run pack:extension`): the packaged `icons` / action icons from the build (including a 128px icon in the ZIP). The Store listing “store icon” upload is separate from, but should match, that mark.

YouTube video: optional; leave blank until you have a short walkthrough.

---

## Do not claim

- Accounts, sign-in, cloud sync, cross-device sync
- Analytics, crash reporting, or “we improve the product with your usage data”
- Reading page contents, search queries, or full browsing history
- Affiliation with LeetCode / NeetCode / takeUforward / Google / etc.
- Fake testimonials or keyword stuffing

---

## Version shown to reviewers

- Manifest version: **0.1.0**
- Package: `release/kalpvan-0.1.0.zip` via `npm run pack:extension` from the repo root
