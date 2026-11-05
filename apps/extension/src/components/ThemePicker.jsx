import { useEffect, useId, useRef, useState } from 'react';
import { THEME_CHOICES, themeIcon } from '@chestha/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { Icon } from './icons.jsx';
import { IconButton, cx } from './ui.jsx';

/**
 * The theme control in the header: one icon that opens a three-choice menu.
 *
 * A menu rather than the toggle this replaced, because there are three choices
 * and a toggle can only express two. The old button cycled light↔dark, which
 * meant `system` — the default — could be left but never returned to without
 * going to Settings. Someone who had never touched the setting lost it the
 * first time they clicked.
 *
 * The icon shows the *choice*, not the resolved theme: on `system` it is a
 * screen, whichever way the OS currently resolves. Showing a sun there would
 * claim a decision nobody made, and would make the two states that differ most
 * — "light" and "system, currently light" — look the same.
 *
 * It stays a plain absolutely-positioned popover rather than a portal, which is
 * what `ProfileMenu` needs: that lives inside the rail's `overflow-y-auto`
 * scroll container and gets clipped, whereas the header clips nothing.
 */
export function ThemePicker({ className }) {
  const { state, actions } = useWorkspace();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const menuId = useId();

  const theme = state.settings.theme;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      // Focus goes back to the trigger: dismissing a menu should not drop the
      // caret at the top of the document.
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (id) => {
    actions.setSetting('theme', id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <IconButton
        ref={triggerRef}
        label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={open ? 'bg-hover text-ink' : undefined}
      >
        <Icon name={themeIcon(theme)} className="size-4" />
      </IconButton>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="absolute top-full right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-card border border-line bg-overlay p-1 shadow-overlay"
        >
          {THEME_CHOICES.map((choice) => {
            const active = choice.id === theme;
            return (
              <button
                key={choice.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(choice.id)}
                title={choice.hint}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-chip px-2.5 py-2 text-left text-card transition-colors duration-150',
                  active ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink',
                )}
              >
                <Icon name={choice.icon} className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                {/* A tick on the chosen row, so the state does not rest on
                    background colour alone. */}
                {active && <Icon name="check" className="size-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
