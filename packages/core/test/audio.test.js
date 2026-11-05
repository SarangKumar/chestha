import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LIBRARY_BYTES, MAX_TRACKS, MAX_TRACK_BYTES, OWNERSHIP_BADGE, OWNERSHIP_NOTICE,
  SOUNDS, SOUND_IDS, TRACK_GROUP,
  audioExtension, coerceSourceUrl, coerceTrack, coerceTrackList, createPreset, creditLine,
  describeSource, editTrack, formatDuration, isAudioFile, mixGain, normalizeMix, titleFromFilename,
  trackToSound, validateTrackFile, youTubeVideoId,
} from '../src/index.js';

const file = (name, size = 4 * 1024 * 1024, type = 'audio/mpeg') => ({ name, size, type });

test('a source link must be http(s), so nothing executable reaches an href', () => {
  for (const hostile of [
    'javascript:alert(1)',
    'data:audio/mp3;base64,AAAA',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
  ]) {
    const result = coerceSourceUrl(hostile);
    assert.equal(result.ok, false, `${hostile} is refused`);
  }

  const ok = coerceSourceUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(ok.ok, true);
  assert.equal(ok.host, 'youtube.com');
  assert.equal(ok.youTubeId, 'dQw4w9WgXcQ');

  // An empty link is valid — credit is optional — and is not an error.
  assert.deepEqual(coerceSourceUrl(''), { ok: true, url: '', host: '', youTubeId: null });
  assert.deepEqual(coerceSourceUrl(null), { ok: true, url: '', host: '', youTubeId: null });
});

test('a pasted link with no scheme is given https rather than refused', () => {
  const result = coerceSourceUrl('youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(result.youTubeId, 'dQw4w9WgXcQ');

  // But a real scheme is never silently rewritten into one.
  assert.equal(coerceSourceUrl('javascript:alert(1)').ok, false);
  assert.equal(coerceSourceUrl('not a url at all').ok, false);
});

test('YouTube video ids are read from every shape of YouTube link', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
  ]) {
    assert.equal(youTubeVideoId(url), id, url);
  }

  assert.equal(youTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(youTubeVideoId('https://www.youtube.com/watch?v=tooshort'), null);
  assert.equal(youTubeVideoId('https://www.youtube.com/'), null);
  assert.equal(youTubeVideoId('nonsense'), null);
});

test('a source is described as YouTube or as its bare domain', () => {
  assert.equal(describeSource('https://youtu.be/dQw4w9WgXcQ'), 'YouTube');
  assert.equal(describeSource('https://freemusicarchive.org/music/x'), 'freemusicarchive.org');
  assert.equal(describeSource('https://www.jamendo.com/track/1'), 'jamendo.com');
  assert.equal(describeSource(''), '');
  assert.equal(describeSource('javascript:alert(1)'), '');
});

test('a picked file is checked before any of it is read', () => {
  assert.equal(validateTrackFile(file('song.mp3')).ok, true);
  assert.equal(validateTrackFile(file('song.m4a', 1024, '')).ok, true, 'extension alone is enough');
  assert.equal(validateTrackFile(file('song.opus', 1024, '')).ok, true);
  assert.equal(validateTrackFile(file('noext', 1024, 'audio/ogg')).ok, true, 'MIME alone is enough');

  assert.equal(validateTrackFile(null).ok, false);
  assert.equal(validateTrackFile(file('song.mp3', 0)).ok, false, 'an empty file is refused');
  assert.equal(validateTrackFile(file('clip.mp4', 1024, 'video/mp4')).ok, false, 'video is refused');
  assert.equal(validateTrackFile(file('notes.pdf', 1024, 'application/pdf')).ok, false);
  // An explicit type beats the extension, in both directions.
  assert.equal(validateTrackFile(file('song.mp3', 1024, 'video/mp4')).ok, false);
  assert.equal(validateTrackFile(file('song.flac', 1024, 'application/octet-stream')).ok, true,
    'a vague type falls back to the extension');
  assert.equal(validateTrackFile(file('notes.txt', 1024, 'application/octet-stream')).ok, false);

  const huge = validateTrackFile(file('long.wav', MAX_TRACK_BYTES + 1));
  assert.equal(huge.ok, false);
  assert.match(huge.error, /larger than/);
});

