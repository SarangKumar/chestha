import { useEffect, useState } from 'react';
import { CELL_PX, columnsForWidth } from '@vistaar/core';

/**
 * Column count derived from how many fixed-width cells fit the grid, rather than
 * from fixed breakpoints — the cell size is constant, so the count is what has
 * to vary for the grid to reach the right of the screen.
 */
export function useColumns(ref) {
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    const element = ref?.current;
    if (!element) return undefined;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width) setColumns(columnsForWidth(width, CELL_PX));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}
