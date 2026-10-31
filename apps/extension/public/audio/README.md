# Your own ambient audio

The built-in sounds are synthesised in the browser and need no files. To add real
recordings — from Pixabay, Freesound, or anywhere you have the rights to use —
drop them in this folder and list them in `catalog.json`:

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

- `id` must be unique and lowercase; it is what presets store.
- `file` must be a plain filename in this folder. Absolute paths, parent paths
  (`..`) and remote URLs are rejected, so a manifest cannot make the app fetch
  from somewhere else.
- `credit` is shown in the UI. Record the licence here so it is not lost.

**Pick files that loop.** Playback loops seamlessly end-to-end, so a recording
that fades in or out will audibly restart. Two to five minutes of steady ambience
works best; long files cost memory, since each is decoded in full.

Supported formats are whatever the browser decodes — MP3, OGG, WAV, M4A, FLAC.

Nothing in this folder is required. Delete a file and remove its manifest entry
and the app carries on; a preset naming a missing sound reports the omission
rather than failing.
