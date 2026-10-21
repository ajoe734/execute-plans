import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bffV1 } from "@/lib/bff-v1";
import { makeBffError } from "@/lib/bff-v1/errors";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { isNotFoundError, useLiveDetail } from "@/lib/bff-v1/useLiveDetail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useLiveDetail", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  it("transitions to not-found when GET returns 404 (FastAPI detail payload or BFF envelope)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Research artifact not found" }, 404),
    );

    const { result } = renderHook(() =>
      useLiveDetail("undefined", (id) => bffV1.artifacts.get(id)),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.status).toBe("not-found");
    expect(result.current.notFound).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("transitions to error when GET returns 500 and records the error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Internal server error" }, 500),
    );

    const { result } = renderHook(() =>
      useLiveDetail("art-500", (id) => bffV1.artifacts.get(id)),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.isError).toBe(true);
    expect(result.current.notFound).toBe(false);
    expect(result.current.error).toContain("HTTP 500");
    expect(result.current.data).toBeUndefined();
  });

  it("resolves immediately to not-found without calling loader when id is missing", async () => {
    const loader = vi.fn();
    const { result } = renderHook(() => useLiveDetail(undefined, loader));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(loader).not.toHaveBeenCalled();
    expect(result.current.status).toBe("not-found");
    expect(result.current.notFound).toBe(true);
  });

  it("transitions to ready when loader resolves with an entity", async () => {
    const entity = { id: "art-1", name: "Alpha Model v1" };
    const { result } = renderHook(() =>
      useLiveDetail("art-1", async () => entity),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.data).toEqual(entity);
    expect(result.current.notFound).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("classifies 404 and 500 errors accurately in isNotFoundError", () => {
    expect(isNotFoundError(makeBffError({ code: "RESOURCE_NOT_FOUND", message: "Not found" }))).toBe(true);
    expect(isNotFoundError(makeBffError({ code: "UNKNOWN_ERROR", message: "HTTP 404", details: { detail: "Research artifact not found" } }))).toBe(true);
    expect(isNotFoundError(makeBffError({ code: "UNKNOWN_ERROR", message: "HTTP 500", details: { detail: "Database failure" } }))).toBe(false);
    expect(isNotFoundError(makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Service unavailable" }))).toBe(false);
  });
});
