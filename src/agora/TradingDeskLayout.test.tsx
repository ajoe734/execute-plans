import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TradingDeskLayout } from "./TradingDeskLayout";
import { getWorkshop } from "@/lib/bff-v1/agora/workshops";
import { submitAgoraAsk } from "@/lib/bff-v1/agora/ask";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";
import { AGORA_LAYOUT_PROPOSAL_REQUEST_EVENT } from "./deskEvents";
import "@/i18n";

vi.mock("@/lib/bff-v1/agora/workshops", () => ({
  getWorkshop: vi.fn(),
}));

vi.mock("@/lib/bff-v1/agora/ask", () => ({
  submitAgoraAsk: vi.fn(),
}));

const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 375;

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

afterEach(() => {
  cleanup();
  setViewportWidth(DESKTOP_WIDTH);
  vi.resetAllMocks();
});

function renderTradingDesk(initialPath = "/agora/trading-room", workshopId?: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/agora" element={<TradingDeskLayout workshopId={workshopId} />}>
          <Route path="trading-room" element={<div data-testid="trading-room-content">Trading Room content</div>} />
          <Route path="strategy-workshop" element={<div data-testid="strategy-workshop-content">Strategy Workshop content</div>} />
          <Route path="strategy-performance" element={<div data-testid="strategy-performance-content">Performance content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function deskTab(label: string): HTMLButtonElement {
  const tabBar = screen.getByTestId("trading-desk-tab-bar");
  const tab = Array.from(tabBar.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  );
  if (!(tab instanceof HTMLButtonElement)) throw new Error(`Agora desk tab not found: ${label}`);
  return tab;
}

describe("TradingDeskLayout", () => {
  it("renders the command bar and tab bar", () => {
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-command-bar")).toBeDefined();
    expect(screen.getByTestId("trading-desk-tab-bar")).toBeDefined();
  });

  it("renders exactly three actual tab controls alongside contextual shortcuts", () => {
    renderTradingDesk();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const labels = new Set(["交易操盤室", "策略工坊", "策略執行與績效"]);
    const tabControls = Array.from(tabBar.querySelectorAll("button")).filter(
      (button) => labels.has(button.textContent?.trim() ?? ""),
    );

    expect(tabControls).toHaveLength(3);
    expect(tabControls.filter((button) => button.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(screen.getByTestId("trading-desk-shortcuts").querySelectorAll("button")).toHaveLength(3);
  });

  it("navigates to strategy-workshop when that tab is clicked", () => {
    renderTradingDesk();
    fireEvent.click(deskTab("策略工坊"));
    expect(screen.getByTestId("strategy-workshop-content")).toBeDefined();
  });

  it("navigates to strategy-performance when that tab is clicked", () => {
    renderTradingDesk();
    fireEvent.click(deskTab("策略執行與績效"));
    expect(screen.getByTestId("strategy-performance-content")).toBeDefined();
  });

  it("renders the matched route in the main content area", () => {
    renderTradingDesk();
    expect(screen.getByTestId("trading-room-content")).toBeDefined();
    expect(screen.getByTestId("trading-desk-main")).toBeDefined();
  });

  it("designates the main content region as the only page-level scroll owner", () => {
    renderTradingDesk();
    const shell = screen.getByTestId("trading-desk-shell");
    const main = screen.getByTestId("trading-desk-main");

    expect(shell.className).toContain("overflow-hidden");
    expect(main.className).toContain("overflow-y-auto");
    expect(main.className).toContain("overflow-x-hidden");
  });

  it("toggles the servant drawer open and closed", () => {
    renderTradingDesk();
    expect(screen.queryByTestId("trading-desk-servant-drawer")).toBeNull();
    const toggleBtn = screen.getByRole("button", { name: /交易僕人/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("trading-desk-servant-drawer")).toBeDefined();
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId("trading-desk-servant-drawer")).toBeNull();
  });

  it("renders the localized bottom strip sections", () => {
    renderTradingDesk();
    const strip = screen.getByTestId("trading-desk-bottom-strip");
    expect(strip.textContent).toContain("工作");
    expect(strip.textContent).toContain("影子模式");
    expect(strip.textContent).toContain("日誌");
  });

  it("marks active tab with aria-current=page (strategy-workshop)", () => {
    renderTradingDesk("/agora/strategy-workshop");
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const activeEl = tabBar.querySelector('[aria-current="page"]');
    expect(activeEl).not.toBeNull();
    expect(activeEl?.textContent).toContain("策略工坊");
  });

  it("marks active tab with aria-current=page (trading-room)", () => {
    renderTradingDesk();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const activeEl = tabBar.querySelector('[aria-current="page"]');
    expect(activeEl).not.toBeNull();
    expect(activeEl?.textContent).toContain("交易操盤室");
  });

  it("renders the full shell container", () => {
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-shell")).toBeDefined();
  });

  it("marks the shell as desktop viewport by default", () => {
    setViewportWidth(DESKTOP_WIDTH);
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-shell").dataset.viewport).toBe("desktop");
  });

  it("marks the shell as mobile viewport below the breakpoint", () => {
    setViewportWidth(MOBILE_WIDTH);
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-shell").dataset.viewport).toBe("mobile");
  });

  it("renders the servant drawer as a fixed full-width overlay on mobile", () => {
    setViewportWidth(MOBILE_WIDTH);
    renderTradingDesk();
    fireEvent.click(screen.getByRole("button", { name: /交易僕人/i }));
    const drawer = screen.getByTestId("trading-desk-servant-drawer");
    expect(drawer.className).toContain("fixed");
    expect(drawer.className).toContain("w-full");
  });

  it("renders the servant drawer as a fixed-width side column on desktop", () => {
    setViewportWidth(DESKTOP_WIDTH);
    renderTradingDesk();
    fireEvent.click(screen.getByRole("button", { name: /交易僕人/i }));
    const drawer = screen.getByTestId("trading-desk-servant-drawer");
    expect(drawer.className).not.toContain("fixed");
    expect(drawer.className).toContain("w-[360px]");
  });

  it("keeps the tab bar horizontally scrollable so tabs never clip on narrow viewports", () => {
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-tab-bar").className).toContain("overflow-x-auto");
  });

  it("shows the normalized route context in the servant drawer without a workshop id", () => {
    renderTradingDesk("/agora/strategy-workshop");
    fireEvent.click(screen.getByRole("button", { name: /交易僕人/i }));
    expect(screen.getByTestId("servant-current-context").textContent).toContain("策略工坊");
    expect(getWorkshop).not.toHaveBeenCalled();
  });

  it("gates workshop loading until the servant drawer opens", async () => {
    const workshop: StrategyWorkshop = {
      spec_version: "1.0",
      workshop_id: "ws-1",
      operator_id: "operator-1",
      status: "open",
      subject: { kind: "free_form", ref: "strategy-draft-1", title: "Momentum draft" },
      message_count: 4,
      created_at: "2026-06-01T00:00:00Z",
    };
    vi.mocked(getWorkshop).mockResolvedValue(workshop);

    renderTradingDesk("/agora/strategy-workshop", "ws-1");
    expect(getWorkshop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /交易僕人/i }));

    await waitFor(() => {
      expect(screen.getByTestId("servant-drawer-context").textContent).toContain("Momentum draft");
    });
    expect(screen.getByTestId("servant-drawer-context").textContent).toContain("狀態：open");
    expect(screen.getByTestId("servant-drawer-context").textContent).toContain("訊息：4");
    expect(getWorkshop).toHaveBeenCalledWith("ws-1");
    expect(getWorkshop).toHaveBeenCalledTimes(1);
  });

  it("renders a safe localized fallback when a live workshop omits subject", async () => {
    const workshopWithoutSubject = {
      spec_version: "1.0",
      workshop_id: "ws-404",
      operator_id: "operator-1",
      status: "open",
      created_at: "2026-06-01T00:00:00Z",
    } as unknown as StrategyWorkshop;
    vi.mocked(getWorkshop).mockResolvedValue(workshopWithoutSubject);

    renderTradingDesk("/agora/strategy-workshop", "ws-404");
    fireEvent.click(screen.getByRole("button", { name: /交易僕人/i }));

    await waitFor(() => {
      expect(screen.getByTestId("servant-current-context").textContent).toContain("策略工坊 ws-404");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses a partial workshop subject ref when title is absent", async () => {
    const workshopWithPartialSubject = {
      spec_version: "1.0",
      workshop_id: "ws-partial",
      operator_id: "operator-1",
      status: "open",
      subject: { ref: "strategy-ref-only" },
      created_at: "2026-06-01T00:00:00Z",
    } as unknown as StrategyWorkshop;
    vi.mocked(getWorkshop).mockResolvedValue(workshopWithPartialSubject);

    renderTradingDesk("/agora/strategy-workshop", "ws-partial");
    fireEvent.click(screen.getByRole("button", { name: /交易僕人/i }));

    await waitFor(() => {
      expect(screen.getByTestId("servant-current-context").textContent).toContain("strategy-ref-only");
    });
  });

  it("shows a degraded state instead of a placeholder when workshop context fails to load", async () => {
    vi.mocked(getWorkshop).mockRejectedValue(new Error("boom"));

    renderTradingDesk("/agora/strategy-workshop", "ws-2");
    fireEvent.click(screen.getByRole("button", { name: /交易僕人/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("無法取得策略工坊情境");
    });
  });

  it("only propagates the servant workshop id while on the strategy-workshop tab", () => {
    renderTradingDesk("/agora/trading-room", "ws-1");
    fireEvent.click(screen.getByRole("button", { name: /交易僕人/i }));
    expect(getWorkshop).not.toHaveBeenCalled();
    expect(screen.getByTestId("servant-current-context").textContent).toContain("交易操盤室");
    expect(screen.getByTestId("servant-current-context").textContent).not.toContain("工坊 ID");
  });

  it("resets command state and ignores stale workshop context after a tab change", async () => {
    let resolveWorkshop!: (workshop: StrategyWorkshop) => void;
    vi.mocked(getWorkshop).mockReturnValue(new Promise((resolve) => {
      resolveWorkshop = resolve;
    }));

    renderTradingDesk("/agora/strategy-workshop", "ws-stale");
    fireEvent.click(screen.getByRole("button", { name: /交易僕人/i }));
    fireEvent.change(screen.getByTestId("trading-desk-command-input"), {
      target: { value: "draft command" },
    });
    expect(getWorkshop).toHaveBeenCalledWith("ws-stale");

    fireEvent.click(deskTab("交易操盤室"));
    await waitFor(() => {
      expect((screen.getByTestId("trading-desk-command-input") as HTMLInputElement).value).toBe("");
      expect(screen.getByTestId("servant-current-context").textContent).toContain("交易操盤室");
    });

    await act(async () => {
      resolveWorkshop({
        spec_version: "1.0",
        workshop_id: "ws-stale",
        operator_id: "operator-1",
        status: "open",
        subject: { kind: "free_form", ref: "stale-ref", title: "Stale workshop title" },
        created_at: "2026-06-01T00:00:00Z",
      });
      await Promise.resolve();
    });
    expect(screen.getByTestId("servant-current-context").textContent).not.toContain("Stale workshop title");
  });

  it("renders a contextual structured command result and dispatches layout proposal review", async () => {
    vi.mocked(submitAgoraAsk).mockResolvedValue({
      sessionId: "session-1",
      messageId: "message-1",
      providerStatus: "completed",
      answer: "Layout evidence reviewed.",
      commandId: "command-1",
    });
    const proposalEvents: CustomEvent[] = [];
    const captureProposal = (event: Event) => proposalEvents.push(event as CustomEvent);
    window.addEventListener(AGORA_LAYOUT_PROPOSAL_REQUEST_EVENT, captureProposal);

    renderTradingDesk();
    fireEvent.change(screen.getByTestId("trading-desk-command-input"), {
      target: { value: "重新排列版面，先看風險" },
    });
    fireEvent.click(screen.getByTestId("trading-desk-command-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("servant-task-understood")).toBeDefined();
    });
    expect(screen.getByTestId("servant-task-plan")).toBeDefined();
    expect(screen.getByTestId("servant-task-evidence").textContent).toContain("Layout evidence reviewed.");
    expect(screen.getByTestId("servant-task-risks")).toBeDefined();
    expect(submitAgoraAsk).toHaveBeenCalledWith(
      expect.objectContaining({
        contextRefs: [{ type: "route", id: "/agora/trading-room" }],
        prompt: "重新排列版面，先看風險",
        route: "/agora/trading-room",
      }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^desk-/) }),
    );

    fireEvent.click(screen.getByTestId("command-open-layout-proposal"));
    window.removeEventListener(AGORA_LAYOUT_PROPOSAL_REQUEST_EVENT, captureProposal);
    expect(proposalEvents).toHaveLength(1);
    expect(proposalEvents[0].detail).toEqual(expect.objectContaining({
      instruction: "重新排列版面，先看風險",
      source: "command",
      taskId: expect.any(String),
    }));
  });

  it("shows truthful Jobs content and explicit Shadow and Journal unavailable states", () => {
    renderTradingDesk();
    const strip = screen.getByTestId("trading-desk-bottom-strip");

    fireEvent.click(strip.querySelector('[aria-controls="trading-desk-bottom-panel-jobs"]') as HTMLButtonElement);
    expect(screen.getByTestId("trading-desk-bottom-panel-jobs").textContent).toContain(
      "尚未建立交易僕人任務",
    );

    fireEvent.click(strip.querySelector('[aria-controls="trading-desk-bottom-panel-shadow"]') as HTMLButtonElement);
    expect(screen.queryByTestId("trading-desk-bottom-panel-jobs")).toBeNull();
    expect(screen.getByTestId("trading-desk-bottom-panel-shadow").textContent).toContain("尚未提供");
    expect(screen.getByTestId("trading-desk-bottom-panel-shadow").textContent).toContain("影子運行記錄");

    fireEvent.click(strip.querySelector('[aria-controls="trading-desk-bottom-panel-journal"]') as HTMLButtonElement);
    expect(screen.queryByTestId("trading-desk-bottom-panel-shadow")).toBeNull();
    expect(screen.getByTestId("trading-desk-bottom-panel-journal").textContent).toContain("尚未提供");
    expect(screen.getByTestId("trading-desk-bottom-panel-journal").textContent).toContain("決策日誌");
  });
});
