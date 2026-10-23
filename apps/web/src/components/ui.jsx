import { useEffect, useId, useRef } from 'react';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

const BUTTON_TONES = {
  // The one high-emphasis control: solid ink, inverted label.
  primary: 'bg-accent text-on-accent border-transparent hover:opacity-90',
  default: 'bg-raised text-ink border-line hover:bg-hover',
  quiet: 'bg-transparent text-ink-muted border-transparent hover:bg-hover hover:text-ink',
  danger: 'bg-transparent text-danger border-line hover:bg-danger-soft',
};

export function Button({ tone = 'default', size = 'md', className, as: As = 'button', ...props }) {
  const sizes = {
    sm: 'h-7 px-2.5 text-xs gap-1.5',
    md: 'h-9 px-3.5 text-sm gap-2',
    lg: 'h-10 px-4 text-sm gap-2',
  };
  return (
    <As
      className={cx(
        'inline-flex items-center justify-center rounded-control border font-medium',
        'transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none',
        sizes[size], BUTTON_TONES[tone], className,
      )}
      {...props}
    />
  );
}

/** Icon-only controls keep a 32px hit area and always carry an accessible name. */
export function IconButton({ label, className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted',
        'transition-colors duration-150 hover:bg-hover hover:text-ink',
        className,
      )}
      {...props}
    />
  );
}

/**
 * The elevation ladder in component form. `flat` sits on the page, `raised` is
 * the standard floating card, `inset` is a well for inputs and nested content.
 */
export function Panel({ level = 'raised', className, children, ...props }) {
  const levels = {
    raised: 'bg-surface border-line shadow-card',
    floating: 'bg-raised border-line shadow-raised',
    inset: 'bg-inset border-line',
    flat: 'bg-transparent border-transparent',
  };
  return (
    <div className={cx('rounded-card border', levels[level], className)} {...props}>
      {children}
    </div>
  );
}

/** Card titles are sentence case and recessive — the content is the emphasis. */
export function CardTitle({ children, className, as: As = 'h3' }) {
  return (
    <As className={cx('text-meta font-medium text-ink-muted', className)}>{children}</As>
  );
}

export function SectionHeader({ title, description, children }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-page font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Field({ label, hint, children, id: providedId }) {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-meta font-medium text-ink">{label}</label>
      {typeof children === 'function' ? children(id) : children}
      {hint && <p className="text-meta leading-relaxed text-ink-faint">{hint}</p>}
    </div>
  );
}

const CONTROL = cx(
  'w-full rounded-control border border-line bg-inset px-3 text-sm text-ink',
  'placeholder:text-ink-faint transition-colors duration-150',
  'hover:border-line-strong focus:border-line-strong',
);

export function TextInput({ className, ...props }) {
  return <input className={cx(CONTROL, 'h-9 py-0', className)} {...props} />;
}

export function TextArea({ className, ...props }) {
  return <textarea className={cx(CONTROL, 'resize-y py-2 leading-relaxed', className)} {...props} />;
}

/**
 * `size="sm"` is the compact variant used inside widget config panels. It is a
 * variant rather than per-site overrides so every select keeps the same border,
 * surface, radius and hover behaviour.
 */
export function Select({ size = 'md', className, children, ...props }) {
  const sizes = {
    md: 'h-9 pr-8 select-chevron',
    sm: 'h-7 px-2 pr-6 text-xs select-chevron select-chevron-sm',
  };
  return (
    <select
      className={cx(CONTROL, 'cursor-pointer appearance-none py-0', sizes[size], className)}
      {...props}
    >
      {children}
    </select>
  );
}

/** Status never rests on colour alone — every toned badge carries its own text. */
export function Badge({ tone = 'neutral', className, children }) {
  const tones = {
    neutral: 'bg-inset text-ink-muted border-line',
    solid: 'bg-accent-soft text-ink border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
    warn: 'bg-warn-soft text-warn border-transparent',
    ok: 'bg-ok-soft text-ok border-transparent',
  };
  return (
    <span className={cx(
      'inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5 text-[11px] font-medium leading-tight',
      tones[tone], className,
    )}>
      {children}
    </span>
  );
}

