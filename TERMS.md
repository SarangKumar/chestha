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

There is no account, no sign-in, and no server operated by us that holds your
content.

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
- The extension requests **no permission to read any website**, and injects no code
  into any page. It can see which site a tab is on; it cannot see what is on it.
  This is a limit of the extension's design, not a policy we could quietly change —
  changing it would require new permissions, which Chrome would show you.
- It counts only while a tracked site is the tab you are looking at, in the window
  in front, and you are at the keyboard. It stops when you go idle or lock the
  screen.
- You can pause it, switch it off, or delete every recorded second from Settings,
  without affecting your tasks, notes, calendar or DSA progress.

Timings are approximate. The application does not claim to measure attention, only
elapsed time with a tab active — and for a focus session, elapsed time you chose to
describe as focus.

### Network requests

In normal use the application requests only its own files from its own origin.
Specifically:

- **Question packs** (`/dsa-packs/*.json`) and **audio files** (`/audio/*`) are
  served from this application, not from a third party.
- **Ambient sounds are generated in your browser.** No audio is downloaded.
- Opening a question, a search, or a shortcut **navigates to a third-party site in
  a new tab**. From that point you are on that site and its terms and privacy
  policy apply, not ours.
- **Site icons in the Shortcuts widget are off by default.** Switching them on
  makes your browser request an icon from each site you have saved, which tells
  those sites when you open your dashboard. This is why it is opt-in.

`[VERIFY BEFORE PUBLISHING: confirm no dependency has introduced a network call —
build output and the network panel are the checks.]`

## 3. Browser extension

The extension is the same application, bundled and run from `chrome-extension://`.
There is no second copy of the interface and nothing is fetched from the network.

### Permissions, and why each one is necessary

| Permission | What it is for |
| --- | --- |
| `tabs` | Raising an already-open workspace instead of opening a duplicate, and reading the **address** of the tab you are looking at so website time can be attributed to a site you added. Chrome describes this as "read your browsing history", which overstates it: no history is read or stored, and sites without a rule are never recorded. |
| `idle` | Knowing whether you are at the keyboard, so time does not accrue while you are away or the screen is locked. |
| `alarms` | Waking the extension about once a minute to close off the time it has counted. Chrome suspends background extension code aggressively; without this, counted time would be lost. |
| `storage` | Holding the handful of pending time records that the workspace has not yet taken in. |

**No host permissions are requested and no content scripts are used.** The extension
has no access to the contents of any web page, and cannot obtain it without asking
you for a new permission that Chrome would show you.

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
