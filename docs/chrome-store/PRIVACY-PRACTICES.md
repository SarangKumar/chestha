# Chrome Web Store — Privacy practices (Chestha v0.1.1)

Answers for the Developer Dashboard **Privacy practices** / data-safety tab.
Align with `TERMS.md` and `scripts/extension/manifest.json`. Re-verify against the shipped ZIP before submit.

---

## Single purpose description

**Chestha is a local-first personal productivity New Tab workspace: tasks, calendar, ambient sound, dashboard widgets, and DSA practice tracking, with optional on-device focus/website-time features for Grove XP.**

Keep this narrow. Do not describe advertising, content scraping, or general browsing-history products.

---

## Permission justifications

Manifest permissions: `tabs`, `idle`, `alarms`, `storage`, `unlimitedStorage`, `offscreen`.
Host permission: **`https://chestha.vercel.app/*` only.**
Content scripts: **one**, `island.js`, matching all sites — it draws the island
overlay and reads nothing from the page. See below.

### `tabs`

Used to:

1. Focus an already-open Chestha workspace tab instead of opening a duplicate.
2. Read the **address** of the active tab so optional website-time (Grove) can attribute seconds to a **site the user added a rule for**.

Chrome’s permission wording may say “read your browsing history.” Honest disclosure: Chestha does **not** read or store browsing history. Sites without a user-defined rule are never recorded. No page path, query, title, favicon, or page contents are stored.

### `idle`

Detects whether the user is active at the keyboard so website-time / focus timing does not accrue while away or when the screen is locked.

### `alarms`

Wakes the extension periodically (about once a minute) to close off counted time. Chrome suspends extension service workers aggressively; without alarms, in-progress counts can be lost.

### `storage`

Holds a small amount of pending time records until the workspace UI takes them in, and caches the answer to the sign-in check below so a New Tab does not have to ask on every open and still knows which sections to show when offline. Workspace content (tasks, notes, DSA, etc.) lives in the extension page’s IndexedDB on the `chrome-extension://` origin.

### `content_scripts`: `island.js` on all sites

The island is a small bar Chestha can draw at the top of any page, showing what
is playing and what is still due. Drawing on a page requires a content script,
and a script that matched only some sites would be a stranger privacy question
than one that matches all of them.

What it does: appends one element, draws inside a closed shadow root, and reads
the page for nothing — no page text, no form fields, no cookies, no storage, no
URL. It communicates only with the extension's own storage and service worker.
The restraint is enforced by a test in the repository that fails if the file
gains any of the ways a script reads its host document.

Chrome will describe this as "read and change all your data on all websites",
because that is what the capability allows. Honest disclosure: Chestha does not
read any of it. The feature can be narrowed to Chestha's own pages, or switched
off entirely, in Settings → Navigation → Island.

### `offscreen`

Lets the extension hold one invisible page containing the audio player, so a
mix keeps playing when the New Tab that started it is navigated away or closed.
It grants no access to any website and no ability to see or touch a page.

### `host_permissions`: `https://chestha.vercel.app/*`

Used for exactly one request: asking our own website whether the user is signed in, so the sections that require an account can be shown or gated. The permission is necessary rather than convenient — Chromium only sends the session cookie on a cross-origin request from an extension when the extension holds host access to that origin, so without it the check cannot work at all and every user would appear signed out.

The pattern names one origin, our own. It grants no access to any other site, and it is not used to read, modify, or observe page content anywhere.

---

## Remote code

**No.**

The extension does not execute remote code. UI and logic ship inside the package. (Do not load scripts from CDNs in production.)

---

## Data collection / data use disclosures

### What the developer collects

**Authentication only.** There is no analytics, no telemetry, no crash reporter, and no advertising SDK. The publisher does not receive tasks, notes, calendar data, DSA history, or website-time records — none of that leaves the device.

