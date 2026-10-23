import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  activeSoundIds, applyPreset, clampVolume, createPreset, deletePreset, renamePreset,
} from '@vistaar/core';
import { useSoundCatalogue } from '../app/useSoundCatalogue.js';
import { useWorkspace } from '../app/StoreProvider.jsx';
import {
  Badge, Button, CardTitle, Dialog, EmptyState, Field, IconButton, Panel, SectionHeader, TextInput, cx,
} from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import * as engine from '../audio/engine.js';

export function Sounds() {
  const { state, actions, notify } = useWorkspace();
  const sound = state.sound;
  const audio = useSyncExternalStore(engine.subscribe, engine.getEngineState);

  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const nameRef = useRef(null);

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
        description={`${catalogue.length} sounds. The built-in set is generated in your browser — nothing is downloaded and it works offline. Drop your own files into public/audio/ to add recordings.`}
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
            These are generated from filtered noise and tones, so they are honest
            approximations rather than recordings — the noise colours and the tonal
            ones are faithful, while rain, fire and crowds are suggestions of the real
            thing. For true fidelity, drop recordings into{' '}
            <span className="font-mono">public/audio/</span>; they appear here beside these.
          </p>
        </div>
        {groups.map((group) => (
          <div key={group}>
            <p className="border-b border-line bg-inset px-4 py-1.5 text-meta font-medium text-ink-muted">
              {group}
            </p>
            {/* Two columns: eighteen sounds in one list is a long scroll, and a
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
                        {!item.builtin && <Badge tone="neutral">Your file</Badge>}
                      </p>
                      <p className="mt-0.5 truncate text-meta text-ink-faint">
                        {failure ? `This file ${failure}.` : item.description}
                        {item.credit && !failure && ` · ${item.credit}`}
                      </p>
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
    </div>
  );
}
