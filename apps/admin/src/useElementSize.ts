import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Measure a DOM element, for handing a pixel viewport to `<FloorPlan>`.
 *
 * The floor plan scales to whatever box it is given, so the box has to be
 * measured rather than assumed. The returned size object keeps a stable
 * identity while the dimensions are unchanged, which matters: a fresh
 * `{width, height}` literal each render would defeat the layout memoisation
 * the component relies on to survive live SignalR updates.
 */
export function useElementSize<T extends HTMLElement>(): [(node: T | null) => void, Size] {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(node);
    observerRef.current = observer;

    const rect = node.getBoundingClientRect();
    setSize((prev) =>
      prev.width === rect.width && prev.height === rect.height
        ? prev
        : { width: rect.width, height: rect.height },
    );
  }, []);

  useLayoutEffect(() => () => observerRef.current?.disconnect(), []);

  return [ref, size];
}
