import { useEffect, useRef, useState } from 'react';
import {
  buildExport, estimateUsage, exportFilename, formatLongDate, parseImport, tagKey,
} from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { Button, Dialog, Field, Panel, SectionHeader, Select, TextInput } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { ShortcutSettings } from '../components/ShortcutSettings.jsx';

export function Settings() {
  const { state, status, actions, store, notify } = useWorkspace();
  const { settings } = state;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Settings"
        description="Preferences, and everything to do with your data."
      />

      <Group title="Appearance">
        <Field label="Theme" hint="“System” follows your operating system, including changes while this is open.">
          {(id) => (
            <Select id={id} value={settings.theme} onChange={(e) => actions.setSetting('theme', e.target.value)}>
              <option value="system">Follow system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          )}
        </Field>

        <Field label="Week starts on">
          {(id) => (
            <Select
              id={id}
              value={String(settings.weekStartsOn)}
              onChange={(e) => actions.setSetting('weekStartsOn', Number(e.target.value))}
            >
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
            </Select>
          )}
        </Field>
      </Group>

      <Group title="Tasks">
        <Field label="Upcoming horizon" hint="How far ahead the Upcoming view reaches. Widgets can override this individually.">
          {(id) => (
            <Select
              id={id}
              value={String(settings.upcomingHorizonDays)}
              onChange={(e) => actions.setSetting('upcomingHorizonDays', Number(e.target.value))}
            >
              {[3, 7, 14, 30].map((days) => <option key={days} value={days}>{days} days</option>)}
            </Select>
          )}
        </Field>

        <Toggle
          label="Hide completed tasks in lists"
          hint="They stay in the Completed view either way."
          checked={settings.hideCompleted}
          onChange={(value) => actions.setSetting('hideCompleted', value)}
        />

        <TagCleanup />
      </Group>

      <ShortcutSettings Group={Group} />

      <StorageGroup status={status} />
      <DataGroup state={state} actions={actions} store={store} notify={notify} />
    </div>
  );
}

function Group({ title, children }) {
  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="mb-5 text-card font-semibold text-ink">{title}</h2>
      <div className="space-y-5">{children}</div>
    </Panel>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--app-accent)]"
      />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

function TagCleanup() {
  const { state, actions, notify } = useWorkspace();
  const used = new Set(state.tasks.flatMap((task) => task.tags.map(tagKey)));
  const unused = state.tags.filter((tag) => !used.has(tagKey(tag)));
  if (unused.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-inset px-3.5 py-2.5">
      <p className="text-xs text-ink-muted">
        {unused.length} tag{unused.length === 1 ? '' : 's'} are kept for autocomplete but no longer used by any task.
      </p>
      <Button
        size="sm"
        onClick={() => {
          const previous = state.tags;
          actions.removeUnusedTags(used);
          notify(`Removed ${unused.length} unused tag${unused.length === 1 ? '' : 's'}`, {
            actionLabel: 'Undo',
            onAction: () => previous.forEach(actions.addTag),
          });
        }}
      >
        Clean up
      </Button>
    </div>
  );
}

