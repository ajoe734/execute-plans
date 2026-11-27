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

// BFF-ALPHA-FACTORY-PIPELINE-TRUTH-20261125 shapes: the four hosted admissions of 2026-09-13
// to 2026-10-31 have no recorded gate pass, so they arrive in data.document_checked.
const asDocumentChecked = (card: Record<string, unknown>, reason: string) => ({
  ...card,
  lane: "document_checked",
  document_check_reason: reason,
});

const HOSTED_DOCUMENT_CHECKED = [
  asDocumentChecked(REAL_REPLICATED_2330, "no_passing_gate_result"),
  asDocumentChecked(REAL_REPLICATED_SPY_ANCHOR, "simulation_or_raw_market_seed"),
  asDocumentChecked(REAL_REPLICATED_H12_01A11, "retired"),
  asDocumentChecked(REAL_REPLICATED_H12_CLAUDE, "retired"),
];

const PASSED_2330 = {
  ...REAL_REPLICATED_2330,
  id: "adm-passed-2330",
  admission_id: "adm-passed-2330",
  gate: { passed: true, source: "owner_run_gate" },
};

const DEMAND_MOMENTUM = {
  id: "rd-momentum",
  lane: "discovered",
  kind: "research_demand",
  demand_id: "rd-momentum",
  persona_id: "persona-momentum",
  display_name: "Momentum Scout",
  lacking: { short_measure: "effective_bets", missing_datasets: ["tw_margin_daily"], tried_families: ["time_series"] },
  since: "2026-11-20T02:00:00Z",
  status: "open",
  latest_outcome: {
    reason_code: "mandate_universe_missing",
    reason: "template_search_unavailable:ValueError:mandate_universe_missing",
  },
};

const DEMAND_UNNAMED = {
  id: "rd-unnamed",
  lane: "discovered",
  kind: "research_demand",
  demand_id: "rd-unnamed",
  persona_id: "persona-unnamed",
  display_name: null,
  lacking: { short_measure: "idle_day_share", missing_datasets: [], tried_families: [] },
  since: "2026-11-22T05:30:00Z",
  status: "open",
  latest_outcome: { reason_code: null, reason: null },
};

const SEARCH_FAILED_KNOWN = {
  id: "template-search:rd-momentum",
  lane: "scaffolded",
  kind: "template_search",
  demand_id: "rd-momentum",
  persona_id: "persona-momentum",
  display_name: "Momentum Scout",
  attempt_count: 3,
  latest_run_id: "rrun-20261124-002",
  latest_at: "2026-11-24T10:03:00Z",
  outcome: "failed",
  reason_code: "mandate_universe_missing",
  reason: "template_search_unavailable:ValueError:mandate_universe_missing",
};

const SEARCH_FAILED_UNKNOWN = {
  ...SEARCH_FAILED_KNOWN,
  id: "template-search:rd-unnamed",
  demand_id: "rd-unnamed",
  persona_id: "persona-unnamed",
  display_name: null,
  attempt_count: 1,
  reason_code: "quota_wall_hit",
  reason: "quota_wall_hit: provider returned 429",
};

const OK_COUNTS = {
  collected_text_records: { value: 4204, status: "ok" },
  dropped_irrelevant: { value: 3565, status: "ok" },
  hypothesis_cards: { value: 7, status: "ok" },
  templates_registered: { value: 182, status: "ok" },
  templates_evaluated: { value: 12, status: "ok" },
  searches: { value: 3, status: "ok" },
  passes: { value: 1, status: "ok" },
};

const HOSTED_COUNTS = {
  collected_text_records: { value: null, status: "unavailable", reason: "no_bounded_owner_read" },
  dropped_irrelevant: { value: null, status: "unavailable", reason: "no_bounded_owner_read" },
  hypothesis_cards: { value: null, status: "unavailable", reason: "no_bounded_owner_read" },
  templates_registered: { value: 182, status: "ok" },
  templates_evaluated: { value: 0, status: "ok" },
  searches: { value: null, status: "unavailable", reason: "owner_read_failed" },
  passes: { value: null, status: "unavailable", reason: "owner_read_failed" },
};

