import { useLayoutEffect, useState } from 'react';
import { CELL_PX, cellForWidth, columnsForWidth } from '@vistaar/core';

/**
 * Measures the grid and reports both the column count and the square cell size.
 *
 * The grid spans the page edge to edge. The column count is the nearest whole
 * number of ~48px squares that fits, and the cell is then the width divided
 * evenly between them — so the last column ends at the right edge rather than
 * short of it, while the square stays within a pixel or two of its intended
 * size.
 *
 * `useLayoutEffect`, not `useEffect`: the initial state is only a guess, and an
 * effect runs *after* the browser paints. That painted one frame at the guessed
 * size and then snapped to the measured one — a visible layout shift every time
 * the dashboard opened. A layout effect measures before the first paint, so the
 * guess is never shown.
 */
export function useGridMetrics(ref) {
  // Never painted — the layout effect below measures first — but a guess at the
  // real cell size is still better than one that would be wildly wrong if it ever
  // were shown.
  const [metrics, setMetrics] = useState({ columns: 12, cell: CELL_PX });

  useLayoutEffect(() => {
    const element = ref?.current;
    // A null node here cannot be recovered from: the dependency is the ref
    // object, which never changes, so the effect would not run again and the
    // guess above would become permanent. Measure a node that is always
    // rendered — never one behind a conditional.
    if (!element) {
      if (typeof console !== 'undefined') {
        console.warn('useGridMetrics: nothing to measure. The ref must be on an element that always renders.');
      }
      return undefined;
    }
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (!width) return;
      const columns = columnsForWidth(width);
      const cell = cellForWidth(width, columns);
      setMetrics((previous) => (
        previous.columns === columns && previous.cell === cell ? previous : { columns, cell }
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return metrics;
}