test('a new track can never shadow a built-in sound or an existing track', () => {
  const first = validateTrackFile(file('a.mp3'));
  const second = validateTrackFile(file('b.mp3'), [first.draft.id]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.draft.id, second.draft.id);
  for (const draft of [first.draft, second.draft]) {
    assert.equal(SOUND_IDS.includes(draft.id), false, 'no collision with a built-in');
  }
});

test('a filename becomes a readable first title', () => {
  assert.equal(titleFromFilename('lofi_beat-01.mp3'), 'lofi beat 01');
  assert.equal(titleFromFilename('Rainy   Day.flac'), 'Rainy Day');
  assert.equal(titleFromFilename('noextension'), 'noextension');
  assert.equal(titleFromFilename(''), '');
  assert.equal(audioExtension('a.b.MP3'), 'mp3');
  assert.equal(audioExtension('.hidden'), '', 'a leading dot is not an extension');
  assert.equal(audioExtension('trailing.'), '');
  assert.equal(isAudioFile({ name: 'x.mp3' }), true);
  assert.equal(isAudioFile({ name: 'x.txt', type: 'text/plain' }), false);
});

test('a stored track record is normalised, and a bad stored link is dropped', () => {
  const track = coerceTrack({
    id: 'track_1',
    name: '  Night drive  ',
    artist: ' Some Artist ',
    sourceUrl: 'javascript:alert(1)',
    license: ' CC BY 4.0 ',
    bytes: '5000',
  });
  assert.equal(track.name, 'Night drive');
  assert.equal(track.artist, 'Some Artist');
  assert.equal(track.license, 'CC BY 4.0');
  assert.equal(track.sourceUrl, '', 'the unusable link is dropped, the record kept');
  assert.equal(track.bytes, 5000);

  assert.equal(coerceTrack(null), null);
  assert.equal(coerceTrack({ name: 'No id' }), null);
  assert.equal(coerceTrack({ id: 'light-rain', name: 'Shadows a built-in' }), null);
  assert.equal(coerceTrack({ id: 'track_2' }).name, 'Untitled track');
});

test('a track list drops duplicates and unusable records', () => {
  const list = coerceTrackList([
    { id: 'track_1', name: 'One' },
    { id: 'track_1', name: 'One again' },
    { id: 'light-rain', name: 'Built-in' },
    null,
    { id: 'track_2', name: 'Two' },
  ]);
  assert.deepEqual(list.map((t) => t.id), ['track_1', 'track_2']);
  assert.deepEqual(coerceTrackList(null), []);
});

