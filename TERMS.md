# Terms of Use and Privacy Notice — Vistaar

**Status: draft, not legal advice.** This file records what the software actually
does, so that whoever prepares the published terms is working from facts rather
than assumptions. Have a lawyer review it before publishing. Replace every
`[BRACKETED]` placeholder.

- **Product:** Vistaar — a local-first personal productivity workspace
- **Publisher:** `[LEGAL NAME / ENTITY]`
- **Contact:** `[SUPPORT EMAIL]`
- **Last updated:** `[DATE ON PUBLICATION]`
- **Governing law:** `[JURISDICTION]`

---

## 1. What this software is

Vistaar is a personal workspace for tasks, a calendar view, ambient sound, and
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

`[COMPLETE WHEN THE EXTENSION SHIPS — it is not built yet.]`

The extension is intended to open the workspace and capture a task. Points to
settle before publication:

- the exact permissions requested, and why each is necessary;
- that extension storage and website storage are **separate** and neither reads
  the other automatically;
- whether a new-tab override is included (it must be opt-in and reversible);
- the store listing's data-use disclosures, which must match this document.

## 4. Third-party content and attribution

### Question metadata and curated lists

Bundled question data — titles, slugs, difficulty and topic tags — is derived from
publicly available datasets that were MIT-licensed when retrieved. Provenance is
recorded in each pack's `provenance` field and in
`packages/core/src/dsa/sources.js`, and `tools/build-dsa-pack.mjs` regenerates it.

**We do not reproduce problem statements.** Problem text belongs to the platform
that publishes it and is never included. The application links to the original
problem page instead.

Curated list membership (which problems a given study list contains) reflects the
editorial selection of that list's author. Lists are referred to by name for
identification. `[LEGAL REVIEW: confirm the position on reproducing list
membership, and on nominative use of these names, before publishing.]`

### Not affiliated

Vistaar is not affiliated with, endorsed by, or sponsored by LeetCode, NeetCode,
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
