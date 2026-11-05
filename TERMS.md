# Terms of Use and Privacy Notice — Chestha

**Status: draft, not legal advice.** This file records what the software actually
does, so that whoever prepares the published terms is working from facts rather
than assumptions. Have a lawyer review it before publishing. Replace every
`[BRACKETED]` placeholder.

- **Product:** Chestha — a local-first personal productivity workspace
- **Publisher:** `[LEGAL NAME / ENTITY]`
- **Contact:** `[SUPPORT EMAIL]`
- **Last updated:** `[DATE ON PUBLICATION]`
- **Governing law:** `[JURISDICTION]`

---

## 1. What this software is

Chestha is a personal workspace for tasks, a calendar view, ambient sound, and
tracking practice of coding-interview questions. It runs entirely in your browser.

The **widget board** and **Settings** need no account. The other sections — tasks,
the calendar, DSA practice, the Grove, productive time, Sounds and Read mode —
require a free Chestha account, and the extension asks our website whether you are
signed in so it knows which to show. Signing in does not move your workspace: no
server of ours holds what you create in it.

The Chestha website additionally offers an optional community side — an account and
posts you choose to publish — which does run on a server we operate. It is separate
from the workspace in every sense that matters: the workspace works fully without it,
signing in never moves your workspace off your device, and the extension never asks
you to sign in. Where this document says "your content" below, it means what you
create in the workspace.

## 2. Your data

**Everything you create stays in your browser**, in that browser's IndexedDB
storage for this site: tasks, notes, dashboard layout, sound presets, keyboard
shortcuts, DSA questions, solving history and revision schedules.

We do not receive, store, transmit or have any means of accessing it.

### What this means in practice — please read

- Clearing site data or browsing history **deletes it**.
- Browsers may evict site storage when disk space runs low, and some evict it
  after long periods without a visit.
- It does **not** follow you to another browser, another device, or a different
  browser profile.
- A private or incognito window usually starts empty and discards everything when
  it closes.
- It is **not encrypted**. Anyone with access to your device and browser profile
  can read it.
- **An exported file is the only copy that survives any of this.** Export regularly.

We cannot recover your data. There is no backup on our side, because there is no
server. If it is gone from your browser and you have no export, it is gone.

### No analytics, no telemetry

The application contains no analytics, telemetry, crash reporting, advertising or
usage tracking of any kind. We collect nothing, because nothing is sent anywhere.

### Website time, if you turn it on

The Chrome extension can count the time you spend on websites **you add yourself**,
to award XP in the Grove. This is observation on your device, not telemetry: nothing
is transmitted, and there is nobody to transmit it to.

- It is **off until you turn it on**, and nothing is observed before that.
- It records only sites **you have added a rule for**. A site with no rule is not
  recorded at all — not even that you visited it.
- What is stored for those sites is a **domain, a local date and a number of
  seconds**. Never a page address, a path, a search query, a page title, a favicon,
  or anything about the contents of a page.
- Website time is counted from the **address of the tab you are looking at**, and
  from nothing else. It can see which site a tab is on; it cannot see what is on it.
- The extension does inject one script into pages — the **island overlay**, the bar
  it can draw at the top of the screen. That script draws and nothing else: it does
  not read the page, and it takes no part in counting website time. You can limit
  the island to Chestha's own pages, or turn it off, in Settings → Navigation.
- It counts only while a tracked site is the tab you are looking at, in the window
  in front, and you are at the keyboard. It stops when you go idle or lock the
  screen.
- You can pause it, switch it off, or delete every recorded second from Settings,
  without affecting your tasks, notes, calendar or DSA progress.

Timings are approximate. The application does not claim to measure attention, only
elapsed time with a tab active — and for a focus session, elapsed time you chose to
describe as focus.

### Network requests

In normal use the application requests only its own files from its own origin. Every
exception is something you switch on, and switching it back off ends the requests.

- **Question packs** (`/dsa-packs/*.json`) and **audio files** (`/audio/*`) are
  served from this application, not from a third party.
