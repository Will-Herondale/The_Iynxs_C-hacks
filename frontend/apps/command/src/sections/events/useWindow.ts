import { useCallback, useState } from 'react';

export interface WindowRange {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
  onScroll: (e: { currentTarget: { scrollTop: number } }) => void;
}

/** Fixed-row-height windowing: only rows in view (+ overscan) are rendered, however long the history. */
export function useWindow(count: number, rowHeight: number, viewport = 480, overscan = 6): WindowRange {
  const [top, setTop] = useState(0);
  const onScroll = useCallback((e: { currentTarget: { scrollTop: number } }) => setTop(e.currentTarget.scrollTop), []);
  const start = Math.max(0, Math.floor(top / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((top + viewport) / rowHeight) + overscan);
  return { start, end, padTop: start * rowHeight, padBottom: Math.max(0, (count - end) * rowHeight), onScroll };
}
