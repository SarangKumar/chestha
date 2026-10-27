import { useEffect, useState } from 'react';
import { msUntilNextLocalMidnight, todayISO } from '@kalpvan/core';

/** Today must stop being today at local midnight, even in a session that has
 *  been open since yesterday evening. */
export function useToday() {
  const [today, setToday] = useState(() => todayISO());

  useEffect(() => {
    let timer;
    const tick = () => {
      setToday(todayISO());
      timer = setTimeout(tick, msUntilNextLocalMidnight());
    };
    timer = setTimeout(tick, msUntilNextLocalMidnight());

    // A suspended or throttled tab can miss the timer entirely.
    const recheck = () => {
      if (document.visibilityState === 'visible') setToday(todayISO());
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, []);

  return today;
}
