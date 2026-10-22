import { useEffect, useRef } from 'react';
import { comboFromEvent, resolveShortcuts } from '@vistaar/core';
import { IS_APPLE } from './shortcuts.js';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || TYPING_TAGS.has(target.tagName);
}

/** A combo with no modifier must not fire while the user is typing. */
function hasModifier(combo) {
  return combo.includes('Mod+') || combo.includes('Ctrl+') || combo.includes('Alt+');
}

/**
 * The application's only global key listener. Everything is driven by the
 * resolved shortcut map, so there is exactly one place where a key becomes an
 * action, and no component installs its own handler.
 */
export function useShortcutDispatch({ enabled, overrides, handlers, blocked }) {
  const latest = useRef({ handlers, blocked, overrides });
  latest.current = { handlers, blocked, overrides };

  useEffect(() => {
    if (!enabled) return undefined;
    let awaitingGo = false;
    let goTimer;

    const onKeyDown = (event) => {
      const { handlers: current, blocked: isBlocked, overrides: currentOverrides } = latest.current;
      const resolved = resolveShortcuts(currentOverrides);
      const combo = comboFromEvent(event, IS_APPLE);
      if (!combo) return;

      const typing = isTypingTarget(event.target);

      // The palette must open even from inside a field, so modifier combos are
      // dispatched before the typing and blocked checks.
      for (const [actionId, assigned] of Object.entries(resolved)) {
        if (!assigned || assigned !== combo) continue;
        if (!hasModifier(assigned) && typing) continue;
        if (isBlocked && !hasModifier(assigned)) continue;
        const handler = current[actionId];
        if (!handler) continue;
        event.preventDefault();
        handler();
        return;
      }

      if (isBlocked || typing || event.metaKey || event.ctrlKey || event.altKey) return;

      // Fixed G-then-X sequences, which are documented but not customisable.
      const key = event.key.toLowerCase();
      if (awaitingGo) {
        const destination = { d: 'dashboard', t: 'tasks', c: 'calendar', a: 'dsa', o: 'sounds', s: 'settings' }[key];
        awaitingGo = false;
        clearTimeout(goTimer);
        if (destination && current.navigate) {
          event.preventDefault();
          current.navigate(destination);
        }
        return;
      }
      if (key === 'g') {
        awaitingGo = true;
        goTimer = setTimeout(() => { awaitingGo = false; }, 1500);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(goTimer);
    };
  }, [enabled]);
}
