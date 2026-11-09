import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no layout: the kit Chart (Recharts) and Grid observe sizes, so the tests give them a fixed one.
class FixedSizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const rect = { width: 640, height: 320, top: 0, left: 0, right: 640, bottom: 320, x: 0, y: 0 };
    this.callback([{ target, contentRect: rect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = FixedSizeObserver as unknown as typeof ResizeObserver;

afterEach(() => cleanup());
