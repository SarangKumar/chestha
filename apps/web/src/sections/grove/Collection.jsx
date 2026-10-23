import { useState } from 'react';
import { CATALOGUE_KINDS, itemsOfKind, unlockItem, unlockState } from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Button, Panel, cx } from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';
import { Plant } from '../../grove/plants.jsx';

const KIND_LABELS = { plant: 'Plants', decoration: 'Decorations', environment: 'Environments' };

/**
 * Locked items are shown with what they cost, never hidden. Locked is a goal; hidden
 * is a mystery, and mysteries are for games with a marketing budget.
 */
export function Collection() {
  const { state, actions, notify } = useWorkspace();
  const [kind, setKind] = useState('plant');
  const garden = state['grove.garden'];
  const ledger = state['grove.ledger'];

  return (
    <div>
      <div role="tablist" aria-label="Collection" className="mb-4 flex flex-wrap gap-1">
        {CATALOGUE_KINDS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={kind === id}
            onClick={() => setKind(id)}
            className={cx(
              'rounded-chip px-3 py-1.5 text-sm font-medium transition-colors duration-150',
              kind === id ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink',
            )}
          >
            {KIND_LABELS[id]}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {itemsOfKind(kind).map((item) => {
          const unlock = unlockState(ledger, garden, item);
          const chosen = garden.selectedSpeciesId === item.id || garden.environmentId === item.id;
          return (
            <li key={item.id}>
              <Panel className={cx('flex h-full flex-col items-center p-4 text-center', chosen && 'ring-1 ring-accent')}>
                {item.kind === 'plant' ? (
                  <Plant speciesId={item.id} stage="mature" glow={false} className={cx('size-16 text-ink', !unlock.owned && 'opacity-35 grayscale')} />
                ) : (
                  <span className={cx('flex size-16 items-center justify-center text-ink-faint', !unlock.owned && 'opacity-35')}>
                    <Icon name={item.kind === 'environment' ? 'moon' : 'star'} className="size-7" />
                  </span>
                )}

                <p className="mt-2 text-card font-medium text-ink">{item.name}</p>
                {item.note && <p className="mt-0.5 text-meta text-ink-faint">{item.note}</p>}

                <p className="mt-1 flex items-center gap-1 text-meta text-ink-muted">
                  {!unlock.owned && <Icon name="lock" className="size-3.5" />}
                  {unlock.reason}
                </p>

                <div className="mt-3">
                  {unlock.owned ? (
                    <Button
                      size="sm"
                      tone={chosen ? 'default' : 'quiet'}
                      disabled={chosen || item.kind === 'decoration'}
                      onClick={() => actions.setGardenChoice(item)}
                    >
                      {chosen ? 'In use' : item.kind === 'decoration' ? 'In the garden' : 'Use this'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      tone="quiet"
                      disabled={!unlock.available}
                      onClick={() => {
                        const result = actions.unlockGardenItem(item.id);
                        notify(result.reason, { tone: result.ok ? 'ok' : 'neutral' });
                      }}
                    >
                      Unlock
                    </Button>
                  )}
                </div>
              </Panel>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">
        Levels come from everything you do and are never spent. Seeds come from focus
        sessions and are. Unlocking something costs seeds, never XP — nothing you have
        earned can go backwards.
      </p>
    </div>
  );
}
