import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import { lists } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { mockMe } from "@/lib/v4/session/me";
import i18n from "@/i18n";
import { markRoutePrimaryReady, resetRoutePrimaryReadyForTests } from "@/platform/routePrimaryReady";
import { usePlatform } from "@/platform/store";

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function shellSummaryPayload(status: "ok" | "degraded" | "unavailable", source = "bff_composed") {
  return {
    data: {
      counts: { pending_approvals: 4, open_alerts: 2, running_jobs: 1 },
      session: { operator_id: "op-1", roles: ["admin"] },
      transport: { bff_status: "ok", service: "operator-bff", api_version: "1.0" },
    },
    meta: {
      snapshot_at: "2026-07-01T00:00:00Z",
      surfaces: {
        shell_summary: { status, source },
      },
    },
  };
}

function shellSummaryPayloadMulti(surfaces: Record<string, { status: string; source?: string }>) {
  return {
    data: {
      counts: { pending_approvals: 4, open_alerts: 2, running_jobs: 1 },
      session: { operator_id: "op-1", roles: ["admin"] },
      transport: { bff_status: "ok", service: "operator-bff", api_version: "1.0" },
    },
    meta: {
      snapshot_at: "2026-07-01T00:00:00Z",
      surfaces,
    },
  };
}

function liveListPayload(surfaceName: string, items: unknown[], source = "bff_composed") {
  return {
    items,
    meta: { surfaces: { [surfaceName]: { status: "ok", source } } },
  };
}

function degradedEnvelopeListPayload(surfaceName: string, items: unknown[], source = "bff_composed") {
  return {
    items,
    meta: { degradation: true, surfaces: { [surfaceName]: { source } } },
  };
}

