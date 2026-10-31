import { useState } from 'react';
import { shadowedRules } from '@chestha/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { trackingAvailable } from '../grove/trackerBridge.js';
import { Button, Dialog, IconButton, Panel, TextInput, cx } from './ui.jsx';
import { Icon } from './icons.jsx';

/**
 * Which sites count, and what they are worth.
 *
 * There is no bundled list of "productive" websites and no judgement baked in. A rule
 * is a domain the user chose. What the extension can know is which site a tab is on —
 * not what is on the page — so "YouTube for learning" is a decision only its owner can
 * make, and the copy here says so rather than implying a smarter signal.
 */
export function WebsiteRules() {
  const { state, actions, notify } = useWorkspace();
  const settings = state['grove.settings'];
  const [draft, setDraft] = useState({ domain: '', label: '' });
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);
  const available = trackingAvailable();
  const shadowed = shadowedRules(settings.rules);

  const add = (event) => {
    event.preventDefault();
    const result = actions.addWebsiteRule(draft);
    if (!result.ok) { setError(result.reason); return; }
    setDraft({ domain: '', label: '' });
    setError('');
    notify(`Now tracking ${result.rule.domain}`);
  };

  if (!available) {
    return (
      <Panel className="p-4">
        <p className="text-sm text-ink-muted">
          Website time needs the Chrome extension — the browser will not tell a web page
          which other tabs are open, and nor should it. Everything else in the Grove works
          here: tasks and focus sessions earn XP exactly the same.
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-current"
          checked={settings.trackingEnabled}
          onChange={(event) => actions.setGroveSetting('trackingEnabled', event.target.checked)}
        />
        <span>
          <span className="block text-sm text-ink">Count time on the sites I list</span>
          <span className="block text-meta text-ink-faint">
            Off until you turn it on. Nothing is observed before that.
          </span>
        </span>
      </label>

      {settings.trackingEnabled && (
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-4 accent-current"
            checked={settings.trackingPaused}
            onChange={(event) => actions.setGroveSetting('trackingPaused', event.target.checked)}
          />
          <span className="text-sm text-ink">Pause for now</span>
        </label>
      )}

      {/*
        * One horizontal row of three columns: Name, Website, Add. Each field
        * stacks label → input → hint so hints never shove the button onto a
        * new line. Plain flex (not an arbitrary grid-template) so Tailwind
        * cannot drop the columns.
        */}
      <form onSubmit={add} className="flex w-full min-w-0 flex-row items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="website-rule-name" className="text-meta font-medium text-ink">Name</label>
          <TextInput
            id="website-rule-name"
            value={draft.label}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            placeholder="Practice"
          />
          <p className="text-meta leading-relaxed text-ink-faint">Optional</p>
        </div>
        <div className="flex min-w-0 flex-[1.35] flex-col gap-1.5">
          <label htmlFor="website-rule-domain" className="text-meta font-medium text-ink">Website</label>
          <TextInput
            id="website-rule-domain"
            value={draft.domain}
            onChange={(event) => { setDraft({ ...draft, domain: event.target.value }); setError(''); }}
            placeholder="leetcode.com"
            aria-invalid={error ? 'true' : undefined}
          />
          <p className="text-meta leading-relaxed text-ink-faint">Just the site, like leetcode.com</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="invisible select-none text-meta font-medium" aria-hidden="true">Add</span>
          <Button type="submit" className="h-9">
            <Icon name="plus" className="size-4" /> Add
          </Button>
        </div>
      </form>
      {error && <p className="text-meta text-danger">{error}</p>}

      {settings.rules.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
          {settings.rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-sm text-ink', !rule.enabled && 'text-ink-faint line-through')}>
                  {rule.label}
                </span>
                <span className="block truncate text-meta text-ink-faint">
                  {rule.domain}{rule.includeSubdomains ? ' and its subdomains' : ''}
                  {!rule.productive && ' · tracked, earns nothing'}
                </span>
              </span>

              <label className="flex items-center gap-1.5 text-meta text-ink-muted">
                <input
                  type="checkbox"
                  className="size-3.5 accent-current"
                  checked={rule.includeSubdomains}
                  onChange={(event) => actions.updateWebsiteRule(rule.id, { includeSubdomains: event.target.checked })}
                />
                Subdomains
              </label>
              <label className="flex items-center gap-1.5 text-meta text-ink-muted">
                <input
                  type="checkbox"
                  className="size-3.5 accent-current"
                  checked={rule.productive}
                  onChange={(event) => actions.updateWebsiteRule(rule.id, { productive: event.target.checked })}
                />
                Earns XP
              </label>
              <label className="flex items-center gap-1.5 text-meta text-ink-muted">
                <input
                  type="checkbox"
                  className="size-3.5 accent-current"
                  checked={rule.enabled}
                  onChange={(event) => actions.updateWebsiteRule(rule.id, { enabled: event.target.checked })}
                />
                On
              </label>
              <IconButton
                label={`Remove ${rule.label}`}
                onClick={() => {
                  actions.removeWebsiteRule(rule.id);
                  notify(`Removed ${rule.domain}. The time it recorded is kept.`);
                }}
              >
                <Icon name="stop" className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {shadowed.map(({ rule, by }) => (
        <p key={rule.id} className="text-meta text-warn">
          “{rule.label}” can never match: “{by.label}” covers {rule.domain} and is more specific.
        </p>
      ))}

      <Panel level="inset" className="flex flex-col gap-2 p-3">
        <p className="text-meta text-ink-faint">
          Time counts only while a tracked site is the tab you are looking at, in the
          window in front, and you are at the keyboard. It stops after {settings.idleSeconds}s
          idle and when the screen locks. Each site can earn up to {settings.thresholds.at(-1)?.minutes ?? 60} minutes
          a day, and {settings.dailyWebsiteCapXp} XP a day across all of them.
        </p>
        <p className="text-meta text-ink-faint">
          What is stored: the site’s domain, the day, and a number of seconds — only for
          sites on this list. Never a page address, a title, or anything about what is on
          the page. The extension asks for no permission to read any website, and nothing
          here leaves your device. Timings are approximate, not second-accurate.
        </p>
        <div>
          <Button size="sm" tone="danger" onClick={() => setClearing(true)}>Delete website-time data</Button>
        </div>
      </Panel>

      <Dialog
        open={clearing}
        onClose={() => setClearing(false)}
        title="Delete recorded website time?"
        description="Every second recorded for every site goes, along with anything not yet counted. Your rules, XP, tasks and the Grove are not touched."
        footer={(
          <>
            <Button tone="quiet" onClick={() => setClearing(false)}>Keep it</Button>
            <Button
              tone="danger"
              onClick={() => {
                actions.clearWebsiteTime();
                setClearing(false);
                notify('Website-time data deleted.', { tone: 'danger' });
              }}
            >
              Delete it
            </Button>
          </>
        )}
      />
    </div>
  );
}
