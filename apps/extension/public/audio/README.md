# Ambient audio

This folder holds the app's sound library. The twelve sounds that ship with it
are declared in `packages/core/src/sound.js` and their `.m4a` files sit here;
`catalog.json` is for recordings *you* add on top of those.

## Two ways to add your own audio

1. **In the app** — Sounds → *Your music* → **Add files**. The file is stored in
   this browser's IndexedDB, on that device only, and each track carries the
   creator's name, the licence and a link to the original. Use this for music.
   Nothing added this way touches this folder, and nothing syncs to your other
   devices. Capped at **30 tracks of 8 MB each** (~240 MB); the limits live in
   `packages/core/src/audio.js` as `MAX_TRACKS` and `MAX_TRACK_BYTES`.
2. **In this folder**, listed in `catalog.json` — for audio you want *shipped
   with the build*, so it is there for everyone on a fresh install. Use this for
   ambience you have the right to redistribute. That is the rest of this file.

**Neither way can download from YouTube or any other streaming site**, and the
app will not gain the ability to. Ripping breaks YouTube's terms and the Chrome
Web Store policy that forbids extensions from downloading YouTube content, and
crediting a creator is not the same as holding a licence. Paste a YouTube link
as the *source* of a file you already have the right to use. For music that is
free to redistribute, try the Free Music Archive, Jamendo, Pixabay or
incompetech.com — many of those artists post the same tracks on YouTube, so the
YouTube link still works as the credit.

To add one — from Mixkit, Pixabay, Freesound, or anywhere you have the rights to
use it — drop the file in this folder and list it in `catalog.json`:

```json
{
  "sounds": [
    {
      "id": "rain-window",
      "name": "Rain on a window",
      "group": "Your files",
      "description": "Recorded indoors during a storm.",
      "credit": "Pixabay - Content License",
      "file": "rain-window.mp3"
    }
  ]
}
```

- `id` must be unique and lowercase, and must not collide with a shipped sound;
  it is what presets store.
- `file` must be a plain filename in this folder. Absolute paths, parent paths
  (`..`) and remote URLs are rejected, so a manifest cannot make the app fetch
  from somewhere else.
- `credit` is shown in the UI. Record the licence here so it is not lost.

**Pick files that loop.** Playback loops seamlessly end-to-end, so a recording
that fades in or out will audibly restart. Two to five minutes of steady ambience
works best; long files cost memory, since each is decoded in full.

Supported formats are whatever the browser decodes — MP3, OGG, WAV, M4A, FLAC.
The shipped files are AAC in an `.m4a` container, converted from WAV with
`afconvert -f m4af -d aac -b 112000 -s 3`, which keeps the whole library under
10 MB.

Adding files here is optional — the shipped set works with none of them present.
Delete one and remove its manifest entry and the app carries on; a preset naming
a missing sound reports the omission rather than failing.
