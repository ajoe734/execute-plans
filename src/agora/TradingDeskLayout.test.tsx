import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { TradingDeskLayout } from "./TradingDeskLayout";
import { getWorkshop } from "@/lib/bff-v1/agora/workshops";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";
import { makeBffError } from "@/lib/bff-v1/errors";

vi.mock("@/lib/bff-v1/agora/workshops", () => ({
  getWorkshop: vi.fn(),
}));

const identityMocks = vi.hoisted(() => ({
  getTraderIdentity: vi.fn(),
}));

vi.mock("@/lib/bff-v1/agora/identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1/agora/identity")>();
  return {
    ...actual,
    agoraIdentityClient: {
      ...actual.agoraIdentityClient,
      getTraderIdentity: () => identityMocks.getTraderIdentity(),
    },
  };
});

const servantSessionMocks = vi.hoisted(() => ({
  createServantSession: vi.fn(),
  sendServantSessionMessage: vi.fn(),
}));

vi.mock("@/lib/bff-v1/agora/servant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1/agora/servant")>();
  return {
    ...actual,
    createServantSession: (...args: unknown[]) => servantSessionMocks.createServantSession(...args),
    sendServantSessionMessage: (...args: unknown[]) =>
      servantSessionMocks.sendServantSessionMessage(...args),
  };
});

// The command bar consumes the real `useAuth().signOut` contract; only the
// provider hook itself is stubbed so no Firebase/BFF wiring runs here.
const authMocks = vi.hoisted(() => ({ signOut: vi.fn<() => Promise<void>>() }));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ signOut: authMocks.signOut }),
}));

const servantMocks = vi.hoisted(() => ({
  status: vi.fn(),
  create: vi.fn(),
  access: vi.fn(),
}));
vi.mock("./useServantStatus", () => ({ useServantStatus: () => servantMocks.status() }));
vi.mock("./useAgoraWriteAccess", () => ({ useAgoraWriteAccess: () => servantMocks.access() }));

const servantProfile = {
  persona_id: "persona-1",
  display_name: "我的交易僕人",
  status: "paper_only",
  agora_user_id: "admintest",
  policy: { execution_authority: "none" },
  capability_summary: { can_ask: true, can_research: true, can_workshop: false },
};

function mockServant(state: unknown, interactionAllowed = true) {
  servantMocks.status.mockReturnValue({ state, creating: false, createError: null, create: servantMocks.create });
  servantMocks.access.mockReturnValue({ interactionAllowed });
}

beforeEach(() => {
  mockServant({ kind: "ready", servant: servantProfile }, true);
  identityMocks.getTraderIdentity.mockResolvedValue({
    userId: "mock-user",
    tenantId: "mock-tenant",
    displayName: "mock-user",
    style: null,
    marketState: null,
    roles: ["operator"],
    capabilities: [],
  });
  servantSessionMocks.createServantSession.mockReset();
  servantSessionMocks.sendServantSessionMessage.mockReset();
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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
  vi.restoreAllMocks();
});

