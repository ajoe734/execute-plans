import { afterEach, describe, expect, it, vi } from "vitest";
import { createSameTabAuthStorage } from "./sameTabAuthStorage";

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("Supabase same-tab auth storage", () => {
  it("rehydrates a short-lived Supabase session after a page reload", async () => {
    const beforeReload = createSameTabAuthStorage(window.sessionStorage);
    await beforeReload.setItem("supabase.session", "short-lived-session");

    // A new adapter instance models the new JavaScript process after reload.
    const afterReload = createSameTabAuthStorage(window.sessionStorage);
    expect(await afterReload.getItem("supabase.session")).toBe("short-lived-session");
  });

  it("never writes the Supabase session to localStorage", async () => {
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const storage = createSameTabAuthStorage(window.sessionStorage);

    await storage.setItem("supabase.session", "access-and-refresh-token");

    expect(await storage.getItem("supabase.session")).toBe("access-and-refresh-token");
    expect(localSet).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("supabase.session")).toBeNull();
  });

  it("clears the same-tab session on logout", async () => {
    const storage = createSameTabAuthStorage(window.sessionStorage);
    await storage.setItem("supabase.session", "short-lived-session");
    await storage.removeItem("supabase.session");
    expect(await storage.getItem("supabase.session")).toBeNull();
  });
});