function buildBffAlphaFactoryPayload(overrides?: {
  discovered?: unknown[];
  scaffolded?: unknown[];
  replicated?: unknown[];
  documentChecked?: unknown[];
  counts?: Record<string, unknown> | null;
  surface?: { status: string; source?: string; message?: string };
  extraSurfaces?: Record<string, unknown>;
}) {
  const discovered = overrides?.discovered ?? [DEMAND_MOMENTUM, DEMAND_UNNAMED];
  const scaffolded = overrides?.scaffolded ?? [
    SEARCH_FAILED_KNOWN,
    SEARCH_FAILED_UNKNOWN,
    REAL_SCAFFOLDED_2317,
    REAL_SCAFFOLDED_NULL_FIELDS_2454,
  ];
  const replicated = overrides?.replicated ?? [];
  const documentChecked = overrides?.documentChecked ?? HOSTED_DOCUMENT_CHECKED;
  const surface = overrides?.surface ?? { status: "ok", source: "research_orchestrator" };
  const items = [...discovered, ...scaffolded, ...replicated];

  return {
    data: {
      id: "alpha-factory",
      snapshotAt: "2026-11-25T00:00:00Z",
      snapshot_at: "2026-11-25T00:00:00Z",
      lanes: [
        { id: "discovered", label: "Discovered", items: discovered },
        { id: "scaffolded", label: "Scaffolded", items: scaffolded },
        { id: "replicated", label: "Replicated", items: replicated },
      ],
      discovered,
      scaffolded,
      replicated,
      document_checked: documentChecked,
      ...(overrides?.counts === null ? {} : { counts: overrides?.counts ?? OK_COUNTS }),
      items,
      templates: [],
    },
    items,
    page_info: { page: 1, page_size: 20, total: items.length, next_page_token: null },
    meta: {
      snapshot_at: "2026-11-25T00:00:00Z",
      surfaces: {
        alpha_factory: surface,
        alpha_factory_strategy_state: { status: "ok", source: "registry" },
        alpha_factory_demands: { status: "ok", source: "research_orchestrator" },
        alpha_factory_runs: { status: "ok", source: "research_orchestrator", runs_seen: 3 },
        ...(overrides?.extraSurfaces ?? {}),
      },
      filters: { lane: null },
    },
  };
}

