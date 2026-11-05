# Extension shell

The files here are copied verbatim over the built app to assemble
`dist/extension` (see `scripts/build-extension.mjs`): the MV3 manifest, the
service worker, the productive-time tracker, and the island overlay.

`manifest.json` holds **no explanatory keys**. Chrome reports any key it does
not recognise as a warning on the extension's card — including `_`-prefixed
ones, which are not a comment syntax — and the manifest is loadable and
inspectable before the build has stripped anything. So the notes live here
instead, and `apps/extension/test/grove-sources.test.js` fails if a key like
`_note` reappears in the JSON.

## `permissions`

The whole list is `tabs`, `idle`, `alarms`, `storage`, `unlimitedStorage`,
`offscreen`. The
test above pins it exactly, so adding one is a deliberate act with a diff that
has to be argued for.

### Why `unlimitedStorage`

**For durability, not for room.** The Sounds section caps the user's own audio
library at `MAX_TRACKS` (30) files of `MAX_TRACK_BYTES` (8MB) in
`packages/core/src/audio.js` — ~240MB at most, which fits inside the default
per-origin quota on any machine.

What the permission actually buys: without it an extension's storage is
best-effort, and Chrome may evict it under disk pressure. Uploaded tracks are
deliberately device-local and never synced, so an eviction loses audio files the
user cannot get back from the server or from another device — unlike everything
else this app stores, all of which returns on the next sync. That argument does
not weaken if the cap is lowered.

It grants no access to any website, no host permission and no new API. (The
island's content script does grant website access — see below. This one does
not, and the two should not be confused when arguing about either.)

### Why `offscreen`

**So the music does not stop when you search from the New Tab.** Audio used to
play in the New Tab page's own `AudioContext`, which dies with the document —
typing a query into the start page and pressing enter killed the mix. An
offscreen document is the one thing Chrome keeps alive independently of a tab
for exactly this reason, and `AUDIO_PLAYBACK` is the stated reason it allows.

The worker creates it on demand (`ensureOffscreen` in `background.js`) and
Chrome tears it down when it stops playing. It grants no website access and no
way to see or touch a page. It also removes a bug rather than only adding a
feature: with one audio host, two open New Tabs can no longer disagree about
whether something is playing.

If the document cannot be created, `apps/extension/src/audio/host.js` falls
back to playing in the page, which is what the app did before. Audio working
matters more than audio working in the tidy place.

## `content_scripts` — the island overlay

`island.js` is injected into every page, matching `<all_urls>`, and it is the
reason Chrome now asks for **"read and change all your data on all websites"**
at install. That is the single biggest thing this extension asks for, so the
argument for it is here in full.

**What it is.** The island is the notch that hangs off the top edge of the
workspace, showing what is playing and what is still due. Its whole point is
to be visible while you are working, which means while you are on other sites.
There is no narrower match pattern that delivers that: a list of sites would
be both a bigger privacy question (why *those*?) and a worse feature.

**What it does.** It appends one element to `document.documentElement`, draws
inside a **closed** shadow root, and reads the page for nothing: no DOM
queries, no text, no forms, no cookies, no storage, no URL. It talks only to
`chrome.storage.local`, where the workspace writes the snapshot it draws, and
to the service worker, which relays its buttons back to the workspace tab.
`apps/extension/test/grove-sources.test.js` pins both halves of that: the
manifest may declare exactly one content script running exactly this file in
the top frame only, and the file may not contain any of the ways a script
reads its host document.

**What the user can do about it.** Settings → Navigation → Island has three
values. `everywhere` is the default; `workspace` keeps the island inside
Chestha, and `off` removes it. The content script is installed either way —
only Chrome can revoke that — but on anything other than `everywhere` the
workspace publishes no snapshot and the overlay draws nothing.

**What it does not change.** The Grove's accounting still reads the active
tab's address through `tabs` and nothing on the page. No new permission was
added for the island: the content script's host access comes from its own
match pattern, and `host_permissions` is still only the website's origin.

`exclude_matches` is filled in at build time with the website's own origin,
because the site serves the same bundle and already draws the island in React —
without it, two would stack on every page of the site.

## Why `host_permissions` is absent from the JSON

It names the website origin, which is a build-time value (`VITE_SITE_URL`) and
differs between development and production. `scripts/build-extension.mjs`
injects it while assembling, reading the origin the bundle was actually built
with. **Do not hardcode it** — a manifest naming a different origin than the
bundle means the session cookie is never sent and every user reads as signed
out.

What it is for: the New Tab asks the website `GET /api/session` who is signed
in, so the gated sections can be gated. Chromium only treats that request as
first-party for SameSite purposes when the initiating extension page has host
access to the target, which is the whole reason the permission exists.
