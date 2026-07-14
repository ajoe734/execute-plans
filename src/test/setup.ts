import "@testing-library/jest-dom";
import { randomUUID } from "node:crypto";

// Mock crypto.randomUUID for environments where it is missing (like jsdom in older Node)
if (typeof window !== "undefined") {
  if (!window.crypto) {
    Object.defineProperty(window, "crypto", {
      value: {},
      writable: true,
    });
  }
  if (!window.crypto.randomUUID) {
    Object.defineProperty(window.crypto, "randomUUID", {
      value: () => randomUUID(),
      writable: true,
    });
  }
}

if (typeof globalThis !== "undefined") {
  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      writable: true,
    });
  }
  if (!globalThis.crypto.randomUUID) {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: () => randomUUID(),
      writable: true,
    });
  }
}

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
