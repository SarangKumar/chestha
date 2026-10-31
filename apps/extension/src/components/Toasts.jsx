import { useWorkspace } from '../app/StoreProvider.jsx';
import { cx } from './ui.jsx';

export function Toasts() {
  const { toasts, dismissToast } = useWorkspace();
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 p-4 sm:items-start sm:pl-20"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-card border px-3.5 py-2.5',
            'border-line bg-overlay shadow-overlay',
          )}
        >
          <p className={cx('min-w-0 flex-1 truncate text-sm', toast.tone === 'danger' ? 'text-ink' : 'text-ink')}>
            {toast.message}
          </p>
          {toast.actionLabel && (
            <button
              type="button"
              onClick={() => { toast.onAction?.(); dismissToast(toast.id); }}
              className="shrink-0 rounded-chip px-2 py-1 text-xs font-semibold text-ink hover:bg-hover"
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded-chip px-1 text-ink-faint hover:text-ink"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