test('editing credits validates the link and refuses an empty name', () => {
  const base = coerceTrack({ id: 'track_1', name: 'Night drive' });

  const saved = editTrack(base, {
    name: 'Night drive (slowed)',
    artist: 'Some Artist',
    sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
    license: 'Permission from the artist',
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.track.name, 'Night drive (slowed)');
  assert.equal(saved.track.sourceUrl, 'https://youtu.be/dQw4w9WgXcQ');

  assert.equal(editTrack(base, { name: '   ' }).ok, false);
  assert.equal(editTrack(base, { sourceUrl: 'javascript:alert(1)' }).ok, false);
  assert.equal(editTrack(null, {}).ok, false);
});

test('the credit line names the creator, the licence and where it came from', () => {
  assert.equal(
    creditLine({ artist: 'Some Artist', license: 'CC BY 4.0', sourceUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
    'Some Artist · CC BY 4.0 · YouTube',
  );
  assert.equal(creditLine({ artist: 'Some Artist' }), 'Some Artist');
  assert.equal(creditLine({}), '', 'nothing filled in reads as nothing, not as punctuation');
});

test('the ownership statement is present and says Chestha owns nothing', () => {
  for (const text of [OWNERSHIP_NOTICE, OWNERSHIP_BADGE]) {
    assert.match(text, /Chestha/);
    assert.match(text, /creator/);
    assert.match(text, /no\b.*rights|rights.*with the creator/i);
  }
});

test('a track becomes a catalogue entry the engine streams rather than decodes', () => {
  const track = coerceTrack({
    id: 'track_1', name: 'Night drive', artist: 'Some Artist', filename: 'night.mp3',
  });
  const entry = trackToSound(track, 'blob:chrome-extension://abc/123');

  assert.equal(entry.id, 'track_1');
  assert.equal(entry.group, TRACK_GROUP);
  assert.equal(entry.builtin, false);
  assert.equal(entry.src, 'blob:chrome-extension://abc/123');
  assert.equal(entry.stream, true, 'music is streamed, not decoded whole');
  assert.equal(entry.credit, 'Some Artist');
  assert.equal(entry.track.id, track.id, 'the record travels with the entry, for the card');

  // Built-in sounds must keep decoding, which is what makes their loops seamless.
  for (const sound of SOUNDS) assert.notEqual(sound.stream, true);
});

test('an uploaded track mixes and saves into a preset like any other sound', () => {
  const track = coerceTrack({ id: 'track_1', name: 'Night drive' });
  const entry = trackToSound(track, 'blob:x');
  const known = [...SOUND_IDS, entry.id];

  const mix = normalizeMix({ track_1: 0.8, 'light-rain': 0.4 }, known);
  assert.deepEqual(Object.keys(mix).sort(), ['light-rain', 'track_1']);
  assert.ok(mixGain(mix, 'track_1', 1, known) > 0);

  const saved = createPreset('Night mix', mix, known);
  assert.equal(saved.ok, true);
  assert.equal(saved.preset.mix.track_1, 0.8);
});

test('the library is capped at 30 tracks of 8MB, and the ceiling follows from both', () => {
  assert.equal(MAX_TRACKS, 30);
  assert.equal(MAX_TRACK_BYTES, 8 * 1024 * 1024);
  // The total is derived, not a third independent rule that could refuse a file
  // for a reason neither visible number explains.
  assert.equal(MAX_LIBRARY_BYTES, MAX_TRACKS * MAX_TRACK_BYTES);

  const full = Array.from({ length: MAX_TRACKS }, (_, i) => `track_${i}`);
  const refused = validateTrackFile(file('one-more.mp3', 1024), full);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /full at 30 tracks/);

  // One below the cap still admits a track, so the boundary is not off by one.
  const room = validateTrackFile(file('one-more.mp3', 1024), full.slice(0, MAX_TRACKS - 1));
  assert.equal(room.ok, true);
});

test('the count cap is checked before the file, so a full library says so first', () => {
  const full = Array.from({ length: MAX_TRACKS }, (_, i) => `track_${i}`);
  // An oversized file offered to a full library reports the library, which is
  // the condition the user has to act on — deleting a track, not re-encoding.
  const refused = validateTrackFile(file('huge.wav', MAX_TRACK_BYTES * 4), full);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /full at 30 tracks/);
});

test('a length reads as a clock, and an unknown one never reads as zero', () => {
  assert.equal(formatDuration(0), '--:--', 'unknown is stated, not guessed at');
  assert.equal(formatDuration(null), '--:--');
  assert.equal(formatDuration(-5), '--:--');
  assert.equal(formatDuration(NaN), '--:--');
  assert.equal(formatDuration(Infinity), '--:--', 'a stream has no length');

  assert.equal(formatDuration(7), '0:07');
  assert.equal(formatDuration(67), '1:07');
  assert.equal(formatDuration(187.4), '3:07', 'rounded to the nearest second');
  assert.equal(formatDuration(600), '10:00');
  assert.equal(formatDuration(3600), '1:00:00', 'an hour grows a field rather than reading 60:00');
  assert.equal(formatDuration(3903), '1:05:03');
});

test('a duration survives storage and a nonsense one is dropped', () => {
  assert.equal(coerceTrack({ id: 'track_1', duration: 187.4 }).duration, 187.4);
  // Unknown, not playable-but-instant: the UI needs to tell those apart.
  assert.equal(coerceTrack({ id: 'track_1' }).duration, 0);
  assert.equal(coerceTrack({ id: 'track_1', duration: 'nope' }).duration, 0);
  assert.equal(coerceTrack({ id: 'track_1', duration: -3 }).duration, 0);
  assert.equal(coerceTrack({ id: 'track_1', duration: Infinity }).duration, 0);

  // A new draft has no duration yet — the store fills it in once the browser
  // has read the file's metadata.
  assert.equal(validateTrackFile(file('song.mp3')).draft.duration, 0);

  // Editing credits must not discard it; it is not one of the edited fields.
  const stored = coerceTrack({ id: 'track_1', name: 'Night drive', duration: 187.4 });
  assert.equal(editTrack(stored, { artist: 'Some Artist' }).track.duration, 187.4);
});
