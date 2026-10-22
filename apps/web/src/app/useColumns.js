import { useEffect, useState } from 'react';
import { BREAKPOINT_COLUMNS } from '@vistaar/core';

/** Matches the Tailwind breakpoints the dashboard grid uses. */
export function useColumns() {
  const read = () => {
    if (typeof window === 'undefined') return BREAKPOINT_COLUMNS.lg;
    if (window.matchMedia('(min-width: 1024px)').matches) return BREAKPOINT_COLUMNS.lg;
    if (window.matchMedia('(min-width: 640px)').matches) return BREAKPOINT_COLUMNS.sm;
    return BREAKPOINT_COLUMNS.base;
  };

  const [columns, setColumns] = useState(read);

  useEffect(() => {
    const queries = ['(min-width: 1024px)', '(min-width: 640px)'].map((q) => window.matchMedia(q));
    const update = () => setColumns(read());
    for (const q of queries) q.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      for (const q of queries) q.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return columns;
}
