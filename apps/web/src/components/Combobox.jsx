import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { cx } from './ui.jsx';

/**
 * Lightweight combobox (button + listbox) — no extra deps. Matches the
 * Vinyaas-style version picker: bordered trigger, chevron, selected check.
 *
 * @param {{ value: string, onChange: (v: string) => void, options: { value: string, label: string }[], id?: string, className?: string, 'aria-label'?: string }} props
 */
export function Combobox({
  value,
  onChange,
  options,
  id,
  className,
  'aria-label': ariaLabel = 'Choose option',
}) {
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    }
  }, [open, options, value]);

  const pick = (next) => {
    onChange?.(next);
    setOpen(false);
  };

  const onTriggerKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = options[active];
      if (opt) pick(opt.value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(options.length - 1);
    }
  };

  return (
    <div ref={rootRef} className={cx('relative inline-flex', className)}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${listId}-opt-${active}` : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        className={cx(
          'inline-flex h-9 min-w-[7.5rem] items-center justify-between gap-2 rounded-lg border border-line',
          'bg-surface px-3 text-sm font-medium text-ink shadow-none',
          'transition-colors duration-150 hover:border-line-strong hover:bg-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span>{selected?.label ?? value}</span>
        <Icon name="chevronDown" className="size-3.5 shrink-0 text-ink-faint" />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          onKeyDown={onListKey}
          className={cx(
            'absolute right-0 top-[calc(100%+0.35rem)] z-40 min-w-full overflow-hidden rounded-lg border border-line',
            'bg-overlay py-1 shadow-raised',
          )}
        >
          {options.map((opt, index) => {
            const isSelected = opt.value === value;
            const isActive = index === active;
            return (
              <li
                key={opt.value}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                className={cx(
                  'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm',
                  isActive ? 'bg-hover text-ink' : 'text-ink-muted',
                  isSelected && 'font-medium text-ink',
                )}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(opt.value);
                }}
              >
                <span>{opt.label}</span>
                {isSelected ? <Icon name="check" className="size-3.5 text-ink" /> : <span className="size-3.5" />}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
