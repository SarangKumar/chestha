import { useWorkspace } from '../app/StoreProvider.jsx';
import { Button, cx } from './ui.jsx';
import { Icon } from './icons.jsx';

function Notice({ tone = 'neutral', children, onDismiss, dismissLabel = 'Dismiss' }) {
  const tones = {
    neutral: 'border-line bg-surface text-ink shadow-card',
    warn: 'border-line bg-warn-soft text-ink',
    danger: 'border-danger/35 bg-danger-soft text-ink',
  };
  return (
    <div className={cx('flex items-start gap-3 rounded-card border px-4 py-3.5 text-sm', tones[tone])}>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {onDismiss && (
        <Button size="sm" tone="quiet" onClick={onDismiss} className="shrink-0">{dismissLabel}</Button>
      )}
    </div>
  );
}

/**
 * Honest status, in this order of severity: not saving at all, a failed write,
 * data that had to be repaired, then the first-run explanation.
 */
export function Notices({ onNavigate }) {
  const { status, state, actions, store } = useWorkspace();

  const hasAnything = (status.ready && status.mode === 'memory')
    || Boolean(status.writeError)
    || status.issues.length > 0
    || (status.ready && status.mode === 'idb' && !state.settings.firstRunNoticeDismissed);
  if (!hasAnything) return null;

  return (
    <div className="space-y-2">
      {status.ready && status.mode === 'memory' && (
        <Notice tone="danger">
          <strong className="font-semibold">Changes in this window will not be saved.</strong>{' '}
          {status.storageReason ?? 'This browser is not allowing site storage.'}{' '}
          You can still work, and you can still export before you close the tab.
        </Notice>
      )}

      {status.writeError && (
        <Notice tone="danger">
          <strong className="font-semibold">A change could not be saved.</strong> {status.writeError}
        </Notice>
      )}

      {status.issues.length > 0 && (
        <Notice tone="warn" onDismiss={store.dismissIssues}>
          <strong className="font-semibold">Some stored data had to be repaired.</strong>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
            {status.issues.map((issue, index) => <li key={index}>{issue}</li>)}
          </ul>
        </Notice>
      )}

      {status.ready && status.mode === 'idb' && !state.settings.firstRunNoticeDismissed && (
        <Notice onDismiss={() => actions.setSetting('firstRunNoticeDismissed', true)} dismissLabel="Got it">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Icon name="alert" className="size-4" /> Your data is stored in this browser only.
          </span>{' '}
          There is no account and nothing is uploaded. Clearing site data, or a browser that evicts storage,
          will remove it — so{' '}
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="font-semibold text-accent-ink underline decoration-dotted underline-offset-2"
          >
            export a copy
          </button>{' '}
          when you have something worth keeping.
        </Notice>
      )}
    </div>
  );
}

/** One dismissible nudge, once there is real data and no export has happened. */
export function ExportReminder({ onNavigate }) {
  const { state, actions } = useWorkspace();
  const { settings, tasks } = state;
  const earned = tasks.length >= 12 && !settings.lastExportAt && !settings.exportReminderDismissed;
  if (!earned) return null;

  return (
    <Notice tone="warn" onDismiss={() => actions.setSetting('exportReminderDismissed', true)} dismissLabel="Not now">
      You have {tasks.length} tasks and have never exported. A copy on disk is the only protection against
      this browser losing its storage.{' '}
      <button
        type="button"
        onClick={() => onNavigate('settings')}
        className="font-semibold text-accent-ink underline decoration-dotted underline-offset-2"
      >
        Export now
      </button>
    </Notice>
  );
}
