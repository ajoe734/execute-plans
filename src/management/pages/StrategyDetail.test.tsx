// FE-RISK-STRATEGY-RESEARCH-UI-20261120 WP6.2 — StrategyDetail overview.
// Fixtures follow the BFF contract shape of GET /bff/strategies/{id} for a real
// pool strategy and for a strat-tw-official synthetic stub (is_synthetic_or_stub).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "@/i18n";
import { StrategyDetail } from "./StrategyDetail";
import { bffV1, managementConsoleReads, realtime, type Strategy } from "@/lib/bff-v1";
import {
  RECORDED_A81B_POOL_MEMBER_RULE,
  RECORDED_A81B_STRATEGY,
} from "@/management/components/detail/__fixtures__/poolRules";

const REAL_POOL_STRATEGY = {
  id: "strategy-persona-298e138c136c9840b0e4",
  name: "青禾｜2330 台股 Paper 學習 R2 Paper Strategy",
  alpha: "momentum.v1",
  state: "approved",
  risk: "low",
  owner: "operator",
  capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
  personaIds: ["persona-be19a1fac471247f2b2a"],
  personaStates: [{ personaId: "persona-be19a1fac471247f2b2a", state: "paper_owner" }],
  persona_display_names: { "persona-be19a1fac471247f2b2a": "青禾｜2330 台股 Paper 學習 R2" },
  operationalStatus: "running",
  symbols: ["2330"],
  rules: [
    {
      registryId: "rule-trading-1",
      role: "trading",
      strategyLogic: { kind: "momentum_threshold", lookback_parameter: "lookback", threshold_parameter: "threshold" },
      parameters: { lookback: 20, threshold: 0, symbols: ["2330"] },
    },
  ],
  is_synthetic_or_stub: false,
  pnl30d: 0.04,
  sharpe: 1.1,
  drawdown: 0.03,
  updatedAt: "2026-11-20T00:00:00Z",
} as unknown as Strategy;

const OFFICIAL_STUB = {
  id: "strat-tw-official",
  name: "strat-tw-official",
  alpha: "",
  state: "approved",
  risk: "low",
  owner: "system",
  capitalPoolId: "",
  personaIds: [],
  personaStates: [],
  operationalStatus: "unknown",
  rules: [],
  is_synthetic_or_stub: true,
  stub_reason: "no_rules",
  pnl30d: null,
  sharpe: null,
  drawdown: null,
  updatedAt: "2026-11-20T00:00:00Z",
} as unknown as Strategy;

function mockRest() {
  vi.spyOn(bffV1.jobs, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.approvals, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.incidents, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.research, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.evolution, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.watchers, "forSubject").mockResolvedValue([]);
  vi.spyOn(bffV1.decisionJournal, "forSubject").mockResolvedValue([]);
}

