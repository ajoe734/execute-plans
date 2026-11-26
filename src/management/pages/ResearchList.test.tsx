// Management research list over the real BFF envelope shape.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { ResearchList } from "./Lists";

const mocks = vi.hoisted(() => ({ useLiveListV1: vi.fn() }));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return { ...actual, useLiveListV1: mocks.useLiveListV1 };
});

const body = (includeNonReal: boolean) => ({
  items: [
    {
      task_id: "rtask-7c1e9a40b2d3",
      id: "rtask-7c1e9a40b2d3",
      name: "rtask-7c1e9a40b2d3",
      name_is_fallback_id: true,
      task_type: "factor_eval",
      display_summary: { symbol: "2330", dataset_ref: "dataset:tw-equity-ohlcv-top50-2024-daily", subject_ref: null },
      status: "completed",
      is_non_real: false,
      run_count: 1,
      latest_run: { run_id: "run-1", status: "completed", adapter: null, dispatch_mode: null },
      created_by: "operator",
      updated_at: "2026-11-20T00:00:00Z",
    },
    ...(includeNonReal
      ? [
          {
            task_id: "rtask-stub-1",
            id: "rtask-stub-1",
            name: "Stub probe",
            status: "completed",
            is_non_real: true,
            run_count: 1,
            latest_run: { run_id: "run-s", status: "completed", adapter: "stub", dispatch_mode: "stub" },
            created_by: "system",
            updated_at: "2026-11-20T00:00:00Z",
          },
        ]
      : []),
  ],
  meta: { hidden_non_real_count: 5 },
});

function renderResearch() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/management/experiments"]}>
          <Routes>
            <Route path="/management/experiments" element={<ResearchList />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </I18nextProvider>,
  );
}

