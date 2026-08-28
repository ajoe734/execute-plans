import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BffError } from "../errors";
import { getAgoraOperationalReadiness } from "./operationalReadiness";

const BASE = "https://bff.example.test";

function readinessEnvelope(overrides: Record<string, unknown> = {}) {
  const data = {
    status: "ok",
    source: {
      snapshot_id: "snapshot-twse-001",
      source_instance_id: "source-twse-daily",
      source_timestamp: "2026-08-27T06:00:00Z",
      age_seconds: 120,
      sla_seconds: 86400,
      freshness: "fresh",
      desired_state: "enabled",
      observed_state: "healthy",
      last_failure: null,
    },
    signal_producer: {
      status: "ok",
      producer_id: "paper-signal-producer",
      active_binding: "binding-paper-twse",
      consumed_snapshot_id: "snapshot-twse-001",
      last_success_at: "2026-08-27T06:01:00Z",
      enqueued: 3,
      reason: "healthy",
    },
    surfaces: {
      signals: { status: "ok", count: 3, reason: "healthy", freshness: "fresh", cursor: "signal-3" },
      decision_events: { status: "ok", count: 1, reason: "healthy", freshness: "fresh", cursor: "event-1" },
      candidates: { status: "ok", count: 3, reason: "healthy", freshness: "fresh", cursor: "candidate-3" },
    },
    deployment: {
      service: "pantheon-bff",
      environment: "dev",
      source_commit_sha: "b9b1b922",
      bundle_version: "v1.13",
    },
  };
  return {
    data: { ...data, ...overrides },
    meta: {
      snapshot_at: "2026-08-27T06:02:00Z",
      capability: "agora.operational_readiness.v1",
      requiredForAuthentication: false,
      no_order_route_proof: "agora_operational_readiness_read_only",
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_BFF_BASE_URL", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Agora operational readiness client", () => {
  it("reads source snapshot, producer identity, and downstream reasons with GET only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(readinessEnvelope()));
    vi.stubGlobal("fetch", fetchMock);

    const readiness = await getAgoraOperationalReadiness();

    expect(readiness.source).toMatchObject({
      snapshot_id: "snapshot-twse-001",
      source_instance_id: "source-twse-daily",
      freshness: "fresh",
    });
    expect(readiness.signal_producer).toMatchObject({
      producer_id: "paper-signal-producer",
      active_binding: "binding-paper-twse",
      consumed_snapshot_id: "snapshot-twse-001",
    });
    expect(readiness.surfaces.decision_events).toMatchObject({ status: "ok", count: 1 });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/bff/agora/operational-readiness`);
    expect(request.method).toBe("GET");
    expect(request.credentials).toBe("include");
    expect(request.body).toBeUndefined();
    expect(request.headers).not.toMatchObject({
      "If-Match": expect.anything(),
      "Idempotency-Key": expect.anything(),
    });
  });

  it("keeps stale, empty_fresh, and unavailable readiness distinct", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(readinessEnvelope({
        status: "degraded",
        source: { ...readinessEnvelope().data.source, freshness: "stale", age_seconds: 90000 },
        signal_producer: { ...readinessEnvelope().data.signal_producer, status: "degraded", reason: "source_snapshot_stale" },
      })))
      .mockResolvedValueOnce(jsonResponse(readinessEnvelope({
        status: "empty_fresh",
        source: { ...readinessEnvelope().data.source, freshness: "empty_fresh" },
        signal_producer: { ...readinessEnvelope().data.signal_producer, status: "empty_fresh", enqueued: 0, reason: "rule_evaluation_zero_signals" },
      })))
      .mockResolvedValueOnce(jsonResponse(readinessEnvelope({
        status: "unavailable",
        source: { ...readinessEnvelope().data.source, snapshot_id: null, freshness: "unavailable", age_seconds: null },
        signal_producer: { ...readinessEnvelope().data.signal_producer, status: "unavailable", reason: "source_unavailable" },
      })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAgoraOperationalReadiness()).resolves.toMatchObject({
      status: "degraded",
      source: { freshness: "stale" },
      signal_producer: { reason: "source_snapshot_stale" },
    });
    await expect(getAgoraOperationalReadiness()).resolves.toMatchObject({
      status: "empty_fresh",
      source: { freshness: "empty_fresh" },
      signal_producer: { reason: "rule_evaluation_zero_signals" },
    });
    await expect(getAgoraOperationalReadiness()).resolves.toMatchObject({
      status: "unavailable",
      source: { freshness: "unavailable" },
      signal_producer: { reason: "source_unavailable" },
    });
  });

  it("fails closed if the route does not prove it is read-only and non-auth-critical", async () => {
    const missingProof = readinessEnvelope();
    missingProof.meta.no_order_route_proof = "agora_order_route";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(missingProof)));

    await expect(getAgoraOperationalReadiness()).rejects.toMatchObject({
      code: "BACKEND_UNAVAILABLE",
      status: 502,
    });
  });

  it("preserves typed BFF errors instead of inventing a readiness state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "BACKEND_UNAVAILABLE", message: "readiness projection offline" },
    }, 503)));

    const request = getAgoraOperationalReadiness();
    await expect(request).rejects.toBeInstanceOf(BffError);
    await expect(request).rejects.toMatchObject({
      code: "BACKEND_UNAVAILABLE",
      status: 503,
    });
  });
});
