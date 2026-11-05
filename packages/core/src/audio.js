import { newId } from './ids.js';
import { SOUND_IDS } from './sound.js';

/**
 * The user's own audio library: music and recordings *they* add, from files on
 * their own disk.
 *
 * Nothing here downloads anything. A track is a file the user picked with a
 * file input; the bytes are stored in IndexedDB on that device and played from
 * a blob URL, so playback works offline and the file never leaves the machine.
 *
 * The `sourceUrl` field is a link and only a link — where the track came from,
 * recorded so the card can credit the creator and point at the original. It is
 * never fetched. A YouTube URL stored here is a citation, not a source of
 * bytes: the app has no way to retrieve audio from it and must not acquire
 * one. Doing so would breach YouTube's terms and the Chrome Web Store policy
 * that forbids extensions from downloading YouTube content, and attribution
 * does not grant a licence.
 *
 * Tracks are deliberately **device-local** and take no part in workspace sync:
 * the metadata lives beside the bytes in the audio database rather than in the
 * synced `sound` area. Syncing the metadata alone would give another device a
 * library of entries it could name but never play.
 */

/** The library group uploaded tracks appear under in the Sounds list. */
export const TRACK_GROUP = 'Your music';

/**
 * Per-file ceiling. Generous enough for a long lossless track and small enough
 * that one accidental drop of a video file is refused with an explanation
 * rather than silently filling the user's disk.
 */
export const MAX_TRACK_BYTES = 60 * 1024 * 1024;

/**
 * Extensions a browser may be able to decode, used when the file's reported
 * type is missing or useless.
 *
 * `.mp4` and `.webm` are absent on purpose: both are far more often video, and
 * an audio-only file in either container is reported as `audio/mp4` or
 * `audio/webm`, which `isAudioFile` accepts on the type alone.
 */
export const AUDIO_EXTENSIONS = [
  'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'weba', 'wav', 'flac',
];

/**
 * Types that carry no information: some platforms report these for `.m4a`,
 * `.opus` and `.flac`, so they mean "look at the extension instead" rather
 * than "this is not audio".
 */
const VAGUE_TYPES = ['', 'application/octet-stream', 'binary/octet-stream'];

/**
 * Shown on every uploaded track's card. The user asked for this to be explicit,
 * and it is the honest statement: the app is a player, not a rights holder.
 */
export const OWNERSHIP_NOTICE =
  'These are files you added, stored on this device and played from it. Chestha '
  + 'claims no rights in any of them — all rights stay with the original '
  + 'creators, and the link on each track points at the original.';

/** The same statement, short enough to sit on every track's card. */
export const OWNERSHIP_BADGE = 'Not owned by Chestha — rights with the creator.';

/** The extension of a filename, lowercased, with no dot. '' when it has none. */
export function audioExtension(filename) {
  const name = String(filename ?? '');
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Whether a picked file looks like audio this browser might play.
 *
 * The reported type decides whenever it says anything: `audio/*` is accepted,
 * and an explicit `video/*`, `image/*` or document type is refused even if the
 * extension disagrees — a `.mp4` the browser calls video is video, and a user
 * who dropped a film in deserves to be told so rather than to watch it fail to
 * decode. Only a missing or deliberately vague type falls back to the
 * extension, because `.m4a`, `.opus` and `.flac` are reported inconsistently
 * across platforms.
 */
export function isAudioFile(file) {
  const type = String(file?.type ?? '').trim().toLowerCase();
  if (type.startsWith('audio/')) return true;
  if (!VAGUE_TYPES.includes(type)) return false;
  return AUDIO_EXTENSIONS.includes(audioExtension(file?.name));
}

/** A filename turned into a first guess at a title: 'lofi_beat-01.mp3' → 'lofi beat 01'. */
export function titleFromFilename(filename) {
  const name = String(filename ?? '');
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The 11-character video id in a YouTube URL, or null.
 *
 * Used only to show a tidy label and to recognise that a link is a YouTube one.
 * Nothing is built from it but display text.
 */
export function youTubeVideoId(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const id = (value) => (/^[A-Za-z0-9_-]{11}$/.test(value ?? '') ? value : null);

  if (host === 'youtu.be') return id(url.pathname.slice(1).split('/')[0]);
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') return id(url.searchParams.get('v'));
    const match = url.pathname.match(/^\/(?:shorts|embed|v|live)\/([^/]+)/);
    if (match) return id(match[1]);
  }
  return null;
}

/**
 * Validates a source link.
 *
 * Only `http:` and `https:` survive. `javascript:` and `data:` URLs are the
 * reason this is a allow-list rather than a check for the obvious bad ones —
 * this value ends up in an anchor's `href`, so anything that could execute on
 * click must never reach the DOM.
 *
 * @returns {{ok: true, url: string, host: string, youTubeId: string|null}
 *          | {ok: false, error: string}}
 */
export function coerceSourceUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: true, url: '', host: '', youTubeId: null };

  // A bare 'youtube.com/watch?v=…' is what people paste; give it a scheme
  // rather than rejecting it, but only when it has no scheme of its own.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: 'That does not look like a web address.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https links can be stored.' };
  }
  if (!url.hostname.includes('.')) {
    return { ok: false, error: 'That address has no domain name.' };
  }
  return {
    ok: true,
    url: url.toString(),
    host: url.hostname.replace(/^www\./, ''),
    youTubeId: youTubeVideoId(url.toString()),
  };
}

