import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import i18n from "@/i18n";
import { lists, type ListEnvelope, type Strategy } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { AlphaFactoryBoardPage } from "./AlphaFactoryBoard";

const setLiveEnv = () => {
  vi.stubEnv("MODE", "production");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "strict");
  vi.stubEnv("VITE_BFF_BASE_URL", "https://api.dev.mvl-cap.tw");
};

const REAL_REPLICATED_2330 = {
  id: "adm-replicated-2330",
  admission_id: "adm-replicated-2330",
  tenant_id: "default",
  lane: "replicated",
  strategy_id: "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
  strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-da7cb8297afb",
  spec_version: "1.0.0",
  checksum: "sha256:2330",
  approval_decision_id: "apr-2330",
  approver: "pantheon-dev-approver",
  approved_at: "2026-08-14T01:00:00Z",
  requested_by: "pantheon-dev-operator",
  review_ref: "mrev-2330",
  mode: "paper",
  created_at: "2026-08-14T01:05:00Z",
  status: "admitted",
  admission_status: "admitted",
  queue_status: "completed",
  enqueued_at: "2026-08-14T01:06:00Z",
  enqueued_by: "pantheon-dev-operator",
  attempt_count: 0,
  max_attempts: 2,
  experiment_task_id: "rtask-20260814-001",
  experiment_run_ids: [
    "rrun-20260814-001",
    "rrun-20260901-004",
    "rrun-20261015-002",
    "rrun-20261016-003",
  ],
  authority_task_id: "rtask-20261015-002",
  authority_run_ids: ["rrun-20261015-002"],
  last_revalidation_at: "2026-10-15T08:30:00Z",
  last_error: null,
  replay_count: 1,
  last_replayed_at: "2026-10-16T02:54:42Z",
  revalidation_count: 1,
  strategy_state: "approved",
};

const REAL_REPLICATED_SPY_ANCHOR = {
  id: "adm-replicated-spy-anchor",
  admission_id: "adm-replicated-spy-anchor",
  tenant_id: "default",
  lane: "replicated",
  strategy_id:
    "strat-src-dev-product-20260913T040439Z-7935481ca72f49629606e01098c3a54e-spy-anchor-7e96a8404f3c",
  strategy_spec_id:
    "reg-strategy-spec-src-dev-product-20260913T040439Z-7935481ca72f49629606e01098c3a54e-spy-anchor",
  spec_version: "1.0.0",
  checksum: "sha256:7e96a8404f3c",
  approval_decision_id: "apr-spy-anchor",
  approver: "pantheon-dev-approver",
  approved_at: "2026-09-13T04:05:00Z",
  requested_by: "pantheon-dev-operator",
  review_ref: "mrev-spy-anchor",
  mode: "paper",
  created_at: "2026-09-13T04:06:00Z",
  status: "admitted",
  admission_status: "admitted",
  queue_status: "completed",
  enqueued_at: "2026-09-13T04:07:00Z",
  enqueued_by: "pantheon-dev-operator",
  attempt_count: 0,
  max_attempts: 2,
  experiment_task_id: "rtask-20260913-001",
  experiment_run_ids: ["rrun-20260913-001"],
  authority_task_id: "rtask-20260913-002",
  authority_run_ids: ["rrun-20260913-002"],
  last_revalidation_at: "2026-09-13T04:10:00Z",
  last_error: null,
  replay_count: 0,
  last_replayed_at: null,
  revalidation_count: 1,
  strategy_state: "approved",
};

const REAL_REPLICATED_H12_01A11 = {
  id: "adm-replicated-h12-01a11",
  admission_id: "adm-replicated-h12-01a11",
  tenant_id: "default",
  lane: "replicated",
  strategy_id: "strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8",
  strategy_spec_id: "reg-strategy-spec-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8",
  spec_version: "1.0.0",
  checksum: "sha256:e018ff6d0eb8",
  approval_decision_id: "apr-h12-01a11",
  approver: "pantheon-dev-approver",
  approved_at: "2026-10-23T02:00:00Z",
  requested_by: "pantheon-dev-operator",
  review_ref: "mrev-h12-01a11",
  mode: "paper",
  created_at: "2026-10-23T02:05:00Z",
  status: "admitted",
  admission_status: "admitted",
  queue_status: "completed",
  enqueued_at: "2026-10-23T02:06:00Z",
  enqueued_by: "pantheon-dev-operator",
  attempt_count: 0,
  max_attempts: 2,
  experiment_task_id: "rtask-20261023-001",
  experiment_run_ids: [
    "rrun-20261023-001",
    "rrun-20261023-002",
    "rrun-20261024-001",
    "rrun-20261024-002",
  ],
  authority_task_id: "rtask-20261024-002",
  authority_run_ids: ["rrun-20261024-002"],
  last_revalidation_at: "2026-10-24T02:30:00Z",
  last_error: null,
  replay_count: 1,
  last_replayed_at: "2026-10-24T02:28:22Z",
  revalidation_count: 1,
  strategy_state: "retired",
};

