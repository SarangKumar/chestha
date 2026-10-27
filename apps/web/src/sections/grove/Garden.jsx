import { useMemo, useState } from 'react';
import { catalogueItem, formatLongDate, todayISO } from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Button, EmptyState, Panel, cx } from '../../components/ui.jsx';
import { Plant, STAGE_LABELS } from '../../grove/plants.jsx';
import { Decoration, environmentOf } from '../../grove/decor.jsx';
import { DirtPad, GardenPlot, gridCell, gridSizeForCount } from '../../grove/GardenPlot.jsx';

/** How many plants are drawn. Older ones are counted, not crowded into the scene. */
const VISIBLE = 36;

export function Garden() {
  const { state } = useWorkspace();
  const garden = state['grove.garden'];
  const sessions = state['grove.focus'].sessions;
  const [selected, setSelected] = useState(null);

  const environment = environmentOf(garden.environmentId);
  const decorations = garden.unlocked.filter((id) => catalogueItem(id)?.kind === 'decoration');
  const shown = useMemo(() => garden.plants.slice(-VISIBLE), [garden.plants]);
  const older = garden.plants.length - shown.length;
  const size = gridSizeForCount(shown.length);

  const chosen = selected ? garden.plants.find((p) => p.id === selected) : null;
  const chosenSession = chosen ? sessions.find((s) => s.id === chosen.sessionId) : null;

  const cells = useMemo(() => {
    // Newest plants fill from the front of the plot so the garden grows toward you.
    const capacity = size * size;
    const plants = shown.slice(-capacity);
    return plants.map((plant, index) => {
      const { col, row } = gridCell(index, size);
      const session = sessions.find((s) => s.id === plant.sessionId);
      const active = selected === plant.id;
      return {
        key: plant.id,
        col,
        row,
        node: (
          <button
            type="button"
            onClick={() => setSelected(active ? null : plant.id)}
            aria-pressed={active}
            className={cx(
              'block rounded-chip transition-transform duration-150 hover:scale-105',
              active && 'scale-110',
            )}
          >
            <Plant
              speciesId={plant.speciesId}
              stage={plant.stage}
              glow={active}
              className="size-full text-ink drop-shadow-sm"
            />
            <span className="sr-only">
              {catalogueItem(plant.speciesId)?.name ?? 'Plant'}, {STAGE_LABELS[plant.stage].toLowerCase()}
              {session ? `, ${session.plannedMinutes} minute session` : ''}
            </span>
          </button>
        ),
      };
    });
  }, [shown, size, sessions, selected]);

  if (garden.plants.length === 0) {
    return (
      <Panel className="relative overflow-hidden p-6 text-center sm:p-8">
        <div className="mx-auto mb-2 flex justify-center">
          <DirtPad>
            <Plant speciesId={garden.selectedSpeciesId} stage="sprout" className="size-24 text-ink sm:size-28" />
          </DirtPad>
        </div>
        <EmptyState
          title="Your Focus Garden is empty"
          description="Every focus session plants one. Start a session and it will be here when you come back — however it ends."
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <GardenPlot
        size={size}
        cells={cells}
        sky={environment.sky}
        haze={environment.haze}
        className="h-72 sm:h-80"
        emptyLabel={`Your garden: ${garden.plants.length} plants from focus sessions.`}
      />

      {decorations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1" aria-label="Unlocked decorations">
          {decorations.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 text-ink-faint" title={catalogueItem(id)?.name}>
              <Decoration id={id} className="size-7" />
              <span className="text-[10px]">{catalogueItem(id)?.name}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        {chosen ? (
          <p className="text-sm text-ink-muted">
            <span className="text-ink">{catalogueItem(chosen.speciesId)?.name ?? 'Plant'}</span>
            {' · '}{STAGE_LABELS[chosen.stage]}
            {chosenSession ? ` · ${chosenSession.plannedMinutes} min` : ''}
            {' · '}{formatLongDate(todayISO(new Date(chosen.plantedAt)))}
          </p>
        ) : (
          <p className="text-meta text-ink-faint">
            {garden.plants.length} planted{older > 0 ? ` · the ${shown.length} most recent are shown` : ''}
            {' · '}{environment.name}
          </p>
        )}
        {chosen && <Button size="sm" tone="quiet" onClick={() => setSelected(null)}>Close</Button>}
      </div>
    </div>
  );
}