/** How a source link should read on a card: 'YouTube' or the bare domain. */
export function describeSource(sourceUrl) {
  const checked = coerceSourceUrl(sourceUrl);
  if (!checked.ok || !checked.url) return '';
  if (checked.youTubeId) return 'YouTube';
  return checked.host;
}

/**
 * Checks a file the user picked, before any of it is read or stored.
 *
 * @param {{name?: string, size?: number, type?: string}} file
 * @param {string[]} [takenIds] ids already in use, so a new track cannot shadow one
 * @returns {{ok: true, draft: object} | {ok: false, error: string}}
 */
export function validateTrackFile(file, takenIds = []) {
  if (!file || typeof file !== 'object') {
    return { ok: false, error: 'No file was chosen.' };
  }
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: 'That file is empty.' };
  }
  if (size > MAX_TRACK_BYTES) {
    return {
      ok: false,
      error: `That file is larger than the ${Math.round(MAX_TRACK_BYTES / (1024 * 1024))} MB limit for one track.`,
    };
  }
  if (!isAudioFile(file)) {
    return { ok: false, error: 'That is not an audio file the browser can play.' };
  }

  const taken = new Set([...SOUND_IDS, ...takenIds]);
  let id = newId('track');
  while (taken.has(id)) id = newId('track');

  return {
    ok: true,
    draft: {
      id,
      name: titleFromFilename(file.name) || 'Untitled track',
      artist: '',
      sourceUrl: '',
      license: '',
      description: '',
      filename: String(file.name ?? ''),
      mime: String(file.type ?? ''),
      bytes: size,
      addedAt: new Date().toISOString(),
    },
  };
}

/**
 * Normalises one stored track record, or returns null when it is unusable.
 *
 * Runs on everything read back out of IndexedDB: a record written by an older
 * version, or edited by hand, must not be able to put a bad id into a preset or
 * a dangerous URL into an anchor.
 */
export function coerceTrack(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id ?? '').trim();
  if (!id || SOUND_IDS.includes(id)) return null;

  const source = coerceSourceUrl(raw.sourceUrl);
  const bytes = Number(raw.bytes);

  return {
    id,
    name: String(raw.name ?? '').trim() || 'Untitled track',
    artist: String(raw.artist ?? '').trim(),
    // An invalid stored URL is dropped rather than rendered: the rest of the
    // record is still worth keeping, and the user can paste the link again.
    sourceUrl: source.ok ? source.url : '',
    license: String(raw.license ?? '').trim(),
    description: String(raw.description ?? '').trim(),
    filename: String(raw.filename ?? '').trim(),
    mime: String(raw.mime ?? '').trim(),
    bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
    addedAt: String(raw.addedAt ?? '').trim(),
  };
}

/** Normalises a list of stored tracks, dropping duplicates and unusable records. */
export function coerceTrackList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const track = coerceTrack(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

/**
 * Applies an edit to a track's credit fields, validating the link.
 *
 * @returns {{ok: true, track: object} | {ok: false, error: string}}
 */
export function editTrack(track, patch = {}) {
  const base = coerceTrack(track);
  if (!base) return { ok: false, error: 'That track no longer exists.' };

  const name = String(patch.name ?? base.name).trim();
  if (!name) return { ok: false, error: 'A track needs a name.' };

  const source = coerceSourceUrl(patch.sourceUrl ?? base.sourceUrl);
  if (!source.ok) return { ok: false, error: source.error };

  return {
    ok: true,
    track: {
      ...base,
      name,
      artist: String(patch.artist ?? base.artist).trim(),
      license: String(patch.license ?? base.license).trim(),
      description: String(patch.description ?? base.description).trim(),
      sourceUrl: source.url,
    },
  };
}

/**
 * The credit line for a track: who made it, under what licence, from where.
 * Empty when the user has filled none of them in.
 */
export function creditLine(track) {
  const parts = [];
  if (track?.artist) parts.push(track.artist);
  if (track?.license) parts.push(track.license);
  const source = describeSource(track?.sourceUrl);
  if (source) parts.push(source);
  return parts.join(' · ');
}

/**
 * Turns a stored track into a catalogue entry the Sounds list and the audio
 * engine understand, given the blob URL its bytes are served from.
 *
 * `stream: true` is the engine's instruction to play this through an `<audio>`
 * element rather than decoding it whole. A built-in loop is a couple of minutes
 * of ambience and decodes to a manageable buffer; a song decodes to hundreds of
 * megabytes of PCM, so music is streamed and never fully decoded.
 */
export function trackToSound(track, src) {
  return {
    id: track.id,
    name: track.name,
    group: TRACK_GROUP,
    description: track.description || track.filename || '',
    credit: creditLine(track),
    file: track.filename,
    src,
    stream: true,
    builtin: false,
    track,
  };
}
