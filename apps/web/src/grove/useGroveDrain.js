import { useEffect } from 'react';
import { applySegments, appendRewards } from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { KEY_INBOX, KEY_PAUSED, KEY_RULES, trackingAvailable } from './trackerBridge.js';

/**
 * Draining what the service worker observed.
 *
 * The page is the only writer of record, so this is where observed seconds become
 * credited time. The order matters and is the whole crash-safety story: the time
 * record (including the segment ids it accepted) and the rewards are written first,
 * and only then are those ids removed from the worker's inbox. A failure in between
 * leaves the segments undrained, and the next drain rejects them by id. Paying twice
 * is impossible; the inbox growing is the only failure mode, and it self-heals.
 *
 * Only one tab drains at a time. `navigator.locks` is the narrowest possible answer
 * to the repo's unresolved multi-tab question — it covers this one operation and
 * pre-decides nothing about the store as a whole.
 */
const DRAIN_EVERY_MS = 60_000;

async function withLock(name, work) {
  if (!navigator.locks?.request) return work();
  return navigator.locks.request(name, { ifAvailable: true }, (lock) => (lock ? work() : undefined));
}

export function useGroveDrain() {
  const { store, state, status } = useWorkspace();
  const settings = state['grove.settings'];
  const focusActive = Boolean(state['grove.focus'].active);

  // The worker needs to know which hosts are worth opening a segment for, and
  // whether a focus session is covering the time. IndexedDB stays authoritative;
  // this is a cache it can read while no page is open.
  useEffect(() => {
    if (!trackingAvailable() || !status.ready) return;
    chrome.storage.local.set({
      [KEY_RULES]: settings.rules.map(({ domain, includeSubdomains, enabled }) => ({ domain, includeSubdomains, enabled })),
      [KEY_PAUSED]: {
        tracking: settings.trackingEnabled && !settings.trackingPaused,
        focus: focusActive && settings.focus.suspendWebsiteXp,
      },
    });
  }, [settings.rules, settings.trackingEnabled, settings.trackingPaused, settings.focus.suspendWebsiteXp, focusActive, status.ready]);

  useEffect(() => {
    if (!trackingAvailable() || !status.ready) return undefined;

    let cancelled = false;
    const drain = () => withLock('grove.drain', async () => {
      const inbox = (await chrome.storage.local.get(KEY_INBOX))[KEY_INBOX] ?? [];
      if (cancelled || inbox.length === 0) return;

      const current = store.getState();
      const result = applySegments(current['grove.settings'], current['grove.time'], inbox);
      if (result.accepted.length === 0) return;

      store.update('grove.time', () => result.time);
      if (result.rewards.length > 0) {
        store.update('grove.ledger', (ledger) => appendRewards(ledger, result.rewards).ledger);
      }

      const accepted = new Set(result.accepted);
      const remaining = inbox.filter((segment) => !accepted.has(segment.id));
      await chrome.storage.local.set({ [KEY_INBOX]: remaining });
    }).catch(() => { /* a failed drain is retried on the next tick, not surfaced */ });

    drain();
    const timer = setInterval(drain, DRAIN_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') drain(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', drain);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', drain);
    };
  }, [store, status.ready]);
}

