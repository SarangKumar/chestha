import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FIXED_SEQUENCES, SHORTCUT_ACTIONS, comboFromEvent, findConflicts, formatCombo,
  isCustomised, resetAllShortcuts, resetShortcut, resolveShortcuts, setShortcut,
  shortcutAction, validateCombo,
} from '@kalpvan/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { Badge, Button, Dialog, cx } from './ui.jsx';
import { IS_APPLE } from '../app/shortcuts.js';

export function ShortcutSettings({ Group }) {
  const { state, actions, notify } = useWorkspace();
  const overrides = state.settings.shortcuts ?? {};
  const resolved = useMemo(() => resolveShortcuts(overrides), [overrides]);
  const conflicts = useMemo(() => findConflicts(resolved), [resolved]);
  const [editing, setEditing] = useState(null);

  const save = (actionId, combo) => {
    const result = setShortcut(overrides, actionId, combo);
    if (!result.ok) return result;
    actions.setSetting('shortcuts', result.overrides);
    return result;
  };

  return (
    <>
      <Group title="Keyboard shortcuts">
        <p className="text-sm leading-relaxed text-ink-muted">
          Changes take effect immediately. Everything here is also reachable with the pointer, and
          shortcuts never fire while you are typing in a field.
        </p>

        {conflicts.length > 0 && (
          <div className="rounded-control border border-danger/35 bg-danger-soft px-3.5 py-2.5 text-sm text-ink">
            {conflicts.length} shortcut conflict{conflicts.length === 1 ? '' : 's'} in your stored settings.
          </div>
        )}

        <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
          {SHORTCUT_ACTIONS.map((action) => {
            const combo = resolved[action.id];
            const custom = isCustomised(overrides, action.id);
            return (
              <li key={action.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{action.name}</p>
                  <p className="mt-0.5 text-meta text-ink-faint">{action.description}</p>
                </div>

                {custom && <Badge tone="neutral">Customised</Badge>}

                <kbd className={cx(
                  'shrink-0 rounded-chip border px-2 py-1 font-mono text-[11px]',
                  combo ? 'border-line bg-inset text-ink' : 'border-dashed border-line text-ink-faint',
                )}>
                  {formatCombo(combo, IS_APPLE)}
                </kbd>

                {action.customizable ? (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" onClick={() => setEditing(action.id)}>Change</Button>
                    {custom && (
                      <Button
                        size="sm"
                        tone="quiet"
                        onClick={() => {
                          actions.setSetting('shortcuts', resetShortcut(overrides, action.id));
                          notify(`${action.name} reset to its default`);
                        }}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                ) : (
                  <Badge tone="neutral">Fixed</Badge>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-meta text-ink-faint">
            Reserved browser combinations such as {IS_APPLE ? '⌘W' : 'Ctrl+W'} cannot be reassigned.
          </p>
          <Button
            size="sm"
            onClick={() => {
              actions.setSetting('shortcuts', resetAllShortcuts());
              notify('All shortcuts reset to their defaults');
            }}
            disabled={Object.keys(overrides).length === 0}
          >
            Reset all to defaults
          </Button>
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-2 text-meta font-medium text-ink">Always available</p>
          <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
            {FIXED_SEQUENCES.map((item) => (
              <li key={item.keys} className="flex items-center justify-between gap-3 px-3.5 py-2">
                <span className="text-sm text-ink-muted">{item.description}</span>
                <kbd className="shrink-0 rounded-chip border border-line bg-inset px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
                  {item.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </div>
      </Group>

      <RecordDialog
        actionId={editing}
        onClose={() => setEditing(null)}
        onSave={save}
        resolved={resolved}
      />
    </>
  );
}

/** Captures the next combination the user presses, and reports why one is refused. */
function RecordDialog({ actionId, onClose, onSave, resolved }) {
  const [captured, setCaptured] = useState(null);
  const [error, setError] = useState(null);
  const action = actionId ? shortcutAction(actionId) : null;
  const surfaceRef = useRef(null);

  useEffect(() => {
    if (!actionId) return;
    setCaptured(null);
    setError(null);
  }, [actionId]);

  const onKeyDown = (event) => {
    // Escape must still close the dialog rather than be recorded.
    if (event.key === 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    const combo = comboFromEvent(event, IS_APPLE);
    if (!combo) return;
    const check = validateCombo(combo);
    if (!check.ok) { setCaptured(null); setError(check.error); return; }
    const clash = Object.entries(resolved).find(([id, value]) => id !== actionId && value === check.combo);
    if (clash) {
      setCaptured(null);
      setError(`${formatCombo(check.combo, IS_APPLE)} is already used by “${shortcutAction(clash[0]).name}”.`);
      return;
    }
    setCaptured(check.combo);
    setError(null);
  };

  if (!action) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      initialFocus={surfaceRef}
      title={`Change “${action.name}”`}
      description="Press the combination you want. Nothing is saved until you confirm."
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={!captured}
            onClick={() => {
              const result = onSave(actionId, captured);
              if (!result.ok) { setError(result.error); return; }
              onClose();
            }}
          >
            Save
          </Button>
        </>
      )}
    >
      <div
        ref={surfaceRef}
        tabIndex={0}
        role="textbox"
        aria-label="Press a key combination"
        onKeyDown={onKeyDown}
        className={cx(
          'flex h-20 w-full items-center justify-center rounded-control border-2 border-dashed text-center',
          error ? 'border-danger/50 bg-danger-soft' : 'border-line bg-inset',
        )}
      >
        <span className={cx('font-mono text-lg', captured ? 'text-ink' : 'text-ink-faint')}>
          {captured ? formatCombo(captured, IS_APPLE) : 'Press a combination…'}
        </span>
      </div>
      {error && <p className="mt-2.5 text-meta leading-relaxed text-danger">{error}</p>}
      <p className="mt-2.5 text-meta leading-relaxed text-ink-faint">
        Current: <span className="font-mono">{formatCombo(resolved[actionId], IS_APPLE)}</span>
        {action.default === null && ' — this action has no default.'}
      </p>
    </Dialog>
  );
}
