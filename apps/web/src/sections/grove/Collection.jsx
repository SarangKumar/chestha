import { useState } from 'react';
import { CATALOGUE_KINDS, itemsOfKind, unlockState } from '@kalpvan/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Button, Panel, cx } from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';
import { Plant } from '../../grove/plants.jsx';
import { Decoration, environmentOf } from '../../grove/decor.jsx';

const KIND_LABELS = { plant: 'Plants', decoration: 'Decorations', environment: 'Environments' };

/**
 * Locked items stay visible — greyed art plus a Locked label. Forest-style:
 * goals you can see, never hidden mysteries.
 */
export function Collection() {
  const { state, actions, notify } = useWorkspace();
  const [kind, setKind] = useState('plant');
  const garden = state['grove.garden'];
  const ledger = state['grove.ledger'];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Collection"
        className="mb-5 inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1 shadow-card"
      >
        {CATALOGUE_KINDS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={kind === id}
            onClick={() => setKind(id)}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150',
              kind === id ? 'bg-accent text-on-accent' : 'text-ink-muted hover:bg-hover hover:text-ink',
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
          const env = item.kind === 'environment' ? environmentOf(item.id) : null;
          return (
            <li key={item.id}>
              <Panel
                className={cx(
                  'relative flex h-full flex-col items-center overflow-hidden p-4 text-center',
                  chosen && 'ring-1 ring-accent',
                )}
              >
                {item.kind === 'environment' && env && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{ background: env.sky }}
                  />
                )}

                <div className={cx('relative z-[1]', !unlock.owned && 'opacity-40 grayscale')}>
                  {item.kind === 'plant' ? (
                    <Plant speciesId={item.id} stage="mature" glow={unlock.owned} className="size-[4.5rem] text-ink" />
                  ) : item.kind === 'decoration' ? (
                    <Decoration id={item.id} className="size-16 text-ink" />
                  ) : (
                    <span className="flex size-16 items-center justify-center text-ink-faint">
                      <Icon name="moon" className="size-8" />
                    </span>
                  )}
                </div>

                <p className="relative z-[1] mt-2 text-card font-medium text-ink">{item.name}</p>
                {item.note && unlock.owned && (
                  <p className="relative z-[1] mt-0.5 text-meta text-ink-faint">{item.note}</p>
                )}

                {!unlock.owned ? (
                  <p className="relative z-[1] mt-1 flex items-center justify-center gap-1 text-meta font-medium text-ink-muted">
                    <Icon name="lock" className="size-3.5" />
                    Locked
                  </p>
                ) : (
                  <p className="relative z-[1] mt-1 text-meta text-ink-muted">{unlock.reason}</p>
                )}
                {!unlock.owned && (
                  <p className="relative z-[1] text-[10px] text-ink-faint">{unlock.reason}</p>
                )}

                <div className="relative z-[1] mt-3">
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
                      {unlock.available ? 'Unlock' : 'Locked'}
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
