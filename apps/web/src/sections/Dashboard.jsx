import { useMemo, useRef, useState } from 'react';
import { DEFAULT_DASHBOARD, newId } from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { WIDGETS, WIDGET_TYPES } from '../widgets/registry.jsx';
import { Button, CardTitle, Dialog, EmptyState, IconButton, Panel, SectionHeader, cx } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

// Size is a column span plus a height, interpreted inside whatever column count
// the viewport allows. Nothing is pixel-positioned, so the stored order is also
// the reading order and the phone order.
const SIZE_CLASS = {
  '1x1': 'sm:col-span-1 min-h-44',
  '2x1': 'sm:col-span-2 min-h-44',
  '2x2': 'sm:col-span-2 min-h-[22rem]',
};

const SIZE_LABEL = { '1x1': 'Small', '2x1': 'Wide', '2x2': 'Large' };

const DEFAULT_WIDGETS = DEFAULT_DASHBOARD.widgets;

export function Dashboard({ onOpenTask, onCapture, onNavigate }) {
  const { state, actions, notify } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const dragIndex = useRef(null);

  const widgets = state.dashboard.widgets;

  // A layout from a newer version can name widgets this build does not have.
  // They are skipped visibly rather than silently rewritten away.
  const { known, unknownTypes } = useMemo(() => {
    const unknown = new Set();
    const list = [];
    for (const widget of widgets) {
      if (WIDGETS[widget.type]) list.push(widget);
      else unknown.add(widget.type);
    }
    return { known: list, unknownTypes: [...unknown] };
  }, [widgets]);

  const move = (id, delta) => {
    actions.setDashboard((list) => {
      const from = list.findIndex((w) => w.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= list.length) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const reorderTo = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    actions.setDashboard((list) => {
      const next = [...list];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  const setSize = (id, size) => {
    actions.setDashboard((list) => list.map((w) => (w.id === id ? { ...w, size } : w)));
  };

  const setConfig = (id, patch) => {
    actions.setDashboard((list) => list.map((w) => (
      w.id === id ? { ...w, config: { ...w.config, ...patch } } : w
    )));
  };

  const remove = (id) => {
    const widget = widgets.find((w) => w.id === id);
    const index = widgets.findIndex((w) => w.id === id);
    actions.setDashboard((list) => list.filter((w) => w.id !== id));
    if (!widget) return;
    notify(`Removed ${WIDGETS[widget.type]?.name ?? widget.type}`, {
      actionLabel: 'Undo',
      onAction: () => actions.setDashboard((list) => {
        const next = [...list];
        next.splice(Math.min(index, next.length), 0, widget);
        return next;
      }),
    });
  };

  const add = (type) => {
    const definition = WIDGETS[type];
    if (!definition) return;
    actions.setDashboard((list) => [
      ...list,
      { id: newId('w'), type, size: definition.sizes[0], config: {} },
    ]);
    setAdding(false);
    setEditing(true);
  };

  return (
    <div>
      <SectionHeader
        title="Dashboard"
        description={editing
          ? 'Drag a widget, or focus one and use Alt with the arrow keys to reorder.'
          : 'Your landing page. Edit the layout to add, resize or rearrange widgets.'}
      >
        {editing ? (
          <>
            <Button size="sm" tone="quiet" onClick={() => setResetting(true)}>Reset layout</Button>
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

      {unknownTypes.length > 0 && (
        <div className="mb-4 rounded-card border border-line bg-warn-soft px-4 py-3 text-sm text-ink">
          {unknownTypes.length} widget type{unknownTypes.length === 1 ? '' : 's'} in your saved layout
          {unknownTypes.length === 1 ? ' is' : ' are'} not available in this version
          ({unknownTypes.join(', ')}), so {unknownTypes.length === 1 ? 'it was' : 'they were'} skipped.
          Your layout has not been changed.
        </div>
      )}

      {known.length === 0 ? (
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
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {known.map((widget, index) => {
            const definition = WIDGETS[widget.type];
            const Render = definition.render;
            const Config = definition.Config;

            return (
              <li
                key={widget.id}
                className={cx('flex', SIZE_CLASS[widget.size] ?? SIZE_CLASS['1x1'])}
                draggable={editing}
                onDragStart={() => { dragIndex.current = index; }}
                onDragEnd={() => { dragIndex.current = null; }}
                onDragOver={(event) => { if (editing && dragIndex.current !== null) event.preventDefault(); }}
                onDrop={(event) => {
                  if (!editing || dragIndex.current === null) return;
                  event.preventDefault();
                  reorderTo(dragIndex.current, index);
                  dragIndex.current = null;
                }}
              >
                <Panel
                  tabIndex={editing ? 0 : undefined}
                  aria-label={editing ? `${definition.name}, position ${index + 1} of ${known.length}` : undefined}
                  onKeyDown={(event) => {
                    if (!editing || !event.altKey) return;
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      move(widget.id, -1);
                      event.currentTarget.focus();
                    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                      event.preventDefault();
                      move(widget.id, 1);
                      event.currentTarget.focus();
                    }
                  }}
                  className={cx(
                    'flex w-full flex-col p-4',
                    editing && 'cursor-grab ring-1 ring-line-strong active:cursor-grabbing',
                  )}
                >
                  <div className="mb-2.5 flex items-center gap-1.5">
                    <CardTitle className="min-w-0 flex-1 truncate">{definition.name}</CardTitle>

                    {editing ? (
                      <div className="flex items-center gap-0.5">
                        <IconButton label={`Move ${definition.name} earlier`} onClick={() => move(widget.id, -1)} className="size-6">
                          <Icon name="chevronLeft" className="size-3.5" />
                        </IconButton>
                        <IconButton label={`Move ${definition.name} later`} onClick={() => move(widget.id, 1)} className="size-6">
                          <Icon name="chevronRight" className="size-3.5" />
                        </IconButton>
                        <IconButton label={`Remove ${definition.name}`} onClick={() => remove(widget.id)} className="size-6 hover:text-danger">
                          <span aria-hidden="true" className="text-sm leading-none">×</span>
                        </IconButton>
                      </div>
                    ) : null}
                  </div>

                  {editing && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-line bg-inset px-2 py-1.5">
                      <div role="group" aria-label={`${definition.name} size`} className="flex gap-1">
                        {definition.sizes.map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setSize(widget.id, size)}
                            aria-pressed={widget.size === size}
                            className={cx(
                              'rounded-chip border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-150',
                              widget.size === size
                                ? 'border-line-strong bg-accent-soft text-ink'
                                : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
                            )}
                          >
                            {SIZE_LABEL[size]}
                          </button>
                        ))}
                      </div>
                      {Config && <Config widget={widget} onChange={(patch) => setConfig(widget.id, patch)} />}
                    </div>
                  )}

                  <div className="min-h-0 flex-1">
                    <Render
                      widget={widget}
                      onOpenTask={onOpenTask}
                      onCapture={onCapture}
                      onNavigate={onNavigate}
                    />
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      <AddWidgetDialog
        open={adding}
        onClose={() => setAdding(false)}
        placed={known.map((w) => w.type)}
        onAdd={add}
      />

      <Dialog
        open={resetting}
        onClose={() => setResetting(false)}
        size="sm"
        title="Restore the default layout?"
        description="This replaces your widget arrangement and their settings. Nothing else is affected, and no tasks or notes are touched."
        footer={(
          <>
            <Button onClick={() => setResetting(false)}>Cancel</Button>
            <Button
              tone="primary"
              onClick={() => {
                const previous = widgets;
                actions.setDashboard(() => structuredClone(DEFAULT_WIDGETS));
                setResetting(false);
                notify('Default layout restored', {
                  actionLabel: 'Undo',
                  onAction: () => actions.setDashboard(() => previous),
                });
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