/**
 * A stat tile, not a chart: a single magnitude reads better as a number.
 * The optional meter is a thin bar with a rounded data-end anchored to the
 * track's start, and it is always accompanied by the number it depicts.
 */
export function Stat({ value, label, tone = 'default', meter, className }) {
  const tones = { default: 'text-ink', danger: 'text-danger', ok: 'text-ok', muted: 'text-ink-muted' };
  return (
    <div className={cx('min-w-0', className)}>
      <p className="flex items-baseline gap-1.5">
        <span className={cx('tabular text-stat font-semibold', tones[tone])}>{value}</span>
        {label && <span className="truncate text-meta text-ink-muted">{label}</span>}
      </p>
      {meter && <Meter {...meter} className="mt-2" />}
    </div>
  );
}

export function Meter({ value, max, label, tone = 'default', className }) {
  const safeMax = Math.max(1, max ?? 1);
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const tones = { default: 'bg-accent', danger: 'bg-danger', ok: 'bg-ok' };
  return (
    <div
      className={cx('h-1 w-full overflow-hidden rounded-full bg-inset', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-300', tones[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({ title, description, action, className }) {
  return (
    <div className={cx(
      'flex flex-col items-center justify-center rounded-card border border-dashed border-line px-6 py-10 text-center',
      className,
    )}>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-xs text-meta leading-relaxed text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * A panel that slides in from the right. Used for editing a widget, where the
 * controls need more room than the widget itself has — a 176px tile cannot hold
 * a configuration form.
 */
export function Drawer({ open, onClose, title, description, children, footer }) {
  const panelRef = useRef(null);
  const returnTo = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    returnTo.current = document.activeElement;
    const panel = panelRef.current;
    (panel?.querySelector(FOCUSABLE) ?? panel)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const node = returnTo.current;
      if (node instanceof HTMLElement && document.contains(node)) node.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-line bg-overlay shadow-overlay"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-card font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-meta leading-relaxed text-ink-muted">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <span aria-hidden="true" className="text-base leading-none">×</span>
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Focus enters the dialog, is trapped inside it, and returns to where it came
 * from on close. Escape always closes.
 */
/**
 * @param maxHeight caps the panel and makes only the body scroll, keeping the
 *   title and footer in place. Without it the whole panel grows and the page
 *   scrolls instead — fine for a short form, wrong for a long list where the
 *   action buttons would scroll out of reach.
 */
export function Dialog({
  open, onClose, title, description, children, footer, size = 'md', initialFocus, maxHeight,
}) {
  const panelRef = useRef(null);
  const returnTo = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;
    returnTo.current = document.activeElement;
    const panel = panelRef.current;
    const target = initialFocus?.current ?? panel?.querySelector(FOCUSABLE) ?? panel;
    target?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      const node = returnTo.current;
      if (node instanceof HTMLElement && document.contains(node)) node.focus();
    };
  }, [open, onClose, initialFocus]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh] sm:p-6 sm:pt-[12vh]">
      <div className="fixed inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={maxHeight ? { maxHeight } : undefined}
        className={cx(
          'relative flex w-full flex-col overflow-hidden rounded-panel border border-line bg-overlay shadow-overlay',
          widths[size],
        )}
      >
        <div className="shrink-0 px-5 pb-4 pt-5">
          <h2 id={titleId} className="text-card font-semibold text-ink">{title}</h2>
          {description && (
            <p id={descId} className="mt-1.5 text-meta leading-relaxed text-ink-muted">{description}</p>
          )}
        </div>
        {/* pt-1 gives the focus ring room: setting overflow-y also makes
            overflow-x computed, so a ring drawn 2px outside the first child
            would otherwise be clipped on every side. */}
        <div className={cx('px-5 pb-5', maxHeight ? 'min-h-0 flex-1 overflow-y-auto pt-1 scrollbar-thin' : '')}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
