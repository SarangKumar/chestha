# Extension shell

The files here are copied verbatim over the built app to assemble
`dist/extension` (see `scripts/build-extension.mjs`): the MV3 manifest, the
service worker, and the productive-time tracker.

`manifest.json` holds **no explanatory keys**. Chrome reports any key it does
not recognise as a warning on the extension's card — including `_`-prefixed
ones, which are not a comment syntax — and the manifest is loadable and
inspectable before the build has stripped anything. So the notes live here
instead, and `apps/extension/test/grove-sources.test.js` fails if a key like
`_note` reappears in the JSON.

## `permissions`

The whole list is `tabs`, `idle`, `alarms`, `storage`, `unlimitedStorage`. The
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

It grants no access to any website, no host permission and no new API.

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