function routedFetch(handlers: Record<string, () => Response>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.split("?")[0];
    for (const [key, handler] of Object.entries(handlers)) {
      if (path.endsWith(key)) return Promise.resolve(handler());
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
}

function renderTopBar() {
  return render(
    <MemoryRouter initialEntries={["/management"]}>
      <TopBar />
    </MemoryRouter>,
  );
}

describe("TopBar — shell-summary badge counts (MGMT-LOAD-003)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);
    resetRoutePrimaryReadyForTests();
    liveStatus._reset({ mode: "live", effective: "live" });
  });

  afterEach(async () => {
    cleanup();
    globalThis.fetch = realFetch;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetRoutePrimaryReadyForTests();
    liveStatus._reset();
    await i18n.changeLanguage("zh-TW");
  });

  it("renders live badge counts from a healthy shell-summary response, without fetching full lists", async () => {
    const approvalsSpy = vi.spyOn(lists, "approvals");
    const alertsSpy = vi.spyOn(lists, "alerts");
    const jobsSpy = vi.spyOn(lists, "jobs");
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayload("ok")),
      "/bff/me": () => jsonResponse(mockMe()),
      "/health": () => jsonResponse({ status: "ok" }),
    });

    renderTopBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTitle("Running work items")).toHaveTextContent("1");
    expect(screen.getByTitle("Pending Approvals")).toHaveTextContent("4");
    expect(screen.getByTitle("Open raw alerts")).toHaveTextContent("2");
    expect(screen.queryByText(/COUNTS UNAVAILABLE|SNAPSHOT DATA/)).not.toBeInTheDocument();
    expect(approvalsSpy).not.toHaveBeenCalled();
    expect(alertsSpy).not.toHaveBeenCalled();
    expect(jobsSpy).not.toHaveBeenCalled();
  });

  it("does not render the retired global environment selector", async () => {
    usePlatform.getState().setEnv("paper");
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayload("ok")),
      "/bff/me": () => jsonResponse(mockMe()),
      "/health": () => jsonResponse({ status: "ok" }),
    });

    renderTopBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByRole("button", { name: /^Paper$/i })).not.toBeInTheDocument();
  });

  it("badges a degraded-but-live surface (bff_composed) as LIVE (partially degraded), not SNAPSHOT DATA", async () => {
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayload("degraded", "bff_composed")),
      "/bff/me": () => jsonResponse(mockMe()),
      "/health": () => jsonResponse({ status: "ok" }),
    });

    renderTopBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByText("SNAPSHOT DATA")).not.toBeInTheDocument();
    const badge = screen.getByText("LIVE (PARTIALLY DEGRADED)");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Degraded surfaces: shell_summary");
  });

  it("badges a degraded surface sourced from service_client as LIVE (partially degraded) too", async () => {
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayload("degraded", "service_client")),
      "/bff/me": () => jsonResponse(mockMe()),
      "/health": () => jsonResponse({ status: "ok" }),
    });

    renderTopBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("LIVE (PARTIALLY DEGRADED)")).toBeInTheDocument();
  });

  it("keeps the SNAPSHOT DATA badge for a genuinely snapshot-sourced surface", async () => {
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayload("degraded", "local_snapshot")),
      "/bff/me": () => jsonResponse(mockMe()),
      "/health": () => jsonResponse({ status: "ok" }),
    });

    renderTopBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("SNAPSHOT DATA")).toBeInTheDocument();
  });

  it("classifies a production-shaped degraded shell-summary payload (service_store/bff_cheap_count child surfaces) as LIVE (partially degraded), not SNAPSHOT DATA", async () => {
    // Matches the real BFF contract shape (see
    // services/control-plane/bff/test_mgmt_load_002_shell_summary.py):
    // pending_approvals/running_jobs are sourced from service_store and
    // open_alerts from bff_cheap_count — both live pathways, not snapshot
    // signals, even though neither is bff_composed/service_client.
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayloadMulti({
        shell_summary: { status: "degraded", source: "bff_composed" },
        pending_approvals: { status: "degraded", source: "service_store" },
        open_alerts: { status: "degraded", source: "bff_cheap_count" },
        running_jobs: { status: "ok", source: "service_store" },
      })),
      "/bff/me": () => jsonResponse(mockMe()),
      "/health": () => jsonResponse({ status: "ok" }),
    });

    renderTopBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByText("SNAPSHOT DATA")).not.toBeInTheDocument();
    const badge = screen.getByText("LIVE (PARTIALLY DEGRADED)");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Degraded surfaces: shell_summary, pending_approvals, open_alerts");
  });

  it("treats an explicit snapshot source on the primary shell_summary surface as SNAPSHOT DATA even when its own status reports ok", async () => {
    // The primary surface's status gates entry into the classifier
    // (shellSummaryStatus reads only surfaces.shell_summary.status), but the
    // classifier itself — not that top-level status — must decide the
    // badge. An inconsistent payload (status: ok, source: local_snapshot) on
    // the primary surface must not bypass classification and render live.
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayload("ok", "local_snapshot")),
      "/bff/me": () => jsonResponse(mockMe()),
      "/health": () => jsonResponse({ status: "ok" }),
    });

    renderTopBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("SNAPSHOT DATA")).toBeInTheDocument();
  });

  it("defers to the full-list fallback only after shell-summary reports unavailable, on an idle callback", async () => {
    const approvalsSpy = vi.spyOn(lists, "approvals");
    const alertsSpy = vi.spyOn(lists, "alerts");
    const jobsSpy = vi.spyOn(lists, "jobs");
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayload("unavailable")),
      "/bff/approvals": () => jsonResponse(liveListPayload("approvals", [{ id: "a1", state: "pending" }])),
      "/bff/alerts": () => jsonResponse(liveListPayload("alerts", [{ id: "al1", acknowledged: false }])),
      "/bff/me": () => jsonResponse(mockMe()),
      "/health": () => jsonResponse({ status: "ok" }),
    });

    renderTopBar();

    // Immediately after shell-summary resolves: honest "unavailable" state,
    // full-list reads not yet issued.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("COUNTS UNAVAILABLE")).toBeInTheDocument();
    expect(approvalsSpy).not.toHaveBeenCalled();
    expect(alertsSpy).not.toHaveBeenCalled();
    expect(jobsSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(approvalsSpy).not.toHaveBeenCalled();
    expect(alertsSpy).not.toHaveBeenCalled();

    // Route-primary-ready releases the fallback; only then does the idle
    // callback perform the heavier full-list reads.
    act(() => {
      markRoutePrimaryReady("/management");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(approvalsSpy).toHaveBeenCalledTimes(1);
    expect(alertsSpy).toHaveBeenCalledTimes(1);
    // TopBar's fallback deliberately never reads the jobs list itself:
    // JobProgressDrawer already owns the one jobs-list hydration for the
    // shell (its own idle-callback effect, unconditional on mount), so a
    // second independent read here would duplicate `/bff/jobs` — exactly
    // what MGMT-LOAD-003 exists to prevent.
    expect(jobsSpy).not.toHaveBeenCalled();

    // The full-list envelopes themselves classified as live (bff_composed,
    // status ok) — recovering through the heavier fallback path because
    // shell-summary was unavailable does not make this a snapshot; it must
    // badge LIVE (partially degraded), naming shell_summary as the reason
    // the fallback ran.
    expect(screen.queryByText("SNAPSHOT DATA")).not.toBeInTheDocument();
    const badge = screen.getByText("LIVE (PARTIALLY DEGRADED)");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Degraded surfaces: shell_summary");
  });

  it("classifies a live full-list envelope with envelope-level degradation as live-degraded, not snapshot", async () => {
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayload("unavailable")),
      "/bff/approvals": () => jsonResponse(degradedEnvelopeListPayload("approvals", [{ id: "a1", state: "pending" }])),
      "/bff/alerts": () => jsonResponse(degradedEnvelopeListPayload("alerts", [{ id: "al1", acknowledged: false }])),
      "/bff/me": () => jsonResponse(mockMe()),
      "/health": () => jsonResponse({ status: "ok" }),
    });

    renderTopBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      markRoutePrimaryReady("/management");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    // Envelope-level `meta.degradation` flags every surface, but each
    // surface here still names a recognized live source (bff_composed) —
    // that must resolve to live-degraded, not an outright SNAPSHOT DATA
    // short-circuit on the envelope-wide flag alone.
    expect(screen.queryByText("SNAPSHOT DATA")).not.toBeInTheDocument();
    const badge = screen.getByText("LIVE (PARTIALLY DEGRADED)");
    expect(badge).toBeInTheDocument();
    // shell_summary is what triggered this full-list fallback in the first
    // place; it must stay named alongside the list envelopes' own degraded
    // surfaces, not get dropped from the tooltip.
    expect(badge).toHaveAttribute("title", "Degraded surfaces: approvals, alerts, shell_summary");
  });

  it("treats an explicit snapshot source as SNAPSHOT DATA even when that surface reports status ok", async () => {
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayloadMulti({
        // Degraded shell_summary gate is what routes into
        // classifyShellSummarySurfaces at all.
        shell_summary: { status: "degraded", source: "bff_composed" },
        // Inconsistent payload: status ok, but an explicit snapshot source.
        // The explicit source must dominate and still be treated as
        // degraded/snapshot, not silently skipped as live.
        approvals: { status: "ok", source: "local_snapshot" },
      })),
      "/bff/me": () => jsonResponse(mockMe()),
      "/health": () => jsonResponse({ status: "ok" }),
    });

    renderTopBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const badge = screen.getByText("SNAPSHOT DATA");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Degraded surfaces: shell_summary, approvals");
  });
});
