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

// Polyfill crypto.randomUUID for JSDOM / test environment
const cryptoShim = {
  randomUUID: () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },
};

type CryptoHost = {
  crypto?: {
    randomUUID?: typeof cryptoShim.randomUUID;
  };
};

const gt = globalThis as unknown as CryptoHost;
if (!gt.crypto) {
  gt.crypto = cryptoShim;
} else if (!gt.crypto.randomUUID) {
  gt.crypto.randomUUID = cryptoShim.randomUUID;
}

if (typeof window !== "undefined") {
  const win = window as unknown as CryptoHost;
  if (!win.crypto) {
    win.crypto = cryptoShim;
  } else if (!win.crypto.randomUUID) {
    win.crypto.randomUUID = cryptoShim.randomUUID;
  }
}
