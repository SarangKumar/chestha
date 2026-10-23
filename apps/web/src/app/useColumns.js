import { useEffect, useState } from 'react';
import { cellForWidth, columnsForWidth } from '@vistaar/core';

/**
 * Measures the grid and reports both the column count and the square cell size.
 *
 * The grid spans the page edge to edge, so the cell is derived from the width
 * rather than fixed — which is what makes the rightmost column the right edge of
 * the screen.
 */
export function useGridMetrics(ref) {
  const [metrics, setMetrics] = useState({ columns: 12, cell: 132 });

  useEffect(() => {
    const element = ref?.current;
    if (!element) return undefined;
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