function renderTradingDesk(
  initialPath = "/agora/trading-room",
  workshopId?: string,
  extraProps?: { strategyId?: string; selectedWidget?: string },
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/agora"
          element={<TradingDeskLayout workshopId={workshopId} {...extraProps} />}
        >
          <Route
            path="trading-room"
            element={
              <div data-testid="trading-room-content">
                Trading Room content
                <div data-testid="workspace-grid-cell-widget-heatmap">Heatmap widget</div>
              </div>
            }
          />
          <Route
            path="trading-room/:strategyId"
            element={
              <div data-testid="trading-room-content">
                Trading Room strategy content
                <div data-testid="workspace-grid-cell-widget-heatmap">Heatmap widget</div>
              </div>
            }
          />
          <Route
            path="strategy-workshop"
            element={<div data-testid="strategy-workshop-content">Strategy Workshop content</div>}
          />
          <Route
            path="strategy-performance"
            element={<div data-testid="strategy-performance-content">Performance content</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("TradingDeskLayout", () => {
  it("renders the command bar and tab bar without the legacy bottom strip", () => {
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-command-bar")).toBeDefined();
    expect(screen.getByTestId("trading-desk-tab-bar")).toBeDefined();
    expect(screen.queryByTestId("trading-desk-bottom-strip")).toBeNull();
  });

  it("renders exactly the three original zh-TW main tabs and excludes Committee, Memory, Persona Lab, and Feedback from trader navigation", () => {
    renderTradingDesk();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const buttons = tabBar.querySelectorAll("button");
    expect(buttons.length).toBe(3);
    const labels = Array.from(buttons).map((b) => (b.textContent ?? "").trim());
    expect(labels).toEqual(["交易操盤室", "策略工坊", "策略執行與績效"]);
    for (const removed of ["Committee", "委員會", "Memory", "記憶審核", "Persona Lab", "人格實驗室", "Feedback", "人的回饋"]) {
      expect(labels.some((text) => text.includes(removed))).toBe(false);
    }
  });

  it("navigates to strategy-workshop when 策略工坊 tab is clicked", () => {
    renderTradingDesk();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const tabs = Array.from(tabBar.querySelectorAll("button"));
    const workshopTab = tabs.find((t) => t.textContent?.includes("策略工坊"));
    if (!workshopTab) throw new Error("策略工坊 tab not found");
    fireEvent.click(workshopTab);
    expect(screen.getByTestId("strategy-workshop-content")).toBeDefined();
  });

  it("navigates to strategy-performance when 策略執行與績效 tab is clicked", () => {
    renderTradingDesk();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const tabs = Array.from(tabBar.querySelectorAll("button"));
    const perfTab = tabs.find((t) => t.textContent?.includes("策略執行與績效"));
    if (!perfTab) throw new Error("策略執行與績效 tab not found");
    fireEvent.click(perfTab);
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
    const toggleBtn = screen.getByRole("button", { name: /交易僕人抽屜/ });
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("trading-desk-servant-drawer")).toBeDefined();
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId("trading-desk-servant-drawer")).toBeNull();
  });

  it("shows trader display name and style, market state, servant state with display name (never raw English default), and zh-TW sign-out in the header", async () => {
    identityMocks.getTraderIdentity.mockResolvedValueOnce({
      userId: "admintest",
      tenantId: "pantheon-dev",
      displayName: "陳大戶",
      style: "分點籌碼與落後補漲",
      marketState: "台股盤中 · 模擬盤監控中",
      roles: ["operator"],
      capabilities: ["agora.identity.v1", "agora.session.v1"],
    });
    mockServant(
      {
        kind: "ready",
        servant: {
          ...servantProfile,
          display_name: "Agora Servant",
        },
      },
      true,
    );
    renderTradingDesk();

    await waitFor(() => {
      expect(screen.getByTestId("trader-display-name").textContent).toBe("陳大戶");
    });
    expect(screen.getByTestId("trader-style").textContent).toBe("分點籌碼與落後補漲");
    expect(screen.getByTestId("trading-desk-market-state").textContent).toContain("市場狀態：台股盤中");
    expect(screen.getByTestId("servant-display-name").textContent).toContain("專屬僕人");
    expect(screen.getByTestId("trading-desk-command-bar").textContent).not.toContain("Agora Servant");
    expect(screen.getByTestId("trading-desk-sign-out").textContent).toBe("登出");
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

  it("applies the dark theme class on the Agora shell in one place across /agora routes", () => {
    for (const path of ["/agora/trading-room", "/agora/strategy-workshop", "/agora/strategy-performance"]) {
      const view = renderTradingDesk(path);
      const shell = screen.getByTestId("trading-desk-shell");
      expect(shell.classList.contains("dark")).toBe(true);
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      view.unmount();
    }
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

  it("uses one exact 900px breakpoint across the shell", () => {
    setViewportWidth(899);
    const firstRender = renderTradingDesk();
    expect(screen.getByTestId("trading-desk-shell").dataset.viewport).toBe("mobile");
    firstRender.unmount();

    setViewportWidth(900);
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-shell").dataset.viewport).toBe("desktop");
  });

  it("renders the servant drawer as a fixed full-width overlay on mobile", () => {
    setViewportWidth(MOBILE_WIDTH);
    renderTradingDesk();
    fireEvent.click(screen.getByRole("button", { name: /交易僕人抽屜/ }));
    const drawer = screen.getByTestId("trading-desk-servant-drawer");
    expect(drawer.className).toContain("fixed");
    expect(drawer.className).toContain("w-full");
  });

  it("traps the mobile Servant as a modal, isolates main content, and restores trigger focus", async () => {
    setViewportWidth(MOBILE_WIDTH);
    renderTradingDesk();
    const trigger = screen.getByRole("button", { name: "開啟交易僕人抽屜" }) as HTMLButtonElement;
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "交易僕人" });
    const mainRegion = screen.getByTestId("trading-desk-main").parentElement;
    expect(dialog).toBe(screen.getByTestId("trading-desk-servant-drawer"));
    expect(mainRegion?.hasAttribute("inert")).toBe(true);
    expect(mainRegion?.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("trading-desk-servant-drawer")).toBeNull());
    expect(mainRegion?.hasAttribute("inert")).toBe(false);
    expect(mainRegion?.hasAttribute("aria-hidden")).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("renders the servant drawer as a fixed-width side column on desktop", () => {
    setViewportWidth(DESKTOP_WIDTH);
    renderTradingDesk();
    fireEvent.click(screen.getByRole("button", { name: /交易僕人抽屜/ }));
    const drawer = screen.getByTestId("trading-desk-servant-drawer");
    expect(drawer.className).not.toContain("fixed");
    expect(drawer.className).toContain("w-80");
  });

  it("keeps the tab bar horizontally scrollable so tabs never clip on narrow viewports", () => {
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-tab-bar").className).toContain("overflow-x-auto");
  });

  it("shows a neutral placeholder in the servant drawer without a workshop id", () => {
    renderTradingDesk("/agora/strategy-workshop");
    fireEvent.click(screen.getByRole("button", { name: /交易僕人抽屜/ }));
    expect(screen.getByTestId("servant-drawer-context").textContent).toContain(
      "開啟策略工坊工作階段",
    );
  });

  it("loads and renders real workshop context in the servant drawer", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /交易僕人抽屜/ }));

    await waitFor(() => {
      expect(screen.getByTestId("servant-drawer-context").textContent).toContain("Momentum draft");
    });
    expect(screen.getByTestId("servant-drawer-context").textContent).toContain("狀態：open");
    expect(screen.getByTestId("servant-drawer-context").textContent).toContain("訊息：4");
    expect(getWorkshop).toHaveBeenCalledWith("ws-1");
  });

  it("shows a degraded state instead of a placeholder when workshop context fails to load", async () => {
    vi.mocked(getWorkshop).mockRejectedValue(new Error("boom"));

    renderTradingDesk("/agora/strategy-workshop", "ws-2");
    fireEvent.click(screen.getByRole("button", { name: /交易僕人抽屜/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("無法取得策略工坊情境：boom");
    });
  });

  it("only propagates the servant workshop id while on the strategy-workshop tab", async () => {
    renderTradingDesk("/agora/trading-room", "ws-1");
    fireEvent.click(screen.getByRole("button", { name: /交易僕人抽屜/ }));
    expect(getWorkshop).not.toHaveBeenCalled();
    expect(screen.getByTestId("servant-drawer-context").textContent).toContain(
      "開啟策略工坊工作階段",
    );
  });

  describe("persistent 交代僕人 command bar and V6 §2.3 quick tasks", () => {
    it("shows distinct zh-TW placeholders per page and all ten V6 §2.3 quick tasks", () => {
      const trView = renderTradingDesk("/agora/trading-room");
      const trInput = screen.getByTestId("trading-desk-command-input") as HTMLInputElement;
      expect(trInput.placeholder).toContain("盯盤邏輯");
      const quickTaskButtons = screen.getByTestId("trading-desk-quick-tasks").querySelectorAll("button");
      expect(quickTaskButtons.length).toBe(10);
      const quickLabels = Array.from(quickTaskButtons).map((btn) => btn.textContent?.trim());
      expect(quickLabels).toEqual([
        "建立策略視角",
        "產生候選池",
        "分析分點",
        "找落後補漲",
        "比較多檔股票",
        "檢查進場條件",
        "檢查出場條件",
        "重排目前畫面",
        "新增圖表",
        "送影子追蹤",
      ]);
      trView.unmount();

      const wsView = renderTradingDesk("/agora/strategy-workshop");
      expect((screen.getByTestId("trading-desk-command-input") as HTMLInputElement).placeholder).toContain(
        "策略想法",
      );
      wsView.unmount();

      const perfView = renderTradingDesk("/agora/strategy-performance");
      expect((screen.getByTestId("trading-desk-command-input") as HTMLInputElement).placeholder).toContain(
        "策略執行檢查",
      );
      perfView.unmount();
    });

    it("sends command text with current page, strategy, and selected widget to servant session routes and displays reply in the servant drawer", async () => {
      servantSessionMocks.createServantSession.mockResolvedValue({
        session_id: "sess-live-1",
        servant_persona_id: "persona-1",
        session_type: "interactive",
        status: "active",
        state: "active",
        metadata: {},
      });
      servantSessionMocks.sendServantSessionMessage.mockResolvedValue({
        message_id: "msg-live-1",
        session_id: "sess-live-1",
        session_type: "interactive",
        servant_persona_id: "persona-1",
        provider: {
          status: "completed",
          answer: "僕人已依據「贏家分點」策略與分點熱圖完成分點異常掃描。",
          error: null,
        },
      });

      renderTradingDesk("/agora/trading-room/strat-winner-v4");

      // Click the widget inside the main workspace to select it
      fireEvent.click(screen.getByTestId("workspace-grid-cell-widget-heatmap"));

      const input = screen.getByTestId("trading-desk-command-input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "檢查關聯分點是否同步賣出" } });
      fireEvent.submit(screen.getByTestId("trading-desk-command-form"));

      await waitFor(() => {
        expect(servantSessionMocks.createServantSession).toHaveBeenCalledWith({
          intent: "檢查關聯分點是否同步賣出",
          strategy_ref: "strat-winner-v4",
          session_type: "interactive",
          metadata: {
            page: "trading-room",
            route: "/agora/trading-room/strat-winner-v4",
            strategy: "strat-winner-v4",
            selected_widget: "widget-heatmap",
          },
        });
      });

      expect(servantSessionMocks.sendServantSessionMessage).toHaveBeenCalledWith("sess-live-1", {
        content: "檢查關聯分點是否同步賣出",
        attachment_refs: [
          "page:trading-room",
          "route:/agora/trading-room/strat-winner-v4",
          "strategy:strat-winner-v4",
          "widget:widget-heatmap",
        ],
      });

      await waitFor(() => {
        expect(screen.getByTestId("servant-command-reply").textContent).toBe(
          "僕人已依據「贏家分點」策略與分點熱圖完成分點異常掃描。",
        );
      });
      expect(screen.getByTestId("servant-command-session").textContent).toContain("sess-live-1");
    });

    it("disables the command bar with a zh-TW reason when the servant is missing or write access is denied", () => {
      mockServant({ kind: "missing" }, true);
      const missingView = renderTradingDesk();
      expect((screen.getByTestId("trading-desk-command-input") as HTMLInputElement).disabled).toBe(true);
      expect(screen.getByTestId("trading-desk-command-disabled-reason").textContent).toContain(
        "尚未建立交易僕人",
      );
      missingView.unmount();

      mockServant({ kind: "ready", servant: servantProfile }, false);
      renderTradingDesk();
      expect((screen.getByTestId("trading-desk-command-input") as HTMLInputElement).disabled).toBe(true);
      expect(screen.getByTestId("trading-desk-command-disabled-reason").textContent).toContain(
        "無互動寫入權限",
      );
    });
  });

  describe("command bar sign out", () => {
    beforeEach(() => {
      authMocks.signOut.mockReset();
      vi.mocked(toast.error).mockClear();
    });

    it("exposes an accessible zh-TW 登出 action that invokes the auth provider signOut", async () => {
      let resolveSignOut: () => void = () => {};
      authMocks.signOut.mockImplementation(
        () => new Promise<void>((resolve) => { resolveSignOut = resolve; }),
      );
      renderTradingDesk();

      const commandBar = screen.getByTestId("trading-desk-command-bar");
      const button = screen.getByRole("button", { name: "登出" }) as HTMLButtonElement;
      expect(commandBar.contains(button)).toBe(true);
      expect(button.type).toBe("button");

      fireEvent.click(button);
      expect(authMocks.signOut).toHaveBeenCalledTimes(1);
      // Re-entrancy guard while the BFF invalidation is in flight.
      expect(button.disabled).toBe(true);

      await act(async () => {
        resolveSignOut();
      });
      expect(button.disabled).toBe(false);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("surfaces a failed BFF invalidation instead of pretending sign out succeeded", async () => {
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      authMocks.signOut.mockRejectedValue(new Error("logout endpoint unreachable"));
      renderTradingDesk();

      fireEvent.click(screen.getByRole("button", { name: "登出" }));

      try {
        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
        expect(vi.mocked(toast.error).mock.calls[0][0]).toContain("logout endpoint unreachable");
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off("unhandledRejection", unhandled);
      }
      expect((screen.getByRole("button", { name: "登出" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("treats an expired-session 401 from the BFF as already signed out", async () => {
      authMocks.signOut.mockRejectedValue(makeBffError({ code: "TOKEN_EXPIRED" }));
      renderTradingDesk();

      fireEvent.click(screen.getByRole("button", { name: "登出" }));

      await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledTimes(1));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(toast.error).not.toHaveBeenCalled();
    });
  });
});

describe("TradingDeskLayout servant status", () => {
  it("shows 尚未建立 when the servant does not exist, without a create button for viewers", () => {
    mockServant({ kind: "missing" }, false);
    renderTradingDesk();
    expect(screen.getByTestId("servant-status").textContent).toBe("尚未建立");
    expect(screen.queryByRole("button", { name: "建立交易僕人" })).toBeNull();
  });

  it("lets an operator create the servant with one ensure call", () => {
    mockServant({ kind: "missing" }, true);
    renderTradingDesk();
    fireEvent.click(screen.getByRole("button", { name: "建立交易僕人" }));
    expect(servantMocks.create).toHaveBeenCalledTimes(1);
  });

  it("shows the header status and no create button once the servant exists", () => {
    renderTradingDesk();
    expect(screen.getByTestId("servant-status").textContent).toBe("助理就緒");
    expect(screen.queryByRole("button", { name: "建立交易僕人" })).toBeNull();
  });

  it("shows read errors as errors", () => {
    mockServant({ kind: "error", message: "boom" }, true);
    renderTradingDesk();
    expect(screen.getByRole("alert").textContent).toBe("狀態讀取失敗");
    expect(screen.queryByRole("button", { name: "建立交易僕人" })).toBeNull();
  });

  it("shows the advisory profile with capabilities and no-execution policy in the drawer", () => {
    renderTradingDesk();
    fireEvent.click(screen.getByRole("button", { name: /交易僕人抽屜/ }));
    const profile = screen.getByTestId("servant-profile").textContent ?? "";
    expect(profile).toContain("我的交易僕人");
    expect(profile).toContain("persona-1");
    expect(profile).toContain("顧問型助理");
    expect(profile).toContain("就緒度：助理就緒");
    expect(screen.getByTestId("servant-capabilities").textContent).toBe("能力：提問、研究");
    expect(profile).not.toMatch(/paper_running|league|ledger-/i);
    expect(profile).toContain("execution_authority: none");
  });
});
