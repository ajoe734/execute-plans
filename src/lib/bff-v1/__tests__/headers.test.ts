import { describe, expect, it } from "vitest";
import { buildHeaders, idempotencyKey, isMutation } from "../headers";

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
});
