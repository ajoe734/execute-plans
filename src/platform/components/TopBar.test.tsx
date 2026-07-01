import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import { lists } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { mockMe } from "@/lib/v4/session/me";
import i18n from "@/i18n";
import { markRoutePrimaryReady, resetRoutePrimaryReadyForTests } from "@/platform/routePrimaryReady";

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function shellSummaryPayload(status: "ok" | "degraded" | "unavailable") {
  return {
    data: {
      counts: { pending_approvals: 4, open_alerts: 2, running_jobs: 1 },
      session: { operator_id: "op-1", roles: ["admin"] },
      transport: { bff_status: "ok", service: "operator-bff", api_version: "1.0" },
    },
    meta: {
      snapshot_at: "2026-07-01T00:00:00Z",
      surfaces: {
        shell_summary: { status, source: "bff_composed" },
      },
    },
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

  it("shows a degraded badge and still renders shell-summary counts when a source is degraded", async () => {
    globalThis.fetch = routedFetch({
      "/bff/management/shell-summary": () => jsonResponse(shellSummaryPayload("degraded")),
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
  });
});
