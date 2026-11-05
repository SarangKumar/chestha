import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  MAX_TRACK_BYTES, OWNERSHIP_BADGE, OWNERSHIP_NOTICE, TRACK_GROUP,
  activeSoundIds, applyPreset, clampVolume, createPreset, deletePreset, describeSource,
  formatBytes, renamePreset,
} from '@chestha/core';
import { useSoundCatalogue } from '../app/useSoundCatalogue.js';
import { useWorkspace } from '../app/StoreProvider.jsx';
import {
  Badge, Button, CardTitle, Dialog, EmptyState, Field, IconButton, Panel, SectionHeader, TextInput, cx,
} from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import * as engine from '../audio/engine.js';
import * as trackStore from '../audio/trackStore.js';

export function Sounds() {
  const { state, actions, notify } = useWorkspace();
  const sound = state.sound;
  const audio = useSyncExternalStore(engine.subscribe, engine.getEngineState);

  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const nameRef = useRef(null);

  // The user's own audio files, stored on this device only.
  const library = useSyncExternalStore(trackStore.subscribe, trackStore.getTrackState);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef(null);
  const editNameRef = useRef(null);

  // Shared with the dashboard widget, so both judge a preset against the same list.
  const catalogue = useSoundCatalogue();
  const knownIds = useMemo(() => catalogue.map((s) => s.id), [catalogue]);
  const groups = useMemo(() => [...new Set(catalogue.map((s) => s.group))], [catalogue]);

  useEffect(() => { engine.setCatalogue(catalogue); }, [catalogue]);

  const mix = sound.lastMix ?? {};
  const active = activeSoundIds(mix, knownIds);
  const playing = audio.running && active.length > 0;

  // The engine is the source of truth for what is audible; the store is the
  // source of truth for what the mix *is*. Keep the former in step with latter.
  useEffect(() => {
    if (audio.running) engine.applyMix(mix, sound.masterVolume);
  }, [mix, sound.masterVolume, audio.running]);

  const start = async (nextMix) => {
    const ok = await engine.ensureContext();
    if (!ok) {
      notify('The browser blocked audio. Press play again — it only starts from a click.', { tone: 'danger', duration: 8000 });
      return false;
    }
    engine.applyMix(nextMix ?? mix, sound.masterVolume);
    return true;
  };

  const toggleSound = async (id) => {
    const next = { ...mix };
    if (id in next) delete next[id];
    else next[id] = 0.5;
    actions.setSound({ lastMix: next });
    if (Object.keys(next).length === 0) {
      engine.stopAll();
    } else {
      await start(next);
    }
  };

  const setSoundVolume = (id, value) => {
    const next = { ...mix, [id]: clampVolume(value) };
    actions.setSound({ lastMix: next });
  };

  const togglePlayback = async () => {
    if (active.length === 0) return;
    if (audio.running) await engine.pause();
    else await start();
  };

  const stopEverything = () => {
    const previous = mix;
    engine.stopAll();
    actions.setSound({ lastMix: {} });
    notify('Stopped and cleared the mix', {
      actionLabel: 'Undo',
      onAction: () => { actions.setSound({ lastMix: previous }); start(previous); },
    });
  };

  const savePreset = () => {
    const result = createPreset(presetName, mix, knownIds);
    if (!result.ok) { notify(result.error, { tone: 'danger' }); return; }
    actions.setSound((s) => ({ ...s, presets: [...s.presets, result.preset] }));
    setSaveOpen(false);
    setPresetName('');
    notify(`Saved “${result.preset.name}”`);
  };

  const loadPreset = async (preset) => {
    const { mix: next, missing } = applyPreset(preset, knownIds);
    const previous = mix;
    actions.setSound({ lastMix: next });
    await start(next);
    if (missing.length > 0) {
      notify(`Restored “${preset.name}”, but ${missing.length} sound(s) in it are not available in this version.`, { duration: 9000 });
    } else {
      notify(`Restored “${preset.name}”`, {
        actionLabel: 'Undo',
        onAction: () => { actions.setSound({ lastMix: previous }); start(previous); },
      });
    }
  };

  const commitRename = () => {
    const result = renamePreset(sound.presets, renaming.id, renaming.name);
    if (!result.ok) { notify(result.error, { tone: 'danger' }); return; }
    actions.setSound({ presets: result.presets });
    setRenaming(null);
  };

  const removePreset = (preset) => {
    actions.setSound((s) => ({ ...s, presets: deletePreset(s.presets, preset.id) }));
    notify(`Deleted “${preset.name}”`, {
      tone: 'danger',
      actionLabel: 'Undo',
      onAction: () => actions.setSound((s) => ({ ...s, presets: [...s.presets, preset] })),
    });
  };

  const addFiles = async (fileList) => {
    const files = [...(fileList ?? [])];
    if (files.length === 0) return;
    setAdding(true);
    const failures = [];
    let added = 0;
    // One at a time: each is a separate IndexedDB transaction, and a file the
    // browser refuses must not stop the rest of a multi-file pick.
    for (const file of files) {
      const result = await trackStore.addTrack(file);
      if (result.ok) added += 1;
      else failures.push(`${file.name}: ${result.error}`);
    }
    setAdding(false);
    if (added > 0) notify(`Added ${added} track${added === 1 ? '' : 's'}`);
    for (const failure of failures) notify(failure, { tone: 'danger', duration: 9000 });
  };

  const saveTrack = async () => {
    const result = await trackStore.updateTrack(editing.id, editing);
    if (!result.ok) { notify(result.error, { tone: 'danger' }); return; }
    setEditing(null);
    notify(`Saved “${result.track.name}”`);
  };

  const confirmRemove = async () => {
    const track = removing;
    setRemoving(null);
    // Take it out of the mix first, so the voice is faded out and its element
    // released before the blob behind it goes.
    if (track.id in mix) {
      const next = { ...mix };
      delete next[track.id];
      actions.setSound({ lastMix: next });
      if (Object.keys(next).length === 0) engine.stopAll();
      else engine.applyMix(next, sound.masterVolume);
    }
    const result = await trackStore.removeTrack(track.id);
    if (!result.ok) { notify(result.error, { tone: 'danger' }); return; }
    // No undo offered: the file itself is gone, and an undo that restored the
    // name without the audio would be a lie.
    notify(`Deleted “${track.name}”`, { tone: 'danger' });
  };

  if (!audio.supported) {
    return (
      <div>
        <SectionHeader title="Sounds" />
        <Panel className="p-5">
          <p className="text-sm text-ink-muted">
            This browser does not provide the Web Audio API, so ambient sound is unavailable here.
            Everything else in the app works normally.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Sounds"
        description={`${catalogue.length} sounds. Everything plays from this device and works offline — nothing is downloaded and nothing is streamed from the internet. Add your own music below.`}
      >
        <Button onClick={togglePlayback} disabled={active.length === 0} tone={playing ? 'default' : 'primary'}>
          <Icon name={playing ? 'pause' : 'play'} className="size-4" />
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button onClick={stopEverything} disabled={active.length === 0}>Stop</Button>
      </SectionHeader>

      {active.length > 0 && !audio.running && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 border-warn/35 bg-warn-soft p-4">
          <p className="text-sm text-ink">
            Your mix is ready but paused. Browsers only start audio from a click, so it cannot resume by itself.
          </p>
          <Button size="sm" tone="primary" onClick={() => start()}>Resume</Button>
        </Panel>
      )}

      <Panel className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Master volume</CardTitle>
          <span className="tabular text-meta text-ink-faint">{Math.round(sound.masterVolume * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={sound.masterVolume}
          onChange={(e) => actions.setSound({ masterVolume: clampVolume(e.target.value) })}
          aria-label="Master volume"
          className="w-full accent-[var(--app-accent)]"
        />
        <p className="mt-2 text-meta text-ink-faint">
          Each sound is also scaled down as you add more, so a busy mix does not clip.
        </p>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <CardTitle>Sound library</CardTitle>
          <p className="mt-1 text-meta leading-relaxed text-ink-faint">
            Real recordings, shipped with the app and played from it — nothing is
            fetched from the internet. Mix as many as you like; each keeps its own
            volume. To add your own, drop looping files into{' '}
            <span className="font-mono">public/audio/</span> and list them in{' '}
            <span className="font-mono">catalog.json</span>; they appear here beside these.
          </p>
        </div>
        {groups.map((group) => (
          <div key={group}>
            <div className="border-b border-line bg-inset px-4 py-1.5">
              <p className="text-meta font-medium text-ink-muted">{group}</p>
              {group === TRACK_GROUP && (
                <p className="mt-0.5 max-w-prose text-meta leading-relaxed text-ink-faint">
                  {OWNERSHIP_NOTICE}
                </p>
              )}
            </div>
            {/* Two columns: the whole library in one list is a long scroll, and a
                full-width row wastes space on a name and a slider. */}
            <ul className="grid gap-px bg-line sm:grid-cols-2">
              {catalogue.filter((s) => s.group === group).map((item) => {
                const on = item.id in mix;
                const failure = audio.failed[item.id];
                return (
                  <li key={item.id} className="flex items-center gap-3 bg-surface px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSound(item.id)}
                      aria-pressed={on}
                      className={cx(
                        'flex size-9 shrink-0 items-center justify-center rounded-control border transition-colors duration-150',
                        on
                          ? 'border-transparent bg-accent text-on-accent'
                          : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
                      )}
                    >
                      <Icon name={on && audio.running ? 'pause' : 'play'} className="size-4" />
                      <span className="sr-only">{on ? `Turn off ${item.name}` : `Turn on ${item.name}`}</span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                        <span className="truncate">{item.name}</span>
                        {failure && <Badge tone="danger">Unavailable</Badge>}
                        {on && !failure && (
                          <Badge tone={audio.running ? 'ok' : 'neutral'}>
                            {audio.running ? 'Playing' : 'Paused'}
                          </Badge>
                        )}
                        {!item.builtin && (
                          <Badge tone="neutral">{item.track ? 'Your track' : 'Your file'}</Badge>
                        )}
                      </p>
                      {item.track ? (
                        <TrackCredit
                          track={item.track}
                          failure={failure}
                          onEdit={() => setEditing({ ...item.track })}
                          onRemove={() => setRemoving(item.track)}
                        />
                      ) : (
                        <p className="mt-0.5 truncate text-meta text-ink-faint">
                          {failure ? `This file ${failure}.` : item.description}
                          {item.credit && !failure && ` · ${item.credit}`}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          type="range"
                          min="0" max="1" step="0.01"
                          value={mix[item.id] ?? 0.5}
                          disabled={!on}
                          onChange={(e) => setSoundVolume(item.id, e.target.value)}
                          aria-label={`${item.name} volume`}
                          className="w-full accent-[var(--app-accent)] disabled:opacity-40"
                        />
                        <span className="tabular w-9 shrink-0 text-right text-meta text-ink-faint">
                          {Math.round((mix[item.id] ?? 0) * 100)}%
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </Panel>

      <Panel className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Your music</CardTitle>
            <p className="mt-1 max-w-prose text-meta leading-relaxed text-ink-faint">
              Add audio files from your own computer. They are stored on this device,
              play offline, and are never uploaded or synced to your other devices.
              Each track can carry the creator’s name, the licence and a link to the
              original — fill those in so the credit travels with the track.
            </p>
            <p className="mt-1.5 max-w-prose text-meta leading-relaxed text-ink-faint">
              Chestha cannot download audio from a streaming site, and will not:
              ripping from YouTube breaks its terms and the Chrome Web Store rules,
              and crediting a creator is not the same as holding a licence. Paste a
              YouTube link as the <em>source</em> of a file you already have the right
              to use. For music that is free to redistribute, try the Free Music
              Archive, Jamendo, Pixabay or incompetech.com.
            </p>
          </div>
          <Button
            size="sm"
            tone="primary"
            onClick={() => fileRef.current?.click()}
            disabled={adding || !library.available}
          >
            <Icon name="upload" className="size-4" />
            {adding ? 'Adding…' : 'Add files'}
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />

        {!library.available ? (
          <Panel level="inset" className="border-warn/35 bg-warn-soft p-3.5">
            <p className="text-meta leading-relaxed text-ink">
              This browser window cannot store audio files
              {library.error ? `: ${library.error}` : '.'} That happens in some private
              windows and with strict privacy settings; the built-in sounds still work.
            </p>
          </Panel>
        ) : !library.ready ? (
          // Reading the library is a database round trip. Showing the empty
          // state first would flash "no tracks" at someone who has plenty.
          <p className="text-meta text-ink-faint">Loading your tracks…</p>
        ) : library.tracks.length === 0 ? (
          <EmptyState
            title="No tracks yet"
            description={`Add an MP3, M4A, OGG, WAV or FLAC file of up to ${Math.round(MAX_TRACK_BYTES / (1024 * 1024))} MB. It appears in the library above, under “${TRACK_GROUP}”.`}
          />
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
              {library.tracks.map((track) => (
                <li key={track.id} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{track.name}</p>
                    <p className="mt-0.5 truncate text-meta text-ink-faint">
                      {[track.artist || 'No creator credited', track.license, describeSource(track.sourceUrl), formatBytes(track.bytes)]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <IconButton label={`Edit credits for ${track.name}`} onClick={() => setEditing({ ...track })}>
                    <Icon name="edit" className="size-4" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${track.name}`}
                    onClick={() => setRemoving(track)}
                    className="hover:text-danger"
                  >
                    <span aria-hidden="true">×</span>
                  </IconButton>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-meta text-ink-faint">
              {library.tracks.length} track{library.tracks.length === 1 ? '' : 's'},
              {' '}{formatBytes(trackStore.libraryBytes(library.tracks))} on this device.
            </p>
          </>
        )}
      </Panel>

      <Panel className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Presets</CardTitle>
          <Button size="sm" onClick={() => { setPresetName(''); setSaveOpen(true); }} disabled={active.length === 0}>
            Save current mix
          </Button>
        </div>

        {sound.presets.length === 0 ? (
          <EmptyState
            title="No presets yet"
            description="Turn on a few sounds, then save the mix so you can bring it back in one action."
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
            {sound.presets.map((preset) => (
              <li key={preset.id} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{preset.name}</p>
                  <p className="mt-0.5 text-meta text-ink-faint">
                    {Object.keys(preset.mix).length} sound{Object.keys(preset.mix).length === 1 ? '' : 's'}
                  </p>
                </div>
                <Button size="sm" onClick={() => loadPreset(preset)}>Load</Button>
                <IconButton label={`Rename ${preset.name}`} onClick={() => setRenaming({ id: preset.id, name: preset.name })}>
                  <Icon name="note" className="size-4" />
                </IconButton>
                <IconButton label={`Delete ${preset.name}`} onClick={() => removePreset(preset)} className="hover:text-danger">
                  <span aria-hidden="true">×</span>
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        size="sm"
        initialFocus={nameRef}
        title="Save this mix"
        description={`${active.length} sound${active.length === 1 ? '' : 's'} and their volumes will be stored. The master volume is a separate setting and is not saved.`}
        footer={(
          <>
            <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button tone="primary" onClick={savePreset} disabled={!presetName.trim()}>Save preset</Button>
          </>
        )}
      >
        <Field label="Preset name">
          {(id) => (
            <TextInput
              id={id}
              ref={nameRef}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && presetName.trim()) { e.preventDefault(); savePreset(); } }}
              placeholder="Deep focus"
              autoComplete="off"
            />
          )}
        </Field>
      </Dialog>

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        size="sm"
        title="Rename preset"
        footer={(
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button tone="primary" onClick={commitRename} disabled={!renaming?.name.trim()}>Save</Button>
          </>
        )}
      >
        <Field label="Preset name">
          {(id) => (
            <TextInput
              id={id}
              value={renaming?.name ?? ''}
              onChange={(e) => setRenaming((r) => ({ ...r, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } }}
              autoComplete="off"
            />
          )}
        </Field>
      </Dialog>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        initialFocus={editNameRef}
        title="Track details"
        description="The credit shown on this track’s card. The audio file itself is not changed."
        footer={(
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button tone="primary" onClick={saveTrack} disabled={!editing?.name?.trim()}>Save</Button>
          </>
        )}
      >
        <div className="space-y-3.5">
          <Field label="Title">
            {(id) => (
              <TextInput
                id={id}
                ref={editNameRef}
                value={editing?.name ?? ''}
                onChange={(e) => setEditing((t) => ({ ...t, name: e.target.value }))}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Creator" hint="Who made it. Shown on the card as the credit.">
            {(id) => (
              <TextInput
                id={id}
                value={editing?.artist ?? ''}
                onChange={(e) => setEditing((t) => ({ ...t, artist: e.target.value }))}
                placeholder="Artist or channel name"
                autoComplete="off"
              />
            )}
          </Field>
          <Field
            label="Original link"
            hint="Where it came from — a YouTube video, a Bandcamp page, anywhere. Stored as a link only; nothing is ever fetched from it."
          >
            {(id) => (
              <TextInput
                id={id}
                type="url"
                value={editing?.sourceUrl ?? ''}
                onChange={(e) => setEditing((t) => ({ ...t, sourceUrl: e.target.value }))}
                placeholder="https://www.youtube.com/watch?v=…"
                autoComplete="off"
                spellCheck="false"
              />
            )}
          </Field>
          <Field label="Licence" hint="Record the terms you have it under, so they are not lost.">
            {(id) => (
              <TextInput
                id={id}
                value={editing?.license ?? ''}
                onChange={(e) => setEditing((t) => ({ ...t, license: e.target.value }))}
                placeholder="CC BY 4.0, or “permission from the artist”"
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Note" hint="Optional. Anything you want to remember about it.">
            {(id) => (
              <TextInput
                id={id}
                value={editing?.description ?? ''}
                onChange={(e) => setEditing((t) => ({ ...t, description: e.target.value }))}
                autoComplete="off"
              />
            )}
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title={`Delete “${removing?.name ?? ''}”?`}
        description="The audio file is deleted from this device. There is no undo — you would have to add the file again. Presets that use it will report it as unavailable."
        footer={(
          <>
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button tone="danger" onClick={confirmRemove}>Delete track</Button>
          </>
        )}
      />
    </div>
  );
}

/**
 * The credit block on one of the user's own tracks.
 *
 * The source is rendered as a real link so the creator's page is one click
 * away, which is the point of recording it. `coerceSourceUrl` has already
 * rejected anything that is not http(s), so nothing executable can reach this
 * `href`; `noreferrer` keeps the user's workspace out of the target's logs.
 */
function TrackCredit({ track, failure, onEdit, onRemove }) {
  const source = describeSource(track.sourceUrl);
  return (
    <div className="mt-0.5 space-y-0.5">
      {failure && <p className="text-meta text-danger">This track {failure}.</p>}
      {track.description && !failure && (
        <p className="truncate text-meta text-ink-faint">{track.description}</p>
      )}
      <p className="flex flex-wrap items-center gap-x-1.5 text-meta text-ink-faint">
        <span className="truncate">{track.artist || 'No creator credited'}</span>
        {track.license && (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{track.license}</span>
          </>
        )}
        {source && (
          <>
            <span aria-hidden="true">·</span>
            <a
              href={track.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 underline decoration-line underline-offset-2 hover:text-ink"
            >
              {source}
              <Icon name="external" className="size-3" />
            </a>
          </>
        )}
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={onEdit}
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Edit
          <span className="sr-only"> credits for {track.name}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="underline decoration-line underline-offset-2 hover:text-danger"
        >
          Delete
          <span className="sr-only"> {track.name}</span>
        </button>
      </p>
      <p className="text-meta text-ink-faint">{OWNERSHIP_BADGE}</p>
    </div>
  );
}
