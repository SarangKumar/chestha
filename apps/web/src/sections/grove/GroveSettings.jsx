import { useState } from 'react';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Button, Dialog, Field, Panel, Select, cx } from '../../components/ui.jsx';

/** Game preferences only. What counts as productive lives in the app's Settings. */
export function GroveSettings() {
  const { state, actions, notify } = useWorkspace();
  const settings = state['grove.settings'];
  const [resetting, setResetting] = useState(false);

  const setFocus = (patch) => actions.setGroveSetting('focus', { ...settings.focus, ...patch });

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-4 p-4">
        <h2 className="text-card font-medium text-ink">Sessions</h2>

        <Field label="Default length" hint="What the Start button offers before you change it.">
          <Select
            value={settings.focus.defaultMinutes}
            onChange={(event) => setFocus({ defaultMinutes: Number(event.target.value) })}
          >
            {settings.focus.options.map((option) => (
              <option key={option} value={option}>{option} minutes</option>
            ))}
          </Select>
        </Field>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-current"
            checked={settings.focus.suspendWebsiteXp}
            onChange={(event) => setFocus({ suspendWebsiteXp: event.target.checked })}
          />
          <span>
            <span className="block text-sm text-ink">A session covers the time it runs for</span>
            <span className="block text-meta text-ink-faint">
              While a session is running, time on your tracked sites is still recorded but
              earns nothing — the session is how that hour is paid for. Turn this off to be
              paid for both.
            </span>
          </span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-4 accent-current"
            checked={settings.chimeOnComplete}
            onChange={(event) => actions.setGroveSetting('chimeOnComplete', event.target.checked)}
          />
          <span className="text-sm text-ink">Play a quiet sound when a session finishes</span>
        </label>
      </Panel>

      <Panel className="p-4">
        <h2 className="text-card font-medium text-ink">Start again</h2>
        <p className="mt-1 mb-3 text-sm text-ink-muted">
          Clears XP, seeds, sessions, plants and unlocks. Your tasks, notes, calendar and
          DSA progress are stored separately and are not touched.
        </p>
        <Button tone="danger" onClick={() => setResetting(true)}>Reset Grove progress</Button>
      </Panel>

      <Dialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="Reset the Grove?"
        description="Every plant, unlock and XP record goes. Nothing outside the Grove is affected, and this cannot be undone."
        footer={(
          <>
            <Button tone="quiet" onClick={() => setResetting(false)}>Keep it</Button>
            <Button
              tone="danger"
              onClick={() => {
                actions.resetGrove();
                setResetting(false);
                notify('The Grove has been reset.', { tone: 'danger' });
              }}
            >
              Reset the Grove
            </Button>
          </>
        )}
      />
    </div>
  );
}
