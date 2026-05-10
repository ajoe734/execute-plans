import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHeaders, idempotencyKey, isMutation, setAuthProvider } from "../headers";

beforeEach(() => {
  vi.stubEnv("VITE_BFF_MODE", "mock");
  vi.stubEnv("VITE_BFF_DEV_BEARER_TOKEN", "");
});

afterEach(() => {
  setAuthProvider({ getToken: () => null, getTenantId: () => null });
  vi.unstubAllEnvs();
});

describe("bff-v1 headers (Final C.1: Idempotency-Key is HEADER)", () => {
  it("isMutation classifies methods", () => {
    expect(isMutation("GET")).toBe(false);
    expect(isMutation("post")).toBe(true);
    expect(isMutation("PATCH")).toBe(true);
    expect(isMutation("DELETE")).toBe(true);
  });

  it("GET requests do NOT carry Idempotency-Key", () => {
    const h = buildHeaders({ method: "GET" });
    expect(h["Idempotency-Key"]).toBeUndefined();
    expect(h["Content-Type"]).toBeUndefined();
    expect(h["X-Request-Id"]).toMatch(/^req_/);
    expect(h["X-BFF-Api-Version"]).toBe("2026-05-07");
  });

  it("POST auto-injects Idempotency-Key + Content-Type", () => {
    const h = buildHeaders({ method: "POST" });
    expect(h["Idempotency-Key"]).toMatch(/^idk_/);
    expect(h["Content-Type"]).toBe("application/json");
  });

  it("If-Match formatted as quoted ETag when ifMatchVersion provided", () => {
    const h = buildHeaders({ method: "PATCH", ifMatchVersion: 7 });
    expect(h["If-Match"]).toBe('"7"');
  });

  it("idempotencyKey returns sortable unique value", () => {
    const a = idempotencyKey();
    const b = idempotencyKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^idk_/);
  });

  it("Accept-Language honours explicit locale override", () => {
    const h = buildHeaders({ method: "GET", locale: "zh-TW" });
    expect(h["Accept-Language"]).toBe("zh-TW");
  });

  it("auto-mints X-Correlation-Id (or accepts caller-supplied)", () => {
    const auto = buildHeaders({ method: "GET" });
    expect(auto["X-Correlation-Id"]).toMatch(/^cid_/);
    const supplied = buildHeaders({ method: "GET", correlationId: "cid_test_1" });
    expect(supplied["X-Correlation-Id"]).toBe("cid_test_1");
  });

  it("injects Authorization + X-Tenant-Id from provider when set", () => {
    setAuthProvider({ getToken: () => "tok-abc", getTenantId: () => "ten-1" });
    const h = buildHeaders({ method: "GET" });
    expect(h["Authorization"]).toBe("Bearer tok-abc");
    expect(h["X-Tenant-Id"]).toBe("ten-1");
  });

  it("omits Authorization / X-Tenant-Id when provider returns null (mock default)", () => {
    const h = buildHeaders({ method: "GET" });
    expect(h["Authorization"]).toBeUndefined();
    expect(h["X-Tenant-Id"]).toBeUndefined();
  });

  it("injects non-secret dev bearer fallback only in live mode", () => {
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_DEV_BEARER_TOKEN", "pantheon-dev-browser:reviewer");

    const h = buildHeaders({ method: "GET" });

    expect(h["Authorization"]).toBe("Bearer pantheon-dev-browser:reviewer");
  });

  it("does not inject dev bearer fallback in mock mode", () => {
    vi.stubEnv("VITE_BFF_MODE", "mock");
    vi.stubEnv("VITE_BFF_DEV_BEARER_TOKEN", "pantheon-dev-browser:reviewer");

    const h = buildHeaders({ method: "GET" });

    expect(h["Authorization"]).toBeUndefined();
  });
});
