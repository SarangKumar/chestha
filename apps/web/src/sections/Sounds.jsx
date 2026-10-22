import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  SOUNDS, activeSoundIds, applyPreset, clampVolume, createPreset, deletePreset, renamePreset,
} from '@vistaar/core';
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

  const mix = sound.lastMix ?? {};
  const active = activeSoundIds(mix);
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
    const result = createPreset(presetName, mix);
    if (!result.ok) { notify(result.error, { tone: 'danger' }); return; }
    actions.setSound((s) => ({ ...s, presets: [...s.presets, result.preset] }));
    setSaveOpen(false);
    setPresetName('');
    notify(`Saved “${result.preset.name}”`);
  };

  const loadPreset = async (preset) => {
    const { mix: next, missing } = applyPreset(preset);
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
        description="Every sound is generated in your browser — nothing is downloaded, and it works offline."
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
        </div>
        <ul className="divide-y divide-line">
          {SOUNDS.map((item) => {
            const on = item.id in mix;
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleSound(item.id)}
                  aria-pressed={on}
                  className={cx(
                    'flex size-9 shrink-0 items-center justify-center rounded-control border transition-colors duration-150',
                    on ? 'border-transparent bg-accent text-on-accent' : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
                  )}
                >
                  <Icon name={on && audio.running ? 'pause' : 'play'} className="size-4" />
                  <span className="sr-only">{on ? `Turn off ${item.name}` : `Turn on ${item.name}`}</span>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    {item.name}
                    {on && <Badge tone={audio.running ? 'ok' : 'neutral'}>{audio.running ? 'Playing' : 'Paused'}</Badge>}
                  </p>
                  <p className="mt-0.5 text-meta text-ink-faint">{item.description}</p>
                </div>

                <div className="flex w-full items-center gap-2 sm:w-44">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
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
              </li>
            );
          })}
        </ul>
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