const REAL_REPLICATED_H12_CLAUDE = {
  id: "adm-replicated-h12-claude",
  admission_id: "adm-replicated-h12-claude",
  tenant_id: "default",
  lane: "replicated",
  strategy_id: "strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a",
  strategy_spec_id: "reg-strategy-spec-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a",
  spec_version: "1.0.0",
  checksum: "sha256:106b4057d07a",
  approval_decision_id: "apr-h12-claude",
  approver: "pantheon-dev-approver",
  approved_at: "2026-10-27T01:00:00Z",
  requested_by: "pantheon-dev-operator",
  review_ref: "mrev-h12-claude",
  mode: "paper",
  created_at: "2026-10-27T01:05:00Z",
  status: "admitted",
  admission_status: "admitted",
  queue_status: "completed",
  enqueued_at: "2026-10-27T01:06:00Z",
  enqueued_by: "pantheon-dev-operator",
  attempt_count: 0,
  max_attempts: 2,
  experiment_task_id: "rtask-20261027-001",
  experiment_run_ids: ["rrun-20261027-001"],
  authority_task_id: "rtask-20261027-002",
  authority_run_ids: ["rrun-20261027-002"],
  last_revalidation_at: "2026-10-27T01:10:00Z",
  last_error: null,
  replay_count: 0,
  last_replayed_at: null,
  revalidation_count: 1,
  strategy_state: "retired",
};

const REAL_SCAFFOLDED_2317 = {
  id: "adm-scaffolded-2317",
  admission_id: "adm-scaffolded-2317",
  tenant_id: "default",
  lane: "scaffolded",
  strategy_id: "strat-tw-official:tw_price_daily:TWSE:2317:9a8b7c6d5e4f3a2b-112233445566",
  strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2317:9a8b7c6d5e4f3a2b-665544332211",
  spec_version: "1.0.0",
  checksum: "sha256:2317",
  approval_decision_id: "apr-2317",
  approver: "pantheon-dev-approver",
  approved_at: "2026-08-15T02:00:00Z",
  requested_by: "pantheon-dev-operator",
  review_ref: "mrev-2317",
  mode: "paper",
  created_at: "2026-08-15T02:05:00Z",
  status: "admitted",
  admission_status: "admitted",
  queue_status: "failed",
  enqueued_at: "2026-08-15T02:06:00Z",
  enqueued_by: "pantheon-dev-operator",
  attempt_count: 2,
  max_attempts: 2,
  experiment_task_id: "rtask-20260815-003",
  experiment_run_ids: ["rrun-20260815-003"],
  authority_task_id: null,
  authority_run_ids: [],
  last_revalidation_at: null,
  last_error: "backtest window incomplete",
  replay_count: 0,
  last_replayed_at: null,
  revalidation_count: 0,
  strategy_state: "approved",
};

const REAL_SCAFFOLDED_NULL_FIELDS_2454 = {
  id: "adm-pending-2454",
  admission_id: "adm-pending-2454",
  tenant_id: "default",
  lane: "scaffolded",
  strategy_id: "strat-tw-official:tw_price_daily:TWSE:2454:1122334455667788-aabbccddeeff",
  strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2454:1122334455667788-ffeeddccbbaa",
  spec_version: "1.0.0",
  checksum: "sha256:2454",
  approval_decision_id: "apr-2454",
  approver: "pantheon-dev-approver",
  approved_at: "2026-08-16T03:00:00Z",
  requested_by: "pantheon-dev-operator",
  review_ref: "mrev-2454",
  mode: "paper",
  created_at: "2026-08-16T03:05:00Z",
  status: "admitted",
  admission_status: "admitted",
  queue_status: null,
  enqueued_at: null,
  enqueued_by: null,
  attempt_count: null,
  max_attempts: null,
  experiment_task_id: null,
  experiment_run_ids: null,
  authority_task_id: null,
  authority_run_ids: null,
  last_revalidation_at: null,
  last_error: null,
  replay_count: null,
  last_replayed_at: null,
  revalidation_count: null,
  strategy_state: null,
};

