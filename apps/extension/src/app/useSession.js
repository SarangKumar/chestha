import { useCallback, useEffect, useSyncExternalStore } from 'react';
import * as session from './session.js';

/**
 * The session, as React sees it.
 *
 * `useSyncExternalStore` over the module singleton rather than a context
 * provider: the session is not owned by any part of the tree, several unrelated
 * surfaces read it (the section router, the nav rail, the account menu), and
 * this way there is no provider to forget to wrap something in.
 *
 * `start()` is called from here rather than from `App`, guarded by the
 * singleton's own `inFlight`/freshness checks, so mounting several readers still
 * makes at most one request.
 */
export function useSession() {
  const value = useSyncExternalStore(session.subscribe, session.read, session.read);

  useEffect(() => {
    session.start();
  }, []);

  const recheck = useCallback(() => session.check({ force: true }), []);

  return { session: value, recheck, forget: session.forget };
}
