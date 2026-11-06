import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { cx } from './ui.jsx';

/**
 * Lightweight combobox (button + listbox) — no extra deps. Matches the
 * Vinyaas-style version picker: bordered trigger, chevron, selected check.
 *
 * **It filters itself once the list is long.** The DSA library offers 422
 * companies and a few hundred topics; a listbox that can only be scrolled is
 * a list you have to hunt through, and a native `<select>` is worse. Above
 * `SEARCH_FROM` options a filter field appears at the top of the popup and
 * takes the focus, so picking "Amazon" is three keystrokes. Short pickers —
 * the Changelog's version list — are unchanged: a search box over six items
 * is furniture.
 *
 * @param {{ value: string, onChange: (v: string) => void, options: { value: string, label: string }[], id?: string, className?: string, block?: boolean, searchable?: boolean, searchPlaceholder?: string, 'aria-label'?: string }} props
 */
const SEARCH_FROM = 8;

export function Combobox({
  value,
  onChange,
  options,
  id,
  className,
  block = false,
  searchable,
  searchPlaceholder = 'Type to filter…',
  'aria-label': ariaLabel = 'Choose option',
}) {
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));

  const withSearch = searchable ?? options.length > SEARCH_FROM;
  // Typing filters 422 companies on every keystroke; deferring keeps the field
  // responsive while the list catches up — the same trade the Companies tab
  // makes over the same data.
  const deferredTerm = useDeferredValue(term);
  const shown = useMemo(() => {
    const needle = deferredTerm.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, deferredTerm]);

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
    if (!open) { setTerm(''); return; }
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    searchRef.current?.focus();
  }, [open, options, value]);

  // The highlight indexes the *filtered* list, so it has to come back in range
  // as the term narrows — otherwise Enter picks nothing, or the wrong row.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, shown.length - 1)));
  }, [shown.length]);

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
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = shown[active];
      if (opt) pick(opt.value);
    } else if (e.key === ' ' && !withSearch) {
      // Space picks in a plain listbox and types in a searchable one.
      e.preventDefault();
      const opt = shown[active];
      if (opt) pick(opt.value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(shown.length - 1);
    }
  };

  return (
    <div ref={rootRef} className={cx('relative', block ? 'flex' : 'inline-flex', className)}>
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
          block && 'w-full min-w-0',
          'bg-surface px-3 text-sm font-medium text-ink shadow-none',
          'transition-colors duration-150 hover:border-line-strong hover:bg-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <Icon name="chevronDown" className="size-3.5 shrink-0 text-ink-faint" />
      </button>

      {open ? (
        <div
          onKeyDown={onListKey}
          className={cx(
            'absolute right-0 top-[calc(100%+0.35rem)] z-40 min-w-full overflow-hidden rounded-lg border border-line',
            'bg-overlay shadow-raised',
            block && 'left-0',
          )}
        >
          {withSearch ? (
            <div className="border-b border-line p-1.5">
              <input
                ref={searchRef}
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={`${ariaLabel} — filter`}
                className={cx(
                  'h-8 w-full rounded-control border border-line bg-inset px-2.5 text-sm text-ink',
                  'placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              />
            </div>
          ) : null}

          {shown.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-ink-muted">Nothing matches that.</p>
          ) : (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          className="max-h-64 overflow-y-auto py-1 scrollbar-thin"
        >
          {shown.map((opt, index) => {
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
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                {isSelected ? <Icon name="check" className="size-3.5 shrink-0 text-ink" /> : <span className="size-3.5 shrink-0" />}
              </li>
            );
          })}
        </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