function buildBffAlphaFactoryPayload(overrides?: {
  discovered?: unknown[];
  scaffolded?: unknown[];
  replicated?: unknown[];
  reason?: string | null;
  surface?: { status: string; source?: string; message?: string };
}) {
  const discovered = overrides?.discovered ?? [];
  const scaffolded = overrides?.scaffolded ?? [
    REAL_SCAFFOLDED_2317,
    REAL_SCAFFOLDED_NULL_FIELDS_2454,
  ];
  const replicated = overrides?.replicated ?? [
    REAL_REPLICATED_2330,
    REAL_REPLICATED_SPY_ANCHOR,
    REAL_REPLICATED_H12_01A11,
    REAL_REPLICATED_H12_CLAUDE,
  ];
  const reason = overrides?.reason !== undefined ? overrides.reason : "no_candidate_source";
  const surface = overrides?.surface ?? {
    status: "ok",
    source: "research_orchestrator",
  };
  const items = [...replicated, ...scaffolded, ...discovered];

  return {
    data: {
      id: "alpha-factory",
      snapshotAt: "2026-11-04T00:00:00Z",
      snapshot_at: "2026-11-04T00:00:00Z",
      reason,
      discovered_reason: reason,
      lanes: [
        { id: "discovered", label: "Discovered", reason, items: discovered },
        { id: "scaffolded", label: "Scaffolded", items: scaffolded },
        { id: "replicated", label: "Replicated", items: replicated },
      ],
      discovered,
      scaffolded,
      replicated,
      items,
    },
    items,
    page_info: {
      page: 1,
      page_size: 20,
      total: items.length,
      next_page_token: null,
    },
    meta: {
      snapshot_at: "2026-11-04T00:00:00Z",
      surfaces: {
        alpha_factory: surface,
      },
      filters: {
        lane: null,
      },
      discovered: {
        reason,
      },
    },
  };
}

