import { useMemo, useState } from 'react';
import { GARDEN_ROWS, catalogueItem, formatLongDate, plantPlacement, todayISO } from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Button, EmptyState, Panel, cx } from '../../components/ui.jsx';
import { Plant, STAGE_LABELS } from '../../grove/plants.jsx';
import { Decoration, environmentOf } from '../../grove/decor.jsx';

/** How many plants are drawn. Older ones are counted, not crowded into the scene. */
const VISIBLE = 48;

export function Garden() {
  const { state } = useWorkspace();
  const garden = state['grove.garden'];
  const sessions = state['grove.focus'].sessions;
  const [selected, setSelected] = useState(null);

  const environment = environmentOf(garden.environmentId);
  const decorations = garden.unlocked.filter((id) => catalogueItem(id)?.kind === 'decoration');
  const shown = useMemo(() => garden.plants.slice(-VISIBLE), [garden.plants]);
  const older = garden.plants.length - shown.length;

  const chosen = selected ? garden.plants.find((p) => p.id === selected) : null;
  const chosenSession = chosen ? sessions.find((s) => s.id === chosen.sessionId) : null;

  if (garden.plants.length === 0) {
    return (
      <Panel className="relative overflow-hidden p-8 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none mx-auto mb-4 flex size-28 items-center justify-center opacity-90"
        >
          <Plant speciesId={garden.selectedSpeciesId} stage="sprout" className="size-28 text-ink" />
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
      <div
        className="relative isolate h-72 overflow-hidden rounded-panel border border-line bg-inset sm:h-80"
        role="img"
        aria-label={`Your garden: ${garden.plants.length} plants from ${garden.plants.length} focus sessions.`}
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: environment.sky }} aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0" style={{ background: environment.haze }} aria-hidden="true" />

        {/* The ground: four soft bands, one per row, so plants have something to stand on. */}
        {Array.from({ length: GARDEN_ROWS }, (_, row) => (
          <div
            key={row}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 rounded-[50%] bg-ink/[0.04]"
            style={{ bottom: `${row * 19 - 6}%`, height: '22%', opacity: 0.5 + row * 0.12 }}
          />
        ))}

        {decorations.map((id, index) => (
          <span
            key={id}
            aria-hidden="true"
            className="absolute text-ink"
            style={{ left: `${12 + index * 23}%`, bottom: `${10 + (index % 2) * 26}%`, opacity: 0.55 }}
          >
            <Decoration id={id} className="size-10 sm:size-12" />
          </span>
        ))}

        {shown.map((plant, index) => {
          const { row, left, depth } = plantPlacement(plant.id, index);
          const session = sessions.find((s) => s.id === plant.sessionId);
          const active = selected === plant.id;
          return (
            <button
              key={plant.id}
              type="button"
              onClick={() => setSelected(active ? null : plant.id)}
              aria-pressed={active}
              className={cx(
                'absolute rounded-chip transition-opacity duration-150 hover:opacity-100',
                active ? 'opacity-100' : 'opacity-[var(--plant-opacity)]',
              )}
              style={{
                left: `${left}%`,
                bottom: `${row * 19 + 2}%`,
                zIndex: row + 1,
                // Nearer rows are bigger and brighter; the furthest fade back.
                transform: `scale(${0.55 + depth * 0.45})`,
                '--plant-opacity': 0.55 + depth * 0.4,
              }}
            >
              <Plant speciesId={plant.speciesId} stage={plant.stage} glow={active} className="size-16 text-ink" />
              <span className="sr-only">
                {catalogueItem(plant.speciesId)?.name ?? 'Plant'}, {STAGE_LABELS[plant.stage].toLowerCase()}
                {session ? `, ${session.plannedMinutes} minute session` : ''}
              </span>
            </button>
          );
        })}
      </div>

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
