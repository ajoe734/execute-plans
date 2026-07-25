import type { SupportedStorage } from "@supabase/supabase-js";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Persist only the Supabase SDK session for same-tab reload continuity.
 *
 * This is intentionally sessionStorage, never localStorage: closing the tab
 * drops the credential. The BFF header provider remains a separate in-memory
 * closure that is rebuilt only after Supabase rehydrates and the BFF rechecks
 * `/bff/me` plus `/bff/auth/readiness`.
 */
export function createSameTabAuthStorage(
  browserStorage: BrowserStorage | null = typeof window === "undefined"
    ? null
    : window.sessionStorage,
): SupportedStorage {
  const fallback = new Map<string, string>();

  return {
    getItem: (key) => {
      try {
        return browserStorage?.getItem(key) ?? fallback.get(key) ?? null;
      } catch {
        return fallback.get(key) ?? null;
      }
    },
    setItem: (key, value) => {
      try {
        if (browserStorage) {
          browserStorage.setItem(key, value);
          return;
        }
      } catch {
        // Use the process-local fallback when Web Storage is unavailable.
      }
      fallback.set(key, value);
    },
    removeItem: (key) => {
      try {
        browserStorage?.removeItem(key);
      } catch {
        // The in-memory BFF provider is still cleared by AuthProvider.
      } finally {
        fallback.delete(key);
      }
    },
  };
}

export const sameTabAuthStorage = createSameTabAuthStorage();