- **Ambient sounds are bundled with the app.** The audio files ship inside it and
  play from your device; no audio is downloaded while you use it.
- Opening a question, a search, or a shortcut **navigates to a third-party site in
  a new tab**. From that point you are on that site and its terms and privacy
  policy apply, not ours.
- **Site icons in the Shortcuts widget are off by default.** Switching them on
  makes your browser request an icon from each site you have saved, which tells
  those sites when you open your dashboard. This is why it is opt-in.
- **The GitHub widget** requests public data from `api.github.com`, and only after
  you enter a username. No token and no account; what is sent is the username you
  typed.
- **The Weather widget** requests a forecast from `open-meteo.com`, and only after
  you set a place. No key and no account; what is sent is that place's coordinates,
  rounded, and the browser's geolocation prompt is never used.
- **The sign-in check** requests `chestha.vercel.app/api/session` when you open a
  New Tab and the last answer is more than ten minutes old. It sends your Chestha
  session cookie and nothing else; the answer is whether you are signed in and your
  username. This is the one request the extension makes that identifies you, it
  goes only to our own site, and it identifies you only to your own account. The
  answer is cached on your device, which is what the extension uses when you are
  offline — so losing your connection never locks you out of what you could already
  reach.
- **Writing a post** sends it to `chestha.vercel.app/api/posts/mine`. This is the
  only request the extension makes that writes anything rather than reading: it
  carries the post you typed, when you open the Writing section and when you save,
  publish or delete. Same cookie, same site, and the server checks on every write
  that the post belongs to the account the cookie belongs to.
- **Your profile card** requests `chestha.vercel.app/api/profile` while a profile
  card is on screen — the card widget on your board, or the account menu when it is
  open. It sends the same session cookie as the sign-in check, to the same site, and
  the answer is your own handle, interests, counts and reading streak. It takes no
  username and answers only for the account the cookie belongs to, so it is not a
  way to read anyone else's profile. Like the sign-in check, the answer is cached on
  your device.
- **Read mode** requests the list of published posts from `chestha.vercel.app`, and
  only after you switch the start screen from your widgets to Read. The request
  carries no account and no cookie, so we cannot tell who asked. Posts are cached on
  your device so the mode still works offline, and switching back to the board ends
  the requests. The start screen shows your widgets until you change it.

`[VERIFY BEFORE PUBLISHING: confirm no dependency has introduced a network call —
build output and the network panel are the checks.]`

## 3. Browser extension

The extension is the same application, bundled and run from `chrome-extension://`.
There is no second copy of the interface, and nothing is fetched from the network
except the requests listed in §2. All but one of those are opt-in and off by
default; the exception is the sign-in check, which runs because most of the
workspace requires an account.

### Permissions, and why each one is necessary

| Permission | What it is for |
| --- | --- |
| `tabs` | Raising an already-open workspace instead of opening a duplicate, and reading the **address** of the tab you are looking at so website time can be attributed to a site you added. Chrome describes this as "read your browsing history", which overstates it: no history is read or stored, and sites without a rule are never recorded. |
| `idle` | Knowing whether you are at the keyboard, so time does not accrue while you are away or the screen is locked. |
| `alarms` | Waking the extension about once a minute to close off the time it has counted. Chrome suspends background extension code aggressively; without this, counted time would be lost. |
| `storage` | Holding the handful of pending time records that the workspace has not yet taken in, and caching the answer to the sign-in check so a New Tab need not ask on every open and still knows what to show you offline. |

| `host_permissions` for `chestha.vercel.app` | The sign-in check described in §2. Chrome only sends your session cookie on a request an extension makes to another origin when the extension holds host access to it, so this permission is what makes the check possible at all — without it every user would appear signed out. It names our own site and nothing else. |

| `offscreen` | Holding the audio player in one invisible extension page, so a mix keeps playing when the workspace tab is navigated away or closed. It grants no access to any website. |

| `content_scripts` on all sites | Drawing the island — the bar at the top of the page showing what is playing and what is due. Chrome describes this as "read and change all your data on all websites", because that is what the capability allows. What the script does is draw: it adds one element, renders inside it, and reads nothing from the page — not its text, its forms, its cookies or its address. |