function mockFetch(payload: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
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

describe("AlphaFactoryBoardPage pipeline truth (FE-ALPHA-FACTORY-PIPELINE-TRUTH-20261125)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    setLiveEnv();
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://api.dev.mvl-cap.tw" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    liveStatus._reset();
    vi.restoreAllMocks();
  });

  it("populated: reads only GET /bff/alpha-factory and shows stage counts, plain titles, links and a real pass", async () => {
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
      meta: { surfaces: { strategies: { status: "ok", source: "runtime_pipeline_manifests" } } },
    };
    const strategiesSpy = vi.spyOn(lists, "strategies").mockResolvedValue(strategyEnvelope);
    const fetchSpy = mockFetch(buildBffAlphaFactoryPayload({ replicated: [PASSED_2330] }));

    renderBoard();

    const counts = await screen.findByTestId("alpha-factory-stage-counts");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.dev.mvl-cap.tw/bff/alpha-factory");
    const init = fetchSpy.mock.calls[0][1] as RequestInit | undefined;
    expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
    expect(strategiesSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("background advance verification R4")).not.toBeInTheDocument();

    // One line of stage counts in pipeline order.
    expect(within(counts).getAllByRole("listitem").map((li) => li.getAttribute("data-testid"))).toEqual([
      "alpha-factory-stage-collected",
      "alpha-factory-stage-dropped",
      "alpha-factory-stage-cards",
      "alpha-factory-stage-templates",
      "alpha-factory-stage-searches",
      "alpha-factory-stage-passes",
    ]);
    expect(screen.getByTestId("alpha-factory-stage-collected-value")).toHaveTextContent("4204");
    expect(screen.getByTestId("alpha-factory-stage-dropped-value")).toHaveTextContent("3565");
    expect(screen.getByTestId("alpha-factory-stage-cards-value")).toHaveTextContent("7");
    expect(screen.getByTestId("alpha-factory-stage-templates-value")).toHaveTextContent("12 of 182 registered");
    expect(screen.getByTestId("alpha-factory-stage-searches-value")).toHaveTextContent("3");
    expect(screen.getByTestId("alpha-factory-stage-passes-value")).toHaveTextContent("1");

    // Discovered: titled by persona and what is sought; ids secondary; links to persona and research items.
    const discovered = screen.getByTestId("alpha-factory-lane-discovered");
    expect(within(discovered).getByText("Who is looking for what")).toBeInTheDocument();
    const demand = within(discovered).getByTestId("alpha-factory-item-rd-momentum");
    expect(within(demand).getByTestId("alpha-factory-item-title-rd-momentum")).toHaveTextContent(
      "Momentum Scout needs: enough independent bets (diversification)",
    );
    expect(within(demand).getByTestId("alpha-factory-item-id-rd-momentum")).toHaveTextContent("rd-momentum · persona-momentum");
    expect(within(demand).getByTestId("alpha-factory-item-reason-rd-momentum")).toHaveTextContent(
      "The persona's mandate has no tradable universe, so no template could be searched.",
    );
    expect(within(demand).queryByText(/template_search_unavailable/)).not.toBeInTheDocument();
    expect(within(demand).getByRole("link", { name: /Open persona/ })).toHaveAttribute("href", "/management/personas/persona-momentum");
    expect(within(demand).getByRole("link", { name: /Open research items/ })).toHaveAttribute("href", "/management/experiments");
    expect(within(discovered).getByTestId("alpha-factory-item-title-rd-unnamed")).toHaveTextContent(
      "Persona with no recorded name needs:",
    );
    expect(within(discovered).getByTestId("alpha-factory-item-reason-rd-unnamed")).toHaveTextContent("No search outcome recorded yet.");

    // Scaffolded: failed searches with plain reasons; unknown code keeps its raw code as secondary text.
    const scaffolded = screen.getByTestId("alpha-factory-lane-scaffolded");
    const known = within(scaffolded).getByTestId("alpha-factory-item-template-search:rd-momentum");
    expect(within(known).getByTestId("alpha-factory-item-title-template-search:rd-momentum")).toHaveTextContent(
      "Template search for Momentum Scout: enough independent bets (diversification)",
    );
    expect(known).toHaveTextContent("3 attempts");
    expect(within(known).getByTestId("alpha-factory-item-reason-template-search:rd-momentum")).toHaveTextContent(
      "The persona's mandate has no tradable universe",
    );
    expect(within(known).queryByTestId("alpha-factory-item-reason-template-search:rd-momentum-raw")).not.toBeInTheDocument();
    const unknown = within(scaffolded).getByTestId("alpha-factory-item-template-search:rd-unnamed");
    expect(within(unknown).getByTestId("alpha-factory-item-reason-template-search:rd-unnamed")).toHaveTextContent(
      "Failed for a reason this page does not recognise.",
    );
    expect(within(unknown).getByTestId("alpha-factory-item-reason-template-search:rd-unnamed-raw")).toHaveTextContent(
      "Code: quota_wall_hit",
    );
    const attempt = within(scaffolded).getByTestId("alpha-factory-card-adm-scaffolded-2317");
    expect(attempt).toHaveTextContent("Backtest validation attempt");
    expect(within(attempt).getByTestId("alpha-factory-card-queue-adm-scaffolded-2317")).toHaveTextContent("failed");
    expect(within(attempt).getByTestId("alpha-factory-card-reason-adm-scaffolded-2317")).toHaveTextContent(
      "Failed for a reason this page does not recognise.",
    );
    expect(attempt).toHaveTextContent("backtest window incomplete");
    const pending = within(scaffolded).getByTestId("alpha-factory-card-adm-pending-2454");
    expect(within(pending).getByTestId("alpha-factory-card-queue-adm-pending-2454")).toHaveTextContent("Not reported");
    expect(within(pending).getAllByText("Not reported").length).toBeGreaterThanOrEqual(4);

    // Passed column: only the real gate pass, linked to its strategy.
    const passed = screen.getByTestId("alpha-factory-lane-replicated");
    expect(within(passed).getByText("Passed backtest validation")).toBeInTheDocument();
    const passCard = within(passed).getByTestId("alpha-factory-card-adm-passed-2330");
    expect(passCard).toHaveTextContent("Strategy candidate that passed validation");
    expect(within(passCard).getByRole("link", { name: /Open strategy/ })).toHaveAttribute(
      "href",
      "/management/strategies/strat-tw-official%3Atw_price_daily%3ATWSE%3A2330%3Ae4b598d99f084c19-60f9c8a78715",
    );
    expect(within(passCard).getByRole("link", { name: /Open experiment rtask-20261015-002/ })).toHaveAttribute(
      "href",
      "/management/experiments/rtask-20261015-002",
    );
    expect(within(passed).queryByTestId("alpha-factory-card-adm-replicated-2330")).not.toBeInTheDocument();

    // Document-checked records sit in a collapsed section named with their count.
    const docs = screen.getByTestId("alpha-factory-document-checked");
    expect(docs.tagName).toBe("DETAILS");
    expect(docs).not.toHaveAttribute("open");
    expect(within(docs).getByText("Test and document-check records (4)")).toBeInTheDocument();
    expect(within(docs).getByTestId("alpha-factory-document-reason-adm-replicated-2330")).toHaveTextContent(
      "No passing backtest result is recorded.",
    );
    expect(within(docs).getByTestId("alpha-factory-document-reason-adm-replicated-spy-anchor")).toHaveTextContent(
      "Built from a simulation or a raw market seed.",
    );
    expect(within(docs).getByTestId("alpha-factory-card-retired-adm-replicated-h12-01a11")).toHaveTextContent("Retired");

    // Banner shows no internal surface names.
    const banner = screen.getByTestId("alpha-factory-source-banner");
    expect(banner).toHaveAttribute("data-source-key", "live");
    expect(banner).toHaveTextContent("Live data");
    expect(banner.textContent).not.toMatch(/alpha_factory|research_orchestrator|\/bff\/|BFF|Surface:/);

    // Read-only: no write button.
    expect(screen.queryByRole("button", { name: /scaffold|replicate|promote|approve/i })).not.toBeInTheDocument();
  });

  it("empty: says plainly that none passed and that no lane has items", async () => {
    mockFetch(
      buildBffAlphaFactoryPayload({
        discovered: [],
        scaffolded: [],
        replicated: [],
        documentChecked: [],
        counts: {
          ...OK_COUNTS,
          hypothesis_cards: { value: 0, status: "ok" },
          searches: { value: 0, status: "ok" },
          passes: { value: 0, status: "ok" },
        },
      }),
    );

    renderBoard();

    expect(await screen.findByTestId("alpha-factory-empty-replicated")).toHaveTextContent(
      "No candidate has passed backtest validation yet.",
    );
    expect(screen.getByTestId("alpha-factory-empty-discovered")).toHaveTextContent(
      "No persona has an open research need and there are no hypothesis cards.",
    );
    expect(screen.getByTestId("alpha-factory-empty-scaffolded")).toHaveTextContent(
      "No template search or validation attempt has run.",
    );
    expect(screen.getByTestId("alpha-factory-stage-passes-value")).toHaveTextContent("0");
    expect(screen.getByTestId("alpha-factory-stage-passes-value")).toHaveAttribute("data-status", "ok");
    expect(screen.getByText("Test and document-check records (0)")).toBeInTheDocument();
    expect(screen.queryByText(/no_candidate_source/)).not.toBeInTheDocument();
  });

  it("unavailable: counts and lanes say unavailable with their reason and never 0 or empty", async () => {
    mockFetch(
      buildBffAlphaFactoryPayload({
        discovered: [],
        scaffolded: [],
        replicated: [],
        counts: HOSTED_COUNTS,
        extraSurfaces: {
          alpha_factory_demands: { status: "unavailable", source: "research_orchestrator", reason: "owner_read_failed" },
          alpha_factory_runs: { status: "unavailable", source: "research_orchestrator", reason: "owner_read_failed" },
        },
      }),
    );

    renderBoard();

    const collected = await screen.findByTestId("alpha-factory-stage-collected-value");
    expect(collected).toHaveTextContent("Unavailable (no bounded read of this stage exists yet)");
    expect(collected).toHaveAttribute("data-status", "unavailable");
    expect(screen.getByTestId("alpha-factory-stage-dropped-value")).toHaveTextContent("Unavailable");
    expect(screen.getByTestId("alpha-factory-stage-cards-value")).toHaveTextContent("Unavailable");
    expect(screen.getByTestId("alpha-factory-stage-templates-value")).toHaveTextContent("0 of 182 registered");
    expect(screen.getByTestId("alpha-factory-stage-searches-value")).toHaveTextContent(
      "Unavailable (the owning service did not answer)",
    );
    const passes = screen.getByTestId("alpha-factory-stage-passes-value");
    expect(passes).toHaveTextContent("Unavailable (the owning service did not answer)");
    expect(passes.textContent).not.toMatch(/\b0\b/);

    expect(screen.getByTestId("alpha-factory-unavailable-discovered")).toHaveTextContent("Unavailable");
    expect(screen.queryByTestId("alpha-factory-empty-discovered")).not.toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-unavailable-scaffolded")).toHaveTextContent("Unavailable");
    expect(screen.queryByTestId("alpha-factory-empty-scaffolded")).not.toBeInTheDocument();
    // With no gate results the page cannot say "none passed".
    expect(screen.getByTestId("alpha-factory-unavailable-replicated")).toHaveTextContent("Unavailable");
    expect(screen.queryByTestId("alpha-factory-empty-replicated")).not.toBeInTheDocument();
  });

  it("unavailable: an older payload without counts never shows 0", async () => {
    mockFetch(buildBffAlphaFactoryPayload({ counts: null }));
    renderBoard();
    const counts = await screen.findByTestId("alpha-factory-stage-counts");
    for (const key of ["collected", "dropped", "cards", "templates", "searches", "passes"]) {
      const value = within(counts).getByTestId(`alpha-factory-stage-${key}-value`);
      expect(value).toHaveAttribute("data-status", "unavailable");
      expect(value).toHaveTextContent("Unavailable (not reported by the server)");
    }
  });

  it("failed: the whole board read failing shows the error state and never empty columns", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    renderBoard();

    const alert = await screen.findByTestId("alpha-factory-degraded-state");
    expect(alert).toHaveTextContent("The Alpha factory could not be loaded");
    expect(screen.getByTestId("alpha-factory-source-banner")).toHaveAttribute("data-source-key", "degraded");
    expect(screen.queryByTestId("alpha-factory-columns")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alpha-factory-stage-counts")).not.toBeInTheDocument();
  });

  it("failed: an unavailable board surface shows its reason and hides the lanes", async () => {
    mockFetch(
      buildBffAlphaFactoryPayload({
        discovered: [],
        scaffolded: [],
        replicated: [],
        surface: { status: "unavailable", source: "research_orchestrator", message: "upstream timeout" },
      }),
    );

    renderBoard();

    const alert = await screen.findByTestId("alpha-factory-degraded-state");
    expect(alert).toHaveTextContent("The research service did not return the pipeline (upstream timeout).");
    const banner = screen.getByTestId("alpha-factory-source-banner");
    expect(banner).toHaveAttribute("data-source-key", "degraded");
    expect(banner.textContent).not.toMatch(/alpha_factory|research_orchestrator|Surface:/);
    expect(screen.queryByTestId("alpha-factory-columns")).not.toBeInTheDocument();
  });

  it("renders zh-TW titles, reasons and the document-check section in plain Chinese", async () => {
    await i18n.changeLanguage("zh-TW");
    mockFetch(buildBffAlphaFactoryPayload());

    renderBoard();

    expect(await screen.findByTestId("alpha-factory-item-title-rd-momentum")).toHaveTextContent(
      "Momentum Scout 需要：足夠的獨立押注（分散度）",
    );
    expect(screen.getByText("誰在找什麼")).toBeInTheDocument();
    expect(screen.getByText("搜尋與驗證嘗試")).toBeInTheDocument();
    expect(screen.getByText("通過回測驗證")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-empty-replicated")).toHaveTextContent("目前沒有任何候選通過回測驗證。");
    expect(screen.getByTestId("alpha-factory-item-reason-template-search:rd-momentum")).toHaveTextContent(
      "Persona 任務沒有可交易標的範圍，無法搜尋範本。",
    );
    expect(screen.getByTestId("alpha-factory-item-reason-template-search:rd-unnamed-raw")).toHaveTextContent(
      "代碼：quota_wall_hit",
    );
    expect(screen.getByText("測試與文件檢查紀錄（4）")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-stage-templates-value")).toHaveTextContent("12 / 已登錄 182");
    expect(screen.getByTestId("alpha-factory-source-banner")).toHaveTextContent("即時資料");

    fireEvent.click(screen.getByRole("button", { name: "開啟策略列表" }));
    expect(await screen.findByTestId("strategies-list-route")).toBeInTheDocument();
  });

  it("mock mode shows the sample pipeline through the same code path with nothing passed", async () => {
    vi.unstubAllEnvs();
    liveStatus._reset({ mode: "mock", effective: "mock", baseUrl: "" });

    renderBoard();

    expect(await screen.findByTestId("alpha-factory-item-rd-mock-momentum-breadth")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-item-template-search:rd-mock-momentum-breadth")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-card-adm-scaffolded-2317")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-empty-replicated")).toHaveTextContent(
      "No candidate has passed backtest validation yet.",
    );
    expect(screen.getByText("Test and document-check records (4)")).toBeInTheDocument();
    expect(screen.getByTestId("alpha-factory-source-banner")).toHaveAttribute("data-source-key", "mock");
    expect(screen.getByTestId("alpha-factory-stage-collected-value")).toHaveAttribute("data-status", "unavailable");
  });
});
