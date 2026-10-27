import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { CELL_PX, cellForWidth, columnsForWidth } from '@kalpvan/core';

/**
 * Measures the grid and reports both the column count and the square cell size.
 *
 * The grid spans the page edge to edge. The column count is the nearest whole
 * number of ~44px squares that fits, and the cell is then the width divided
 * evenly between them — so the last column ends at the right edge rather than
 * short of it, while the square stays within a pixel or two of its intended
 * size.
 *
 * `useLayoutEffect`, not `useEffect`: the initial state is only a guess, and an
 * effect runs *after* the browser paints. That painted one frame at the guessed
 * size and then snapped to the measured one — a visible layout shift every time
 * the dashboard opened. A layout effect measures before the first paint, so the
 * guess is never shown.
 *
 * The measure host must be attached with the returned callback ref (`measureRef`),
 * not a plain object ref. Object refs do not re-render when `.current` is set, so
 * an effect keyed only on the ref object can read `null` once (Strict Mode
 * remount, late commit, conditional host) and then never retry — leaving the
 * column guess permanent and, after the warn was added, flooding the console.
 * A callback ref updates `host` when React attaches or detaches the node, so
 * measurement starts as soon as the element exists and stops cleanly on unmount.
 */
export function useGridMetrics() {
  // Never painted — the layout effect below measures first — but a guess at the
  // real cell size is still better than one that would be wildly wrong if it ever
  // were shown.
  const [metrics, setMetrics] = useState({ columns: 12, cell: CELL_PX });
  const [host, setHost] = useState(null);
  // Same node as `host`, exposed as an object ref for callers that need to read
  // the element outside the callback (e.g. viewport math while editing).
  const hostRef = useRef(null);

  const measureRef = useCallback((node) => {
    hostRef.current = node;
    setHost((previous) => (previous === node ? previous : node));
  }, []);

  useLayoutEffect(() => {
    if (!host) return undefined;
    const measure = () => {
      const width = host.getBoundingClientRect().width;
      if (!width) return;
      const columns = columnsForWidth(width);
      const cell = cellForWidth(width, columns);
      setMetrics((previous) => (
        previous.columns === columns && previous.cell === cell ? previous : { columns, cell }
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);

  return { columns: metrics.columns, cell: metrics.cell, measureRef, hostRef };
}