**The island's script is the only code we inject, and reading pages is not what it
is for.** We do not read the contents of any web page, including ours. If that ever
changed it would be a change to this document and to what the extension does, not
something the current permissions quietly already allow.

**Turning it off.** Settings → Navigation → Island limits the overlay to Chestha's
own pages, or switches it off. Chrome's own Extensions page can also restrict the
extension's site access, which stops the script running at all.

### Storage is separate

The extension runs on its own origin, so **its data is separate from the same
application opened over `http`**, and neither reads the other. Moving data between
them is done deliberately, with Settings → Export and Import.

### The New Tab page

Installing the extension replaces Chrome's New Tab page. **Chrome asks you to
confirm this the first time** and offers to keep your previous setting. It is
reversible at any point by disabling or removing the extension, and no data is lost
by doing so.

### Store listing

The data-use disclosures on the Chrome Web Store listing must match this section.
As built, the honest disclosure is: **no data is collected or transmitted.** Website
activity is processed on your device for a feature you switch on, and is never sent
anywhere. `[VERIFY BEFORE PUBLISHING: re-read the permissions in
scripts/extension/manifest.json against the table above.]`

## 4. Third-party content and attribution

### Question metadata and curated lists

Bundled question data — titles, slugs, difficulty and topic tags — is derived from
publicly available datasets that were MIT- or ISC-licensed when retrieved. Provenance is
recorded in each pack's `provenance` field and in
`packages/core/src/dsa/sources.js`, and `scripts/build-dsa-pack.mjs` regenerates it.

**We do not reproduce problem statements.** Problem text belongs to the platform
that publishes it and is never included. The application links to the original
problem page instead.

Curated list membership (which problems a given study list contains) reflects the
editorial selection of that list's author. Lists are referred to by name for
identification. `[LEGAL REVIEW: confirm the position on reproducing list
membership, and on nominative use of these names, before publishing.]`

### Not affiliated

Chestha is not affiliated with, endorsed by, or sponsored by LeetCode, NeetCode,
takeUforward, Pixabay, Google, or any other named service. All trademarks belong
to their owners.

### No scraping

The application does not crawl, scrape or automate access to any third-party
service, and must not be changed to do so. LeetCode's terms of service prohibit
crawling and scraping; honouring that is a design constraint of this product, not
merely a policy.

### Audio you add yourself

If you place your own audio files in the application's audio folder, **you are
responsible for having the right to use them**. Record the licence in the manifest
`credit` field. We supply no audio beyond what the browser generates.

## 5. Acceptable use

Use it for your own personal productivity. Do not use it unlawfully, do not
attempt to use it to breach another service's terms, and do not redistribute
bundled third-party data except as that data's own licence permits.

## 6. Warranty and liability

The software is provided **"as is", without warranty of any kind**, express or
implied, including merchantability, fitness for a particular purpose and
non-infringement.

To the fullest extent permitted by law, we are not liable for any loss of data,
loss of profits, or any indirect, incidental, special or consequential damages
arising from use of the software — including **loss of data stored in your
browser**, however caused.

`[JURISDICTION CHECK: consumer-protection law in some jurisdictions limits these
exclusions. Have this section reviewed.]`

## 7. Changes

We may update the software and these terms. Material changes will be noted in the
release notes and the "last updated" date above. Because we hold none of your
data, changes to these terms do not alter anything we already hold about you —
there is nothing.

## 8. Contact

`[SUPPORT EMAIL]` · `[REPOSITORY OR ISSUE TRACKER URL]`

---

## Checklist before publishing

- [ ] Every `[BRACKETED]` placeholder replaced
- [ ] Reviewed by a lawyer in the publishing jurisdiction
- [ ] Section 3 completed once the extension exists
- [ ] Network claims in §2 re-verified against the shipped build
- [ ] Licences of every bundled dataset re-checked and dated
- [ ] Store listing data disclosures match this document
- [ ] Section 4 reviewed on list-membership reproduction
