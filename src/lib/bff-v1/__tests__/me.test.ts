import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMe, fetchMe, invalidateMe, hasCapability } from "@/lib/bff-v1";

describe("VI-A C4 — bff-v1 me façade", () => {
  it("fetchMe returns canonical MeResponse with required fields", async () => {
    invalidateMe();
    const me = await fetchMe(true);
    expect(me.user.id).toBeTruthy();
    expect(me.tenant.id).toBeTruthy();
    expect(me.permissionsVersion).toBeTruthy();
    expect(me.serverTime).toBeTruthy();
    expect(Array.isArray(me.capabilities)).toBe(true);
  });

  it("useMe hook surfaces the cached MeResponse", async () => {
    invalidateMe();
    const { result } = renderHook(() => useMe());
    await waitFor(() => expect(result.current.me).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(hasCapability(result.current.me, "strategy.create")).toBe(true);
    expect(hasCapability(result.current.me, "nope.bogus")).toBe(false);
  });
});