function renderPage(id: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/management/strategies/${id}`]}>
        <Routes>
          <Route path="/management/strategies/:id" element={<StrategyDetail />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("StrategyDetail overview (FE-RISK-STRATEGY-RESEARCH-UI-20261120)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-TW");
    mockRest();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("real pool strategy: shows persona display name with id secondary and a plain-language rules summary, no discovery dashes", async () => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(REAL_POOL_STRATEGY);
    renderPage(REAL_POOL_STRATEGY.id);
    const name = await screen.findByTestId("strategy-bound-persona-name-persona-be19a1fac471247f2b2a");
    expect(name).toHaveTextContent("青禾｜2330 台股 Paper 學習 R2");
    expect(screen.getByTestId("strategy-bound-persona-persona-be19a1fac471247f2b2a")).toHaveTextContent(
      "persona-be19a1fac471247f2b2a",
    );
    const summary = screen.getByTestId("strategy-rules-summary");
    expect(summary).toHaveTextContent("2330");
    expect(screen.getByTestId("strategy-rules-summary-rule-0")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-rules-summary-spec-link")).toBeInTheDocument();
    expect(screen.queryByTestId("strategy-stub-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("strategy-discovery")).not.toBeInTheDocument();
    expect(screen.queryByTestId("strategy-discovery-hypothesis-claim")).not.toBeInTheDocument();
  });

  it("strat-tw-official stub: renders an explicit banner naming the stub reason instead of an empty rule list", async () => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(OFFICIAL_STUB);
    renderPage(OFFICIAL_STUB.id);
    const banner = await screen.findByTestId("strategy-stub-banner");
    expect(banner).toHaveTextContent("測試／合成策略");
    expect(screen.getByTestId("strategy-stub-reason")).toHaveTextContent("尚未設定任何交易規則");
    expect(screen.queryByTestId("strategy-rules-summary")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("strategy-discovery")).not.toBeInTheDocument());
  });

  it("recorded strategy-persona-a81b4fd15944698341aa: shows pool_envelope combination, pool_member rule once when listed twice, and labels rollback_baseline as not traded", async () => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(RECORDED_A81B_STRATEGY);
    renderPage(RECORDED_A81B_STRATEGY.id);

    const summary = await screen.findByTestId("strategy-rules-summary");
    expect(screen.queryByTestId("strategy-rules-summary-empty")).not.toBeInTheDocument();

    // pool_envelope combination & risk limits
    const envelopeCard = screen.getByTestId("strategy-rule-artifact-persona-pool-a81b4fd15944698341aa-v2");
    expect(envelopeCard).toHaveTextContent("策略池打包版");
    expect(screen.getByTestId("strategy-rule-combination")).toHaveTextContent("clipped_weighted_sum_v1");
    expect(screen.getByTestId("strategy-rule-risk-limits")).toHaveTextContent("max_net_strength=1");
    expect(screen.getByTestId("strategy-rule-risk-limits")).toHaveTextContent("gross_weight_limit=1");

    // pool_member listed both at top-level and inside pool_envelope.members is shown once
    const memberItem = screen.getByTestId("strategy-rule-member-artifact-persona-paper-a81b4fd15944698341aa");
    expect(memberItem).toHaveTextContent("策略池成員");
    expect(memberItem).toHaveTextContent("權重 1");
    expect(memberItem).toHaveTextContent(
      "2330.TWSE：每根日K 收盤時，比較最新收盤價與 1 根前的收盤價：漲幅大於 0% 就買進 1 股，否則賣出 1 股。",
    );
    expect(screen.queryByTestId("strategy-rule-artifact-persona-paper-a81b4fd15944698341aa")).not.toBeInTheDocument();
    expect(
      summary.querySelectorAll('[data-testid="strategy-rule-member-artifact-persona-paper-a81b4fd15944698341aa"]'),
    ).toHaveLength(1);

    // rollback_baseline labeled as not traded (不送單回滾基準)
    const baselineCard = screen.getByTestId("strategy-rule-artifact-persona-paper-baseline-a81b4fd15944698341aa");
    expect(baselineCard).toHaveTextContent("不送單回滾基準");
    expect(baselineCard).toHaveTextContent("不送單回滾基準（正負向皆不動作，下單數量 0）");
  });

  it("deduplicates a pool_member listed twice at top level and distinguishes null rules (unavailable) from empty rules (not reported) and absent new BFF fields", async () => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValueOnce({
      ...RECORDED_A81B_STRATEGY,
      rules: [RECORDED_A81B_POOL_MEMBER_RULE, RECORDED_A81B_POOL_MEMBER_RULE],
    });
    const dupRender = renderPage(RECORDED_A81B_STRATEGY.id);
    await screen.findByTestId("strategy-rules-summary");
    expect(
      screen.getAllByTestId("strategy-rule-artifact-persona-paper-a81b4fd15944698341aa"),
    ).toHaveLength(1);
    dupRender.unmount();

    vi.spyOn(bffV1.strategies, "get").mockResolvedValueOnce({
      ...RECORDED_A81B_STRATEGY,
      rules: null,
    });
    const nullRender = renderPage(RECORDED_A81B_STRATEGY.id);
    expect(await screen.findByTestId("strategy-rules-unavailable")).toHaveTextContent(
      "無法讀取交易規則（執行套件讀取失敗）。",
    );
    expect(screen.queryByTestId("strategy-rules-summary-empty")).not.toBeInTheDocument();
    nullRender.unmount();

    const withoutNewFields = {
      id: RECORDED_A81B_STRATEGY.id,
      name: RECORDED_A81B_STRATEGY.name,
      alpha: "",
      state: "approved",
      risk: "low",
      owner: "persona-a81b4fd15944698341aa",
      capitalPoolId: "pool-persona-paper-a81b4fd15944698341aa",
      personaIds: ["persona-a81b4fd15944698341aa"],
      updatedAt: "2026-11-25T06:35:00Z",
    } as unknown as Strategy;
    vi.spyOn(bffV1.strategies, "get").mockResolvedValueOnce(withoutNewFields);
    renderPage(RECORDED_A81B_STRATEGY.id);
    expect(await screen.findByTestId("strategy-rules-summary-empty")).toHaveTextContent(
      "此策略尚未回報交易規則。",
    );
    expect(screen.queryByTestId("strategy-rules-unavailable")).not.toBeInTheDocument();
  });

  it("renders immediately after the single strategy read while secondary reads remain unresolved and one rejects, and keeps shown data on refresh without blanking", async () => {
    const never = <T,>() => new Promise<T>(() => {});
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(RECORDED_A81B_STRATEGY);
    vi.spyOn(bffV1.jobs, "list").mockImplementation(never);
    vi.spyOn(bffV1.audit, "list").mockImplementation(never);
    vi.spyOn(bffV1.approvals, "list").mockImplementation(never);
    vi.spyOn(bffV1.alerts, "list").mockImplementation(never);
    vi.spyOn(bffV1.incidents, "list").mockImplementation(never);
    vi.spyOn(bffV1.artifacts, "list").mockImplementation(never);
    vi.spyOn(bffV1.research, "list").mockImplementation(never);
    vi.spyOn(bffV1.evolution, "list").mockImplementation(never);
    vi.spyOn(bffV1.watchers, "forSubject").mockImplementation(never);
    vi.spyOn(managementConsoleReads, "lineage").mockImplementation(never);
    vi.spyOn(bffV1.decisionJournal, "forSubject").mockRejectedValue(new Error("journal timeout"));

    renderPage(RECORDED_A81B_STRATEGY.id);

    // Primary strategy header and rules summary render without waiting for secondary reads
    expect(await screen.findByText(RECORDED_A81B_STRATEGY.name)).toBeInTheDocument();
    expect(screen.getByTestId("strategy-rules-summary")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-watchers-section")).toHaveAttribute("data-section-status", "loading");
    expect(screen.getByTestId("strategy- watchers-section".replace(" ", ""))).toHaveTextContent("載入中…");

    await waitFor(() => {
      expect(screen.getByTestId("strategy-journal-section")).toHaveAttribute("data-section-status", "unavailable");
    });
    expect(screen.getByTestId("strategy-journal-section")).toHaveTextContent("決策日誌暫時無法取得");

    // Triggering a live refresh while the next strategy read is unresolved keeps the shown data on screen
    vi.spyOn(bffV1.strategies, "get").mockImplementation(never);
    await act(async () => {
      realtime.emit("data", { kind: "strategies" });
    });
    expect(screen.getByText(RECORDED_A81B_STRATEGY.name)).toBeInTheDocument();
    expect(screen.getByTestId("strategy-rules-summary")).toBeInTheDocument();
  });

  it("sends only the primary strategy read first, starts overview secondary reads only after it answers, omits jobs and tab reads on overview, and loads tab sections when opened", async () => {
    const callOrder: string[] = [];
    let resolveStrategy!: (value: Strategy) => void;
    const strategyPromise = new Promise<Strategy>((resolve) => {
      resolveStrategy = resolve;
    });

    vi.spyOn(bffV1.strategies, "get").mockImplementation(() => {
      callOrder.push("strategies.get");
      return strategyPromise;
    });
    const jobsSpy = vi.spyOn(bffV1.jobs, "list").mockImplementation(async () => {
      callOrder.push("jobs.list");
      return [];
    });
    const artifactsSpy = vi.spyOn(bffV1.artifacts, "list").mockImplementation(async () => {
      callOrder.push("artifacts.list");
      return [];
    });
    const lineageSpy = vi.spyOn(managementConsoleReads, "lineage").mockImplementation(async () => {
      callOrder.push("lineage");
      return {
        nodes: [],
        edges: [],
        meta: { status: "ok", source: "service_client", surfaces: {} },
        page_info: { total: 0, page_size: 0, has_more: false },
        has_more: false,
      };
    });
    const researchSpy = vi.spyOn(bffV1.research, "list").mockImplementation(async () => {
      callOrder.push("research.list");
      return [];
    });
    const alertsSpy = vi.spyOn(bffV1.alerts, "list").mockImplementation(async () => {
      callOrder.push("alerts.list");
      return [];
    });
    const incidentsSpy = vi.spyOn(bffV1.incidents, "list").mockImplementation(async () => {
      callOrder.push("incidents.list");
      return [];
    });
    const evolutionSpy = vi.spyOn(bffV1.evolution, "list").mockImplementation(async () => {
      callOrder.push("evolution.list");
      return [];
    });
    const approvalsSpy = vi.spyOn(bffV1.approvals, "list").mockImplementation(async () => {
      callOrder.push("approvals.list");
      return [];
    });
    const auditSpy = vi.spyOn(bffV1.audit, "list").mockImplementation(async () => {
      callOrder.push("audit.list");
      return [];
    });
    vi.spyOn(bffV1.watchers, "forSubject").mockImplementation(async () => {
      callOrder.push("watchers.forSubject");
      return [];
    });
    vi.spyOn(bffV1.decisionJournal, "forSubject").mockImplementation(async () => {
      callOrder.push("decisionJournal.forSubject");
      return [];
    });

    renderPage(RECORDED_A81B_STRATEGY.id);

    // While primary strategy read is pending, no secondary read has been sent
    await act(async () => {
      await Promise.resolve();
    });
    expect(callOrder).toEqual(["strategies.get"]);

    // Resolve primary strategy read; overview renders and only then do overview secondary reads start
    await act(async () => {
      resolveStrategy(RECORDED_A81B_STRATEGY);
    });
    expect(await screen.findByText(RECORDED_A81B_STRATEGY.name)).toBeInTheDocument();
    await waitFor(() => {
      expect(callOrder).toEqual([
        "strategies.get",
        "watchers.forSubject",
        "decisionJournal.forSubject",
      ]);
    });

    // Jobs list, full artifact list, lineage, and all tab-only reads are NOT sent on overview
    expect(jobsSpy).not.toHaveBeenCalled();
    expect(artifactsSpy).not.toHaveBeenCalled();
    expect(lineageSpy).not.toHaveBeenCalled();
    expect(researchSpy).not.toHaveBeenCalled();
    expect(alertsSpy).not.toHaveBeenCalled();
    expect(incidentsSpy).not.toHaveBeenCalled();
    expect(evolutionSpy).not.toHaveBeenCalled();
    expect(approvalsSpy).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();

    // Tab labels do not display zero counts from unrequested secondary reads
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.textContent ?? "").not.toMatch(/\(\s*0\s*\)/);
    }

    // Opening a tab triggers its read lazily and keeps its own loading/unavailable state
    let resolveResearch!: (value: never[]) => void;
    researchSpy.mockImplementationOnce(() => {
      callOrder.push("research.list");
      return new Promise((resolve) => {
        resolveResearch = resolve;
      });
    });
    const expTab = screen.getByRole("tab", { name: /研究項目|Experiments/i });
    fireEvent.pointerDown(expTab);
    fireEvent.mouseDown(expTab);
    fireEvent.pointerUp(expTab);
    fireEvent.mouseUp(expTab);
    fireEvent.click(expTab);

    expect(await screen.findByTestId("strategy-experiments-section")).toHaveAttribute(
      "data-section-status",
      "loading",
    );
    expect(researchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveResearch([]);
    });
    await waitFor(() => {
      expect(screen.getByTestId("strategy-experiments-section")).toHaveAttribute(
        "data-section-status",
        "ready",
      );
    });

    // Opening Artifacts tab loads lineage and artifacts only on open
    const artTab = screen.getByRole("tab", { name: /^(Artifacts|Artifact)/i });
    fireEvent.pointerDown(artTab);
    fireEvent.mouseDown(artTab);
    fireEvent.pointerUp(artTab);
    fireEvent.mouseUp(artTab);
    fireEvent.click(artTab);

    await waitFor(() => {
      expect(lineageSpy).toHaveBeenCalledWith(RECORDED_A81B_STRATEGY.id);
      expect(artifactsSpy).toHaveBeenCalledTimes(1);
    });
    expect(jobsSpy).not.toHaveBeenCalled();
  });
});
