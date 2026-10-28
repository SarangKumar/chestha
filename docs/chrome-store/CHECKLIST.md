# Chrome Web Store — Upload checklist (Chestha v0.1.1)

Do this from the Chestha repo root on your Mac. No CloudAgent required.

Working folder for Store assets and copy:

`/Users/sarangkumar/01-projects/01-active/chestha/release/chrome-store/`

---

## Before you open the dashboard

1. [ ] Replace placeholders in published privacy policy: `[LEGAL NAME / ENTITY]`, `[SUPPORT EMAIL]`, `[DATE]`, `[JURISDICTION]`, repo/support URL.
2. [ ] Host the privacy policy (body in `PRIVACY-PRACTICES.md`) at an `https://` URL.
3. [ ] Fill Homepage URL and Support email (see `LISTING.md` placeholders).
4. [ ] Confirm `apps/extension/src/manifest.json` still lists only `tabs`, `idle`, `alarms`, `storage` and description matches the product.
5. [ ] Re-skim `TERMS.md` §2–§3 against the built extension (network panel + permissions).

---

## Build the ZIP

```bash
cd /Users/sarangkumar/01-projects/01-active/chestha
npm test
npm run pack:extension
```

Upload this archive (version follows `package.json`):

`/Users/sarangkumar/01-projects/01-active/chestha/release/chestha-0.1.1.zip`

Staging folder for inspection:

`/Users/sarangkumar/01-projects/01-active/chestha/release/chestha-0.1.1/`

Default pack strips local media you may not redistribute. Only use `--keep-media` if you hold rights for every file.

---

## Upload order (recommended)

1. [ ] Create / select the item in Chrome Web Store Developer Dashboard.
2. [ ] **Package** — upload `release/chestha-0.1.1.zip`.
3. [ ] **Store listing** — paste fields from `LISTING.md`:
   - Item name: Chestha
   - Summary (≤132)
   - Detailed description
   - Category: Productivity
   - Language: English
   - Homepage URL
4. [ ] **Store icon 128×128** — upload `release/chrome-store/store-icon-128.png` (already in folder).
5. [ ] **Screenshots 1280×800** — upload at least one (prefer up to five). Suggested order:
   1. Dashboard New Tab
   2. Tasks / calendar
   3. Grove / Focus Garden
   4. DSA
   5. Sounds or Settings / export
6. [ ] **Small promo 440×280** — upload when ready (`promo-small-440x280.png`).
7. [ ] **Marquee 1400×560** — optional (`promo-marquee-1400x560.png`).
8. [ ] **Privacy practices** — fill from `PRIVACY-PRACTICES.md`:
   - Single purpose
   - Permission justifications
   - Remote code: No
   - Data collection disclosures
   - Privacy policy URL (hosted)
9. [ ] Support email + any distribution / visibility settings.
10. [ ] Submit for review.

---

## Asset status in this folder

| Asset | Status |
| --- | --- |
| `LISTING.md` | Ready to paste |
| `PRIVACY-PRACTICES.md` | Ready to paste / host |
| `CHECKLIST.md` | This file |
| `store-icon-128.png` | Present (128×128) |
| `icon-512-source.png` | Present (master; not a Store upload by itself) |
| Screenshots 1280×800 | **Still need creating / capturing** |
| Small promo 440×280 | **Still need creating** |
| Marquee 1400×560 | **Still need creating** (optional) |

---

## Rejects to avoid

- Misleading sync/cloud/account claims
- Keyword spam or fake testimonials
- Privacy tab contradicting listing or `TERMS.md`
- Missing screenshot or icon
- ZIP that includes media you cannot redistribute
