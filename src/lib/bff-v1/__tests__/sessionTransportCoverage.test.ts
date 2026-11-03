import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  onBffUnauthorized,
  resetSessionTransportForTests,
} from "@/lib/auth/sessionExpiry";
import { bffFetch } from "@/lib/bff-v1/client";
import { strictLiveRead } from "@/lib/bff-v1/domainReads";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { liveOnlyRead } from "@/lib/bff-v1/management";
import {
  lookupCandidatePool,
  reviewCandidateMember,
} from "@/lib/bff-v1/agora/candidatePool";
import {
  actOnGovernedProposal,
  getGovernedProposal,
} from "@/lib/bff-v1/agora/governance";
import { getAgoraOperationalReadiness } from "@/lib/bff-v1/agora/operationalReadiness";
import { getStrategyPerformance } from "@/lib/bff-v1/agora/performance";
import {
  decideOnEvent,
  getTradingRoom,
} from "@/lib/bff-v1/agora/tradingRoom";
import {
  askManagementAi,
  fetchAssistantModeStatus,
} from "@/lib/bff-v1/managementAi";
import {
  getTradeJourney,
  subscribeTradeJourneys,
} from "@/lib/bff-v1/tradeJourneys";
import { fetchSse } from "@/lib/bff-v1/sse/liveSse";

const BFF_V1_ROOT = resolve(__dirname, "..");

function collectNonTestSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "mocks" || entry === "node_modules") {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectNonTestSourceFiles(fullPath));
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !entry.endsWith(".d.ts")
    ) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/.*$/gmu, "")
    .replace(/'(?:\\.|[^'\\])*'/gu, "''")
    .replace(/"(?:\\.|[^"\\])*"/gu, '""')
    .replace(/`(?:\\.|[^`\\])*`/gu, "``");
}

function findDirectFetchViolations(source: string): string[] {
  const cleaned = stripCommentsAndStrings(source);
  const violations: string[] = [];
  const pattern = /(?<!\bget\s+)(?<![.\w$])(?:(?:globalThis|window)\s*\.\s*)?fetch\s*\(/gu;
  for (const match of cleaned.matchAll(pattern)) {
    violations.push(match[0]);
  }
  return violations;
}

describe("session-aware transport coverage gate (FE-SESSION-EXPIRY-RENEWAL-20261103)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    resetSessionTransportForTests();
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_REAL_WRITES", "true");
    vi.stubEnv("VITE_BFF_BASE_URL", "https://api.dev.mvl-cap.tw");
    liveStatus._reset({
      mode: "live",
      effective: "live",
      baseUrl: "https://api.dev.mvl-cap.tw",
    });
  });

  afterEach(() => {
    resetSessionTransportForTests();
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    liveStatus._reset();
    vi.restoreAllMocks();
  });

  it("scans all non-test sources under src/lib/bff-v1 and fails on any direct fetch() that bypasses bffSessionFetch", () => {
    const files = collectNonTestSourceFiles(BFF_V1_ROOT);
    expect(files.length).toBeGreaterThan(15);

    const bypassingFiles: Array<{ file: string; matches: string[] }> = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const violations = findDirectFetchViolations(content);
      if (violations.length > 0) {
        bypassingFiles.push({
          file: relative(BFF_V1_ROOT, file),
          matches: violations,
        });
      }
    }

    expect(bypassingFiles).toEqual([]);

    // Prove the detector catches raw fetch() and globalThis.fetch() calls
    expect(findDirectFetchViolations('const res = await fetch("/bff/test");')).toHaveLength(1);
    expect(findDirectFetchViolations('const res = await globalThis.fetch("/bff/test");')).toHaveLength(1);
    expect(findDirectFetchViolations('const res = await bffSessionFetch("/bff/test");')).toHaveLength(0);
  });

  it("verifies all direct BFF caller modules import and invoke bffSessionFetch", () => {
    const requiredModules = [
      "client.ts",
      "agora/candidatePool.ts",
      "agora/governance.ts",
      "agora/operationalReadiness.ts",
      "agora/performance.ts",
      "agora/tradingRoom.ts",
      "managementAi.ts",
      "tradeJourneys.ts",
      "sse/liveSse.ts",
    ];

    for (const relPath of requiredModules) {
      const source = readFileSync(join(BFF_V1_ROOT, relPath), "utf8");
      expect(source, `${relPath} must import bffSessionFetch`).toContain("bffSessionFetch");
    }
  });

  it("routes bffFetch, strictLiveRead, and liveOnlyRead through single-flight refresh + retry on 401", async () => {
    let customCalls = 0;
    let strictCalls = 0;
    let liveOnlyCalls = 0;
    let refreshCalls = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/bff/auth/refresh")) {
        refreshCalls += 1;
        return new Response(
          JSON.stringify({
            data: {
              session: {
                authenticated: true,
                session_kind: "cookie",
                expires_at: "2026-11-03T06:30:00Z",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/bff/custom-read")) {
        customCalls += 1;
        if (customCalls === 1) {
          return new Response(JSON.stringify({ error: { code: "TOKEN_EXPIRED" } }), { status: 401 });
        }
        return new Response(JSON.stringify({ ok: true, source: "bffFetch" }), { status: 200 });
      }
      if (url.endsWith("/bff/strict-read")) {
        strictCalls += 1;
        if (strictCalls === 1) {
          return new Response(JSON.stringify({ error: { code: "TOKEN_EXPIRED" } }), { status: 401 });
        }
        return new Response(JSON.stringify({ data: { value: "strict-ok" } }), { status: 200 });
      }
      if (url.endsWith("/bff/live-only-read")) {
        liveOnlyCalls += 1;
        if (liveOnlyCalls === 1) {
          return new Response(JSON.stringify({ error: { code: "TOKEN_EXPIRED" } }), { status: 401 });
        }
        return new Response(JSON.stringify({ data: { value: "live-only-ok" } }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const customRes = await bffFetch<{ ok: boolean; source: string }>({
      method: "GET",
      path: "/bff/custom-read",
      mode: "live",
    });
    expect(customRes).toEqual({ ok: true, source: "bffFetch" });

    const strictRes = await strictLiveRead<{ value: string }>("test.strict", {
      method: "GET",
      path: "/bff/strict-read",
      mode: "live",
    });
    expect(strictRes).toEqual({ value: "strict-ok" });

    const liveOnlyRes = await liveOnlyRead<{ value: string }>(
      { method: "GET", path: "/bff/live-only-read", mode: "live" },
      (raw) => ((raw as { data?: { value: string } })?.data ?? null),
    );
    expect(liveOnlyRes).toEqual({ value: "live-only-ok" });

    expect(refreshCalls).toBe(3);
    expect(liveStatus.get().effective).toBe("live");
  });

  it("routes agora candidatePool, governance, operationalReadiness, performance, and tradingRoom through refresh + retry on 401", async () => {
    const attemptByKey = new Map<string, number>();
    const idempotencyByPath = new Map<string, string[]>();
    let refreshCount = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const path = new URL(url, "https://api.dev.mvl-cap.tw").pathname;
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${path}`;

      if (path === "/bff/auth/refresh") {
        refreshCount += 1;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (path === "/bff/me") {
        return new Response(
          JSON.stringify({
            data: {
              session: { authenticated: true, session_kind: "cookie" },
              environment: { name: "dev" },
            },
          }),
          { status: 200 },
        );
      }

      const headers = new Headers(init?.headers);
      const idem = headers.get("Idempotency-Key");
      if (idem) {
        const list = idempotencyByPath.get(key) ?? [];
        list.push(idem);
        idempotencyByPath.set(key, list);
      }

      const count = (attemptByKey.get(key) ?? 0) + 1;
      attemptByKey.set(key, count);
      if (count === 1) {
        return new Response(JSON.stringify({ error: { code: "TOKEN_EXPIRED" } }), { status: 401 });
      }

      if (path === "/bff/agora/candidate-pools/lookup") {
        return new Response(
          JSON.stringify({
            data: { pool: { pool_id: "pool-strategy-001" } },
          }),
          { status: 200 },
        );
      }
      if (path === "/bff/agora/candidate-pools/pool-1/members/mem-1/review") {
        return new Response(
          JSON.stringify({
            data: {
              member: {
                member_id: "mem-1",
                status: "approved",
              },
            },
          }),
          { status: 200 },
        );
      }
      if (path === "/bff/agora/proposals/prop-1") {
        return new Response(
          JSON.stringify({
            data: {
              proposal_id: "prop-1",
              revision: 1,
              state: "draft",
            },
          }),
          { status: 200, headers: { ETag: '"v1"' } },
        );
      }
      if (path === "/bff/agora/proposals/prop-1/actions") {
        return new Response(
          JSON.stringify({
            data: {
              proposal_id: "prop-1",
              revision: 2,
              state: "approved",
            },
          }),
          { status: 200, headers: { ETag: '"v2"' } },
        );
      }
      if (path === "/bff/agora/operational-readiness") {
        return new Response(
          JSON.stringify({
            data: {
              status: "ok",
              source: {
                snapshot_id: "snap-1",
                source_instance_id: "src-1",
                source_timestamp: "2026-11-03T05:00:00Z",
                age_seconds: 10,
                sla_seconds: 86400,
                freshness: "fresh",
                desired_state: "enabled",
                observed_state: "healthy",
                last_failure: null,
              },
              signal_producer: {
                status: "ok",
                producer_id: "prod-1",
                active_binding: "bind-1",
                consumed_snapshot_id: "snap-1",
                last_success_at: "2026-11-03T05:00:00Z",
                enqueued: 1,
                reason: "healthy",
              },
              surfaces: {
                signals: { status: "ok", count: 1, reason: "healthy", freshness: "fresh", cursor: "c1" },
                decision_events: { status: "ok", count: 1, reason: "healthy", freshness: "fresh", cursor: "c2" },
                candidates: { status: "ok", count: 1, reason: "healthy", freshness: "fresh", cursor: "c3" },
              },
              deployment: {
                service: "pantheon-bff",
                environment: "dev",
                source_commit_sha: "abc1234",
                bundle_version: "v1.13",
              },
            },
            meta: {
              snapshot_at: "2026-11-03T05:00:00Z",
              capability: "agora.operational_readiness.v1",
              requiredForAuthentication: false,
              no_order_route_proof: "agora_operational_readiness_read_only",
            },
          }),
          { status: 200 },
        );
      }
      if (path === "/bff/agora/trading-room/strategies/strat-1/performance") {
        const available = {
          status: "available" as const,
          as_of: "2026-11-03T05:00:00Z",
          source_ids: ["performance-projector"],
          reason: null,
        };
        return new Response(
          JSON.stringify({
            data: {
              strategy_id: "strat-1",
              period: "latest",
              environment: "paper",
              availability: "available",
              freshness: {
                status: "available",
                snapshot_at: "2026-11-03T05:01:00Z",
                as_of: "2026-11-03T05:00:00Z",
                source_watermarks: { performance_projector: "2026-11-03T05:00:00Z" },
                projection_revision: 5,
                projection_generation: 11,
                unavailable_sources: [],
              },
              compliance: { availability: available, metrics: [] },
              interventions: { availability: available, aggregate: { total: 0, by_status: {} }, items: [] },
              execution_history: { availability: available, items: [] },
              warnings: { availability: available, items: [] },
              adjustment_suggestions: { availability: available, items: [] },
              no_order_route_proof: "agora_performance_read_only",
            },
            meta: { capability: "agora.performance.truth.v1" },
          }),
          { status: 200 },
        );
      }
      if (path === "/bff/agora/trading-room" && method === "GET") {
        return new Response(
          JSON.stringify({
            data: {
              user_scope_ref: "operator-1",
              strategies: [
                {
                  strategy_id: "strat-1",
                  strategy_spec_registry_id: "reg-1",
                  title: "Alpha Momentum",
                  readiness_state: "ready",
                  monitoring_state: "monitoring",
                },
              ],
              queue_summary: { entry: 1, add: 0, reduce: 0, exit: 0, review: 0 },
              top_decision_events: [],
              position_summaries: [],
              risk_summary: { state: "normal", alerts: [] },
              snapshot_at: "2026-11-03T05:00:00Z",
              data_cutoff: "2026-11-03T05:00:00Z",
            },
          }),
          { status: 200 },
        );
      }
      if (path === "/bff/agora/trading-room/decision-events/evt-1/decisions" && method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              decision_id: "dec-1",
              decision_event_id: "evt-1",
              decision: "approve",
              recorded_at: "2026-11-03T05:00:00Z",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const poolId = await lookupCandidatePool({
      strategyId: "strat-001",
      strategyVersion: "registry-001",
    });
    expect(poolId).toBe("pool-strategy-001");

    const reviewed = await reviewCandidateMember("pool-1", "mem-1", {
      decision: "approve_for_monitoring",
      rationale: "Validated",
      reviewed_by: "op-1",
    });
    expect(reviewed).toBeDefined();
    const reviewIdems = idempotencyByPath.get("POST /bff/agora/candidate-pools/pool-1/members/mem-1/review");
    expect(reviewIdems).toHaveLength(2);
    expect(reviewIdems?.[0]).toBe(reviewIdems?.[1]);

    const proposal = await getGovernedProposal("prop-1");
    expect(proposal.proposal.proposal_id).toBe("prop-1");

    const acted = await actOnGovernedProposal(
      "prop-1",
      { action: "modify", reason: "tighten", proposed_value: { limit: 2 } },
      '"v1"',
    );
    expect(acted.etag).toBe('"v2"');

    const readiness = await getAgoraOperationalReadiness();
    expect(readiness.status).toBe("ok");

    const perf = await getStrategyPerformance("strat-1");
    expect(perf.data.strategy_id).toBe("strat-1");

    const room = await getTradingRoom();
    expect(room.strategies).toHaveLength(1);

    const decisionReceipt = await decideOnEvent(
      "evt-1",
      { decision: "approve", rationale: "Approved" },
      { idempotencyKey: "idem-evt-1", ifMatch: '"v1"', requestId: "req-evt-1" },
    );
    expect(decisionReceipt.decision_id).toBe("dec-1");
    const roomIdems = idempotencyByPath.get("POST /bff/agora/trading-room/decision-events/evt-1/decisions");
    expect(roomIdems).toHaveLength(2);
    expect(roomIdems?.[0]).toBe("idem-evt-1");
    expect(roomIdems?.[1]).toBe("idem-evt-1");

    expect(refreshCount).toBe(8);
  });

  it("routes managementAi, tradeJourneys, and liveSse fetchSse through refresh + retry on 401", async () => {
    const attempts = new Map<string, number>();
    const askIdempotencyKeys: string[] = [];
    let refreshCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const path = new URL(url, "https://api.dev.mvl-cap.tw").pathname;

      if (path === "/bff/auth/refresh") {
        refreshCount += 1;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      const headers = new Headers(init?.headers);
      const idem = headers.get("Idempotency-Key");
      if (path === "/bff/management/nl/ask" && idem) {
        askIdempotencyKeys.push(idem);
      }

      const count = (attempts.get(path) ?? 0) + 1;
      attempts.set(path, count);
      if (count === 1) {
        return new Response(JSON.stringify({ error: { code: "TOKEN_EXPIRED" } }), { status: 401 });
      }

      if (path === "/bff/assistant/mode") {
        return new Response(
          JSON.stringify({
            status: "ok",
            data: {
              mode: "business_read_only",
              available_modes: ["business_read_only"],
            },
          }),
          { status: 200 },
        );
      }
      if (path === "/bff/management/nl/ask") {
        return new Response(
          JSON.stringify({
            status: "ok",
            data: {
              answer: "Refreshed and answered",
              conversation_id: "conv-1",
            },
          }),
          { status: 200 },
        );
      }
      if (path === "/bff/management/trade-journeys/tj-1") {
        return new Response(
          JSON.stringify({
            data: {
              journey_id: "tj-1",
              symbol: "2330.TW",
            },
            meta: {},
          }),
          { status: 200 },
        );
      }
      if (path === "/bff/management/trade-journeys/events") {
        return new Response(
          'id: 4\nevent: journeys_changed\ndata: {"revision":4,"gap":false,"snapshot_refetch":true}\n\n',
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        );
      }
      if (path === "/bff/events/stream") {
        return new Response(
          'event: system.heartbeat\nid: evt-1\ndata: {"ok":true}\n\n',
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        );
      }
      return new Response("{}", { status: 404 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const mode = await fetchAssistantModeStatus();
    expect(mode).toBeDefined();

    const askRes = await askManagementAi({
      question: "Check readiness",
      context: "/management",
    });
    expect("answer" in askRes && askRes.answer).toBe("Refreshed and answered");
    expect(askIdempotencyKeys).toHaveLength(2);
    expect(askIdempotencyKeys[0]).toBe(askIdempotencyKeys[1]);

    const journey = await getTradeJourney("tj-1", {
      tenant_id: "tenant-a",
      environment: "paper",
    });
    expect(journey).toBeDefined();

    const onInvalidate = vi.fn();
    const onState = vi.fn();
    const unsubPoll = subscribeTradeJourneys(
      { tenant_id: "tenant-a", environment: "paper" },
      { onInvalidate, onState },
    );
    await vi.waitFor(() => {
      expect(onInvalidate).toHaveBeenCalledTimes(1);
    });
    expect(onState).toHaveBeenLastCalledWith("live");
    unsubPoll.close();

    const onSseMessage = vi.fn();
    const sseController = fetchSse({
      url: "https://api.dev.mvl-cap.tw/bff/events/stream",
      autoReconnect: false,
      fetchFn: fetchMock as typeof fetch,
      onMessage: onSseMessage,
    });
    await vi.waitFor(() => {
      expect(onSseMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "evt-1",
          event: "system.heartbeat",
        }),
      );
    });
    sseController.close();

    expect(refreshCount).toBe(5);
  });

  it("does not mark liveStatus as transport fallback when refresh fails on 401 in strictLiveRead", async () => {
    const unauthorizedListener = vi.fn();
    const off = onBffUnauthorized(unauthorizedListener);

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "TOKEN_EXPIRED", message: "expired" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;

    await expect(
      strictLiveRead("mgmt.humanInbox", {
        method: "GET",
        path: "/bff/management/human-inbox",
        mode: "live",
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(unauthorizedListener).toHaveBeenCalledTimes(1);
    expect(unauthorizedListener).toHaveBeenCalledWith({ confirmed: true });
    // Crucial for Acceptance #3: 401 must NOT flip liveStatus to fallback / Transport Unavailable
    expect(liveStatus.get().effective).toBe("live");
    off();
  });
});