What the publisher does receive is the sign-in check: because most sections of the workspace require an account, the extension asks our own server whether the person using it is signed in, which necessarily identifies them to their own account. That is a single request to `chestha.vercel.app`, carrying the Chestha session cookie and nothing else. For store-disclosure purposes this is **authentication information**, and it is used only to decide which sections to show — never sold, never shared with a third party, and not used for tracking across sites.

### What stays on the device

All user-created workspace data is stored locally in the browser (IndexedDB / extension storage for this origin):

- Tasks, tags, notes, dashboard layout, sound presets, shortcuts, settings
- DSA questions metadata progress, revision schedules, confidence
- Optional Grove ledger / focus session state
- Optional website-time aggregates: **domain + local date + seconds** only, for sites the user configured

Clearing site data or removing the extension can delete this. Export is the user’s backup.

### Optional network activity (user-configured widgets)

Not “collection by the developer,” but disclose honestly:

| Feature | When | What leaves the device | Destination |
| --- | --- | --- | --- |
| GitHub widget | After user enters a username | Requests for that public username’s public API data | `api.github.com` |
| Weather widget | After user sets a place | Place coordinates / geocode + forecast requests | `open-meteo.com` (and its geocoding as used by the app) |
| Shortcut icons | Only if user turns icons on | Browser requests each saved site’s icon | Those sites |
| Reading mode | Only after the user switches the start screen to **Read** | A request for the public list of published posts. No account, no cookie, nothing identifying the reader | `chestha.vercel.app` |
| Sign-in check | On New Tab open, when the last answer is over 10 minutes old | A request carrying the user's own Chestha session cookie, answered with whether they are signed in and their username. **This one does identify the user** — to their own account, on our own site | `chestha.vercel.app` |
| Writing a post | Only in the Writing section — on open, and on save / publish / delete | The post the user typed (title, body, tags), with their own Chestha session cookie. **The only request the extension makes that writes.** It can reach no post but the user's own | `chestha.vercel.app` |
| Profile card | Only while a profile card is on screen — the card widget on the board, or the account menu while it is open | A request carrying the user's own Chestha session cookie, answered with their own handle, interests, post and follower counts, and reading streak. **This one does identify the user**, to their own account only — it takes no username and cannot be asked about anyone else | `chestha.vercel.app` |
| Opening a question / search / shortcut | User clicks | Normal navigation in a new tab | Third-party site (their terms apply) |

Built-in ambient sound is bundled audio played from the extension itself — no network request. The packing step strips the author's own wallpaper and any extra audio they added, but always ships the twelve-sound library.

### Website time (opt-in)

- Off until the user enables it and adds site rules.
- Observation on-device only; nothing is transmitted; there is nobody to transmit it to.
- Records only configured domains; never full URLs, paths, queries, titles, or page contents.
- No reading of website contents. One script is injected into pages — the island
  overlay — and it only draws; it does not read the page, and it plays no part in
  website-time counting, which still works from the tab's address alone.

**Store disclosure stance (as built):** no personal data is collected or transmitted by the developer. Certify accordingly, and ensure the Privacy policy URL says the same.

---

## Privacy policy URL

Chrome requires a **hosted** privacy policy URL (https).

1. Host a short policy (draft body below) on your site, GitHub Pages, or a public gist/raw page you control.
2. Paste that URL into the Store’s Privacy policy field.
3. Keep it consistent with this file and `TERMS.md`.

Draft source in-repo: `/Users/sarangkumar/01-projects/01-active/chestha/TERMS.md` (draft, not legal advice — have it reviewed before relying on it as published terms).

Placeholders to replace before hosting: `[LEGAL NAME / ENTITY]`, `[SUPPORT EMAIL]`, `[DATE ON PUBLICATION]`, `[JURISDICTION]`, `[REPOSITORY OR ISSUE TRACKER URL]`.

---

## Short privacy-policy body (host this)

You can publish the following as a standalone page. It is a concise Store-facing policy derived from `TERMS.md`; it is **not** a substitute for legal review.

