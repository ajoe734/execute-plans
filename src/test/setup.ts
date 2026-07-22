import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom shims for Radix primitives that depend on layout APIs.
class ResizeObserverShim {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const g = globalThis as unknown as {
  ResizeObserver?: unknown;
};
g.ResizeObserver = g.ResizeObserver ?? (ResizeObserverShim as unknown);
const ep = Element.prototype as unknown as {
  hasPointerCapture?: () => boolean;
  scrollIntoView?: () => void;
};
if (!ep.hasPointerCapture) ep.hasPointerCapture = () => false;
if (!ep.scrollIntoView) ep.scrollIntoView = () => {};
