import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Renders only the rows near the viewport.
 *
 * The full LeetCode index is 3,511 questions, and each row carries several
 * badges and two buttons — mounting them all is thousands of DOM nodes and makes
 * filtering feel sluggish. Rows are a uniform height here, so the window can be
 * computed arithmetically; no measurement or dependency is needed.
 */
export function useVirtualRows({ count, rowHeight, overscan = 8 }) {
  const scrollRef = useRef(null);
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 40) });

  const recompute = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const { scrollTop, clientHeight } = element;
    const visible = Math.ceil(clientHeight / rowHeight);
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(count, start + visible + overscan * 2);
    setRange((previous) => (
      previous.start === start && previous.end === end ? previous : { start, end }
    ));
  }, [count, rowHeight, overscan]);

  // Measured before paint, for the same reason as the grid: the initial guess of
  // 40 rows would otherwise be rendered for one frame and then corrected.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    recompute();
    element.addEventListener('scroll', recompute, { passive: true });
    const observer = new ResizeObserver(recompute);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', recompute);
      observer.disconnect();
    };
  }, [recompute]);

  // A changed filter can leave the window past the end of a shorter list.
  useEffect(() => {
    const element = scrollRef.current;
    if (element && element.scrollTop > count * rowHeight) element.scrollTop = 0;
    recompute();
  }, [count, rowHeight, recompute]);

  return {
    scrollRef,
    start: range.start,
    end: range.end,
    padTop: range.start * rowHeight,
    padBottom: Math.max(0, (count - range.end) * rowHeight),
  };
}