```
Privacy Policy — Chestha

Publisher: [LEGAL NAME / ENTITY]
Contact: [SUPPORT EMAIL]
Last updated: [DATE ON PUBLICATION]

1. Overview
Chestha is a local-first personal productivity browser extension and web app. It replaces (or can be opened as) a New Tab workspace for tasks, calendar, ambient sound, dashboard widgets, and DSA practice tracking.

Your data is kept on your device. The **dashboard widget board** and **Settings** work with no account at all. The other sections — tasks, calendar, DSA practice, the Grove, productive time, Sounds, and Read mode — require a free Chestha account, and the extension checks with `chestha.vercel.app` whether you are signed in so it knows which to show. Signing in does not move your workspace off your device: it is still stored locally, and signing up for the website does not upload it.

2. Data we collect
We do not collect your workspace data. We do not use analytics, advertising, crash reporting, or usage telemetry in the application.

3. Data stored on your device
Content you create (tasks, notes, layouts, settings, DSA progress, optional Grove and website-time records) is stored locally by your browser for this extension/site origin. We cannot access, recover, or restore it. Clearing browser data, using a private window, or removing the extension can delete it. Export regularly if you need a backup.

4. Optional website time
If you enable website-time rules for Grove XP, the extension may record domain, local date, and seconds for sites you configure, only while those tabs are active and you are not idle. This data stays on your device and is not transmitted to us. Full URLs, paths, queries, titles, and page contents are not stored. The extension injects one script into web pages — the island overlay, which draws a bar at the top of the page and reads nothing from it — and its one host permission covers only `chestha.vercel.app`. Website-time counting uses the tab's address and never the injected script.

5. Optional network features
- GitHub widget: after you enter a username, your browser may request public data from GitHub’s API.
- Weather widget: after you set a location, your browser may request forecast/geocode data from Open-Meteo.
- Shortcut icons: off by default; if enabled, your browser may fetch icons from sites you saved.
- Reading mode: the start screen shows your widgets by default. If you switch it to Read, your browser requests the public list of published posts from chestha.vercel.app. The request carries no account and no cookie, so we cannot tell who asked. Switch back to the board and the requests stop.
- Sign-in check: because most sections need an account, a New Tab asks chestha.vercel.app whether you are signed in. It sends your Chestha session cookie and nothing else, and the answer is your username and nothing else. It is cached for 10 minutes, so opening many tabs is one request, and the cached answer is what the extension uses when you are offline. This request goes only to our own site and identifies you only to your own account.
- Links you open (searches, DSA problems, shortcuts) navigate to third-party sites under their own policies.

6. Permissions (Chrome extension)
tabs — focus an existing workspace tab; read the active tab’s address for optional site-time attribution.
idle — pause timing when you are away.
alarms — periodically finalize counted time.
storage — hold small pending timing records for the workspace.
unlimitedStorage — keep your uploaded audio from being evicted under disk pressure; it is never synced, so an eviction would lose it.
offscreen — hold the audio player in one invisible extension page, so your mix keeps playing when the workspace tab is navigated away or closed.
One host permission: chestha.vercel.app, used solely for the sign-in check above. One content script: the island overlay, which draws a small bar at the top of the page and reads nothing from it. No remote code.

7. Children
Chestha is not directed at children under 13. Do not use it to store sensitive data about minors.

8. Changes
We may update this policy. The “Last updated” date will change when we do. We hold no workspace data on our servers, so a policy change cannot alter what we store about your workspace — there is none. If you created a website account, what we hold for it is your account record and whatever posts you chose to write.

9. Contact
[SUPPORT EMAIL] · [REPOSITORY OR ISSUE TRACKER URL]
```

---

## Certification checklist (dashboard)

- [ ] Single purpose matches the narrow description above
- [ ] Permission justifications pasted / filled for tabs, idle, alarms, storage
- [ ] Remote code: **No**
- [ ] Data collection: none by developer; disclose on-device processing + optional widget requests
- [ ] Privacy policy URL live and consistent with this document
- [ ] Listing description does not contradict Privacy tab