function renderBoard() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/management/alpha-factory"]}>
        <Routes>
          <Route path="/management/alpha-factory" element={<AlphaFactoryBoardPage />} />
          <Route path="/management/strategies" element={<div data-testid="strategies-list-route">Strategies List</div>} />
          <Route path="/management/strategies/:id" element={<div data-testid="strategy-detail-route">Strategy Detail</div>} />
          <Route path="/management/experiments/:id" element={<div data-testid="experiment-detail-route">Experiment Detail</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("AlphaFactoryBoardPage (FE-ALPHA-FACTORY-REPLICATION-20261104)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    setLiveEnv();
    liveStatus._reset({
      mode: "live",
      effective: "live",
      baseUrl: "https://api.dev.mvl-cap.tw",
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    liveStatus._reset();
    vi.restoreAllMocks();
  });

  it("reads GET /bff/alpha-factory, never reads lists.strategies, and proves a strategy with no replication record never appears on the board", async () => {
    const nonReplicatedStrategy: Strategy = {
      id: "strategy-persona-fd1281847a3b1c6a9735",
      name: "background advance verification R4",
      owner: "pantheon-dev",
      updatedAt: "2026-11-04T00:00:00Z",
      state: "deployed",
      risk: "low",
      alpha: "persona-verify",
      capitalPoolId: "pool-fd1281847a3b1c6a9735",
      personaIds: ["persona-fd1281847a3b1c6a9735"],
      pnl30d: null,
      sharpe: null,
      drawdown: 0,
    };
    const strategyEnvelope: ListEnvelope<Strategy> = {
      items: [nonReplicatedStrategy],
      cursor: {},
      pageSize: 1,
      estimatedTotal: 1,
      totalCountExact: true,
      meta: {
        surfaces: { strategies: { status: "ok", source: "runtime_pipeline_manifests" } },
      },
    };
    const strategiesSpy = vi.spyOn(lists, "strategies").mockResolvedValue(strategyEnvelope);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(buildBffAlphaFactoryPayload()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderBoard();

    const replicatedLane = await screen.findByTestId("alpha-factory-lane-replicated");
    const scaffoldedLane = screen.getByTestId("alpha-factory-lane-scaffolded");
    const discoveredLane = screen.getByTestId("alpha-factory-lane-discovered");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.dev.mvl-cap.tw/bff/alpha-factory");
    expect(strategiesSpy).not.toHaveBeenCalled();

    // Non-replicated strategy from lists.strategies never appears anywhere on the board
    expect(screen.queryByText("strategy-persona-fd1281847a3b1c6a9735")).not.toBeInTheDocument();
    expect(screen.queryByText("background advance verification R4")).not.toBeInTheDocument();
    expect(screen.queryByText(/Replicated into an active strategy/i)).not.toBeInTheDocument();

    // Subtitle and admission-checks column title + caption in en-US
    expect(
      screen.getByText(
        "Alpha pipeline kanban — Discovered candidates, Scaffolded experiments, and Admission checks passed.",
      ),
    ).toBeInTheDocument();
    expect(within(replicatedLane).getByText("Admission checks passed")).toBeInTheDocument();
    expect(within(replicatedLane).getByTestId("alpha-factory-replicated-caption")).toHaveTextContent(
      "Admission checks review the spec, lineage, and governance records and do not rerun a backtest.",
    );

    // Replicated lane shows all 4 replicated records (including retired ones, none hidden or moved)
    const repCard = within(replicatedLane).getByTestId("alpha-factory-card-adm-replicated-2330");
    const spyCard = within(replicatedLane).getByTestId("alpha-factory-card-adm-replicated-spy-anchor");
    const h12CardA = within(replicatedLane).getByTestId("alpha-factory-card-adm-replicated-h12-01a11");
    const h12CardB = within(replicatedLane).getByTestId("alpha-factory-card-adm-replicated-h12-claude");
    expect(
      within(repCard).getAllByText(
        "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(within(repCard).getByText("pantheon-dev-approver")).toBeInTheDocument();
    expect(within(repCard).getByText("2026-08-14T01:00:00Z")).toBeInTheDocument();
    expect(within(repCard).getByText("completed")).toBeInTheDocument();
    expect(within(repCard).getByText("Failures since last replay")).toBeInTheDocument();
    expect(within(repCard).getByText("Check runs")).toBeInTheDocument();
    expect(within(repCard).getByText("Replays")).toBeInTheDocument();
    expect(within(repCard).getByText("Last replayed")).toBeInTheDocument();
    expect(within(repCard).getByText("0")).toBeInTheDocument();
    expect(within(repCard).getByText("1")).toBeInTheDocument();
    expect(within(repCard).getByText("4")).toBeInTheDocument();
    expect(within(repCard).getByText("2026-10-16T02:54:42Z")).toBeInTheDocument();
    expect(within(repCard).getByText("2026-10-15T08:30:00Z")).toBeInTheDocument();
    expect(within(repCard).queryByText("Last failure reason")).not.toBeInTheDocument();
    expect(within(repCard).queryByTestId("alpha-factory-card-retired-adm-replicated-2330")).not.toBeInTheDocument();

    // spy-anchor has replay_count 0 and last_replayed_at null (omitted when null) and strategy_state approved (no badge)
    expect(within(spyCard).queryByText("Last replayed")).not.toBeInTheDocument();
    expect(within(spyCard).queryByTestId("alpha-factory-card-retired-adm-replicated-spy-anchor")).not.toBeInTheDocument();

    // Retired strategies show Retired badge and stay in replicated lane
    expect(within(h12CardA).getByTestId("alpha-factory-card-retired-adm-replicated-h12-01a11")).toHaveTextContent("Retired");
    expect(within(h12CardA).getByText("2026-10-24T02:28:22Z")).toBeInTheDocument();
    expect(within(h12CardB).getByTestId("alpha-factory-card-retired-adm-replicated-h12-claude")).toHaveTextContent("Retired");
    expect(within(h12CardB).queryByText("Last replayed")).not.toBeInTheDocument();

    // No Sharpe or risk badge is rendered because the BFF did not supply sharpe or risk
    expect(within(repCard).queryByText(/Sharpe/i)).not.toBeInTheDocument();
    expect(within(repCard).queryByText(/^Low$|^Medium$|^High$|^Critical$/i)).not.toBeInTheDocument();

    // Links encode strategy_id (which contains colons) and link authority_task_id to /management/experiments/<id>
    const strategyLink = within(repCard).getByRole("link", { name: /Open strategy/i });
    expect(strategyLink).toHaveAttribute(
      "href",
      "/management/strategies/strat-tw-official%3Atw_price_daily%3ATWSE%3A2330%3Ae4b598d99f084c19-60f9c8a78715",
    );
    const experimentLink = within(repCard).getByRole("link", {
      name: /Open experiment rtask-20261015-002/i,
    });
    expect(experimentLink).toHaveAttribute("href", "/management/experiments/rtask-20261015-002");

    // Scaffolded lane shows non-empty last_error on 2317 and "Not reported" for null fields on 2454
    const failedCard = within(scaffoldedLane).getByTestId("alpha-factory-card-adm-scaffolded-2317");
    expect(within(failedCard).getByText("Last failure reason")).toBeInTheDocument();
    expect(within(failedCard).getByText("backtest window incomplete")).toBeInTheDocument();
    const pendingCard = within(scaffoldedLane).getByTestId("alpha-factory-card-adm-pending-2454");
    expect(within(pendingCard).getAllByText("Not reported").length).toBeGreaterThanOrEqual(5);
    expect(within(pendingCard).queryByText("Last failure reason")).not.toBeInTheDocument();
    expect(within(pendingCard).queryByTestId("alpha-factory-card-retired-adm-pending-2454")).not.toBeInTheDocument();
    expect(within(pendingCard).queryByRole("link", { name: /Open experiment/i })).not.toBeInTheDocument();

    // Discovered lane shows no_candidate_source empty state and removes old "does not expose" text
    expect(within(discoveredLane).getByTestId("alpha-factory-empty-discovered")).toHaveTextContent(
      "There is no candidate source yet (no_candidate_source).",
    );
    expect(
      screen.queryByText(/The BFF does not expose alpha candidates yet/i),
    ).not.toBeInTheDocument();

    // Source banner reflects alpha_factory surface
    const banner = screen.getByTestId("alpha-factory-source-banner");
    expect(banner).toHaveTextContent("LIVE BFF");
    expect(banner).toHaveTextContent("Surface: alpha_factory · status: ok · source: research_orchestrator");
  });

  it("renders zh-TW labels, no_candidate_source empty state, and not-reported markers", async () => {
    await i18n.changeLanguage("zh-TW");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(buildBffAlphaFactoryPayload()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderBoard();

    const discoveredEmpty = await screen.findByTestId("alpha-factory-empty-discovered");
    expect(discoveredEmpty).toHaveTextContent("目前尚無候選來源（no_candidate_source）。");
    expect(
      screen.getByText("Alpha 流水線看板 — 已探索候選、已建檔實驗、已通過准入檢查的策略。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Scaffolded/)).not.toBeInTheDocument();
    expect(screen.queryByText(/BFF 尚未提供 Alpha 候選清單/)).not.toBeInTheDocument();
    expect(screen.queryByText(/已重現為正式策略/)).not.toBeInTheDocument();

    const replicatedLane = screen.getByTestId("alpha-factory-lane-replicated");
    expect(within(replicatedLane).getByText("已通過准入檢查")).toBeInTheDocument();
    expect(within(replicatedLane).getByTestId("alpha-factory-replicated-caption")).toHaveTextContent(
      "准入檢查僅檢視規格、血緣與治理紀錄，不重跑回測。",
    );

    const repCard = within(replicatedLane).getByTestId("alpha-factory-card-adm-replicated-2330");
    expect(within(repCard).getByText("本輪失敗次數")).toBeInTheDocument();
    expect(within(repCard).getByText("檢查執行次數")).toBeInTheDocument();
    expect(within(repCard).getByText("重新排入次數")).toBeInTheDocument();
    expect(within(repCard).getByText("最後重新排入時間")).toBeInTheDocument();
    expect(within(repCard).getByText("2026-10-16T02:54:42Z")).toBeInTheDocument();
    expect(within(repCard).queryByText("最後失敗原因")).not.toBeInTheDocument();

    const retiredCard = within(replicatedLane).getByTestId("alpha-factory-card-adm-replicated-h12-01a11");
    expect(
      within(retiredCard).getByTestId("alpha-factory-card-retired-adm-replicated-h12-01a11"),
    ).toHaveTextContent("已退役");

    const failedCard = screen.getByTestId("alpha-factory-card-adm-scaffolded-2317");
    expect(within(failedCard).getByText("最後失敗原因")).toBeInTheDocument();
    expect(within(failedCard).getByText("backtest window incomplete")).toBeInTheDocument();

    const pendingCard = screen.getByTestId("alpha-factory-card-adm-pending-2454");
    expect(within(pendingCard).getAllByText("未回報").length).toBeGreaterThanOrEqual(5);
    expect(within(pendingCard).queryByText("最後失敗原因")).not.toBeInTheDocument();

    // Existing open-strategy-list button works in zh-TW
    fireEvent.click(screen.getByRole("button", { name: "開啟策略列表" }));
    expect(await screen.findByTestId("strategies-list-route")).toBeInTheDocument();
  });

  it("renders discovered cards when the BFF places items in lane discovered", async () => {
    const discoveredItem = {
      ...REAL_SCAFFOLDED_2317,
      id: "adm-discovered-2303",
      admission_id: "adm-discovered-2303",
      lane: "discovered",
      strategy_id: "strat-tw-official:tw_price_daily:TWSE:2303:abcdef0123456789-001122334455",
      queue_status: "pending",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          buildBffAlphaFactoryPayload({
            discovered: [discoveredItem],
            reason: null,
          }),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderBoard();

    const discoveredLane = await screen.findByTestId("alpha-factory-lane-discovered");
    expect(
      within(discoveredLane).getByTestId("alpha-factory-card-adm-discovered-2303"),
    ).toBeInTheDocument();
  });

  it("shows the degraded error state and never empty columns when meta.surfaces.alpha_factory status is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          buildBffAlphaFactoryPayload({
            discovered: [],
            scaffolded: [],
            replicated: [],
            surface: {
              status: "unavailable",
              source: "research_orchestrator",
              message: "Research orchestrator replication read failed: upstream timeout",
            },
          }),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderBoard();

    const degradedAlert = await screen.findByTestId("alpha-factory-degraded-state");
    expect(degradedAlert).toHaveTextContent("Alpha Factory replication surface unavailable");
    expect(degradedAlert).toHaveTextContent(
      "Research orchestrator replication read failed: upstream timeout",
    );

    const banner = screen.getByTestId("alpha-factory-source-banner");
    expect(banner).toHaveAttribute("data-source-key", "degraded");
    expect(banner).toHaveTextContent(
      "Surface: alpha_factory · status: unavailable · source: research_orchestrator",
    );

    // Never renders empty columns when degraded/unavailable
    expect(screen.queryByTestId("alpha-factory-columns")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alpha-factory-empty-discovered")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alpha-factory-empty-scaffolded")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alpha-factory-empty-replicated")).not.toBeInTheDocument();
  });

  it("shows the degraded error state and never empty columns when the /bff/alpha-factory read fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Bad Gateway", { status: 502 }),
    );

    renderBoard();

    const degradedAlert = await screen.findByTestId("alpha-factory-degraded-state");
    expect(degradedAlert).toHaveTextContent("Alpha Factory replication surface unavailable");
    expect(screen.getByTestId("alpha-factory-source-banner")).toHaveAttribute(
      "data-source-key",
      "degraded",
    );
    expect(screen.queryByTestId("alpha-factory-columns")).not.toBeInTheDocument();
  });

  it("renders mock mode fixtures through the same card shape and code path", async () => {
    vi.unstubAllEnvs();
    liveStatus._reset({ mode: "mock", effective: "mock", baseUrl: "" });

    renderBoard();

    const repCard = await screen.findByTestId("alpha-factory-card-adm-replicated-2330");
    expect(
      within(repCard).getAllByText(
        "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("alpha-factory-card-adm-replicated-spy-anchor")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-card-adm-replicated-h12-01a11")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-card-adm-replicated-h12-claude")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-card-retired-adm-replicated-h12-01a11")).toHaveTextContent(
      "Retired",
    );
    expect(screen.getByTestId("alpha-factory-card-retired-adm-replicated-h12-claude")).toHaveTextContent(
      "Retired",
    );
    expect(screen.getByTestId("alpha-factory-card-adm-scaffolded-2317")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-card-adm-pending-2454")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-empty-discovered")).toHaveTextContent(
      "There is no candidate source yet (no_candidate_source).",
    );
    expect(screen.getByTestId("alpha-factory-source-banner")).toHaveAttribute(
      "data-source-key",
      "mock",
    );
  });
});
