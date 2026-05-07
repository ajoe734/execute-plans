// BFF Contract v1 — Mock-mode adapter registry.
// Maps `${METHOD} ${path}` to a handler that returns CommandResponse / ListEnvelope
// or throws BffError. Uses existing src/lib/bff/* mocks where possible.

import type { CommandResponse, ListEnvelope } from "../dto";
import { BffError, makeBffError } from "../errors";

export type MockResponse =
  | { kind: "json"; status: number; body: unknown }
  | { kind: "error"; error: BffError };

export type MockHandler = (req: MockRequest) => MockResponse | Promise<MockResponse>;

export interface MockRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

const handlers = new Map<string, MockHandler>();

function key(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

export function registerMock(method: string, pathPattern: string, handler: MockHandler): void {
  handlers.set(key(method, pathPattern), handler);
}

/** Resolve handler by exact match, then by parameterized pattern (`{id}` placeholder). */
export function resolveMock(method: string, path: string): MockHandler | undefined {
  const exact = handlers.get(key(method, path));
  if (exact) return exact;
  for (const [k, h] of handlers) {
    const [m, pattern] = k.split(" ", 2);
    if (m !== method.toUpperCase()) continue;
    if (matchPattern(pattern, path)) return h;
  }
  return undefined;
}

function matchPattern(pattern: string, path: string): boolean {
  const p = pattern.split("/");
  const u = path.split("/");
  if (p.length !== u.length) return false;
  return p.every((seg, i) => seg.startsWith("{") || seg === u[i]);
}

// ---------- Convenience helpers for adapters ----------

export function ok<T>(data: T, extra?: Partial<CommandResponse<T>>): MockResponse {
  const body: CommandResponse<T> = {
    ok: true,
    data,
    correlationId: extra?.correlationId ?? `corr_${Math.random().toString(36).slice(2, 10)}`,
    ...extra,
  };
  return { kind: "json", status: 200, body };
}

export function list<T>(envelope: ListEnvelope<T>): MockResponse {
  return { kind: "json", status: 200, body: envelope };
}

export function fail(error: Parameters<typeof makeBffError>[0]): MockResponse {
  return { kind: "error", error: makeBffError(error) };
}

export function clearMocks(): void {
  handlers.clear();
}
