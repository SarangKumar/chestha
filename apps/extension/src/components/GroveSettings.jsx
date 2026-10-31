import { useState } from 'react';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { Button, Dialog, Field, Select, Toggle } from './ui.jsx';

/**
 * Grove preferences, shown in the app's Settings beside every other preference
 * rather than inside the Grove itself.
 *
 * It sits below the data group on purpose: resetting the Grove belongs next to the
 * other irreversible actions, where a person already reads carefully.
 *
 * What counts as a productive website is a separate group higher up — that is a
 * privacy decision, not a game preference.
 */
export function GroveSettings({ showDanger = true } = {}) {
  const { state, actions, notify } = useWorkspace();
  const settings = state['grove.settings'];
  const [resetting, setResetting] = useState(false);

  const setFocus = (patch) => actions.setGroveSetting('focus', { ...settings.focus, ...patch });

  return (
    <>
      <Field label="Default session length" hint="What the Start button offers before you change it.">
        <Select
          value={settings.focus.defaultMinutes}
          onChange={(event) => setFocus({ defaultMinutes: Number(event.target.value) })}
        >
          {settings.focus.options.map((option) => (
            <option key={option} value={option}>{option} minutes</option>
          ))}
        </Select>
      </Field>

      <Field
        label="Ambient sound"
        hint={state.sound.presets.length === 0
          ? 'Save a mix on the Sounds page and it will be offered here.'
          : 'Started when a session starts. If something is already playing, the session leaves it alone.'}
      >
        <Select
          value={settings.soundMixId ?? ''}
          onChange={(event) => actions.setGroveSetting('soundMixId', event.target.value || null)}
          disabled={state.sound.presets.length === 0}
        >
          <option value="">None</option>
          {state.sound.presets.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </Select>
      </Field>

      <Toggle
        label="Play a quiet sound when a session finishes"
        checked={settings.chimeOnComplete}
        onChange={(value) => actions.setGroveSetting('chimeOnComplete', value)}
      />

      <Toggle
        label="A session covers the time it runs for"
        hint="While a session is running, time on your tracked sites is still recorded but earns nothing — the session is how that hour is paid for. Turn this off to be paid for both."
        checked={settings.focus.suspendWebsiteXp}
        onChange={(value) => setFocus({ suspendWebsiteXp: value })}
      />

      {showDanger && (
        <>
          <Field
            label="Start the Grove again"
            hint="Clears XP, seeds, sessions, plants and unlocks. Tasks, notes, the calendar and DSA progress are stored separately and are not touched. Prefer the Danger zone in Settings."
          >
            {() => (
              <div>
                <Button tone="danger" onClick={() => setResetting(true)}>Reset Grove progress</Button>
              </div>
            )}
          </Field>

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
        </>
      )}
    </>
  );
}
