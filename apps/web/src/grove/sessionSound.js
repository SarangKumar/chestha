import * as engine from '../audio/engine.js';

/**
 * Ambient sound for a focus session.
 *
 * The audio engine is a singleton shared with the Sounds section, which sets the
 * rule here: a session may start a mix, but it may never take one over. If
 * anything is already playing — a mix the user chose, from the Sounds page or a
 * widget — the session leaves it exactly as it is, and leaves it running when it
 * ends. Only sound the session itself started is paused or stopped by it.
 *
 * Audio can only begin from a user gesture, so `start` is called from the Start
 * button's handler rather than from an effect watching the session.
 */
let startedBySession = false;

/** @returns whether a mix was started. */
export async function startSessionSound(preset, masterVolume) {
  if (!preset?.mix || Object.keys(preset.mix).length === 0) return false;
  if (engine.activeVoiceIds().length > 0) return false;   // something is already playing
  const running = await engine.ensureContext();
  if (!running) return false;
  await engine.applyMix(preset.mix, masterVolume);
  startedBySession = true;
  return true;
}

export async function pauseSessionSound() {
  if (startedBySession) await engine.pause();
}

export async function resumeSessionSound() {
  if (startedBySession) await engine.resume();
}

/** Ends the session's own mix and plays the chime, in that order. */
export async function stopSessionSound({ chime = false } = {}) {
  if (chime) await engine.chime();
  if (!startedBySession) return;
  startedBySession = false;
  // A moment after the chime, so the mix does not cut out underneath it.
  setTimeout(() => engine.stopAll(), chime ? 1300 : 0);
}
