import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bffFetch, liveStatus } from "@/lib/bff-v1";
import { isUnauthorizedError, onBffUnauthorized } from "@/lib/auth/sessionExpiry";

describe("BFF 401 session-expiry signal", () => {
  const realFetch = globalThis.fetch;
  const listener = vi.fn();
  let unsubscribe = () => {};

  beforeEach(() => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://x.test" });
    listener.mockReset();
    unsubscribe = onBffUnauthorized(listener);
  });
  afterEach(() => {
    unsubscribe();
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  const respond = (status: number) => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "AUTH_REQUIRED", message: "expired" } }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  it("reports a 401 and still throws the status to the caller", async () => {
    respond(401);
    const failure = await bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" })
      .catch((error: unknown) => error);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isUnauthorizedError(failure)).toBe(true);
  });

  it.each([403, 500])("does not report HTTP %i", async (status) => {
    respond(status);
    await expect(
      bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" }),
    ).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
  });
});
