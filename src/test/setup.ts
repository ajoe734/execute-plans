import "@testing-library/jest-dom";
import { randomUUID } from "node:crypto";
import "@/lib/bff-v1/mocks/adapters";
import "@/lib/bff-v1/mocks/registry";

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

// jsdom 20 (whatwg-url 11) overwrites globalThis.URL without static URL.canParse,
// which Playwright 1.65+ requires during page navigation inside Vitest.
if (typeof URL !== "undefined" && typeof URL.canParse !== "function") {
  URL.canParse = (url: string, base?: string) => {
    try {
      new URL(url, base);
      return true;
    } catch {
      return false;
    }
  };
}
