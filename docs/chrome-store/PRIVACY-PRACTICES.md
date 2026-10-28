# Chrome Web Store — Privacy practices (Chestha v0.1.1)

Answers for the Developer Dashboard **Privacy practices** / data-safety tab.
Align with `TERMS.md` and `apps/extension/src/manifest.json`. Re-verify against the shipped ZIP before submit.

---

## Single purpose description

**Chestha is a local-first personal productivity New Tab workspace: tasks, calendar, ambient sound, dashboard widgets, and DSA practice tracking, with optional on-device focus/website-time features for Grove XP.**

Keep this narrow. Do not describe advertising, content scraping, or general browsing-history products.

---

## Permission justifications

Manifest permissions: `tabs`, `idle`, `alarms`, `storage`.
**No host permissions. No content scripts.**

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

Holds a small amount of pending time records until the workspace UI takes them in (plus normal extension storage needs for that feature). Workspace content (tasks, notes, DSA, etc.) lives in the extension page’s IndexedDB on the `chrome-extension://` origin.

---

## Remote code

**No.**

The extension does not execute remote code. UI and logic ship inside the package. (Do not load scripts from CDNs in production.)

---

## Data collection / data use disclosures

### What the developer collects

**Essentially none.** There is no Chestha backend, no account, no analytics, no telemetry, no crash reporter, and no advertising SDK. The publisher does not receive tasks, notes, calendar data, DSA history, or website-time records.

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
| Opening a question / search / shortcut | User clicks | Normal navigation in a new tab | Third-party site (their terms apply) |

Built-in ambient sound is generated in the browser; the packing step strips redistributable media by default.

### Website time (opt-in)

- Off until the user enables it and adds site rules.
- Observation on-device only; nothing is transmitted; there is nobody to transmit it to.
- Records only configured domains; never full URLs, paths, queries, titles, or page contents.
- No permission to read website contents; no injected scripts.

**Store disclosure stance (as built):** no personal data is collected or transmitted by the developer. Certify accordingly, and ensure the Privacy policy URL says the same.

---

## Privacy policy URL

Chrome requires a **hosted** privacy policy URL (https).

1. Host a short policy (draft body below) on your site, GitHub Pages, or a public gist/raw page you control.
2. Paste that URL into the Store’s Privacy policy field.
3. Keep it consistent with this file and `TERMS.md`.

Draft source in-repo: `/Users/sarangkumar/01-projects/01-active/vistaar-2/TERMS.md` (draft, not legal advice — have it reviewed before relying on it as published terms).

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
Chestha is a local-first personal productivity browser extension and web app. It replaces (or can be opened as) a New Tab workspace for tasks, calendar, ambient sound, dashboard widgets, and DSA practice tracking. We do not operate a user-content server for Chestha, and we do not require an account.

2. Data we collect
We do not collect your workspace data. We do not use analytics, advertising, crash reporting, or usage telemetry in the application.

3. Data stored on your device
Content you create (tasks, notes, layouts, settings, DSA progress, optional Grove and website-time records) is stored locally by your browser for this extension/site origin. We cannot access, recover, or restore it. Clearing browser data, using a private window, or removing the extension can delete it. Export regularly if you need a backup.

4. Optional website time
If you enable website-time rules for Grove XP, the extension may record domain, local date, and seconds for sites you configure, only while those tabs are active and you are not idle. This data stays on your device and is not transmitted to us. Full URLs, paths, queries, titles, and page contents are not stored. The extension does not inject scripts into web pages and does not request host permissions.

5. Optional network features
- GitHub widget: after you enter a username, your browser may request public data from GitHub’s API.
- Weather widget: after you set a location, your browser may request forecast/geocode data from Open-Meteo.
- Shortcut icons: off by default; if enabled, your browser may fetch icons from sites you saved.
- Links you open (searches, DSA problems, shortcuts) navigate to third-party sites under their own policies.

6. Permissions (Chrome extension)
tabs — focus an existing workspace tab; read the active tab’s address for optional site-time attribution.
idle — pause timing when you are away.
alarms — periodically finalize counted time.
storage — hold small pending timing records for the workspace.
No host permissions. No content scripts. No remote code.

7. Children
Chestha is not directed at children under 13. Do not use it to store sensitive data about minors.

8. Changes
We may update this policy. The “Last updated” date will change when we do. Because we do not hold your workspace data on our servers, policy changes do not alter data we already store about you — we store none.

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