function StorageGroup({ status }) {
  const [usage, setUsage] = useState(null);
  useEffect(() => { estimateUsage().then(setUsage); }, []);

  return (
    <Group title="Where your data lives">
      <div className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <p>
          Everything is stored by this browser, on this device, in its IndexedDB store for this site.
          There is no account, no server, and nothing is uploaded. No analytics or telemetry run at any point.
        </p>
        <p className="font-medium text-ink">What that honestly means:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Clearing site data or browsing history removes it.</li>
          <li>Browsers may evict site storage when space runs low, and some evict it after long periods without a visit.</li>
          <li>It does not follow you to another browser, another profile, or your phone.</li>
          <li>A private window usually starts empty and discards everything when it closes.</li>
          <li>It is not encrypted. Anyone with access to this device and browser profile can read it.</li>
        </ul>
        <p>
          An exported file is the only copy that survives any of this. There is no way to promise permanence
          or absolute security, so this product does not.
        </p>
      </div>

      <dl className="grid gap-3 rounded-control border border-line bg-inset px-3.5 py-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-ink-faint">Storage in use</dt>
          <dd className="font-medium text-ink">
            {status.mode === 'memory'
              ? 'Not saving — memory only'
              : usage
                ? `${formatBytes(usage.usage)} of about ${formatBytes(usage.quota)} available`
                : 'This browser does not report an estimate'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-faint">Backing store</dt>
          <dd className="font-medium text-ink">
            {status.mode === 'idb' ? 'IndexedDB (“vistaar”)' : status.storageReason ?? 'Unavailable'}
          </dd>
        </div>
      </dl>
    </Group>
  );
}

function DataGroup({ state, actions, store, notify }) {
  const [pendingImport, setPendingImport] = useState(null);
  const [importError, setImportError] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { store.readSnapshot().then(setSnapshot); }, [store]);

  const doExport = async () => {
    // A lazy area that was never opened still holds its default in memory, so it
    // must be read before the state is snapshotted.
    await store.ensureAllAreas();
    const payload = buildExport(store.getState());
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename();
    link.click();
    URL.revokeObjectURL(url);
    actions.setSetting('lastExportAt', new Date().toISOString());
    notify('Exported a copy of everything');
  };

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportError(null);
    let text;
    try {
      text = await file.text();
    } catch {
      setImportError('That file could not be read from disk.');
      return;
    }
    const result = parseImport(text);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    setPendingImport({ ...result, filename: file.name });
  };

  // Import is all-or-nothing, and the prior state is snapshotted first.
  const applyImport = async () => {
    const saved = await store.saveSnapshot();
    const { issues } = await store.replaceAll(pendingImport.data);
    setSnapshot(await store.readSnapshot());
    setPendingImport(null);
    notify(
      saved ? 'Imported. Your previous data was snapshotted first.' : 'Imported. A snapshot could not be saved.',
      { duration: 8000 },
    );
    if (issues.length > 0) notify(`${issues.length} item(s) were repaired during import.`);
  };

  const restoreSnapshot = async () => {
    if (!snapshot) return;
    await store.replaceAll(snapshot.state);
    notify('Restored the data from before the last import');
  };

  return (
    <>
      <Group title="Your data">
        <div className="flex flex-wrap gap-2">
          <Button tone="primary" onClick={doExport}>
            <Icon name="download" className="size-4" /> Export everything
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Icon name="upload" className="size-4" /> Import a file
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={chooseFile} className="hidden" />
        </div>

        <p className="text-xs text-ink-muted">
          One JSON file with tasks, tags, the scratchpad, dashboard layout, sound presets and settings.
          {state.settings.lastExportAt
            ? ` Last exported ${new Date(state.settings.lastExportAt).toLocaleString()}.`
            : ' You have not exported yet.'}
        </p>

        {importError && (
          <div className="rounded-control border border-danger/40 bg-danger-soft px-3.5 py-3 text-sm">
            <strong className="font-semibold">That file was not imported.</strong> {importError}
            <br />
            <span className="text-xs text-ink-muted">Nothing in your workspace was changed.</span>
          </div>
        )}

        {snapshot && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-inset px-3.5 py-2.5">
            <p className="text-xs text-ink-muted">
              A snapshot from before your last import is kept
              ({new Date(snapshot.takenAt).toLocaleString()}).
            </p>
            <Button size="sm" onClick={restoreSnapshot}>Restore it</Button>
          </div>
        )}

        <div className="rounded-control border border-danger/30 bg-danger-soft/50 p-4">
          <p className="text-sm font-medium text-ink">Reset the application</p>
          <p className="mb-3 mt-1 text-meta leading-relaxed text-ink-muted">
            Deletes everything stored here and returns to a first-run state. This cannot be undone.
          </p>
          <Button tone="danger" onClick={() => { setResetConfirm(''); setResetOpen(true); }}>
            Reset the application
          </Button>
        </div>
      </Group>

      <Dialog
        open={Boolean(pendingImport)}
        onClose={() => setPendingImport(null)}
        title="Import this file?"
        description="This replaces everything currently in this browser. Your current data is snapshotted first so this can be undone."
        footer={(
          <>
            <Button onClick={() => setPendingImport(null)}>Cancel</Button>
            <Button tone="primary" onClick={applyImport}>Replace everything</Button>
          </>
        )}
      >
        {pendingImport && (
          <div className="space-y-3 text-sm">
            <p className="font-mono text-xs text-ink-muted">{pendingImport.filename}</p>
            <dl className="grid grid-cols-2 gap-3 rounded-control border border-line bg-inset px-3.5 py-3 text-xs">
              <Stat label="Tasks" value={`${pendingImport.summary.tasks} (${pendingImport.summary.openTasks} open)`} />
              <Stat label="Widgets" value={pendingImport.summary.widgets} />
              <Stat label="Sound presets" value={pendingImport.summary.presets} />
              <Stat
                label="Exported"
                value={pendingImport.summary.exportedAt
                  ? formatLongDate(pendingImport.summary.exportedAt.slice(0, 10))
                  : 'Date not recorded'}
              />
            </dl>
            <p className="text-xs text-ink-muted">
              Replacing is what restoring a backup almost always means. Merging two sets of tasks is not
              supported yet, because deciding whether two tasks are the same one needs a rule we have not set.
            </p>
            {pendingImport.notes.length > 0 && (
              <ul className="list-disc space-y-0.5 rounded-control border border-line bg-warn-soft px-4 py-2.5 pl-6 text-xs text-ink">
                {pendingImport.notes.map((note, index) => <li key={index}>{note}</li>)}
              </ul>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        size="sm"
        title="Reset the application?"
        description="Every task, note, preset and preference stored in this browser is deleted. This cannot be undone."
        footer={(
          <>
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button onClick={doExport}>Export first</Button>
            <Button
              tone="danger"
              disabled={resetConfirm.trim().toLowerCase() !== 'reset'}
              onClick={async () => {
                await store.reset();
                setResetOpen(false);
                notify('Everything was reset');
              }}
            >
              Reset
            </Button>
          </>
        )}
      >
        <Field label="Type “reset” to confirm">
          {(id) => (
            <TextInput
              id={id}
              value={resetConfirm}
              onChange={(event) => setResetConfirm(event.target.value)}
              autoComplete="off"
              placeholder="reset"
            />
          )}
        </Field>
      </Dialog>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
