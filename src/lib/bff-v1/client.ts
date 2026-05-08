// BFF Contract v1 — typed fetch client with mock/live mode switch.
// Frozen contract source: .lovable/feedback/2026-05-07-final/

import { buildHeaders, isMutation, BFF_API_VERSION } from "./headers";
import { BffError, isBffErrorEnvelope, makeBffError } from "./errors";
import { bootstrapMockAdapters } from "./mocks/adapters";
import { resolveMock } from "./mocks/registry";
import { liveStatus } from "./liveStatus";

export type BffMode = "mock" | "live";

function detectMode(): BffMode {
  try {
    // Vite-style env access; defaults to mock.
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const v = env?.VITE_BFF_MODE;
    return v === "live" ? "live" : "mock";
  } catch {
    return "mock";
  }
}

function detectBaseUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_BFF_BASE_URL ?? "";
  } catch {
    return "";
  }
}

export interface BffRequest {
  method: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Override generated Idempotency-Key. */
  idempotencyKey?: string;
  ifMatchVersion?: number | string;
  locale?: string;
  /** Override mode for this single call (testing). */
  mode?: BffMode;
  /** Override base URL for live mode. */
  baseUrl?: string;
  signal?: AbortSignal;
}

export interface BffSuccess<T = unknown> {
  ok: true;
  status: number;
  data: T;
}

export type BffResult<T = unknown> = BffSuccess<T> | { ok: false; error: BffError };

function buildQuery(query?: BffRequest["query"]): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Throws BffError on non-2xx, returns parsed JSON on 2xx. */
export async function bffFetch<T = unknown>(req: BffRequest): Promise<T> {
  const mode = req.mode ?? detectMode();
  const headers = buildHeaders({
    method: req.method,
    locale: req.locale,
    idempotency: req.idempotencyKey,
    ifMatchVersion: req.ifMatchVersion,
    extra: req.headers,
  });

  if (mode === "mock") {
    bootstrapMockAdapters();
    const handler = resolveMock(req.method, req.path);
    if (!handler) {
      throw makeBffError({
        code: "RESOURCE_NOT_FOUND",
        message: `No mock for ${req.method} ${req.path}`,
        correlationId: headers["X-Request-Id"],
      });
    }
    const result = await handler({
      method: req.method.toUpperCase(),
      path: req.path,
      query: normaliseQuery(req.query),
      headers,
      body: req.body,
    });
    if (result.kind === "error") throw result.error;
    return result.body as T;
  }

  // live mode
  const url = `${req.baseUrl ?? detectBaseUrl()}${req.path}${buildQuery(req.query)}`;
  const init: RequestInit = {
    method: req.method.toUpperCase(),
    headers,
    signal: req.signal,
  };
  if (isMutation(req.method) && req.body !== undefined) {
    init.body = JSON.stringify(req.body);
  }
  const res = await fetch(url, init);
  // H1+ — record server-advertised api version (if any) for mismatch detection.
  liveStatus.reportApiVersion(res.headers.get("X-BFF-Api-Version") ?? undefined, BFF_API_VERSION);
  // Planner §E7 — record echoed X-Request-Id / X-Correlation-Id for debugging.
  liveStatus.reportRequestIds(
    res.headers.get("X-Request-Id") ?? undefined,
    res.headers.get("X-Correlation-Id") ?? undefined,
  );
  const text = await res.text();
  const json: unknown = text ? safeJson(text) : undefined;
  if (!res.ok) {
    if (isBffErrorEnvelope(json)) {
      throw new BffError(res.status, json);
    }
    throw makeBffError({
      code: "UNKNOWN_ERROR",
      message: `HTTP ${res.status}`,
      correlationId: headers["X-Request-Id"],
    });
  }
  return json as T;
}

function normaliseQuery(q?: BffRequest["query"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!q) return out;
  for (const [k, v] of Object.entries(q)) if (v !== undefined) out[k] = String(v);
  return out;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Result-style wrapper; never throws. */
export async function bffRequest<T = unknown>(req: BffRequest): Promise<BffResult<T>> {
  try {
    const data = await bffFetch<T>(req);
    return { ok: true, status: 200, data };
  } catch (err) {
    if (err instanceof BffError) return { ok: false, error: err };
    const wrapped = makeBffError({ code: "UNKNOWN_ERROR", message: (err as Error).message });
    return { ok: false, error: wrapped };
  }
}

export const bffV1 = {
  fetch: bffFetch,
  request: bffRequest,
  detectMode,
};
