import { useEffect, useRef } from 'react';
import { useWorkspace } from '../app/StoreProvider.jsx';

/**
 * The once-per-load housekeeping pass.
 *
 * Session recovery runs here rather than on the Grove page, which is where it used to
 * live and where it was wrong: a session left running by a closed tab was only settled
 * if you happened to open the Grove. Until then it stayed "active", which also kept
 * the tracker's `duringFocus` flag set — so website time was being suspended for a
 * session that had finished hours ago. Recovery belongs at the app, because the thing
 * it repairs affects the whole app.
 *
 * It runs once per load. Nothing here needs to be periodic: a ledger does not drift
 * while you watch it, and a session that is still running is still running.
 */
export function useGroveMaintenance() {
  const { status, actions, notify } = useWorkspace();
  const done = useRef(false);

  useEffect(() => {
    if (!status.ready || done.current) return;
    done.current = true;

    const recovered = actions.recoverFocusSession();
    if (recovered) {
      const away = recovered.session.outcome === 'abandoned';
      notify(
        away
          ? `A session left running was written off · +${recovered.earned.xp} XP for the time it earned`
          : `A session finished while you were away · +${recovered.earned.xp} XP`,
      );
    }

    actions.maintainLedger();
  }, [status.ready, actions, notify]);
}
