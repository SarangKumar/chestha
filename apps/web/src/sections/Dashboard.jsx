import { useMemo, useState } from 'react';
import {
  BASE_COLUMNS, DEFAULT_DASHBOARD, addItem, layoutHeight, moveItem, newId,
  projectToColumns, removeItem, resizeItem, tidy,
} from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { useColumns } from '../app/useColumns.js';
import { useGridDrag } from '../app/useGridDrag.js';
import { WIDGETS, WIDGET_TYPES } from '../widgets/registry.jsx';
import { Button, CardTitle, Dialog, EmptyState, IconButton, SectionHeader, cx } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

const ROW_HEIGHT = 176; // px, one grid row
const GAP = 16;         // px, matches gap-4

const PRESENTATIONS = ['card', 'transparent', 'inset'];

/**
 * Named sizes, kept as buttons because the drag handle alone is not
 * discoverable. Both routes write the same w/h, so they cannot disagree.
 */
const SIZE_PRESETS = [
  { key: 'small', label: 'S', title: 'Small', w: 1, h: 1 },
  { key: 'wide', label: 'W', title: 'Wide', w: 2, h: 1 },
  { key: 'tall', label: 'T', title: 'Tall', w: 1, h: 2 },
  { key: 'large', label: 'L', title: 'Large', w: 2, h: 2 },
  { key: 'full', label: 'F', title: 'Full width', w: 4, h: 2 },
];

function presetFor(widget) {
  return SIZE_PRESETS.find((p) => p.w === widget.w && p.h === widget.h)?.key ?? null;
}

const PRESENTATION_CLASS = {
  card: 'bg-surface border-line shadow-card',
  inset: 'bg-inset border-line',
  transparent: 'bg-transparent border-transparent',
};

/**
 * A widget instance may override its type's default presentation. Presentation is
 * never consulted by layout — a transparent widget occupies, collides and moves
 * exactly like a card.
 */
export function resolvePresentation(widget, definition) {
  const allowed = definition?.presentations === false
    ? [definition.presentation ?? 'card']
    : (definition?.presentations ?? PRESENTATIONS);
  const chosen = widget?.config?.presentation;
  return allowed.includes(chosen) ? chosen : (definition?.presentation ?? 'card');
}

