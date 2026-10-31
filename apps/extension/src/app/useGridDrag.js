import { useCallback, useRef, useState } from 'react';

/**
 * Translates pointer movement into grid cells. The pointer offset *within* the
 * widget is captured on grab and subtracted thereafter, so the widget does not
 * jump to centre itself under the cursor — the grabbed point stays under it.
 *
 * Pointer events are used rather than HTML5 drag-and-drop because they give real
 * coordinates during the gesture, which is what snapping and a live preview need.
 */
export function useGridDrag({ columns, rowHeight, gap, onCommit, surfaceRef: externalRef }) {
  const [drag, setDrag] = useState(null);
  // The grid element is shared with the column measurement, so it may be owned
  // by the caller.
  const ownRef = useRef(null);
  const surfaceRef = externalRef ?? ownRef;
  const stateRef = useRef(null);

  const cellWidth = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return (rect.width - gap * (columns - 1)) / columns;
  }, [columns, gap]);

  /** @param mode 'move' | 'resize' */
  const begin = useCallback((event, item, mode) => {
    if (event.button !== undefined && event.button !== 0) return;
    const surface = surfaceRef.current;
    if (!surface) return;

    const rect = surface.getBoundingClientRect();
    const cw = (rect.width - gap * (columns - 1)) / columns;
    const stepX = cw + gap;
    const stepY = rowHeight + gap;

    stateRef.current = {
      id: item.id,
      mode,
      origin: { x: item.x, y: item.y, w: item.w, h: item.h },
      pointerStart: { x: event.clientX, y: event.clientY },
      stepX,
      stepY,
      preview: { x: item.x, y: item.y, w: item.w, h: item.h },
    };
    setDrag({ ...stateRef.current });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, [columns, gap, rowHeight]);

  const move = useCallback((event) => {
    const s = stateRef.current;
    if (!s) return;
    const dx = Math.round((event.clientX - s.pointerStart.x) / s.stepX);
    const dy = Math.round((event.clientY - s.pointerStart.y) / s.stepY);

    const preview = s.mode === 'move'
      ? {
        ...s.origin,
        x: Math.min(Math.max(0, s.origin.x + dx), Math.max(0, columns - s.origin.w)),
        y: Math.max(0, s.origin.y + dy),
      }
      : {
        ...s.origin,
        w: Math.min(Math.max(1, s.origin.w + dx), columns - s.origin.x),
        h: Math.max(1, s.origin.h + dy),
      };

    if (preview.x === s.preview.x && preview.y === s.preview.y
      && preview.w === s.preview.w && preview.h === s.preview.h) return;

    s.preview = preview;
    setDrag({ ...s, preview });
  }, [columns]);

  const end = useCallback(() => {
    const s = stateRef.current;
    stateRef.current = null;
    setDrag(null);
    if (!s) return;
    const changed = s.preview.x !== s.origin.x || s.preview.y !== s.origin.y
      || s.preview.w !== s.origin.w || s.preview.h !== s.origin.h;
    if (changed) onCommit(s.id, s.mode, s.preview);
  }, [onCommit]);

  return { drag, surfaceRef, begin, move, end, cellWidth };
}
