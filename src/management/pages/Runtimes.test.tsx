import { cleanup, configure, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { RuntimeListItem } from "@/lib/bff-v1";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { RuntimesPage } from "./Runtimes";

configure({
  getElementError: (message) => new Error(message ?? "Element not found"),
});

const mocks = vi.hoisted(() => ({
  useLiveListV1: vi.fn(),
  runActionSafe: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    useLiveListV1: mocks.useLiveListV1,
    runActionSafe: mocks.runActionSafe,
  };
});

void i18n.changeLanguage("en-US");

class MockPointerEvent extends MouseEvent {
  pointerId?: number;
  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 1;
  }
}
if (typeof window !== "undefined") {
  window.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}

function renderRuntimes(initialEntry: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/runtimes" element={<RuntimesPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("RuntimesPage", () => {
  const originalRealWrites = process.env.VITE_BFF_REAL_WRITES;

  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    mocks.useLiveListV1.mockReset();
    mocks.runActionSafe.mockReset();
    delete process.env.VITE_BFF_REAL_WRITES;
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    if (originalRealWrites !== undefined) {
      process.env.VITE_BFF_REAL_WRITES = originalRealWrites;
    } else {
      delete process.env.VITE_BFF_REAL_WRITES;
    }
  });

  it("focuses live runtime binding rows and renders missing telemetry as nan", () => {
    const rows: RuntimeListItem[] = [{
      id: "rt-rescue-0260528-5937dea1",
      name: "rt-rescue-0260528-5937dea1",
      kind: "paper" as RuntimeListItem["kind"],
      env: "paper",
      status: "active",
      cpu: Number.NaN,
      memory: Number.NaN,
      latencyP95Ms: Number.NaN,
      uptimePct: Number.NaN,
      region: "",
      updatedAt: "",
      runtimeId: "rt-rescue-0260528-5937dea1",
      runtimeBindingId: "rb-433f2a614995432b9e7a463c882dbefb",
      personaId: "persona-20260528-5937dea1",
    }];
    mocks.useLiveListV1.mockReturnValue({
      items: rows,
      refresh: vi.fn(),
    });

    renderRuntimes("/management/runtimes?persona=persona-20260528-5937dea1&runtime=rt-rescue-0260528-5937dea1&binding=rb-433f2a614995432b9e7a463c882dbefb");

    expect(screen.getByText(/Focused persona: persona-20260528-5937dea1/)).toBeInTheDocument();
    expect(screen.getByText("rt-rescue-0260528-5937dea1")).toBeInTheDocument();
    expect(screen.getByText("rb-433f2a614995432b9e7a463c882dbefb")).toBeInTheDocument();
    expect(screen.getByText("persona-20260528-5937dea1")).toBeInTheDocument();
    expect(screen.getAllByText("nan").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("0ms")).not.toBeInTheDocument();
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();
    const journeysLink = screen.getByRole("link", { name: "persona-20260528-5937dea1 trade journeys" });
    expect(journeysLink).toHaveAttribute(
      "href",
      "/management/trade-journeys?persona_id=persona-20260528-5937dea1&return_to=%2Fmanagement%2Fruntimes%3Fpersona%3Dpersona-20260528-5937dea1%26runtime%3Drt-rescue-0260528-5937dea1%26binding%3Drb-433f2a614995432b9e7a463c882dbefb&return_label=Runtimes",
    );
  });

  it("does not fall back to unrelated runtime rows when focus misses", () => {
    const rows: RuntimeListItem[] = [{
      id: "rt-other",
      name: "rt-other",
      kind: "executor" as RuntimeListItem["kind"],
      env: "live",
      status: "active",
      cpu: 0.1,
      memory: 0.2,
      latencyP95Ms: 15,
      uptimePct: 99.9,
      region: "ap-northeast-1",
      updatedAt: "",
      runtimeId: "rt-other",
      runtimeBindingId: "rb-other",
      personaId: "persona-other",
    }];
    mocks.useLiveListV1.mockReturnValue({
      items: rows,
      refresh: vi.fn(),
      loading: false,
    });

    renderRuntimes("/management/runtimes?persona=persona-tw&runtime=rt-tw&binding=rb-tw");

    expect(screen.getByText("No runtime row declares persona persona-tw / runtime rt-tw / binding rb-tw.")).toBeInTheDocument();
    expect(screen.getByText("No runtime rows.")).toBeInTheDocument();
    expect(screen.queryByText("rt-other")).not.toBeInTheDocument();
    expect(screen.queryByText("persona-other")).not.toBeInTheDocument();
  });

  it("disables all runtime action controls when VITE_BFF_REAL_WRITES is false (read-only dev profile)", () => {
    process.env.VITE_BFF_REAL_WRITES = "false";
    const rows: RuntimeListItem[] = [{
      id: "rt-prod-01",
      name: "rt-prod-01",
      kind: "live" as RuntimeListItem["kind"],
      env: "live",
      status: "active",
      cpu: 0.2,
      memory: 0.4,
      latencyP95Ms: 25,
      uptimePct: 99.95,
      region: "ap-northeast-1",
      updatedAt: "2026-08-23T12:00:00Z",
      runtimeId: "rt-prod-01",
      runtimeBindingId: "rb-prod-01",
      personaId: "persona-alpha",
    }];
    mocks.useLiveListV1.mockReturnValue({
      items: rows,
      refresh: vi.fn(),
      loading: false,
    });

    renderRuntimes("/management/runtimes");

    const actionBtn = screen.getByRole("button", { name: "Runtime actions" });
    expect(actionBtn).toBeDisabled();
    expect(actionBtn).toHaveAttribute("title", "Disabled until this action is backed by a governed command endpoint, command id, audit receipt, and dry-run/no-side-effect proof.");
    expect(mocks.runActionSafe).not.toHaveBeenCalled();
  });

  it("enables runtime action controls and executes restart mutation when VITE_BFF_REAL_WRITES is true", async () => {
    process.env.VITE_BFF_REAL_WRITES = "true";
    const refreshMock = vi.fn();
    mocks.runActionSafe.mockResolvedValue({ ok: true });
    const rows: RuntimeListItem[] = [{
      id: "rt-prod-01",
      name: "rt-prod-01",
      kind: "live" as RuntimeListItem["kind"],
      env: "live",
      status: "active",
      cpu: 0.2,
      memory: 0.4,
      latencyP95Ms: 25,
      uptimePct: 99.95,
      region: "ap-northeast-1",
      updatedAt: "2026-08-23T12:00:00Z",
      runtimeId: "rt-prod-01",
      runtimeBindingId: "rb-prod-01",
      personaId: "persona-alpha",
    }];
    mocks.useLiveListV1.mockReturnValue({
      items: rows,
      refresh: refreshMock,
      loading: false,
    });

    renderRuntimes("/management/runtimes");

    const actionBtn = screen.getByRole("button", { name: "Runtime actions" });
    expect(actionBtn).toBeEnabled();
    expect(actionBtn).not.toHaveAttribute("title");

    const { fireEvent, waitFor } = await import("@testing-library/react");
    actionBtn.focus();
    fireEvent.keyDown(actionBtn, { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });

    const restartItem = screen.getByText("Restart");
    fireEvent.click(restartItem);

    await waitFor(() => {
      expect(mocks.runActionSafe).toHaveBeenCalledWith(
        {
          kind: "Runtime",
          id: "rt-prod-01",
          action: "restart",
          memo: "from runtimes table",
        },
        expect.objectContaining({
          successTitle: "Restart dispatched: rt-prod-01",
        }),
      );
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("maps disable_new to quarantine with correct memo in real-write mode", async () => {
    process.env.VITE_BFF_REAL_WRITES = "true";
    const refreshMock = vi.fn();
    mocks.runActionSafe.mockResolvedValue({ ok: true });
    const rows: RuntimeListItem[] = [{
      id: "rt-prod-01",
      name: "rt-prod-01",
      kind: "live" as RuntimeListItem["kind"],
      env: "live",
      status: "active",
      cpu: 0.2,
      memory: 0.4,
      latencyP95Ms: 25,
      uptimePct: 99.95,
      region: "ap-northeast-1",
      updatedAt: "2026-08-23T12:00:00Z",
      runtimeId: "rt-prod-01",
      runtimeBindingId: "rb-prod-01",
      personaId: "persona-alpha",
    }];
    mocks.useLiveListV1.mockReturnValue({
      items: rows,
      refresh: refreshMock,
      loading: false,
    });

    renderRuntimes("/management/runtimes");

    const actionBtn = screen.getByRole("button", { name: "Runtime actions" });
    const { fireEvent, waitFor } = await import("@testing-library/react");
    actionBtn.focus();
    fireEvent.keyDown(actionBtn, { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });

    const disableNewItem = screen.getByText("Disable new deployments");
    fireEvent.click(disableNewItem);

    await waitFor(() => {
      expect(mocks.runActionSafe).toHaveBeenCalledWith(
        {
          kind: "Runtime",
          id: "rt-prod-01",
          action: "quarantine",
          memo: "disable_new_deployments",
        },
        expect.objectContaining({
          successTitle: "Disabled new deployments on: rt-prod-01",
        }),
      );
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("opens HighRiskConfirm for emergency_kill and runs safe action when confirmed in real-write mode", async () => {
    process.env.VITE_BFF_REAL_WRITES = "true";
    const refreshMock = vi.fn();
    mocks.runActionSafe.mockResolvedValue({ ok: true });
    const rows: RuntimeListItem[] = [{
      id: "rt-prod-01",
      name: "rt-prod-01",
      kind: "live" as RuntimeListItem["kind"],
      env: "live",
      status: "active",
      cpu: 0.2,
      memory: 0.4,
      latencyP95Ms: 25,
      uptimePct: 99.95,
      region: "ap-northeast-1",
      updatedAt: "2026-08-23T12:00:00Z",
      runtimeId: "rt-prod-01",
      runtimeBindingId: "rb-prod-01",
      personaId: "persona-alpha",
    }];
    mocks.useLiveListV1.mockReturnValue({
      items: rows,
      refresh: refreshMock,
      loading: false,
    });

    renderRuntimes("/management/runtimes");

    const actionBtn = screen.getByRole("button", { name: "Runtime actions" });
    const { fireEvent, waitFor } = await import("@testing-library/react");
    actionBtn.focus();
    fireEvent.keyDown(actionBtn, { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });

    const killItem = screen.getByText("Emergency kill");
    fireEvent.click(killItem);

    await waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("runtime.emergency_kill");

    const memoInput = dialog.querySelector("textarea")!;
    const tokenInput = dialog.querySelector("input")!;
    const confirmBtn = dialog.querySelector('button[type="button"].bg-destructive, button.bg-destructive') as HTMLButtonElement
      || Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent?.includes("Confirm"))!;

    expect(confirmBtn.disabled).toBe(true);

    // Type memo (critical risk requires >= 80 characters) and token
    const testMemo = "Emergency operator kill for runaway runtime instance to prevent capital allocation loss on live broker.";
    fireEvent.change(memoInput, { target: { value: testMemo } });
    fireEvent.change(tokenInput, { target: { value: "KILL" } });

    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mocks.runActionSafe).toHaveBeenCalledWith(
        {
          kind: "Runtime",
          id: "rt-prod-01",
          action: "emergency_kill",
          memo: testMemo,
        },
        expect.objectContaining({
          successTitle: "Emergency kill dispatched: rt-prod-01",
        }),
      );
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("keeps action button disabled for fleetDerived runtime rows even when real writes are enabled", () => {
    process.env.VITE_BFF_REAL_WRITES = "true";
    const rows = [{
      id: "rt-fleet-01",
      name: "rt-fleet-01",
      kind: "paper" as RuntimeListItem["kind"],
      env: "paper",
      status: "declared" as RuntimeListItem["status"],
      cpu: Number.NaN,
      memory: Number.NaN,
      latencyP95Ms: Number.NaN,
      uptimePct: Number.NaN,
      region: "",
      updatedAt: "",
      runtimeId: "rt-fleet-01",
      fleetDerived: true,
    }];
    mocks.useLiveListV1.mockReturnValue({
      items: rows,
      refresh: vi.fn(),
      loading: false,
    });

    renderRuntimes("/management/runtimes");

    const actionBtn = screen.getByRole("button", { name: "Runtime actions" });
    expect(actionBtn).toBeDisabled();
    expect(mocks.runActionSafe).not.toHaveBeenCalled();
  });
});