export function Dashboard({ onOpenTask, onCapture, onNavigate }) {
  const { state, actions, notify } = useWorkspace();
  const columns = useColumns();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);

  const stored = state.dashboard.widgets;

  // Unknown types (from a newer build or an import) are skipped visibly.
  const { known, unknownTypes } = useMemo(() => {
    const unknown = new Set();
    const list = [];
    for (const widget of stored) {
      if (WIDGETS[widget.type]) list.push(widget);
      else unknown.add(widget.type);
    }
    return { known: list, unknownTypes: [...unknown] };
  }, [stored]);

  // The layout is stored at four columns and projected for narrower screens, so
  // a phone never rewrites the desktop arrangement.
  const atFullWidth = columns >= BASE_COLUMNS;
  const visible = useMemo(
    () => (atFullWidth ? known : projectToColumns(known, columns)),
    [known, columns, atFullWidth],
  );

  const canEdit = editing && atFullWidth;

  const commit = (next) => actions.setDashboard(() => next);

  const { drag, surfaceRef, begin, move, end } = useGridDrag({
    columns,
    rowHeight: ROW_HEIGHT,
    gap: GAP,
    onCommit: (id, mode, preview) => {
      const definition = WIDGETS[stored.find((w) => w.id === id)?.type];
      commit(mode === 'move'
        ? moveItem(stored, id, preview.x, preview.y, BASE_COLUMNS)
        : resizeItem(stored, id, preview.w, preview.h, BASE_COLUMNS, definition?.limits));
    },
  });

  const nudge = (widget, dx, dy, resize) => {
    const definition = WIDGETS[widget.type];
    commit(resize
      ? resizeItem(stored, widget.id, widget.w + dx, widget.h + dy, BASE_COLUMNS, definition?.limits)
      : moveItem(stored, widget.id, widget.x + dx, widget.y + dy, BASE_COLUMNS));
  };

  const remove = (id) => {
    const widget = stored.find((w) => w.id === id);
    commit(removeItem(stored, id));
    if (!widget) return;
    notify(`Removed ${WIDGETS[widget.type]?.name ?? widget.type}`, {
      actionLabel: 'Undo',
      onAction: () => commit(addItem(stored, widget, BASE_COLUMNS)),
    });
  };

  const add = (type) => {
    const definition = WIDGETS[type];
    if (!definition) return;
    commit(addItem(stored, {
      id: newId('w'),
      type,
      w: definition.defaultSize?.w ?? 1,
      h: definition.defaultSize?.h ?? 1,
      config: {},
    }, BASE_COLUMNS));
    setAdding(false);
    setEditing(true);
  };

  const rows = Math.max(layoutHeight(visible), 1);

  return (
    <div>
      <SectionHeader
        title="Dashboard"
        description={canEdit
          ? 'Drag a widget anywhere on the grid, or focus one and use Alt with the arrow keys. Add Shift to resize.'
          : 'Your landing page. Edit the layout to add, move, resize or restyle widgets.'}
      >
        {editing ? (
          <>
            <Button size="sm" tone="quiet" onClick={() => setResetting(true)}>Reset layout</Button>
            <Button
              size="sm"
              onClick={() => { commit(tidy(stored)); notify('Packed the layout and released every anchor'); }}
              title="Remove deliberate gaps and pack everything to the top"
            >
              Tidy up
            </Button>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Icon name="plus" className="size-4" /> Add widget
            </Button>
            <Button size="sm" tone="primary" onClick={() => setEditing(false)}>
              <Icon name="check" className="size-4" /> Done
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setEditing(true)}>Edit layout</Button>
        )}
      </SectionHeader>

      {editing && !atFullWidth && (
        <div className="mb-4 rounded-card border border-line bg-warn-soft px-4 py-3 text-sm text-ink">
          The layout is arranged on a four-column grid and is edited at desktop width. This screen shows your
          arrangement reflowed to fit, and your saved positions are left untouched.
        </div>
      )}

      {unknownTypes.length > 0 && (
        <div className="mb-4 rounded-card border border-line bg-warn-soft px-4 py-3 text-sm text-ink">
          {unknownTypes.length} widget type{unknownTypes.length === 1 ? '' : 's'} in your saved layout
          {unknownTypes.length === 1 ? ' is' : ' are'} not available in this version ({unknownTypes.join(', ')}),
          so {unknownTypes.length === 1 ? 'it was' : 'they were'} skipped. Your layout has not been changed.
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title="No widgets on the dashboard"
          description="Add one, or restore the default layout."
          action={(
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setAdding(true)}>Add widget</Button>
              <Button size="sm" tone="primary" onClick={() => setResetting(true)}>Restore default</Button>
            </div>
          )}
        />
      ) : (
        <div
          ref={surfaceRef}
          onPointerMove={canEdit ? move : undefined}
          onPointerUp={canEdit ? end : undefined}
          onPointerCancel={canEdit ? end : undefined}
          className="relative grid touch-pan-y"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridAutoRows: `${ROW_HEIGHT}px`,
            gap: `${GAP}px`,
          }}
        >
          {/* The snap preview: where the dragged widget will land. */}
          {canEdit && drag && (
            <div
              aria-hidden="true"
              className="pointer-events-none rounded-card border-2 border-dashed border-accent/70 bg-accent-soft/40"
              style={{
                gridColumn: `${drag.preview.x + 1} / span ${drag.preview.w}`,
                gridRow: `${drag.preview.y + 1} / span ${drag.preview.h}`,
              }}
            />
          )}

          {visible.map((widget) => {
            const definition = WIDGETS[widget.type];
            const Render = definition.render;
            const Config = definition.Config;
            const presentation = resolvePresentation(widget, definition);
            const showTitle = canEdit || presentation !== 'transparent';
            const isDragging = drag?.id === widget.id;

            return (
              <div
                key={widget.id}
                style={{
                  gridColumn: `${widget.x + 1} / span ${widget.w}`,
                  gridRow: `${widget.y + 1} / span ${widget.h}`,
                }}
                className={cx('relative min-h-0', isDragging && 'z-20 opacity-60')}
              >
                <div
                  tabIndex={canEdit ? 0 : undefined}
                  aria-label={canEdit
                    ? `${definition.name}, column ${widget.x + 1} row ${widget.y + 1}, ${widget.w} by ${widget.h}`
                    : undefined}
                  onKeyDown={(event) => {
                    if (!canEdit || !event.altKey) return;
                    const delta = {
                      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
                    }[event.key];
                    if (!delta) return;
                    event.preventDefault();
                    nudge(widget, delta[0], delta[1], event.shiftKey);
                    event.currentTarget.focus();
                  }}
                  className={cx(
                    'flex h-full w-full flex-col overflow-hidden rounded-card border',
                    presentation === 'transparent' ? 'p-1.5' : 'p-4',
                    PRESENTATION_CLASS[presentation],
                    canEdit && (presentation === 'transparent'
                      ? 'border-dashed border-line-strong'
                      : 'ring-1 ring-line-strong'),
                  )}
                >
                  <div className={cx('flex items-center gap-1.5', showTitle ? 'mb-2.5' : 'sr-only')}>
                    {canEdit && (
                      <span
                        onPointerDown={(event) => begin(event, widget, 'move')}
                        className="-ml-1 cursor-grab touch-none rounded-chip px-1 py-0.5 text-ink-faint hover:bg-hover hover:text-ink active:cursor-grabbing"
                        role="button"
                        tabIndex={-1}
                        aria-label={`Drag ${definition.name}`}
                      >
                        <Icon name="grip" className="size-4" />
                      </span>
                    )}
                    <CardTitle className="min-w-0 flex-1 truncate">{definition.name}</CardTitle>
                    {canEdit && (
                      <IconButton label={`Remove ${definition.name}`} onClick={() => remove(widget.id)} className="size-6 hover:text-danger">
                        <span aria-hidden="true" className="text-sm leading-none">×</span>
                      </IconButton>
                    )}
                  </div>

                  {canEdit && definition.presentations !== false && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-line bg-inset px-2 py-1.5">
                      <div role="group" aria-label={`${definition.name} size`} className="flex items-center gap-1">
                        <span className="text-[10px] text-ink-muted">Size</span>
                        {SIZE_PRESETS.filter((preset) => {
                          const limits = definition.limits ?? {};
                          return preset.w <= (limits.maxW ?? 4) && preset.h <= (limits.maxH ?? 8)
                            && preset.w >= (limits.minW ?? 1) && preset.h >= (limits.minH ?? 1);
                        }).map((preset) => (
                          <button
                            key={preset.key}
                            type="button"
                            title={`${preset.title} (${preset.w}x${preset.h})`}
                            aria-pressed={presetFor(widget) === preset.key}
                            onClick={() => commit(resizeItem(stored, widget.id, preset.w, preset.h, BASE_COLUMNS, definition.limits))}
                            className={cx(
                              'size-5 rounded-chip border text-[10px] font-medium transition-colors duration-150',
                              presetFor(widget) === preset.key
                                ? 'border-line-strong bg-accent-soft text-ink'
                                : 'border-line text-ink-muted hover:bg-surface hover:text-ink',
                            )}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                        Style
                        <select
                          value={presentation}
                          onChange={(event) => actions.setDashboard((list) => list.map((w) => (
                            w.id === widget.id ? { ...w, config: { ...w.config, presentation: event.target.value } } : w
                          )))}
                          aria-label={`${definition.name} presentation`}
                          className="h-6 rounded-chip border border-line bg-surface px-1 text-[10px] text-ink"
                        >
                          {(definition.presentations ?? PRESENTATIONS).map((value) => (
                            <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>
                          ))}
                        </select>
                      </label>
                      {Config && <Config widget={widget} onChange={(patch) => actions.setDashboard((list) => list.map((w) => (
                        w.id === widget.id ? { ...w, config: { ...w.config, ...patch } } : w
                      )))} />}
                    </div>
                  )}

                  {/* A container query scope, so a widget adapts to its own
                      width and height rather than to the viewport. */}
                  <div className="@container min-h-0 flex-1">
                    <Render
                      widget={widget}
                      span={{ w: widget.w, h: widget.h }}
                      compact={widget.h <= 1}
                      onOpenTask={onOpenTask}
                      onCapture={onCapture}
                      onNavigate={onNavigate}
                    />
                  </div>
                </div>

                {canEdit && (
                  <span
                    onPointerDown={(event) => begin(event, widget, 'resize')}
                    role="button"
                    tabIndex={-1}
                    aria-label={`Resize ${definition.name}`}
                    className="absolute bottom-1 right-1 cursor-nwse-resize touch-none rounded-chip p-1 text-ink-faint hover:bg-hover hover:text-ink"
                  >
                    <Icon name="resize" className="size-3.5" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && <p className="mt-3 px-1 text-meta text-ink-faint">{rows} row{rows === 1 ? '' : 's'} in use.</p>}

      <AddWidgetDialog open={adding} onClose={() => setAdding(false)} placed={visible.map((w) => w.type)} onAdd={add} />

      <Dialog
        open={resetting}
        onClose={() => setResetting(false)}
        size="sm"
        title="Restore the default layout?"
        description="This replaces your widget arrangement and their settings. No tasks or notes are touched."
        footer={(
          <>
            <Button onClick={() => setResetting(false)}>Cancel</Button>
            <Button
              tone="primary"
              onClick={() => {
                const previous = stored;
                commit(structuredClone(DEFAULT_DASHBOARD.widgets));
                setResetting(false);
                notify('Default layout restored', { actionLabel: 'Undo', onAction: () => commit(previous) });
              }}
            >
              Restore default
            </Button>
          </>
        )}
      >
        <p className="text-sm text-ink-muted">Your current layout can be brought back with Undo straight afterwards.</p>
      </Dialog>
    </div>
  );
}

function AddWidgetDialog({ open, onClose, placed, onAdd }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a widget"
      description="A widget can be added more than once — two Upcoming widgets can use different horizons."
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <ul className="space-y-1.5">
        {WIDGET_TYPES.map((type) => {
          const definition = WIDGETS[type];
          const count = placed.filter((t) => t === type).length;
          return (
            <li key={type}>
              <button
                type="button"
                onClick={() => onAdd(type)}
                className="flex w-full items-start gap-3 rounded-control border border-line px-3.5 py-3 text-left transition-colors duration-150 hover:border-line-strong hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{definition.name}</span>
                  <span className="mt-0.5 block text-meta leading-relaxed text-ink-muted">{definition.description}</span>
                </span>
                {count > 0 && (
                  <span className="shrink-0 rounded-chip border border-line bg-inset px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                    {count} placed
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
