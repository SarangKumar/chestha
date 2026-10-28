import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  addItem, allowedPresets, defaultWidgetsFor, layoutHeight, moveItem, newId,
  presetKeyFor, projectToColumns, reanchorDefaultWidgets, removeItem, resizeItem,
  shouldReanchorDefault, tidy,
} from '@chestha/core';
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
  /**
   * Two refs, deliberately.
   *
   * `measureRef` (callback) sits on a wrapper that is always rendered; `gridRef`
   * is on the grid itself, which is replaced by an empty state when there is
   * nothing to place. Measuring the grid meant that whenever it was absent at
   * mount — which is every load, since widgets wait for storage — the
   * measurement never ran, and the hook's initial guess of 12 columns became
   * permanent. The two elements are the same width, so measuring the wrapper
   * costs nothing. The hook returns a callback ref so attachment re-triggers
   * measurement (a plain object ref cannot).
   */
  const gridRef = useRef(null);
  const { columns, cell, measureRef, hostRef } = useGridMetrics();
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

  // Cap the edit grid to the remaining viewport so it fills the screen. Do NOT
  // reserve a band for the floating pills — that empty canvas read as a full-
  // width black strip under the grid. Pills overlay the grid; mobile only
  // clears the bottom nav.
  const [viewportRows, setViewportRows] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const editScrollRef = useRef(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = editScrollRef.current ?? hostRef.current;
      const top = el?.getBoundingClientRect().top ?? 0;
      const bottomReserve = window.matchMedia('(min-width: 640px)').matches ? 0 : 56;
      const available = Math.max(0, window.innerHeight - top - bottomReserve);
      const pitch = cell + GAP;
      const fit = pitch > 0 ? Math.floor((available + GAP) / pitch) : 0;
      setViewportHeight(available);
      setViewportRows(Math.max(0, fit));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [cell, editing]);

  const stored = state.dashboard.widgets;

  /**
   * The shipped default is stored at a laptop column count. Once the grid is
   * measured, re-resolve that untouched sketch so corner widgets hug the real
   * edges of this New Tab / window — otherwise they sit in a left band with a
   * dead gutter on the right. Custom layouts are left alone.
   */
  useEffect(() => {
    if (!status.ready || columns < 8) return;
    if (!shouldReanchorDefault(stored, columns)) return;
    actions.setDashboard(() => reanchorDefaultWidgets(stored, columns));
  }, [status.ready, columns, stored, actions]);

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
  // Guides fill the visible edit band (and cover every occupied row when the
  // layout is taller). They no longer add extra rows past the viewport — that
  // used to make the edit surface taller than the screen.
  const guideRows = Math.max(rows, viewportRows || 1);

  return (
    <div ref={measureRef} className="w-full min-w-0 max-w-full overflow-x-hidden">
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
      {/*
        * Edit chrome: shrink-wrapped floating pills only. Transparent fixed
        * wrappers — never a full-width strip. Grid shows through behind them.
        */}
      {!editing ? (
        <div className="pointer-events-none fixed bottom-20 right-4 z-40 bg-transparent sm:bottom-6 sm:right-6">
          <Button
            size="sm"
            onClick={() => setEditing(true)}
            title="Edit the dashboard layout"
            className="pointer-events-auto h-8 rounded-full px-3 shadow-card"
          >
            <Icon name="edit" className="size-3.5" /> Edit
          </Button>
        </div>
      ) : (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-40 flex w-max -translate-x-1/2 flex-col items-center gap-1.5 bg-transparent sm:bottom-6">
          {canEdit && (
            <p className="pointer-events-auto rounded-full border border-line bg-overlay/90 px-2.5 py-0.5 text-[10px] text-ink-faint shadow-card backdrop-blur">
              Drag anywhere · Alt + arrows to move · add Shift to resize
            </p>
          )}
          <div className="pointer-events-auto flex w-max items-center gap-1 rounded-full border border-line bg-overlay p-1 shadow-overlay">
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
        </div>
      )}

      {editing && !fitsCurrent && (
        <div className="mb-4 rounded-card border border-line bg-warn-soft px-4 py-3 text-sm text-ink">
          <p>
            Some widgets sit beyond the {columns} column{columns === 1 ? '' : 's'} this window fits, so the
            arrangement below has been reflowed to show it. Editing is paused here so a narrower window
            cannot overwrite the positions you saved on a wider one.
          </p>
          {/* Without this the guard is a dead end: editing is off, so there is
              no way to make the layout fit from inside the app. Fitting is
              offered explicitly, and it is undoable. */}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              tone="primary"
              onClick={() => {
                const before = stored;
                commit(projectToColumns(known, columns));
                notify(`Fitted the layout to ${columns} columns`, {
                  actionLabel: 'Undo',
                  onAction: () => commit(before),
                });
              }}
            >
              Fit to this window
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const before = stored;
                commit(defaultWidgetsFor(columns));
                notify('Default layout restored', {
                  actionLabel: 'Undo',
                  onAction: () => commit(before),
                });
              }}
            >
              Restore default
            </Button>
          </div>
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
          ref={editScrollRef}
          className={cx(
            // Always clip X so sub-pixel grid tracks / right-edge widgets cannot
            // create a horizontal scrollbar at the corners (landing preview +
            // extension New Tab share this surface).
            'max-w-full overflow-x-hidden bg-transparent',
            // Above sticky header (z-20): edit chrome sits in this surface, so the
            // whole band must stack higher or pill backgrounds paint under the header.
            canEdit && 'relative z-[25] overflow-y-auto scrollbar-thin',
          )}
          style={canEdit && viewportHeight > 0 ? {
            maxHeight: viewportHeight,
            // Top pad so -top-3 edit pills are not clipped by overflow-y-auto.
            // Cancel with equal negative margin so the grid does not jump down
            // when edit mode opens (padding alone caused a ~12px layout shift).
            paddingTop: 12,
            marginTop: -12,
            // Bottom pad for the fixed floating Done/Add island — does not
            // move content; only grows scrollable room under the last row.
            paddingBottom: 72,
          } : undefined}
        >
        <div
          ref={surfaceRef}
          onPointerMove={canEdit ? move : undefined}
          onPointerUp={canEdit ? end : undefined}
          onPointerCancel={canEdit ? end : undefined}
          className="relative grid max-w-full touch-pan-y"
          style={{
            // Fixed square tracks from the measured cell. Using the same pixel
            // size for columns and rows keeps the edit guides square; leftover
            // width (sub-pixel) sits on the right rather than stretching cells.
            gridTemplateColumns: `repeat(${columns}, ${cell}px)`,
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
              className="pointer-events-none rounded-[4px] border border-dashed border-line opacity-25"
            />
          ))}

          {/* Crosshair through the middle of the edit surface for alignment. */}
          {canEdit && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-1/2 z-[1] w-0 -translate-x-px border-l border-dotted border-line/50"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-1/2 z-[1] h-0 -translate-y-px border-t border-dotted border-line/50"
              />
            </>
          )}

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
            // Same title rule as the homepage — including while editing — so
            // "Show the title" previews the real card. Edit chrome lives outside.
            const titleWanted = typeof widget.config.showTitle === 'boolean'
              ? widget.config.showTitle
              : presentation !== 'transparent';
            const isDragging = drag?.id === widget.id;
            const isConfiguring = configuring === widget.id;

            return (
              <div
                key={widget.id}
                style={{
                  gridColumn: `${widget.x + 1} / span ${widget.w}`,
                  gridRow: `${widget.y + 1} / span ${widget.h}`,
                }}
                className={cx(
                  // Edit surface is z-[25] above the sticky header; hover/focus then
                  // lifts one card over its neighbours so chrome stays clickable.
                  'group/widget relative min-h-0 min-w-0',
                  canEdit && 'hover:z-50 focus-within:z-50',
                  isDragging && 'z-50 opacity-60',
                  isConfiguring && 'z-50',
                )}
              >
                {/*
                  * The card itself matches the homepage: same title rule, same
                  * padding, no edit ring. DnD grip is absolutely overlaid so it
                  * cannot shove the title. Edit / remove / resize float outside
                  * the border and only appear on hover (or while this card is
                  * being configured / focused).
                  */}
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
                    'relative flex h-full w-full flex-col overflow-hidden rounded-card border',
                    presentation === 'transparent' ? 'p-1.5' : 'p-4',
                    PRESENTATION_CLASS[presentation],
                  )}
                >
                  {titleWanted ? (
                    <div className="relative z-10 mb-2.5 flex shrink-0 items-center gap-1.5">
                      <CardTitle className="min-w-0 flex-1 truncate pr-1">{definition.name}</CardTitle>
                    </div>
                  ) : (
                    <div className="sr-only">
                      <CardTitle>{definition.name}</CardTitle>
                    </div>
                  )}

                  {canEdit && (
                    <span
                      onPointerDown={(event) => begin(event, widget, 'move')}
                      className={cx(
                        'absolute z-[60] cursor-grab touch-none rounded-chip bg-overlay/90 p-1 text-ink-faint shadow-card',
                        'hover:bg-hover hover:text-ink active:cursor-grabbing',
                        // Sit in the padding corner so the title/body stay put.
                        presentation === 'transparent' ? 'left-0.5 top-0.5' : 'left-1.5 top-1.5',
                      )}
                      role="button"
                      tabIndex={-1}
                      aria-label={`Drag ${definition.name}`}
                    >
                      <Icon name="grip" className="size-3.5" />
                    </span>
                  )}

                  {/* A container query scope, so a widget adapts to its own
                      width and height rather than to the viewport. */}
                  <div className="@container min-h-0 min-w-0 flex-1 overflow-hidden">
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
                  <>
                    <div
                      className={cx(
                        'absolute -top-3 right-0 z-[60] flex items-center gap-0.5 rounded-full border border-line bg-overlay p-0.5 shadow-card',
                        'opacity-0 transition-opacity duration-150',
                        'pointer-events-none group-hover/widget:pointer-events-auto group-hover/widget:opacity-100',
                        'group-focus-within/widget:pointer-events-auto group-focus-within/widget:opacity-100',
                        isConfiguring && 'pointer-events-auto opacity-100',
                      )}
                    >
                      <IconButton
                        label={`Edit ${definition.name}`}
                        onClick={() => openConfig(widget.id)}
                        className="size-7"
                      >
                        <Icon name="edit" className="size-3.5" />
                      </IconButton>
                      <IconButton
                        label={`Remove ${definition.name}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          remove(widget.id);
                        }}
                        className="size-7 hover:text-danger"
                      >
                        <span aria-hidden="true" className="text-sm leading-none">×</span>
                      </IconButton>
                    </div>

                    <span
                      onPointerDown={(event) => begin(event, widget, 'resize')}
                      role="button"
                      tabIndex={-1}
                      aria-label={`Resize ${definition.name}`}
                      className={cx(
                        'absolute -bottom-2.5 -right-2.5 z-[60] cursor-nwse-resize touch-none rounded-full border border-line bg-overlay p-1.5 text-ink-faint shadow-card',
                        'opacity-0 transition-opacity duration-150 hover:bg-hover hover:text-ink',
                        'pointer-events-none group-hover/widget:pointer-events-auto group-hover/widget:opacity-100',
                        'group-focus-within/widget:pointer-events-auto group-focus-within/widget:opacity-100',
                        isConfiguring && 'pointer-events-auto opacity-100',
                      )}
                    >
                      <Icon name="resize" className="size-3.5" />
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        </div>
      )}

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
                // Resolved against the columns actually on screen, so the
                // default reaches the corners of this window rather than the
                // laptop width the stored copy is written for.
                commit(defaultWidgetsFor(columns));
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
  // Keep the live card clear of the panel: open on the opposite half of the grid.
  const drawerSide = (widget.x + widget.w / 2) >= (columns / 2) ? 'left' : 'right';

  return (
    <Drawer
      open
      side={drawerSide}
      onClose={onClose}
      title={definition.name}
      description={definition.description}
      // Dim rather than bury the dashboard: toggles must be judged on the live card.
      scrimClassName="opacity-40"
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
          <p className="text-meta text-ink-faint">Changes apply to the widget on the dashboard immediately.</p>
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
