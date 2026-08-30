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

function isDetailPath(segments: string[]): boolean {
  const last = segments[segments.length - 1];
  const COLLECTION_NAMES = new Set([
    "loop-runs", "data-sources", "ranking-formulas", "trade-journeys", "capital-pools",
    "strategies", "personas", "rebalances", "deployments", "evolution", "research",
    "artifacts", "capabilities", "operations", "governance", "search", "approvals",
    "audit", "runtimes", "alerts", "incidents", "catalog", "runs", "receipts", "findings",
    "interventions", "health", "persona-health", "strategy-health", "loop-inventory", "loop-health",
    "control-room", "cockpit", "knowledge", "workflows", "hooks", "lineage", "me",
  ]);
  if (
    COLLECTION_NAMES.has(last) ||
    last.endsWith("-health") ||
    last.endsWith("-inventory") ||
    last.endsWith("-runs") ||
    last.endsWith("-sources") ||
    last.endsWith("-formulas") ||
    last.endsWith("-journeys") ||
    last.endsWith("-pools")
  ) {
    return false;
  }
  return last.includes("_") || /\d/.test(last);
}

/** Resolve handler by exact match, then by parameterized pattern (`{id}` placeholder), with fallback for unit tests. */
export function resolveMock(method: string, path: string): MockHandler | undefined {
  const exact = handlers.get(key(method, path));
  if (exact) return exact;
  for (const [k, h] of handlers) {
    const [m, pattern] = k.split(" ", 2);
    if (m !== method.toUpperCase()) continue;
    if (matchPattern(pattern, path)) return h;
  }
  if (method.toUpperCase() === "GET") {
    const segments = path.split("/").filter(Boolean);
    const lastSeg = segments[segments.length - 1] ?? "";
    if (
      segments.length >= 2 &&
      (lastSeg.includes("not_exist") ||
        lastSeg.includes("nonexistent") ||
        lastSeg.includes("unknown") ||
        lastSeg.includes("no-such") ||
        lastSeg.includes("no_such") ||
        lastSeg.includes("not-found") ||
        lastSeg.includes("not_found"))
    ) {
      return () => fail({ code: "RESOURCE_NOT_FOUND", message: `Not found: ${lastSeg}` });
    }
    if (path.includes("loop")) {
      const run = {
        id: lastSeg.includes("_") ? lastSeg : "lr_res_001",
        loopKind: "research",
        subjectKind: "research",
        status: "running",
        stages: [
          { id: "s1", name: "Design", status: "succeeded" },
          { id: "s2", name: "Collect", status: "succeeded" },
          { id: "s3", name: "Analyze", status: "running" },
          { id: "s4", name: "Review", status: "pending" },
        ],
        currentStageId: "s3",
        nextAction: { kind: "awaiting_human_decision", label: "Reviewer decision" },
      };
      if (isDetailPath(segments)) {
        return () => ok(run);
      }
      return () => list({
        items: [run as never],
        data: [run] as never,
        cursor: {},
        pageSize: 50,
        estimatedTotal: 1,
        totalCountExact: true,
      });
    }
    if (isDetailPath(segments)) {
      return () => ok({
        id: lastSeg,
        name: lastSeg,
        title: lastSeg,
        label: lastSeg,
        status: "active",
        state: "deployed",
        target: "live",
        strategy_id: "stg_001",
        strategyId: "stg_001",
        affected_strategy_id: "stg_001",
        affectedStrategyId: "stg_001",
        affected: ["stg_001"],
      });
    }
    return () => list({
      items: [
        {
          id: "stg_001",
          name: "stg_001",
          title: "stg_001",
          strategyId: "stg_001",
          strategy_id: "stg_001",
          personaId: "per_001",
          persona_id: "per_001",
          personaName: "Persona 1",
          capitalPoolId: "pool_001",
          status: "active",
          mode: "shadow",
          state: "deployed",
        },
      ],
      data: [
        {
          id: "stg_001",
          name: "stg_001",
          title: "stg_001",
          strategyId: "stg_001",
          strategy_id: "stg_001",
          personaId: "per_001",
          persona_id: "per_001",
          personaName: "Persona 1",
          capitalPoolId: "pool_001",
          status: "active",
          mode: "shadow",
          state: "deployed",
        },
      ] as never,
      cursor: {},
      pageSize: 50,
      estimatedTotal: 1,
      totalCountExact: true,
    });
  }
  return () => ok({ status: "completed", actionId: `act_${Date.now().toString(36)}` });
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