describe("ResearchList (FE-RISK-STRATEGY-RESEARCH-UI-20261120)", () => {
  beforeEach(async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
    const actual = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actual.useLiveListV1);
    await i18n.changeLanguage("zh-TW");
  });
  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    liveStatus._reset();
    await i18n.changeLanguage("en-US");
  });

  it("hides is_non_real rows by default, shows the hidden count and renders readable fallback titles", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      return new Response(JSON.stringify(body(url.includes("include_non_real=true"))), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    renderResearch();
    const title = await screen.findByTestId("research-row-title");
    expect(title).toHaveTextContent("2330 的因子評估");
    expect(title).not.toHaveTextContent("rtask-7c1e9a40b2d3");
    expect(screen.getByTestId("research-runner-unrecorded")).toHaveTextContent("執行來源未記錄");
    expect(document.body.textContent ?? "").not.toContain("unknown / unknown");
    expect(screen.queryByText("Stub probe")).not.toBeInTheDocument();
    expect(screen.getByTestId("research-toggle-non-real-button")).toHaveTextContent("5");
    expect(urls.some((u) => u.includes("include_non_real=false"))).toBe(true);

    fireEvent.click(screen.getByTestId("research-toggle-non-real-button"));
    expect(await screen.findByText("Stub probe")).toBeInTheDocument();
    expect(urls.some((u) => u.includes("include_non_real=true"))).toBe(true);
  });

  it("switches the existing list to collector checks and resets the research page cursor", async () => {
    const urls: URL[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input), "https://bff.example.test");
      urls.push(url);
      const collector = url.searchParams.get("view") === "collector_checks";
      const page = url.searchParams.get("page_token");
      const items = collector ? [{
        id: "collector-weekly",
        task_type: "collector_query_plan",
        name: "Collector query proposal 2026-W47",
        status: "no_change",
        query_plan: { week: "2026-W47", changes: {} },
      }] : [{
        id: page ? "research-next" : "research-first",
        task_type: "rapid_eval",
        name: page ? "Older evaluation" : "rapid eval",
        status: "ready",
      }];
      return new Response(JSON.stringify({ items, page_info: {
        page_size: 1,
        total: collector ? 1 : 2,
        next_page_token: collector || page ? null : "1",
      } }), { headers: { "Content-Type": "application/json" } });
    });
    renderResearch();
    expect(await screen.findByText("快速評估")).toBeInTheDocument();
    expect(screen.getByText("評估對象未記錄")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看研究" })).toHaveAttribute("href", "/management/experiments/research-first");
    fireEvent.click(screen.getByTestId("research-page-next"));
    expect(await screen.findByText("Older evaluation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "資料蒐集檢查" }));
    expect(await screen.findByText("2026-W47 資料蒐集檢查")).toBeInTheDocument();
    expect(screen.getByText("本週無需調整關鍵字")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看檢查" })).toHaveAttribute("href", "/management/experiments/collector-weekly");
    expect(urls.some((url) => url.searchParams.get("view") === "collector_checks" && !url.searchParams.has("page_token"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "研究評估" }));
    expect(await screen.findByText("快速評估")).toBeInTheDocument();
  });

  describe("open demands, search rows and meeting tickets (FE-RESEARCH-DEMANDS-20261125)", () => {
    const PERSONA_A = "persona-ee7112a829d38b9135ac";
    const DEMAND_A = "rd-975bb89106f1c696a680";
    const demandRow = (over: Record<string, unknown> = {}) => ({
      demand_id: DEMAND_A, persona_id: PERSONA_A, persona_display_name: "Momentum Persona A",
      short_measure: "effective_bets", tried_families: ["momentum"], missing_datasets: [],
      mandate: "meeting_research_demand", created_at: "2026-11-25T05:00:00Z", expires_at: "2026-12-02T05:00:00Z",
      status: "open", evidence_ref: "pool-health:" + PERSONA_A,
      last_template_search_reason: "template_search_unavailable:ValueError:mandate_universe_missing",
      last_discovery_reason: "no_external_match", ...over,
    });
    const searchTask = (code: string | null) => ({
      id: "rtask-tmpl-1", task_id: "rtask-tmpl-1", status: "failed",
      title: "Search registered templates for " + DEMAND_A, name: "Search registered templates for " + DEMAND_A,
      created_by: "persona-pool-cycle", updated_at: "2026-11-25T05:11:00Z", run_count: 2,
      latest_run: { run_id: "r2", status: "failed", adapter: "template_demand_gate", dispatch_mode: "replication_gate" },
      demand: { demand_id: DEMAND_A, persona_id: PERSONA_A, attempt_count: 2, last_reason_code: code, short_measure: "effective_bets", status: "open" },
    });
    const ticket = {
      ticket_id: "rt-20261125-001", title: "Find diversifying template", owner_id: "persona-ee7112a829d38b9135ac",
      owner_display_name: "Momentum Persona A", due_at: "2026-11-30T00:00:00Z", status: "open",
      origin_meeting_id: "mtg-77",
    };
    const mockBff = (opts: { demands?: unknown; surface?: unknown; code?: string | null; tickets?: "ok" | "denied" | "empty" }) => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = new URL(String(input instanceof Request ? input.url : input), "https://bff.example.test");
        const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
        if (url.pathname.endsWith("/research/tickets")) {
          if (opts.tickets === "denied") return json({ error: { code: "PERMISSION_DENIED", message: "forbidden" } }, 403);
          return json({ items: opts.tickets === "empty" ? [] : [ticket] });
        }
        return json({
          items: [searchTask(opts.code === undefined ? "template_search_unavailable:ValueError:mandate_universe_missing" : opts.code)],
          open_demands: opts.demands ?? [demandRow()],
          meta: { hidden_non_real_count: 3, surfaces: { research_demands: opts.surface ?? { status: "ok" } } },
        });
      });
    };

    it("lists open demands first with persona, lack, tried, expiry, outcome and links", async () => {
      mockBff({});
      renderResearch();
      const row = await screen.findByTestId("research-demand-row");
      expect(row).toHaveTextContent("Momentum Persona A");
      expect(row).toHaveTextContent("缺少：足夠的獨立押注");
      expect(row).toHaveTextContent("已嘗試：momentum");
      expect(row).toHaveTextContent("到期");
      expect(row).toHaveTextContent("已搜尋 2 次");
      expect(screen.getByTestId("research-demand-outcome")).toHaveTextContent("角色任務沒有可交易標的範圍");
      expect(within(row).getByRole("link", { name: "角色頁面" })).toHaveAttribute("href", "/management/personas/" + PERSONA_A);
      expect(within(row).getByRole("link", { name: "搜尋任務" })).toHaveAttribute("href", "/management/experiments/rtask-tmpl-1");
      expect(screen.getByTestId("research-demands").compareDocumentPosition(screen.getByTestId("research-toggle-non-real-button")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("titles the search row by persona and lacking measure and shows attempts and the plain failure reason", async () => {
      mockBff({});
      renderResearch();
      const title = await screen.findByTestId("research-row-title");
      expect(title).toHaveTextContent("為 Momentum Persona A 搜尋範本 · 缺少足夠的獨立押注");
      expect(title).not.toHaveTextContent("rd-975bb");
      const outcome = screen.getByTestId("research-search-outcome");
      expect(outcome).toHaveTextContent("已搜尋 2 次");
      expect(outcome).toHaveTextContent("角色任務沒有可交易標的範圍");
      expect(screen.getByTestId("research-toggle-non-real-button")).toHaveTextContent("3");
    });

    it("renders the English reason and shows the raw code only for an unknown reason", async () => {
      await i18n.changeLanguage("en-US");
      mockBff({ code: "template_search_unavailable:RuntimeError:boom" });
      renderResearch();
      const outcome = await screen.findByTestId("research-search-outcome");
      expect(outcome).toHaveTextContent("The template search service failed.");
      expect(screen.getByTestId("research-reason-raw")).toHaveTextContent("template_search_unavailable:RuntimeError:boom");
      cleanup();
      mockBff({ code: "weird_new_code" });
      renderResearch();
      expect(await screen.findByText("Failure reason not recognised")).toBeInTheDocument();
      expect(screen.getByTestId("research-reason-raw")).toHaveTextContent("weird_new_code");
    });

    it("shows unavailable, not zero, when the demand owner is unavailable", async () => {
      mockBff({ demands: [], surface: { status: "unavailable", reason: "owner_read_failed:RuntimeError" } });
      renderResearch();
      expect(await screen.findByTestId("research-demands-unavailable")).toHaveTextContent("不代表沒有需求");
      expect(screen.queryByTestId("research-demands-empty")).not.toBeInTheDocument();
    });

    it("shows an explicit empty state when the owner answered with no open demands", async () => {
      mockBff({ demands: [] });
      renderResearch();
      expect(await screen.findByTestId("research-demands-empty")).toBeInTheDocument();
    });

    it("hides the demand section when the BFF does not return the field", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input instanceof Request ? input.url : input);
        return new Response(JSON.stringify(url.includes("/research/tickets") ? { items: [] } : body(false)), { headers: { "Content-Type": "application/json" } });
      });
      renderResearch();
      expect(await screen.findByTestId("research-row-title")).toBeInTheDocument();
      expect(screen.queryByTestId("research-demands")).not.toBeInTheDocument();
    });

    it("lists meeting research tickets with owner, due, state and meeting link", async () => {
      mockBff({ tickets: "ok" });
      renderResearch();
      const row = await screen.findByTestId("research-ticket-row");
      expect(row).toHaveTextContent("Find diversifying template");
      expect(row).toHaveTextContent("負責人：Momentum Persona A");
      expect(within(row).getByRole("link", { name: "開啟會議" })).toHaveAttribute("href", "/management/meetings/mtg-77?action=rt-20261125-001");
    });

    it("shows a denied state, not an empty list, when tickets are forbidden", async () => {
      mockBff({ tickets: "denied" });
      renderResearch();
      expect(await screen.findByTestId("research-tickets-denied")).toHaveTextContent("沒有檢視會議研究工單的權限");
      expect(screen.queryByTestId("research-tickets-empty")).not.toBeInTheDocument();
    });

    it("shows empty only when the ticket read succeeded with no rows", async () => {
      mockBff({ tickets: "empty" });
      renderResearch();
      expect(await screen.findByTestId("research-tickets-empty")).toBeInTheDocument();
    });
  });
});
