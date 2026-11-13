import { useLayoutEffect, useState } from 'react';

// The size helpers of every chart and card that measures its cell. This module imports no chart library, so a widget
// drawn without one (the funnel, the radial progress) imports it without loading a chart library.

/** The size of an element, kept current by a ResizeObserver; 0 by 0 until it is laid out. */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, size] as const;
}

/**
 * Below this height a chart is compact (a small low cell): rotated x ticks would take most of it and a legend
 * of one series only repeats the cell's title, so a compact chart draws horizontal ticks, which thin out to
 * fit, and no legend for a single series. Its values stay in the tooltip and the text alternative.
 */
const COMPACT_CHART_HEIGHT = 200;
export const isCompact = (height: number) => height > 0 && height < COMPACT_CHART_HEIGHT;
