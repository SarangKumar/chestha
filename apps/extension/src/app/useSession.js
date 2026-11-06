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

  /**
   * Ask again when this page is looked at again.
   *
   * Signing out happens on the website, in another tab, and nothing there can
   * reach into this one — so without this the New Tab would keep naming an
   * account that is gone until the cached answer aged out. `resume()` only
   * forces a request when a change was expected (see `expectChange`), so an
   * ordinary tab switch still costs nothing.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') session.resume();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const recheck = useCallback(() => session.check({ force: true }), []);

  return {
    session: value,
    recheck,
    forget: session.forget,
    expectChange: session.expectChange,
  };
}
