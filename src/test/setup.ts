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
// @ts-expect-error - jsdom polyfill
globalThis.ResizeObserver = globalThis.ResizeObserver ?? ResizeObserverShim;
// @ts-expect-error - jsdom polyfill
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
// @ts-expect-error - jsdom polyfill
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
