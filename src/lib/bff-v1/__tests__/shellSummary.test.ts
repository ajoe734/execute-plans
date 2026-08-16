import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchShellSummary, shellSummaryStatus } from "@/lib/bff-v1/shellSummary";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

const realFetch = globalThis.fetch;

function okResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function liveShellSummaryPayload(overrides: Partial<{ status: string }> = {}) {
  return {
    data: {
      counts: { pending_approvals: 3, open_alerts: 1, running_jobs: 2 },
      session: { operator_id: "op-1", roles: ["admin"] },
      transport: { bff_status: "ok", service: "operator-bff", api_version: "1.0" },
    },
    meta: {
      snapshot_at: "2026-07-01T00:00:00Z",
      surfaces: {
        shell_summary: { status: overrides.status ?? "ok", source: "bff_composed" },
        pending_approvals: { status: "ok", source: "service_store" },
        open_alerts: { status: "ok", source: "bff_cheap_count" },
        running_jobs: { status: "ok", source: "service_store" },
      },
    },
  };
}

describe("fetchShellSummary — mock mode", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  it("returns zeroed counts and an unknown surface without calling fetch", async () => {
    liveStatus._reset({ mode: "mock", effective: "mock" });
    const spy = vi.fn();
    globalThis.fetch = spy;

    const summary = await fetchShellSummary();

    expect(summary.counts).toEqual({ pendingApprovals: 0, openAlerts: 0, runningJobs: 0 });
    expect(shellSummaryStatus(summary)).toBe("unknown");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("fetchShellSummary — live mode", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  it("adapts a healthy live response into camelCase counts", async () => {
    liveStatus._reset({ mode: "live", effective: "live" });
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse(liveShellSummaryPayload()));

    const summary = await fetchShellSummary();

    expect(summary.counts).toEqual({ pendingApprovals: 3, openAlerts: 1, runningJobs: 2 });
    expect(shellSummaryStatus(summary)).toBe("ok");
    expect(summary.session.operator_id).toBe("op-1");
    expect(summary.transport.bff_status).toBe("ok");
  });

  it("surfaces a degraded shell_summary status without throwing", async () => {
    liveStatus._reset({ mode: "live", effective: "live" });
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse(liveShellSummaryPayload({ status: "degraded" })));

    const summary = await fetchShellSummary();

    expect(shellSummaryStatus(summary)).toBe("degraded");
    expect(summary.counts.pendingApprovals).toBe(3);
  });

  it("falls back to mock data (unknown surface) on a transport failure, without flipping the shared liveStatus signal", async () => {
    liveStatus._reset({ mode: "live", effective: "live" });
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("network error"));

    const summary = await fetchShellSummary();

    expect(shellSummaryStatus(summary)).toBe("unknown");
    expect(summary.counts).toEqual({ pendingApprovals: 0, openAlerts: 0, runningJobs: 0 });
    // Other live reads (full approvals/alerts/jobs) may still be healthy —
    // this narrow badge-count read must not mask that by reporting through
    // the shared transport signal (which would also spuriously re-trigger
    // every effect keyed on it, double-fetching on transient blips).
    expect(liveStatus.get().effective).toBe("live");
  });
});
