import { SOUNDS, coerceAudioManifest } from '@chestha/core';
import * as engine from './audio/engine.js';
import * as tracks from './audio/trackStore.js';
import { AUDIO_COMMAND, AUDIO_KEY, AUDIO_STATE, audioSnapshotFrom } from './audio/protocol.js';

/**
 * The audio host.
 *
 * Chestha's mix used to play in the New Tab page's own AudioContext, which
 * meant it stopped the moment that tab was navigated away — typing a search
 * into the start page killed the music. This document exists only to outlive
 * that: Chrome keeps an offscreen document alive independently of any tab, and
 * `AUDIO_PLAYBACK` is exactly the reason it is allowed to.
 *
 * It owns the engine now. A workspace page sends it a mix and it resolves,
 * decodes and plays it; the page draws what this reports. That also makes the
 * island's cross-tab problem disappear by construction — with one audio host
 * there is only one answer to "is it playing", so two New Tabs can no longer
 * disagree.
 *
 * It resolves the catalogue itself rather than being handed one. Built-ins are
 * fetched from the extension's own `/audio/`, and uploaded tracks are read
 * from the same IndexedDB the workspace writes — their blob URLs have to be
 * created *in this document*, because a blob URL made in a tab dies with it.
 *
 * Nothing here touches the workspace store. It is handed mixes and gives back
 * playback state; the meaning of a mix stays in the app.
 */

let catalogue = [...SOUNDS];
let ready = null;
let lastMix = {};
let masterVolume = 0.6;
let loopTracks = true;

/** Built-ins, the optional manifest, and whatever the user has uploaded. */
async function resolveCatalogue() {
  if (!ready) {
    ready = (async () => {
      let extra = [];
      try {
        const response = await fetch('/audio/catalog.json');
        if (response.ok) extra = coerceAudioManifest(await response.json());
      } catch {
        // No manifest is the normal case; the built-ins are enough.
      }
      tracks.loadTracks();
      return extra;
    })();
  }
  const extra = await ready;
  catalogue = [...SOUNDS, ...extra, ...tracks.getTrackState().sounds];
  engine.setCatalogue(catalogue);
  return catalogue;
}

// An upload finishing in the workspace changes what this can play, and the
// store is shared, so the catalogue is rebuilt rather than cached forever.
tracks.subscribe(() => {
  catalogue = [...catalogue.filter((item) => !item.track), ...tracks.getTrackState().sounds];
  engine.setCatalogue(catalogue);
});

/** Tells every workspace page, and the overlay, what is happening. */
function broadcast() {
  const snapshot = audioSnapshotFrom({
    engineState: engine.getEngineState(),
    mix: lastMix,
    catalogue,
    masterVolume,
    loop: loopTracks,
    playback: playbackOfMix(),
  });

  try {
    chrome.storage.local.set({ [AUDIO_KEY]: snapshot });
  } catch {
    /* storage went away under an extension reload */
  }
  try {
    chrome.runtime.sendMessage({ type: AUDIO_STATE, snapshot }, () => {
      // Nobody listening is the ordinary case: every workspace tab may be
      // closed while the music plays on. Reading the error keeps Chrome from
      // logging it.
      void chrome.runtime.lastError;
    });
  } catch {
    /* see above */
  }
}

/** The position of the one streamed track in the mix, if there is one. */
function playbackOfMix() {
  for (const id of Object.keys(lastMix)) {
    const sound = catalogue.find((item) => item.id === id);
    if (!sound?.stream) continue;
    const at = engine.playbackOf(id);
    if (at) return at;
  }
  return null;
}

engine.subscribe(broadcast);

/**
 * One second: the resolution of the clock beside the progress bar, and a
 * position that is not broadcast is not drawn moving anywhere.
 *
 * It beats while paused too. Readers treat an unrefreshed record as silence —
 * that is how the overlay knows the browser went quiet — so a host that only
 * reported while playing would lose the paused track's name fifteen seconds
 * after you paused it, along with the button to start it again.
 */
setInterval(broadcast, 1000);

const COMMANDS = {
  async play({ mix, volume, loop }) {
    lastMix = mix ?? lastMix;
    masterVolume = typeof volume === 'number' ? volume : masterVolume;
    await resolveCatalogue();
    loopTracks = loop !== false;
    engine.setLoopTracks(loopTracks);
    const started = await engine.ensureContext();
    if (!started) return { ok: false, reason: 'blocked' };
    await engine.applyMix(lastMix, masterVolume);
    broadcast();
    return { ok: true };
  },

  async apply({ mix, volume }) {
    lastMix = mix ?? lastMix;
    masterVolume = typeof volume === 'number' ? volume : masterVolume;
    await resolveCatalogue();
    if (engine.getEngineState().running) await engine.applyMix(lastMix, masterVolume);
    broadcast();
    return { ok: true };
  },

  async pause() {
    await engine.pause();
    broadcast();
    return { ok: true };
  },

  async stop() {
    engine.stopAll();
    lastMix = {};
    broadcast();
    return { ok: true };
  },

  async volume({ volume }) {
    masterVolume = typeof volume === 'number' ? volume : masterVolume;
    engine.setMasterVolume(lastMix, masterVolume);
    broadcast();
    return { ok: true };
  },

  async loop({ loop }) {
    loopTracks = loop !== false;
    engine.setLoopTracks(loopTracks);
    broadcast();
    return { ok: true };
  },

  async seek({ id, seconds }) {
    engine.seek(id, seconds);
    broadcast();
    return { ok: true };
  },

  async state() {
    broadcast();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== AUDIO_COMMAND) return false;
  if (sender?.id && sender.id !== chrome.runtime.id) return false;

  const command = COMMANDS[message.command];
  if (!command) { sendResponse?.({ ok: false, reason: 'unknown' }); return false; }

  command(message.payload ?? {}).then(
    (result) => sendResponse?.(result),
    () => sendResponse?.({ ok: false, reason: 'failed' }),
  );
  // Answered from a promise, so the channel stays open.
  return true;
});

// Announce once on load: a page that asked for the document to be created is
// waiting to hear what it found.
resolveCatalogue().then(broadcast, broadcast);
