import { useCallback, useEffect, useSyncExternalStore } from 'react';
import * as profile from './profile.js';

/**
 * The signed-in person's card. Mirrors `useSession` exactly, including reading
 * the same value on the server snapshot — there is no server render here, but
 * the hook is cheaper to reason about when both arguments agree.
 */
export function useProfile() {
  const value = useSyncExternalStore(profile.subscribe, profile.read, profile.read);

  useEffect(() => {
    profile.start();
  }, []);

  const refresh = useCallback(() => profile.check({ force: true }), []);

  return { profile: value.profile, state: value.state, refresh };
}
