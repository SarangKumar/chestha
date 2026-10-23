import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DASHBOARD, addItem, allowedPresets, layoutHeight, moveItem, newId,
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

const GAP = 8; // px, matches gap-2 — a finer grid needs a finer gutter

// Cell size is measured from the page; see useGridMetrics.

const PRESENTATIONS = ['card', 'transparent', 'inset'];



/**
 * `card` and `inset` take their fill from the glass utilities instead of a flat
 * `bg-*`, so the Settings slider reaches them. `transparent` is already showing
 * the background and has nothing to frost.
 */
const PRESENTATION_CLASS = {
  card: 'widget-glass widget-glass-card border-line shadow-card',
  inset: 'widget-glass widget-glass-inset border-line',
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
  const { state, status, actions, notify } = useWorkspace();
  // One element drives the column count, the cell size and the drag maths.
  const gridRef = useRef(null);
  const { columns, cell } = useGridMetrics(gridRef);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [configuring, setConfiguring] = useState(null);

  /**
   * Both panels are overlays on the right-hand edge, so two open at once would
   * stack one on the other. Opening either closes the other.
   */
  const openConfig = (id) => {
    setConfiguring(id);
    if (state.settings.sidebarOpen) actions.setSetting('sidebarOpen', false);
  };
  useEffect(() => {
    if (state.settings.sidebarOpen) setConfiguring(null);
  }, [state.settings.sidebarOpen]);

  const glass = state.settings.glass ?? 0.55;

  // How many grid rows the visible part of the page is tall. Measured from the
  // grid's own top, so the header and any notices above it are already excluded.
  const [viewportRows, setViewportRows] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const top = gridRef.current?.getBoundingClientRect().top ?? 0;
      setViewportRows(Math.max(0, (window.innerHeight - top) / (cell + GAP)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [cell]);

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

  /**
   * Nothing is placed until storage has been read.
   *
   * The store starts from `defaultState()`, so without this the first paint
   * showed the *shipped* arrangement — and the saved one replaced it a few
   * milliseconds later, which looked like every widget sliding into position
   * from the wrong place. Rendering an empty grid for that moment is honest and
   * does not move anything: a widget appearing is not a widget jumping.
   *
   * The grid itself stays mounted throughout, so its width is measured before
   * the first paint and the column count never changes underneath the widgets.
   */
  const visible = useMemo(
    () => {
      if (!status.ready) return [];
      return fitsCurrent ? known : projectToColumns(known, columns);
    },
    [known, columns, fitsCurrent, status.ready],
  );

  const canEdit = editing && fitsCurrent && status.ready;

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
        ? moveItem(stored, id, preview.x, preview.y, columns)
        : resizeItem(stored, id, preview.w, preview.h, columns, definition?.limits));
    },
  });

  const nudge = (widget, dx, dy, resize) => {
    const definition = WIDGETS[widget.type];
    commit(resize
      ? resizeItem(stored, widget.id, widget.w + dx, widget.h + dy, columns, definition?.limits)
      : moveItem(stored, widget.id, widget.x + dx, widget.y + dy, columns));
  };

  const remove = (id) => {
    const widget = stored.find((w) => w.id === id);
    commit(removeItem(stored, id));
    if (!widget) return;
    notify(`Removed ${WIDGETS[widget.type]?.name ?? widget.type}`, {
      actionLabel: 'Undo',
      onAction: () => commit(addItem(stored, widget, columns)),
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
    }, columns));
    setAdding(false);
    setEditing(true);
  };

  const rows = Math.max(layoutHeight(visible), 1);
  // The guide grid covers the whole screen, not just the rows in use: an empty
  // lower half with no guides reads as "nothing can go here", when in fact that
  // is exactly where there is room. `cell + GAP` is one row's pitch.
  const guideRows = Math.max(rows + 2, Math.ceil(viewportRows));

  return (
    <div>
      <h1 className="sr-only">Dashboard</h1>

      {/*
        * Both controls float clear of the document flow, so the grid keeps the
        * full width and height for widgets.
        *
        * The Edit button sits in the bottom-right corner, out of the way of the
        * grid; the island it opens is centred. They share one wrapper and one
        * set of offsets, so the two stay vertically aligned and clear the same
        * obstacles — only the horizontal alignment differs.
        *
        * `fixed` rather than `absolute`: these are exactly the controls you want
        * while dragging a widget near the bottom of a long grid, so they must not
        * scroll away. The bottom offset clears the mobile bottom bar, and the
        * right-hand padding keeps the centre measured against the grid rather
        * than the window when the today panel is open.
        */}
      <div
        className={cx(
          'pointer-events-none fixed inset-x-0 bottom-20 z-40 flex flex-col gap-1.5 px-4 sm:bottom-6',
          editing ? 'items-center' : 'items-end',
        )}
      >
        {!editing ? (
          /* Deliberately small and recessive: it is chrome, not content, and
             should not read as another tile sitting on the grid. */
          <Button
            size="sm"
            onClick={() => setEditing(true)}
            title="Edit the dashboard layout"
            className="pointer-events-auto h-8 rounded-full px-3 shadow-card"
          >
            <Icon name="edit" className="size-3.5" /> Edit
          </Button>
        ) : (
          <>
            {canEdit && (
              <p className="pointer-events-auto rounded-full border border-line bg-overlay/90 px-2.5 py-0.5 text-[10px] text-ink-faint shadow-card backdrop-blur">
                Drag anywhere · Alt + arrows to move · add Shift to resize
              </p>
            )}

            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-overlay p-1 shadow-overlay">
              <Button size="sm" tone="quiet" className="rounded-full" onClick={() => setResetting(true)}>
                Reset
              </Button>
              <Button
                size="sm"
                tone="quiet"
                className="rounded-full"
                onClick={() => { commit(tidy(stored)); notify('Packed the layout and released every anchor'); }}
                title="Remove deliberate gaps and pack everything to the top"
              >
                Tidy up
              </Button>
              <Button size="sm" tone="quiet" className="rounded-full" onClick={() => setAdding(true)}>
                <Icon name="plus" className="size-4" /> Add
              </Button>
              <Button size="sm" tone="primary" className="rounded-full" onClick={() => setEditing(false)}>
                <Icon name="check" className="size-4" /> Done
              </Button>
            </div>
          </>
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
            // `1fr` rather than the measured pixel value: the column count is
            // already chosen so the cell divides the width evenly, and fr tracks
            // reach the same geometry without a sub-pixel rounding error that
            // could overflow the row and raise a horizontal scrollbar. Rows stay
            // in pixels, which is what keeps each cell square.
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            // Set once here and inherited by every widget, so the glass slider
            // costs one property write rather than one per widget.
            '--glass': glass,
            gridAutoRows: `${cell}px`,
            gap: `${GAP}px`,
          }}
        >
          {/*
            * A faint dashed cell behind every grid position, so the grid itself
            * is visible while arranging. Rendered before the widgets so they
            * paint over it, and inert so it never intercepts a drag.
            */}
          {canEdit && Array.from({ length: columns * guideRows }, (_, index) => (
            <div
              key={`guide-${index}`}
              aria-hidden="true"
              style={{
                gridColumn: (index % columns) + 1,
                gridRow: Math.floor(index / columns) + 1,
              }}
              className="pointer-events-none rounded-card border border-dashed border-line/60"
            />
          ))}

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
                          onClick={() => openConfig(widget.id)}
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
        columns={columns}
        onResize={(w, h, limits) => commit(resizeItem(stored, configuring, w, h, columns, limits))}
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

/** A bounded number control, for sizes no named preset covers. */
function SizeStepper({ label, value, min, max, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-meta text-ink-muted">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          className="size-7 px-0"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </Button>
        <span className="tabular w-7 text-center text-sm font-semibold text-ink">{value}</span>
        <Button
          size="sm"
          className="size-7 px-0"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </Button>
        <span className="tabular ml-1 w-8 text-meta text-ink-faint">/ {max}</span>
      </div>
    </div>
  );
}

/** Every per-widget control, with room to breathe. */
function WidgetDrawer({ widget, columns, onClose, onResize, onConfig, onRemove }) {
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
            {allowedPresets(definition.limits, definition.sizes).map((raw) => {
              // "Full row" means the row you can actually see. The canonical
              // grid is wider than any screen, so an unclamped 48 would place a
              // widget past the edge and pause editing.
              const preset = { ...raw, w: Math.min(raw.w, columns) };
              return (
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
              );
            })}
          </div>
          <div className="mt-3 space-y-2">
            <SizeStepper
              label="Columns"
              value={widget.w}
              min={definition.limits?.minW ?? 1}
              max={Math.min(columns, definition.limits?.maxW ?? columns)}
              onChange={(w) => onResize(w, widget.h, definition.limits)}
            />
            <SizeStepper
              label="Rows"
              value={widget.h}
              min={definition.limits?.minH ?? 1}
              max={definition.limits?.maxH ?? 8}
              onChange={(h) => onResize(widget.w, h, definition.limits)}
            />
          </div>
          <p className="mt-2 text-meta leading-relaxed text-ink-faint">
            Any size within those bounds works — {widget.w}×{widget.h} right now. Dragging the corner
            handle resizes too.
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
      // The catalogue is long enough that the Close button would otherwise
      // scroll out of reach.
      maxHeight="75vh"
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
