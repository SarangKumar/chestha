import { useMemo, useRef, useState } from 'react';
import {
  BASE_COLUMNS, DEFAULT_DASHBOARD, addItem, allowedPresets, layoutHeight, moveItem, newId,
  presetKeyFor, projectToColumns, removeItem, resizeItem, tidy,
} from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { useGridMetrics } from '../app/useColumns.js';
import { useGridDrag } from '../app/useGridDrag.js';
import { WIDGETS, WIDGET_TYPES } from '../widgets/registry.jsx';
import {
  Button, CardTitle, Dialog, Drawer, EmptyState, Field, IconButton, Select, cx,
} from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

const GAP = 16; // px, matches gap-4

// Cell size is measured from the page; see useGridMetrics.

const PRESENTATIONS = ['card', 'transparent', 'inset'];



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
  // One element drives the column count, the cell size and the drag maths.
  const gridRef = useRef(null);
  const { columns, cell } = useGridMetrics(gridRef);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [configuring, setConfiguring] = useState(null);

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
  /**
   * Editing is allowed whenever the view *is* the stored layout — that is, when
   * every widget already fits the current column count, so nothing has been
   * reflowed for display. Saving then writes back exactly what is on screen.
   *
   * It is deliberately not `columns >= BASE_COLUMNS`: the stored grid is 12 wide
   * and almost no screen shows 12 columns, so that test disabled editing
   * everywhere. The point of the guard is to stop a narrowed view overwriting a
   * wider arrangement, which this states directly.
   */
  const fitsCurrent = useMemo(
    () => known.every((widget) => widget.x + widget.w <= columns),
    [known, columns],
  );

  const visible = useMemo(
    () => (fitsCurrent ? known : projectToColumns(known, columns)),
    [known, columns, fitsCurrent],
  );

  const canEdit = editing && fitsCurrent;

  const commit = (next) => actions.setDashboard(() => next);

  const setConfig = (id, patch) => actions.setDashboard((list) => list.map((w) => (
    w.id === id ? { ...w, config: { ...w.config, ...patch } } : w
  )));

  const { drag, surfaceRef, begin, move, end } = useGridDrag({
    surfaceRef: gridRef,
    columns,
    rowHeight: cell,
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
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <h1 className="sr-only">Dashboard</h1>
        {canEdit && (
          <p className="mr-auto text-meta text-ink-faint">
            Drag a widget anywhere, or focus one and use Alt with the arrow keys. Add Shift to resize.
          </p>
        )}
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
      </div>

      {editing && !fitsCurrent && (
        <div className="mb-4 rounded-card border border-line bg-warn-soft px-4 py-3 text-sm text-ink">
          Some widgets sit beyond the {columns} column{columns === 1 ? '' : 's'} this window fits, so the
          arrangement below has been reflowed to show it. Editing is paused here to protect your saved
          positions — widen the window, or use Tidy up on a wider screen.
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
            // Fractional tracks so the grid spans the page edge to edge; the
            // measured cell keeps them square.
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridAutoRows: `${cell}px`,
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
            // The title is a per-widget choice; a transparent widget defaults to
            // hiding it. While editing it is always shown, because that row also
            // carries the drag handle and remove control.
            const titleWanted = typeof widget.config.showTitle === 'boolean'
              ? widget.config.showTitle
              : presentation !== 'transparent';
            const showTitle = canEdit || titleWanted;
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
                      <>
                        <IconButton
                          label={`Edit ${definition.name}`}
                          onClick={() => setConfiguring(widget.id)}
                          className="size-6"
                        >
                          <Icon name="edit" className="size-3.5" />
                        </IconButton>
                        <IconButton label={`Remove ${definition.name}`} onClick={() => remove(widget.id)} className="size-6 hover:text-danger">
                          <span aria-hidden="true" className="text-sm leading-none">×</span>
                        </IconButton>
                      </>
                    )}
                  </div>

                  {/* A container query scope, so a widget adapts to its own
                      width and height rather than to the viewport. */}
                  <div className="@container min-h-0 flex-1">
                    <Render
                      widget={widget}
                      span={{ w: widget.w, h: widget.h }}
                      compact={widget.h <= 1}
                      onChange={(patch) => setConfig(widget.id, patch)}
                      editing={canEdit}
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

      <WidgetDrawer
        widget={stored.find((w) => w.id === configuring) ?? null}
        onClose={() => setConfiguring(null)}
        onResize={(w, h, limits) => commit(resizeItem(stored, configuring, w, h, BASE_COLUMNS, limits))}
        onConfig={(patch) => setConfig(configuring, patch)}
        onRemove={() => { remove(configuring); setConfiguring(null); }}
      />

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

/** Every per-widget control, with room to breathe. */
function WidgetDrawer({ widget, onClose, onResize, onConfig, onRemove }) {
  if (!widget) return null;
  const definition = WIDGETS[widget.type];
  if (!definition) return null;

  const presentation = resolvePresentation(widget, definition);
  const titleWanted = typeof widget.config.showTitle === 'boolean'
    ? widget.config.showTitle
    : presentation !== 'transparent';
  const Config = definition.Config;

  return (
    <Drawer
      open
      onClose={onClose}
      title={definition.name}
      description={definition.description}
      footer={<Button tone="danger" onClick={onRemove}>Remove widget</Button>}
    >
      <div className="space-y-5">
        <section>
          <CardTitle className="mb-2">Size</CardTitle>
          <div role="group" aria-label="Widget size" className="flex flex-wrap gap-1.5">
            {allowedPresets(definition.limits, definition.sizes).map((preset) => (
              <button
                key={preset.key}
                type="button"
                aria-pressed={presetKeyFor(widget) === preset.key}
                onClick={() => onResize(preset.w, preset.h, definition.limits)}
                className={cx(
                  'rounded-control border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150',
                  presetKeyFor(widget) === preset.key
                    ? 'border-line-strong bg-accent-soft text-ink'
                    : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
                )}
              >
                {preset.title}
                <span className="ml-1.5 tabular text-[10px] text-ink-faint">{preset.w}×{preset.h}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-meta text-ink-faint">
            Currently {widget.w}×{widget.h}. Dragging the corner handle also resizes.
          </p>
        </section>

        <section className="space-y-3 border-t border-line pt-4">
          <CardTitle>Appearance</CardTitle>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={titleWanted}
              onChange={(event) => onConfig({ showTitle: event.target.checked })}
              className="size-4 accent-[var(--app-accent)]"
            />
            <span className="text-sm text-ink">Show the title</span>
          </label>
          {definition.presentations !== false && (
            <Field label="Style">
              {(id) => (
                <Select
                  id={id}
                  value={presentation}
                  onChange={(event) => onConfig({ presentation: event.target.value })}
                >
                  {(definition.presentations ?? PRESENTATIONS).map((value) => (
                    <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </section>

        {Config && (
          <section className="space-y-3 border-t border-line pt-4">
            <CardTitle>Options</CardTitle>
            <div className="flex flex-col gap-3">
              <Config widget={widget} onChange={onConfig} />
            </div>
          </section>
        )}
      </div>
    </Drawer>
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
