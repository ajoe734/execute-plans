import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lists, type Artifact, type Deployment, type Persona, type Strategy } from "@/lib/bff-v1";
import {
  ArtifactsList,
  DeploymentsList,
  PersonasList,
  RankingFormulasList,
  StrategiesList,
  extractHiddenNonRealCount,
  extractHiddenRetiredPersonaCount,
  extractHiddenTestBreakdown,
  extractHiddenTestPersonaStrategyCount,
  extractIncludeTestPersonas,
  extractPersonaExclusionScope,
  extractStrategyPageInfoTotal,
  extractStrategyStateCounts,
  hasNonTradingPersonaExclusionScope,
  normalizeStrategyFilterParam,
  normalizeStrategyOperationalStatus,
  resolveStrategyListQuery,
  shortenHash,
} from "./Lists";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shortenHash", () => {
  it("shortens the real artifact sha256 and keeps prefix", () => {
    const full = "sha256:38fb8f49fbee0b7131014b14c432fdd8dc521d522b4c76be2e04d002608e008e";
    const short = shortenHash(full);
    expect(short).toBe("sha256:38fb8f49…e008e".replace("…e008e", "…" + full.slice(-6)));
    expect(short.length).toBeLessThan(full.length / 2);
    expect(full.startsWith("sha256:38fb8f49")).toBe(true);
    expect(full.endsWith(short.slice(-6))).toBe(true);
  });
  it("leaves short values alone", () => {
    expect(shortenHash("abc123")).toBe("abc123");
  });
});

describe("StrategiesList state filter and query helpers", () => {
  it("maps default, all, and explicit DTO state filters to BFF query options", () => {
    expect(normalizeStrategyFilterParam(null)).toBe("default");
    expect(normalizeStrategyFilterParam("")).toBe("default");
    expect(normalizeStrategyFilterParam("default")).toBe("default");
    expect(normalizeStrategyFilterParam("approved")).toBe("approved");
    expect(normalizeStrategyFilterParam("paper_running")).toBe("paper_running");
    expect(normalizeStrategyFilterParam("all")).toBe("all");

    expect(resolveStrategyListQuery("default")).toEqual({
      exclude_state: "draft",
      hide_retired_personas: true,
      page_size: 20,
    });
    expect(resolveStrategyListQuery("all", "20")).toEqual({
      page_size: 20,
      page_token: "20",
    });
    expect(resolveStrategyListQuery("approved", "40")).toEqual({
      state: "approved",
      page_size: 20,
      page_token: "40",
    });
  });

  it("extracts per-state counts, page_info.total, and hidden_retired_persona_count without client-side defaultCount summing", () => {
    // FE-REGISTRY-LISTS-CURRENT-FIRST-20261125: tab numbers come from
    // meta.visible_state_counts (rows the owner did not hide); the raw
    // meta.state_counts still counts hidden test/stub rows and is never read.
    const meta = {
      visible_state_counts: {
        draft: 3217,
        review: 1,
        approved: 140,
        paper_running: 0,
        canary_running: 0,
        live_running: 0,
        deployed: 0,
        paused: 0,
        retired: 1556,
      },
      hidden_retired_persona_count: 134,
      page_info: { page_size: 20, total: 7, next_page_token: null },
    };
    const counts = extractStrategyStateCounts(meta);
    expect(counts).toEqual({
      byState: {
        draft: 3217,
        review: 1,
        approved: 140,
        paper_running: 0,
        canary_running: 0,
        live_running: 0,
        deployed: 0,
        paused: 0,
        retired: 1556,
      },
      allCount: 3358,
      draftCount: 3217,
    });
    expect("defaultCount" in (counts ?? {})).toBe(false);
    expect(extractStrategyPageInfoTotal(meta)).toBe(7);
    expect(extractHiddenRetiredPersonaCount(meta)).toBe(134);

    expect(extractStrategyStateCounts({ state_counts: null })).toBeNull();
    expect(extractStrategyStateCounts({ visible_state_counts: null })).toBeNull();
    // Raw state_counts alone (older BFF) prints no number.
    expect(extractStrategyStateCounts({ state_counts: { draft: 7421, approved: 170, retired: 1556 } })).toBeNull();
    expect(extractStrategyStateCounts({})).toBeNull();
    expect(extractStrategyStateCounts(null)).toBeNull();
    expect(extractStrategyPageInfoTotal({ page_info: {} })).toBeUndefined();
    expect(extractHiddenRetiredPersonaCount({})).toBeUndefined();
  });

  it("renders distinct operationalStatus labels for running, idle, retired, unbound, and unknown and never shows unknown as running or retired", async () => {
    expect(normalizeStrategyOperationalStatus("running")).toBe("running");
    expect(normalizeStrategyOperationalStatus("idle")).toBe("idle");
    expect(normalizeStrategyOperationalStatus("retired")).toBe("retired");
    expect(normalizeStrategyOperationalStatus("unbound")).toBe("unbound");
    expect(normalizeStrategyOperationalStatus("unknown")).toBe("unknown");

    const rows: Strategy[] = [
      {
        id: "strategy-persona-b9f9e2e4d44cdd44d160",
        name: "Pantheon Dev Paper Release 42345302114 Attempt 1",
        owner: "persona-22582e56e0ad8a4f0ca7",
        updatedAt: "2026-11-07T07:40:00Z",
        state: "approved",
        risk: "low",
        alpha: "",
        capitalPoolId: "pool-persona-paper-b9f9e2e4d44cdd44d160",
        personaIds: ["persona-22582e56e0ad8a4f0ca7"],
        personaStates: [{ personaId: "persona-22582e56e0ad8a4f0ca7", state: "paper_running" }],
        operationalStatus: "running",
        symbols: ["2330.TW"],
        pnl: 0,
        pnl30d: 0,
        sharpe: null,
        drawdown: null,
        totalTrades: 0,
      },
      {
        id: "strategy-persona-idle-row",
        name: "Research Only Strategy",
        owner: "operator",
        updatedAt: "2026-11-07T07:40:00Z",
        state: "approved",
        risk: "low",
        alpha: "",
        capitalPoolId: "",
        personaIds: ["persona-research-1"],
        personaStates: [{ personaId: "persona-research-1", state: "research_only" }],
        operationalStatus: "idle",
        symbols: ["2330.TWSE"],
        pnl: null,
        pnl30d: null,
        sharpe: null,
        drawdown: null,
      },
      {
        id: "strategy-persona-retired-row",
        name: "Retired Persona Strategy",
        owner: "operator",
        updatedAt: "2026-11-07T07:40:00Z",
        state: "approved",
        risk: "low",
        alpha: "",
        capitalPoolId: "",
        personaIds: ["persona-retired-1"],
        personaStates: [{ personaId: "persona-retired-1", state: "retired" }],
        operationalStatus: "retired",
        symbols: ["2330.TW"],
        pnl: null,
        pnl30d: null,
        sharpe: null,
        drawdown: null,
      },
      {
        id: "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
        name: "TW Official 2330 Unbound",
        owner: "operator",
        updatedAt: "2026-11-07T07:40:00Z",
        state: "approved",
        risk: "low",
        alpha: "",
        capitalPoolId: "",
        personaIds: [],
        personaStates: [],
        operationalStatus: "unbound",
        symbols: ["2330.TW"],
        pnl: null,
        pnl30d: null,
        sharpe: null,
        drawdown: null,
      },
      {
        id: "strategy-persona-unknown-row",
        name: "Degraded Directory Strategy",
        owner: "operator",
        updatedAt: "2026-11-07T07:40:00Z",
        state: "approved",
        risk: "low",
        alpha: "",
        capitalPoolId: "",
        personaIds: ["persona-22582e56e0ad8a4f0ca7"],
        personaStates: [{ personaId: "persona-22582e56e0ad8a4f0ca7", state: "unknown" }],
        operationalStatus: "unknown",
        symbols: [],
        pnl: null,
        pnl30d: null,
        sharpe: null,
        drawdown: null,
      },
    ];

    vi.spyOn(lists, "strategies").mockResolvedValue({
      items: rows,
      cursor: {},
      pageSize: rows.length,
      estimatedTotal: rows.length,
      totalCountExact: true,
      meta: {
        state_counts: { draft: 3217, review: 1, approved: 140, retired: 1556 },
        hidden_retired_persona_count: 134,
        page_info: { page_size: 20, total: 7, next_page_token: null },
      },
    });

    render(
      <MemoryRouter initialEntries={["/management/strategies"]}>
        <StrategiesList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Pantheon Dev Paper Release 42345302114 Attempt 1")).toBeInTheDocument();
    });

    const badges = screen.getAllByTestId("strategy-operational-status");
    expect(badges).toHaveLength(5);
    const labelSet = new Set(badges.map((el) => el.textContent));
    expect(labelSet.size).toBe(5);
    expect(badges[4]).toHaveAttribute("data-operational-status", "unknown");
    expect(badges[4].textContent).toMatch(/Persona state could not be read|無法讀取 Persona 狀態/);
    expect(badges[4].textContent).not.toBe(badges[0].textContent);
    expect(badges[4].textContent).not.toBe(badges[2].textContent);

    const symbolCells = screen.getAllByTestId("strategy-symbols");
    expect(symbolCells[0]).toHaveTextContent("2330.TW");
    expect(symbolCells[1]).toHaveTextContent("2330.TWSE");
  });
});

describe("PersonasList and DeploymentsList show every row across pages", () => {
  it("renders every persona row past the first 20 rows including provisioning-only retired row", async () => {
    const personaRows: Persona[] = Array.from({ length: 25 }, (_, index) => ({
      id: index === 24 ? "persona-c6ef44745087d11cc138" : `persona-row-${index + 1}`,
      name:
        index === 0
          ? "青禾｜2330 台股 Paper 學習 R2"
          : index === 24
            ? "persona-c6ef44745087d11cc138"
            : `Persona Row ${index + 1}`,
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: index === 24 ? "retired" : "approved",
      risk: "low",
      archetype: "quant",
      routedStrategies: 1,
      successRate: 0.62,
    }));

    vi.spyOn(lists, "personas").mockResolvedValue({
      items: personaRows,
      cursor: {},
      pageSize: personaRows.length,
      estimatedTotal: personaRows.length,
      totalCountExact: true,
    });

    render(
      <MemoryRouter initialEntries={["/management/personas"]}>
        <PersonasList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("青禾｜2330 台股 Paper 學習 R2")).toBeInTheDocument();
      expect(screen.getByText("Persona Row 21")).toBeInTheDocument();
      expect(screen.getByText("persona-c6ef44745087d11cc138")).toBeInTheDocument();
    });
  });

  it("renders every deployment row past the first 20 rows normalized from plan_id", async () => {
    const deploymentRows: Deployment[] = Array.from({ length: 25 }, (_, index) => ({
      id:
        index === 24
          ? "plan-persona-paper-298e138c136c9840b0e4"
          : `plan-persona-paper-row-${index + 1}`,
      name:
        index === 24
          ? "plan-persona-paper-298e138c136c9840b0e4"
          : `plan-persona-paper-row-${index + 1}`,
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "deployed",
      risk: "low",
      target: "paper",
      artifactId: "artifact-persona-298e138c136c9840b0e4",
      version: "1",
    }));

    vi.spyOn(lists, "deployments").mockResolvedValue({
      items: deploymentRows,
      cursor: {},
      pageSize: deploymentRows.length,
      estimatedTotal: deploymentRows.length,
      totalCountExact: true,
    });

    render(
      <MemoryRouter initialEntries={["/management/deployments"]}>
        <DeploymentsList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("plan-persona-paper-row-1")).toBeInTheDocument();
      expect(screen.getByText("plan-persona-paper-row-21")).toBeInTheDocument();
      expect(screen.getByText("plan-persona-paper-298e138c136c9840b0e4")).toBeInTheDocument();
    });
  });
});

describe("RankingFormulasList real payload", () => {
  it("shows version and weight summary with no blank cells", async () => {
    vi.spyOn(lists, "rankingFormulas").mockResolvedValue({
      items: [{
        id: "pm12-quarterly-ranking-formula",
        version: "pm12-default-v1",
        formula_version: "pm12-default-v1",
        weights: { pnl: 0.35, risk: 0.25, execution: 0.25, activity: 0.15 },
        components: [
          { key: "pnl", label: "PnL", weight: 0.35 },
          { key: "risk", label: "Risk", weight: 0.25 },
          { key: "execution", label: "Execution", weight: 0.25 },
          { key: "activity", label: "Activity", weight: 0.15 },
        ],
      }],
      meta: {},
    } as never);
    render(<MemoryRouter><RankingFormulasList /></MemoryRouter>);
    expect(await screen.findByText("pm12-default-v1")).toBeInTheDocument();
    expect(screen.getByText("PnL 35% · Risk 25% · Execution 25% · Activity 15%")).toBeInTheDocument();
    document.querySelectorAll("tbody td").forEach((td) => expect(td.textContent?.trim()).not.toBe(""));
  });
});

describe("FE-MGMT-DISPLAY-NAMES-AND-SUMMARIES-20261120: StrategiesList test-persona filter and Artifacts/Deployments display names", () => {
  it("shows how many test-persona strategies are hidden and toggles include_test_personas filter on StrategiesList (AC3)", async () => {
    expect(extractHiddenTestPersonaStrategyCount({ hidden_test_persona_count: 14 })).toBe(14);
    expect(extractHiddenTestPersonaStrategyCount({ hidden_test_strategy_count: 9 })).toBe(9);
    expect(extractHiddenTestPersonaStrategyCount({ hidden_test_persona_strategy_count: 4, hidden_unbound_stub_strategy_count: 3 })).toBe(7);
    expect(extractHiddenTestPersonaStrategyCount({ hidden_unbound_stub_strategy_count: 3 })).toBe(3);
    expect(extractIncludeTestPersonas({ include_test_personas: true })).toBe(true);
    expect(resolveStrategyListQuery("default", undefined, { includeTestPersonas: true })).toEqual({
      exclude_state: "draft",
      hide_retired_personas: true,
      include_test_personas: true,
      page_size: 20,
    });

    const strategySpy = vi.spyOn(lists, "strategies").mockImplementation(async (query) => {
      const q = (query ?? {}) as { include_test_personas?: boolean };
      return {
        items: [
          {
            id: "strategy-prod-1",
            name: "Prod Momentum Strategy",
            owner: "operator",
            updatedAt: "2026-11-20T08:00:00Z",
            state: "approved",
            risk: "low",
            alpha: "",
            capitalPoolId: "",
            personaIds: ["persona-prod-1"],
            personaStates: [{ personaId: "persona-prod-1", state: "paper_running" }],
            operationalStatus: "running",
            symbols: ["2330.TW"],
            pnl: 0,
            pnl30d: 0,
            sharpe: null,
            drawdown: null,
          },
        ],
        cursor: {},
        pageSize: 1,
        estimatedTotal: 1,
        totalCountExact: true,
        meta: {
          state_counts: { draft: 0, approved: 1 },
          hidden_test_persona_count: 12,
          include_test_personas: Boolean(q.include_test_personas),
          page_info: { page_size: 20, total: 1, next_page_token: null },
        },
      };
    });

    render(
      <MemoryRouter initialEntries={["/management/strategies"]}>
        <StrategiesList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Prod Momentum Strategy")).toBeInTheDocument();
    });

    const banner = screen.getByTestId("strategy-test-personas-banner");
    expect(banner.textContent).toMatch(/12/);
    const toggleBtn = screen.getByTestId("strategy-toggle-test-personas-button");
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(strategySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          include_test_personas: true,
        }),
      );
      expect(screen.getByTestId("strategy-toggle-test-personas-button")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  it("renders BFF persona and strategy display names on DeploymentsList and ArtifactsList with secondary raw IDs and name_missing badges (AC1/AC4)", async () => {
    const deploymentRows: Deployment[] = [
      {
        id: "plan-named-001",
        name: "plan-named-001",
        owner: "operator",
        updatedAt: "2026-11-20T08:00:00Z",
        state: "deployed",
        risk: "low",
        target: "paper",
        artifactId: "artifact-2330",
        version: "1.0.0",
        persona_id: "persona-be19a1fac471247f2b2a",
        persona_display_name: "青禾｜2330 台股 Paper 學習 R2",
        persona_name_missing: false,
        strategy_id: "strategy-persona-2330",
        strategy_display_name: "青禾 2330 動能策略",
        strategy_name_missing: false,
      },
      {
        id: "plan-missing-002",
        name: "plan-missing-002",
        owner: "operator",
        updatedAt: "2026-11-20T08:05:00Z",
        state: "deployed",
        risk: "low",
        target: "paper",
        artifactId: "artifact-orphan",
        version: "1.0.0",
        persona_id: "persona-unregistered-77",
        persona_display_name: null,
        persona_name_missing: true,
        strategy_id: "strategy-unregistered-77",
        strategy_display_name: null,
        strategy_name_missing: true,
      },
    ];

    vi.spyOn(lists, "deployments").mockResolvedValue({
      items: deploymentRows,
      cursor: {},
      pageSize: deploymentRows.length,
      estimatedTotal: deploymentRows.length,
      totalCountExact: true,
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={["/management/deployments"]}>
        <DeploymentsList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("青禾｜2330 台股 Paper 學習 R2")).toBeInTheDocument();
      expect(screen.getByText("青禾 2330 動能策略")).toBeInTheDocument();
    });
    expect(screen.getByText("plan-named-001")).toBeInTheDocument();
    expect(screen.getByText("persona-be19a1fac471247f2b2a")).toBeInTheDocument();
    expect(screen.getByText("strategy-persona-2330")).toBeInTheDocument();
    expect(
      screen.getByTestId("deployment-persona-name-missing"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("deployment-strategy-name-missing"),
    ).toBeInTheDocument();
    unmount();

    const artifactRows: Artifact[] = [
      {
        id: "artifact-2330",
        name: "artifact-2330",
        kind: "bundle",
        owner: "operator",
        updatedAt: "2026-11-20T08:00:00Z",
        state: "approved",
        risk: "low",
        strategy_id: "strategy-persona-2330",
        strategyId: "strategy-persona-2330",
        strategy_display_name: "青禾 2330 動能策略",
        strategy_name_missing: false,
        persona_id: "persona-be19a1fac471247f2b2a",
        persona_display_name: "青禾｜2330 台股 Paper 學習 R2",
        persona_name_missing: false,
        version: "1.0.0",
        hash: "sha256:abc123",
      },
      {
        id: "artifact-orphan",
        name: "artifact-orphan",
        kind: "bundle",
        owner: "operator",
        updatedAt: "2026-11-20T08:05:00Z",
        state: "approved",
        risk: "low",
        strategy_id: "strategy-orphan-88",
        strategyId: "strategy-orphan-88",
        strategy_display_name: null,
        strategy_name_missing: true,
        persona_id: "persona-orphan-88",
        persona_display_name: null,
        persona_name_missing: true,
        version: "1.0.0",
        hash: "sha256:def456",
      },
    ];

    vi.spyOn(lists, "artifacts").mockResolvedValue({
      items: artifactRows,
      cursor: {},
      pageSize: artifactRows.length,
      estimatedTotal: artifactRows.length,
      totalCountExact: true,
    });

    render(
      <MemoryRouter initialEntries={["/management/artifacts"]}>
        <ArtifactsList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("青禾 2330 動能策略")).toBeInTheDocument();
      expect(screen.getByText("青禾｜2330 台股 Paper 學習 R2")).toBeInTheDocument();
    });
    expect(screen.getByText("artifact-2330")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-strategy-name-missing")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-persona-name-missing")).toBeInTheDocument();
  });
});

describe("extractHiddenNonRealCount", () => {
  it("reads meta.hidden_non_real_count and ignores invalid values", () => {
    expect(extractHiddenNonRealCount({ hidden_non_real_count: 5 })).toBe(5);
    expect(extractHiddenNonRealCount({ hidden_non_real_count: "5" })).toBeUndefined();
    expect(extractHiddenNonRealCount({ surfaces: { research_tasks: { hidden_non_real_count: 7 } } })).toBe(7);
    expect(
      extractHiddenNonRealCount({ hidden_non_real_count: 2, surfaces: { research_tasks: { hidden_non_real_count: 7 } } }),
    ).toBe(2);
    expect(extractHiddenNonRealCount(null)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// FE-REGISTRY-LISTS-CURRENT-FIRST-20261125
// Row shapes below are the recorded hosted shapes (2026-11-25 06:35Z–07:16Z, BFF adc027da9 and
// BFF-STRATEGY-METRICS-RUNTIME-20261125 test_strategy_metrics_truth.py): the three live paper
// strategies with pnl -9.988691250022384 / -186.89087499999732 / null (no_fills).
// ---------------------------------------------------------------------------
import i18n from "@/i18n";
import {
  personaWinRateText,
  countUnknownScopeRows,
  classifyCurrentFirstScope,
  buildStrategyColumns,
  orderPersonasByRoutedStrategies,
  hasPersonaRoutedStrategies,
  STRATEGY_COLUMN_MIN_WIDTHS,
  PERSONA_COLUMN_MIN_WIDTHS,
  ARTIFACT_COLUMN_MIN_WIDTHS,
} from "./Lists";

async function withLanguage<T>(lng: "en-US" | "zh-TW", fn: () => Promise<T>): Promise<T> {
  await i18n.changeLanguage(lng);
  try {
    return await fn();
  } finally {
    await i18n.changeLanguage("en-US");
  }
}

const LIVE_STRATEGIES = [
  {
    id: "strategy-persona-a81b4fd15944698341aa",
    name: "衡岳｜2330 台股 Paper 學習 R2",
    owner: "persona-ee7112a829d38b9135ac",
    updatedAt: "2026-11-23T23:34:52Z",
    state: "approved",
    risk: "low",
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-a81b4fd15944698341aa",
    personaIds: ["persona-ee7112a829d38b9135ac"],
    persona_display_names: { "persona-ee7112a829d38b9135ac": "衡岳｜2330 台股 Paper 學習 R2" },
    operationalStatus: "idle",
    symbols: ["2330.TW"],
    pnl: -9.988691250022384,
    pnl30d: null,
    sharpe: null,
    drawdown: 9.988691250022385e-05,
    totalTrades: 2,
    metricsAsOf: "2026-11-25T07:16:00Z",
    metricsResolution: "fresh",
    metricsReason: null,
    runtimeStatus: "running",
    runtimeStatusReason: null,
  },
  {
    id: "strategy-persona-06d4775a9b6a8f63b311",
    name: "青禾｜2330 台股 Paper 學習 R2",
    owner: "persona-2448c7053e33ea48da47",
    updatedAt: "2026-11-23T10:05:12Z",
    state: "approved",
    risk: "low",
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-06d4775a9b6a8f63b311",
    personaIds: ["persona-2448c7053e33ea48da47"],
    persona_display_names: { "persona-2448c7053e33ea48da47": "青禾｜2330 台股 Paper 學習 R2" },
    operationalStatus: "idle",
    symbols: ["2330.TW"],
    pnl: -186.89087499999732,
    pnl30d: null,
    sharpe: null,
    drawdown: 0.0018689087499999732,
    totalTrades: 2,
    metricsAsOf: "2026-11-25T07:16:00Z",
    metricsResolution: "fresh",
    metricsReason: null,
    runtimeStatus: "paused_market_input",
    runtimeStatusReason: "market_input_stale",
  },
  {
    id: "strategy-persona-039ad01f8bcd2b4aa466",
    name: "澄川｜2330 台股 Paper 學習 R2",
    owner: "persona-6507750312870d03a241",
    updatedAt: "2026-11-23T10:04:18Z",
    state: "approved",
    risk: "low",
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-039ad01f8bcd2b4aa466",
    personaIds: ["persona-6507750312870d03a241"],
    persona_display_names: { "persona-6507750312870d03a241": "澄川｜2330 台股 Paper 學習 R2" },
    operationalStatus: "idle",
    symbols: ["2317.TW"],
    pnl: null,
    pnl30d: null,
    sharpe: null,
    drawdown: null,
    totalTrades: 0,
    metricsAsOf: null,
    metricsResolution: "missing",
    metricsReason: "no_fills",
    runtimeStatus: "running",
    runtimeStatusReason: null,
  },
] as unknown as Strategy[];

describe("FE-REGISTRY-LISTS-CURRENT-FIRST-20261125 strategy table", () => {
  it("shows name, state, runtime status with plain reason, symbols, cumulative paper result with as-of, drawdown, trades and persona; no alpha/30d/sharpe/pool id; a missing value shows its recorded reason", async () => {
    await withLanguage("en-US", async () => {
      vi.spyOn(lists, "strategies").mockResolvedValue({
        items: LIVE_STRATEGIES,
        cursor: {},
        pageSize: 3,
        estimatedTotal: 3,
        totalCountExact: true,
        meta: {
          state_counts: { draft: 7421, review: 1, approved: 170, retired: 1556 },
          visible_state_counts: { draft: 4205, review: 0, approved: 14, retired: 2 },
          hidden_retired_persona_count: 11,
          hidden_test_persona_strategy_count: 153,
          hidden_unbound_stub_strategy_count: 4,
          page_info: { page_size: 20, total: 3, next_page_token: null },
        },
      });
      render(
        <MemoryRouter initialEntries={["/management/strategies"]}>
          <StrategiesList />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.getAllByTestId("strategy-result").length).toBe(2));

      const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());
      expect(headers).toEqual([
        "Name",
        "State",
        "Runtime",
        "Symbols",
        "Cumulative paper result",
        "Drawdown",
        "Trades",
        "Persona",
      ]);
      expect(STRATEGY_COLUMN_MIN_WIDTHS.name).toBeGreaterThanOrEqual(220);
      expect(Object.values(STRATEGY_COLUMN_MIN_WIDTHS).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(935);
      const table = screen.getByRole("table");
      expect(table).not.toHaveTextContent(/alpha|sharpe|30d/i);
      expect(table).not.toHaveTextContent("pool-persona-paper-");

      const rows = screen.getAllByRole("row").slice(1);
      expect(rows).toHaveLength(3);
      // Row A: -9.99 over 2 trades, running although the persona stage said idle.
      expect(rows[0]).toHaveTextContent("-9.99");
      expect(rows[0].querySelector('[data-testid="strategy-runtime-status"]')).toHaveAttribute("data-runtime-status", "running");
      expect(rows[0]).toHaveTextContent("Running");
      expect(rows[0]).not.toHaveTextContent("Idle");
      expect(rows[0].querySelector('[data-testid="strategy-result-as-of"]')).toHaveTextContent(/^as of /);
      expect(rows[0].querySelector('[data-testid="strategy-trades"]')).toHaveTextContent("2");
      expect(rows[0]).toHaveTextContent("0.01%");
      expect(rows[0].querySelector('[data-testid="strategy-persona"]')).toHaveTextContent("衡岳｜2330 台股 Paper 學習 R2");
      expect(rows[0].querySelector('[data-testid="strategy-persona"]')).toHaveAttribute("title", "Persona IDs: persona-ee7112a829d38b9135ac");
      // Row B: paused because market input stopped, with the plain reason and the raw code as tooltip.
      expect(rows[1]).toHaveTextContent("-186.89");
      expect(rows[1].querySelector('[data-testid="strategy-runtime-status"]')).toHaveAttribute("data-runtime-status", "paused_market_input");
      expect(rows[1].querySelector('[data-testid="strategy-runtime-reason"]')).toHaveTextContent("Market data input stopped");
      expect(rows[1].querySelector('[data-testid="strategy-runtime-reason"]')).toHaveAttribute("title", "Market data input stopped (market_input_stale)");
      expect(rows[1]).toHaveTextContent("0.19%");
      // Row C: no value — shows its recorded reason, never 0.00.
      const missing = rows[2].querySelector('[data-testid="strategy-result-missing"]');
      expect(missing).toHaveTextContent("No fills yet");
      expect(missing).toHaveAttribute("data-metrics-reason", "no_fills");
      expect(rows[2]).not.toHaveTextContent("0.00");
      expect(rows[2].querySelector('[data-testid="strategy-trades"]')).toHaveTextContent("0");

      // Tab numbers print visible_state_counts only.
      const group = screen.getByTestId("strategy-state-filter");
      expect(group).toHaveTextContent("Approved (14)");
      expect(group).toHaveTextContent("Draft (4205)");
      expect(group).toHaveTextContent("All (4219)");
      for (const raw of ["7421", "170", "1556"]) expect(group).not.toHaveTextContent(raw);
      // Hidden-test banner: 153 + 4 = 157, with the breakdown.
      expect(screen.getByTestId("strategy-hidden-test-personas-text")).toHaveTextContent("157 test-persona strategies are hidden");
      expect(screen.getByTestId("strategy-hidden-test-breakdown")).toHaveTextContent("153 from test personas and 4 unbound placeholders");
      expect(screen.getByTestId("strategy-toggle-test-personas-button")).toHaveTextContent("Show test strategies (157)");
    });
  });

  it("falls back to the persona-stage status when runtimeStatus is absent and prints no tab number without visible_state_counts", async () => {
    await withLanguage("en-US", async () => {
      const legacy = [{ ...LIVE_STRATEGIES[0], runtimeStatus: undefined, runtimeStatusReason: undefined, operationalStatus: "idle" }] as unknown as Strategy[];
      vi.spyOn(lists, "strategies").mockResolvedValue({
        items: legacy,
        cursor: {},
        pageSize: 1,
        estimatedTotal: 1,
        totalCountExact: true,
        meta: { state_counts: { draft: 7421, approved: 170 }, page_info: { page_size: 20, total: 1, next_page_token: null } },
      });
      render(
        <MemoryRouter initialEntries={["/management/strategies"]}>
          <StrategiesList />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.getByTestId("strategy-operational-status")).toHaveAttribute("data-operational-status", "idle"));
      expect(screen.queryByTestId("strategy-runtime-status")).not.toBeInTheDocument();
      const group = screen.getByTestId("strategy-state-filter");
      expect(group.textContent).not.toMatch(/\d/);
    });
  });

  it("explains on the draft tab that drafts are unscreened text drafts, not strategies", async () => {
    await withLanguage("en-US", async () => {
      vi.spyOn(lists, "strategies").mockResolvedValue({
        items: [],
        cursor: {},
        pageSize: 0,
        estimatedTotal: 4205,
        totalCountExact: true,
        meta: { visible_state_counts: { draft: 4205, approved: 14 }, page_info: { page_size: 20, total: 4205, next_page_token: "20" } },
      });
      render(
        <MemoryRouter initialEntries={["/management/strategies?state=draft"]}>
          <StrategiesList />
        </MemoryRouter>,
      );
      expect(await screen.findByTestId("strategy-draft-notice")).toHaveTextContent("unscreened text drafts, not strategies");
      expect(screen.getByRole("button", { name: "Draft (4205)" })).toHaveAttribute("aria-pressed", "true");
    });
    await withLanguage("zh-TW", async () => {
      expect(i18n.t("strategy.list.draftNotice")).toContain("尚未篩選的文字草稿");
    });
  });

  it("builds zh-TW cells for the same recorded rows", async () => {
    await withLanguage("zh-TW", async () => {
      const t = i18n.getFixedT("zh-TW") as unknown as (k: string, o?: Record<string, unknown>) => string;
      const cols = buildStrategyColumns(t, t("common.noData"));
      expect(cols.map((c) => c.header)).toEqual(["名稱", "狀態", "執行狀態", "標的", "累計模擬損益", "回撤", "成交筆數", "Persona"]);
    });
  });

  it("FE-REGISTRY-ACCEPTANCE-WORDS-20261126 AC1: shows source_unavailable as a plain phrase in zh-TW and en-US and shows unknown reason codes directly instead of 未記錄 / Not recorded", async () => {
    const slowRequestRows: Strategy[] = [
      {
        ...LIVE_STRATEGIES[0],
        pnl: null,
        drawdown: null,
        metricsAsOf: null,
        metricsResolution: "unavailable",
        metricsReason: "source_unavailable",
      },
      {
        ...LIVE_STRATEGIES[1],
        pnl: null,
        drawdown: null,
        metricsAsOf: null,
        metricsResolution: "unavailable",
        metricsReason: "upstream_telemetry_timeout",
      },
    ] as unknown as Strategy[];

    await withLanguage("zh-TW", async () => {
      vi.spyOn(lists, "strategies").mockResolvedValue({
        items: slowRequestRows,
        cursor: {},
        pageSize: 2,
        estimatedTotal: 2,
        totalCountExact: true,
        meta: {
          visible_state_counts: { draft: 4205, approved: 14, retired: 2 },
          page_info: { page_size: 20, total: 2, next_page_token: null },
        },
      });
      const { unmount } = render(
        <MemoryRouter initialEntries={["/management/strategies"]}>
          <StrategiesList />
        </MemoryRouter>,
      );
      const missingCells = await screen.findAllByTestId("strategy-result-missing");
      expect(missingCells).toHaveLength(2);
      expect(missingCells[0]).toHaveTextContent("目前無法讀取結果");
      expect(missingCells[0]).toHaveAttribute("data-metrics-reason", "source_unavailable");
      expect(missingCells[0]).not.toHaveTextContent("未記錄");
      expect(missingCells[1]).toHaveTextContent("upstream_telemetry_timeout");
      expect(missingCells[1]).toHaveAttribute("data-metrics-reason", "upstream_telemetry_timeout");
      expect(missingCells[1]).not.toHaveTextContent("未記錄");
      unmount();
    });

    await withLanguage("en-US", async () => {
      vi.spyOn(lists, "strategies").mockResolvedValue({
        items: slowRequestRows,
        cursor: {},
        pageSize: 2,
        estimatedTotal: 2,
        totalCountExact: true,
        meta: {
          visible_state_counts: { draft: 4205, approved: 14, retired: 2 },
          page_info: { page_size: 20, total: 2, next_page_token: null },
        },
      });
      const { unmount } = render(
        <MemoryRouter initialEntries={["/management/strategies"]}>
          <StrategiesList />
        </MemoryRouter>,
      );
      const missingCells = await screen.findAllByTestId("strategy-result-missing");
      expect(missingCells).toHaveLength(2);
      expect(missingCells[0]).toHaveTextContent("Result could not be read now");
      expect(missingCells[0]).toHaveAttribute("data-metrics-reason", "source_unavailable");
      expect(missingCells[0]).not.toHaveTextContent("Not recorded");
      expect(missingCells[1]).toHaveTextContent("upstream_telemetry_timeout");
      expect(missingCells[1]).not.toHaveTextContent("Not recorded");
      unmount();
    });
  });
});

describe("FE-REGISTRY-LISTS-CURRENT-FIRST-20261125 persona list opens on current", () => {
  // 177 rows: 153 test (BFF listScope test), the live ones at positions 152, 154, 155, plus retired,
  // research and one row with no recorded scope.
  const baseRow = (i: number, extra: Record<string, unknown>) => ({
    id: `persona-${String(i).padStart(4, "0")}`,
    name: `Persona ${i}`,
    owner: "pantheon-dev-paper-provisioner",
    updatedAt: "2026-11-23T23:34:52Z",
    state: "approved",
    risk: "low",
    archetype: "momentum",
    routedStrategies: 1,
    successRate: null,
    ...extra,
  });
  const personaRows = (() => {
    const rows: Record<string, unknown>[] = [];
    const live = new Set([152, 154, 155]);
    const test = new Set([...Array.from({ length: 151 }, (_, k) => k + 1), 153, 156]);
    for (let i = 1; i <= 177; i += 1) {
      if (live.has(i)) rows.push(baseRow(i, { listScope: "current", successRate: i === 154 ? 0.62 : null }));
      else if (test.has(i)) rows.push(baseRow(i, { listScope: "test" }));
      else if (i >= 157 && i <= 160) rows.push(baseRow(i, { listScope: "research" }));
      else if (i === 177) rows.push(baseRow(i, {}));
      else rows.push(baseRow(i, { listScope: "retired", state: "retired" }));
    }
    return rows;
  })();

  it("lists current rows first, counts the toggles, keeps unknown-scope rows visible and shows a null win rate as no data", async () => {
    await withLanguage("en-US", async () => {
      expect(personaRows).toHaveLength(177);
      const counts = personaRows.reduce<Record<string, number>>((acc, r) => {
        const k = String(r.listScope ?? "none");
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      expect(counts.test).toBe(153);
      vi.spyOn(lists, "personas").mockResolvedValue({
        items: personaRows as unknown as Persona[],
        cursor: {},
        pageSize: 177,
        estimatedTotal: 177,
        totalCountExact: true,
      });
      render(
        <MemoryRouter initialEntries={["/management/personas"]}>
          <PersonasList />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.getByRole("button", { name: /^Current/ })).toBeInTheDocument());
      // 3 current + 1 row with no recorded scope.
      expect(screen.getByRole("button", { name: "Current (4)" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Test (153)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Retired (${counts.retired})` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Research (4)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "All (177)" })).toBeInTheDocument();
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(4);
      expect(screen.getByText("Persona 152")).toBeInTheDocument();
      expect(screen.getByText("Persona 154")).toBeInTheDocument();
      expect(screen.getByText("Persona 155")).toBeInTheDocument();
      expect(screen.getByText("Persona 177")).toBeInTheDocument();
      expect(screen.queryByText("Persona 1")).not.toBeInTheDocument();
      expect(screen.getByTestId("list-unknown-scope-notice")).toHaveAttribute("data-unknown-scope-count", "1");
      // null win rate is "No data", the 0.62 row is 62%; never 0%.
      const winCells = screen.getAllByTestId("persona-win-rate").map((el) => el.textContent);
      expect(winCells.filter((x) => x === "No data")).toHaveLength(3);
      expect(winCells).toContain("62%");
      expect(screen.queryByText("0%")).not.toBeInTheDocument();
      expect(Object.values(PERSONA_COLUMN_MIN_WIDTHS).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(935);
      expect(PERSONA_COLUMN_MIN_WIDTHS.name).toBeGreaterThanOrEqual(220);

      fireEvent.click(screen.getByRole("button", { name: "Test (153)" }));
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(153);
      expect(screen.queryByText("Persona 152")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "All (177)" }));
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(177);
    });
    // Renders 153-304 recorded rows and queries by role; slow under full-suite parallel load.
  }, 30_000);

  it("keeps every row on the default view when the BFF sends no listScope (older BFF)", async () => {
    await withLanguage("en-US", async () => {
      const rows = personaRows.map((r) => ({ ...r, listScope: undefined })).slice(0, 30);
      vi.spyOn(lists, "personas").mockResolvedValue({
        items: rows as unknown as Persona[], cursor: {}, pageSize: 30, estimatedTotal: 30, totalCountExact: true,
      });
      render(
        <MemoryRouter initialEntries={["/management/personas"]}>
          <PersonasList />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.getByRole("button", { name: "Current (30)" })).toBeInTheDocument());
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(30);
    });
  });

  it("classifies scopes and win rates", () => {
    const tabs = ["current", "test", "retired", "research", "all"] as const;
    expect(classifyCurrentFirstScope({ listScope: "test" }, tabs)).toBe("test");
    expect(classifyCurrentFirstScope({ list_scope: "retired" }, tabs)).toBe("retired");
    expect(classifyCurrentFirstScope({ listScope: "unknown" }, tabs)).toBe("current");
    expect(classifyCurrentFirstScope({}, tabs)).toBe("current");
    expect(classifyCurrentFirstScope({ listScope: "unbound" }, tabs)).toBe("current");
    expect(countUnknownScopeRows([{}, { listScope: "test" }, { list_scope: "unknown" }])).toBe(2);
    expect(personaWinRateText(null, "No data")).toBe("No data");
    expect(personaWinRateText(undefined, "No data")).toBe("No data");
    expect(personaWinRateText(0, "No data")).toBe("0%");
    expect(personaWinRateText(0.62, "No data")).toBe("62%");
  });
});

describe("FE-REGISTRY-LISTS-CURRENT-FIRST-20261125 artifact list opens on current", () => {
  // 344 rows: 304 test, with the rest current / retired / unbound / research.
  const artifactRow = (i: number, extra: Record<string, unknown>) => ({
    id: `artifact-persona-paper-${String(i).padStart(4, "0")}`,
    name: `strategy-persona-${String(i).padStart(4, "0")}`,
    kind: "execution_bundle",
    version: "1.0.0",
    state: "approved",
    risk: "low",
    hash: `sha256:${String(i).padStart(64, "a")}`,
    owner: "pantheon-dev-paper-provisioner",
    updatedAt: "2026-11-06T09:02:23Z",
    source_kind: "registry",
    ...extra,
  });
  const rows = (() => {
    const out: Record<string, unknown>[] = [];
    for (let i = 1; i <= 344; i += 1) {
      if (i <= 304) out.push(artifactRow(i, { list_scope: "test" }));
      else if (i <= 309) out.push(artifactRow(i, { list_scope: "current" }));
      else if (i <= 329) out.push(artifactRow(i, { list_scope: "retired", state: "retired" }));
      else if (i <= 342) out.push(artifactRow(i, { list_scope: "unbound" }));
      else out.push(artifactRow(i, { list_scope: "research", source_kind: "research_run_output", kind: "factor_eval_report", version: null, state: null, risk: null }));
    }
    return out;
  })();

  it("shows current rows, counted toggles, kind and source as words with the code as tooltip, no size column", async () => {
    await withLanguage("en-US", async () => {
      vi.spyOn(lists, "artifacts").mockResolvedValue({
        items: rows as unknown as Artifact[], cursor: {}, pageSize: 344, estimatedTotal: 344, totalCountExact: true,
      });
      render(
        <MemoryRouter initialEntries={["/management/artifacts"]}>
          <ArtifactsList />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.getByRole("button", { name: "Current (5)" })).toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Test (304)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retired (20)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unbound (13)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Research output (2)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "All (344)" })).toBeInTheDocument();
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(5);
      const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());
      expect(headers).not.toContain("Size");
      expect(headers).toEqual(["Name", "Source", "Kind", "Version", "State / Risk", "Hash", "Owner", "Last updated"]);
      const kind = screen.getAllByTestId("artifact-kind")[0];
      expect(kind).toHaveTextContent("Execution bundle");
      expect(kind).toHaveAttribute("title", "execution_bundle");
      const source = screen.getAllByTestId("artifact-source")[0];
      expect(source).toHaveTextContent("Registry bundle");
      expect(source).toHaveAttribute("title", "registry");
      expect(Object.values(ARTIFACT_COLUMN_MIN_WIDTHS).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(935);
      expect(ARTIFACT_COLUMN_MIN_WIDTHS.name).toBeGreaterThanOrEqual(220);
      fireEvent.click(screen.getByRole("button", { name: "Test (304)" }));
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(304);
    });
    // Renders 153-304 recorded rows and queries by role; slow under full-suite parallel load.
  }, 30_000);

  it("keeps every row visible with scope unknown when the persona directory was unreadable", async () => {
    await withLanguage("en-US", async () => {
      const unknownRows = rows.slice(0, 12).map((r) => ({ ...r, list_scope: "unknown" }));
      vi.spyOn(lists, "artifacts").mockResolvedValue({
        items: unknownRows as unknown as Artifact[], cursor: {}, pageSize: 12, estimatedTotal: 12, totalCountExact: true,
        meta: { persona_directory_status: "unavailable" },
      });
      render(
        <MemoryRouter initialEntries={["/management/artifacts"]}>
          <ArtifactsList />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.getByRole("button", { name: "Current (12)" })).toBeInTheDocument());
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(12);
      expect(screen.getByTestId("list-unknown-scope-notice")).toHaveAttribute("data-unknown-scope-count", "12");
    });
  });
});

// ---------------------------------------------------------------------------
// FE-PERSONA-LIST-PLAIN-WORDS-20261125
// Recorded current rows 2026-11-25 20:38Z on BFF b3f93d448:
// 1. Agora Servant; agora_servant; pantheon-dev-operator-a; 0
// 2. Agora Servant; agora_servant; pantheon-dev-operator-b; 0
// 3-5. The three trading personas; momentum; pantheon-dev-admin-test; 1 each
// 6. Risk Officer; sentence archetype; operator-bff; 0
// 7. Red Team; sentence archetype; operator-bff; 0
// ---------------------------------------------------------------------------
describe("FE-PERSONA-LIST-PLAIN-WORDS-20261125 trading-first order, plain-word type, short owner and unsplit symbols", () => {
  const RISK_OFFICER_SENTENCE =
    "Independent risk reviewer. Never trades. Reviews trial admission, envelope publication and every harness patch; may veto.";
  const RED_TEAM_SENTENCE =
    "Adversarial reviewer. Never trades. Attacks patches that touch guardrails or the consult policy.";

  const RECORDED_SEVEN_CURRENT_PERSONAS: Persona[] = [
    {
      id: "persona-agora-servant-operator-a",
      name: "Agora Servant",
      owner: "pantheon-dev-operator-a",
      updatedAt: "2026-11-25T20:38:00Z",
      state: "approved",
      risk: "low",
      archetype: "agora_servant",
      routedStrategies: 0,
      successRate: null,
      listScope: "current",
    },
    {
      id: "persona-agora-servant-operator-b",
      name: "Agora Servant",
      owner: "pantheon-dev-operator-b",
      updatedAt: "2026-11-25T20:38:00Z",
      state: "approved",
      risk: "low",
      archetype: "agora_servant",
      routedStrategies: 0,
      successRate: null,
      listScope: "current",
    },
    {
      id: "persona-ee7112a829d38b9135ac",
      name: "衡岳｜2330 台股 Paper 學習 R2",
      owner: "pantheon-dev-admin-test",
      updatedAt: "2026-11-23T23:34:52Z",
      state: "approved",
      risk: "low",
      archetype: "momentum",
      routedStrategies: 1,
      successRate: null,
      listScope: "current",
    },
    {
      id: "persona-2448c7053e33ea48da47",
      name: "青禾｜2330 台股 Paper 學習 R2",
      owner: "pantheon-dev-admin-test",
      updatedAt: "2026-11-23T10:05:12Z",
      state: "approved",
      risk: "low",
      archetype: "momentum",
      routedStrategies: 1,
      successRate: null,
      listScope: "current",
    },
    {
      id: "persona-6507750312870d03a241",
      name: "澄川｜2330 台股 Paper 學習 R2",
      owner: "pantheon-dev-admin-test",
      updatedAt: "2026-11-23T10:04:18Z",
      state: "approved",
      risk: "low",
      archetype: "momentum",
      routedStrategies: 1,
      successRate: null,
      listScope: "current",
    },
    {
      id: "persona-risk-officer",
      name: "Risk Officer",
      owner: "operator-bff",
      updatedAt: "2026-11-25T20:38:00Z",
      state: "draft",
      risk: "low",
      archetype: RISK_OFFICER_SENTENCE,
      routedStrategies: 0,
      successRate: null,
      listScope: "current",
    },
    {
      id: "persona-red-team",
      name: "Red Team",
      owner: "operator-bff",
      updatedAt: "2026-11-25T20:38:00Z",
      state: "draft",
      risk: "low",
      archetype: RED_TEAM_SENTENCE,
      routedStrategies: 0,
      successRate: null,
      listScope: "current",
    },
  ] as unknown as Persona[];

  const OTHER_SCOPE_PERSONAS: Persona[] = [
    {
      id: "persona-test-0",
      name: "Test Idle Persona",
      owner: "pantheon-dev-paper-provisioner",
      updatedAt: "2026-10-20T08:40:59Z",
      state: "failed",
      risk: "low",
      archetype: "generalist",
      routedStrategies: 0,
      successRate: null,
      listScope: "test",
    },
    {
      id: "persona-test-1",
      name: "Test Trading Persona",
      owner: "pantheon-dev-paper-provisioner",
      updatedAt: "2026-10-20T08:40:59Z",
      state: "approved",
      risk: "low",
      archetype: "momentum",
      routedStrategies: 1,
      successRate: null,
      listScope: "test",
    },
    {
      id: "persona-research-0",
      name: "Research No Strategy",
      owner: "pantheon-dev-operator-a",
      updatedAt: "2026-10-20T08:40:59Z",
      state: "approved",
      risk: "low",
      archetype: "mean_reversion",
      routedStrategies: 0,
      successRate: null,
      listScope: "research",
    },
    {
      id: "persona-research-1",
      name: "Research With Strategy",
      owner: "pantheon-dev-operator-b",
      updatedAt: "2026-10-20T08:40:59Z",
      state: "approved",
      risk: "low",
      archetype: "generalist",
      routedStrategies: 2,
      successRate: null,
      listScope: "research",
    },
  ] as unknown as Persona[];

  it("AC1-AC3: lists personas with >=1 routed strategies first on every scope tab while keeping counts and relative order unchanged, translates recorded types with code tooltip, truncates sentences on one line with full tooltip, and shows distinguishing owner without pantheon-dev- prefix", async () => {
    const allRows = [...RECORDED_SEVEN_CURRENT_PERSONAS, ...OTHER_SCOPE_PERSONAS];
    expect(hasPersonaRoutedStrategies(RECORDED_SEVEN_CURRENT_PERSONAS[0])).toBe(false);
    expect(hasPersonaRoutedStrategies(RECORDED_SEVEN_CURRENT_PERSONAS[2])).toBe(true);
    expect(orderPersonasByRoutedStrategies(RECORDED_SEVEN_CURRENT_PERSONAS).map((r) => r.id)).toEqual([
      "persona-ee7112a829d38b9135ac",
      "persona-2448c7053e33ea48da47",
      "persona-6507750312870d03a241",
      "persona-agora-servant-operator-a",
      "persona-agora-servant-operator-b",
      "persona-risk-officer",
      "persona-red-team",
    ]);

    await withLanguage("en-US", async () => {
      vi.spyOn(lists, "personas").mockResolvedValue({
        items: allRows,
        cursor: {},
        pageSize: allRows.length,
        estimatedTotal: allRows.length,
        totalCountExact: true,
      });

      const { unmount } = render(
        <MemoryRouter initialEntries={["/management/personas"]}>
          <PersonasList />
        </MemoryRouter>,
      );

      await waitFor(() => expect(screen.getByRole("button", { name: "Current (7)" })).toHaveAttribute("aria-pressed", "true"));
      expect(screen.getByRole("button", { name: "Test (2)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retired (0)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Research (2)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "All (11)" })).toBeInTheDocument();

      // Current tab: the three trading personas (routedStrategies = 1) come first in their original order,
      // followed by Agora Servant (operator-a), Agora Servant (operator-b), Risk Officer, Red Team.
      const currentRows = screen.getAllByRole("row").slice(1);
      expect(currentRows).toHaveLength(7);
      expect(currentRows[0]).toHaveTextContent("衡岳｜2330 台股 Paper 學習 R2");
      expect(currentRows[1]).toHaveTextContent("青禾｜2330 台股 Paper 學習 R2");
      expect(currentRows[2]).toHaveTextContent("澄川｜2330 台股 Paper 學習 R2");
      expect(currentRows[3]).toHaveTextContent("persona-agora-servant-operator-a");
      expect(currentRows[4]).toHaveTextContent("persona-agora-servant-operator-b");
      expect(currentRows[5]).toHaveTextContent("Risk Officer");
      expect(currentRows[6]).toHaveTextContent("Red Team");

      // AC2: Type column in en-US
      const typeCells = screen.getAllByTestId("persona-type");
      expect(typeCells).toHaveLength(7);
      for (const idx of [0, 1, 2]) {
        expect(typeCells[idx]).toHaveTextContent("Momentum");
        expect(typeCells[idx]).toHaveAttribute("title", "momentum");
        expect(typeCells[idx]).toHaveAttribute("data-persona-type-kind", "code");
      }
      for (const idx of [3, 4]) {
        expect(typeCells[idx]).toHaveTextContent("Agora servant");
        expect(typeCells[idx]).toHaveAttribute("title", "agora_servant");
        expect(typeCells[idx]).toHaveAttribute("data-persona-type-kind", "code");
      }
      expect(typeCells[5]).toHaveTextContent(RISK_OFFICER_SENTENCE);
      expect(typeCells[5]).toHaveAttribute("title", RISK_OFFICER_SENTENCE);
      expect(typeCells[5]).toHaveAttribute("data-persona-type-kind", "sentence");
      expect(typeCells[5]).toHaveClass("truncate", "whitespace-nowrap");
      expect(typeCells[6]).toHaveTextContent(RED_TEAM_SENTENCE);
      expect(typeCells[6]).toHaveAttribute("title", RED_TEAM_SENTENCE);
      expect(typeCells[6]).toHaveAttribute("data-persona-type-kind", "sentence");
      expect(typeCells[6]).toHaveClass("truncate", "whitespace-nowrap");

      // AC3: Owner column shows distinguishing suffix and full id as tooltip
      const ownerCells = screen.getAllByTestId("owner-cell");
      expect(ownerCells.map((el) => el.textContent)).toEqual([
        "admin-test",
        "admin-test",
        "admin-test",
        "operator-a",
        "operator-b",
        "operator-bff",
        "operator-bff",
      ]);
      expect(ownerCells[0]).toHaveAttribute("title", "pantheon-dev-admin-test");
      expect(ownerCells[0]).toHaveAttribute("data-full-owner", "pantheon-dev-admin-test");
      expect(ownerCells[3]).toHaveAttribute("title", "pantheon-dev-operator-a");
      expect(ownerCells[4]).toHaveAttribute("title", "pantheon-dev-operator-b");
      expect(ownerCells[5]).toHaveAttribute("title", "operator-bff");

      // AC1: Scope tabs preserve the same trading-first rule and counts
      fireEvent.click(screen.getByRole("button", { name: "Test (2)" }));
      const testRows = screen.getAllByRole("row").slice(1);
      expect(testRows).toHaveLength(2);
      expect(testRows[0]).toHaveTextContent("Test Trading Persona");
      expect(testRows[1]).toHaveTextContent("Test Idle Persona");
      expect(screen.getAllByTestId("owner-cell")[0]).toHaveTextContent("paper-provisioner");
      expect(screen.getAllByTestId("owner-cell")[0]).toHaveAttribute("title", "pantheon-dev-paper-provisioner");

      fireEvent.click(screen.getByRole("button", { name: "Research (2)" }));
      const researchRows = screen.getAllByRole("row").slice(1);
      expect(researchRows).toHaveLength(2);
      expect(researchRows[0]).toHaveTextContent("Research With Strategy");
      expect(researchRows[1]).toHaveTextContent("Research No Strategy");
      const researchTypes = screen.getAllByTestId("persona-type");
      expect(researchTypes[0]).toHaveTextContent("Generalist");
      expect(researchTypes[0]).toHaveAttribute("title", "generalist");
      // Unknown code is shown as it is
      expect(researchTypes[1]).toHaveTextContent("mean_reversion");
      expect(researchTypes[1]).toHaveAttribute("data-persona-type-kind", "unknown");

      fireEvent.click(screen.getByRole("button", { name: "All (11)" }));
      const allTabRows = screen.getAllByRole("row").slice(1);
      expect(allTabRows).toHaveLength(11);
      // All 5 personas with >=1 routedStrategies come before the 6 with 0 routedStrategies
      expect(allTabRows.slice(0, 5).map((r) => r.textContent)).toEqual([
        expect.stringContaining("衡岳｜2330 台股 Paper 學習 R2"),
        expect.stringContaining("青禾｜2330 台股 Paper 學習 R2"),
        expect.stringContaining("澄川｜2330 台股 Paper 學習 R2"),
        expect.stringContaining("Test Trading Persona"),
        expect.stringContaining("Research With Strategy"),
      ]);
      unmount();
    });

    // AC2: Verify zh-TW translations for momentum, generalist, agora_servant
    await withLanguage("zh-TW", async () => {
      vi.spyOn(lists, "personas").mockResolvedValue({
        items: allRows,
        cursor: {},
        pageSize: allRows.length,
        estimatedTotal: allRows.length,
        totalCountExact: true,
      });

      const { unmount } = render(
        <MemoryRouter initialEntries={["/management/personas?list_scope=all"]}>
          <PersonasList />
        </MemoryRouter>,
      );

      await waitFor(() => expect(screen.getAllByTestId("persona-type").length).toBe(11));
      const zhTypes = screen.getAllByTestId("persona-type");
      expect(zhTypes[0]).toHaveTextContent("動能");
      expect(zhTypes[0]).toHaveAttribute("title", "momentum");
      expect(zhTypes[4]).toHaveTextContent("通用");
      expect(zhTypes[4]).toHaveAttribute("title", "generalist");
      expect(zhTypes[5]).toHaveTextContent("交易僕人");
      expect(zhTypes[5]).toHaveAttribute("title", "agora_servant");
      expect(zhTypes[10]).toHaveTextContent("mean_reversion");
      unmount();
    });
  });

  it("AC3 & AC4: shows short owner on ArtifactsList with full tooltip, and never breaks inside 2330.TWSE while wrapping between multiple symbols in StrategiesList", async () => {
    await withLanguage("en-US", async () => {
      vi.spyOn(lists, "artifacts").mockResolvedValue({
        items: [
          {
            id: "artifact-persona-paper-a81b4fd15944698341aa",
            name: "strategy-persona-a81b4fd15944698341aa",
            kind: "execution_bundle",
            version: "1.0.0",
            state: "approved",
            risk: "low",
            hash: "sha256:38fb8f49000000000000000000000000000000000000000000000000002e008e",
            owner: "pantheon-dev-paper-provisioner",
            updatedAt: "2026-11-23T23:34:52Z",
            source_kind: "registry",
            list_scope: "current",
          } as unknown as Artifact,
        ],
        cursor: {},
        pageSize: 1,
        estimatedTotal: 1,
        totalCountExact: true,
      });

      const { unmount } = render(
        <MemoryRouter initialEntries={["/management/artifacts"]}>
          <ArtifactsList />
        </MemoryRouter>,
      );

      const ownerCell = await screen.findByTestId("owner-cell");
      expect(ownerCell).toHaveTextContent("paper-provisioner");
      expect(ownerCell).toHaveAttribute("title", "pantheon-dev-paper-provisioner");
      expect(ownerCell).toHaveAttribute("data-full-owner", "pantheon-dev-paper-provisioner");
      expect(ownerCell).toHaveClass("max-w-[144px]");
      expect(PERSONA_COLUMN_MIN_WIDTHS.owner).toBeGreaterThanOrEqual(140);
      expect(ARTIFACT_COLUMN_MIN_WIDTHS.owner).toBeGreaterThanOrEqual(140);
      unmount();

      vi.spyOn(lists, "strategies").mockResolvedValue({
        items: [
          {
            ...LIVE_STRATEGIES[0],
            symbols: ["2330.TWSE"],
          },
          {
            ...LIVE_STRATEGIES[1],
            symbols: ["2330.TWSE", "2317.TWSE", "2454.TWSE"],
          },
        ] as unknown as Strategy[],
        cursor: {},
        pageSize: 2,
        estimatedTotal: 2,
        totalCountExact: true,
        meta: {
          visible_state_counts: { draft: 4205, approved: 14, retired: 2 },
          page_info: { page_size: 20, total: 2, next_page_token: null },
        },
      });

      render(
        <MemoryRouter initialEntries={["/management/strategies"]}>
          <StrategiesList />
        </MemoryRouter>,
      );

      const symbolCells = await screen.findAllByTestId("strategy-symbols");
      expect(symbolCells).toHaveLength(2);
      expect(symbolCells[0]).toHaveClass("inline-flex", "flex-wrap");
      const firstRowItems = symbolCells[0].querySelectorAll('[data-testid="strategy-symbol-item"]');
      expect(firstRowItems).toHaveLength(1);
      expect(firstRowItems[0]).toHaveTextContent("2330.TWSE");
      expect(firstRowItems[0]).toHaveClass("whitespace-nowrap");

      const secondRowItems = symbolCells[1].querySelectorAll('[data-testid="strategy-symbol-item"]');
      expect(secondRowItems).toHaveLength(3);
      expect(Array.from(secondRowItems).map((el) => el.textContent?.trim())).toEqual([
        "2330.TWSE,",
        "2317.TWSE,",
        "2454.TWSE",
      ]);
      for (const item of Array.from(secondRowItems)) {
        expect(item).toHaveClass("whitespace-nowrap");
      }
    });
  });
});

describe("FE-STRATEGY-HIDDEN-COHORT-BANNER-20261128 hidden persona cohort count and non_trading exclusion banner", () => {
  it("AC1: extractHiddenTestPersonaStrategyCount and extractHiddenTestBreakdown read meta.hidden_persona_strategy_count first and fall back to meta.hidden_test_persona_strategy_count across new-key only, old-key only, both, and null old key", () => {
    // New-key only
    expect(extractHiddenTestPersonaStrategyCount({ hidden_persona_strategy_count: 156 })).toBe(156);
    expect(
      extractHiddenTestPersonaStrategyCount({
        hidden_persona_strategy_count: 156,
        hidden_unbound_stub_strategy_count: 2,
      }),
    ).toBe(158);
    expect(
      extractHiddenTestBreakdown({
        hidden_persona_strategy_count: 156,
        hidden_unbound_stub_strategy_count: 2,
      }),
    ).toEqual({ testCount: 156, stubCount: 2 });

    // Old-key only
    expect(extractHiddenTestPersonaStrategyCount({ hidden_test_persona_strategy_count: 153 })).toBe(153);
    expect(
      extractHiddenTestPersonaStrategyCount({
        hidden_test_persona_strategy_count: 153,
        hidden_unbound_stub_strategy_count: 4,
      }),
    ).toBe(157);
    expect(
      extractHiddenTestBreakdown({
        hidden_test_persona_strategy_count: 153,
        hidden_unbound_stub_strategy_count: 4,
      }),
    ).toEqual({ testCount: 153, stubCount: 4 });

    // Both keys present (new key wins)
    expect(
      extractHiddenTestPersonaStrategyCount({
        hidden_persona_strategy_count: 156,
        hidden_test_persona_strategy_count: 153,
        hidden_unbound_stub_strategy_count: 2,
      }),
    ).toBe(158);
    expect(
      extractHiddenTestBreakdown({
        hidden_persona_strategy_count: 156,
        hidden_test_persona_strategy_count: 153,
        hidden_unbound_stub_strategy_count: 2,
      }),
    ).toEqual({ testCount: 156, stubCount: 2 });

    // Null old key with new key (hosted BFF 2c72f5e28 shape)
    expect(
      extractHiddenTestPersonaStrategyCount({
        hidden_persona_strategy_count: 156,
        hidden_test_persona_strategy_count: null,
        hidden_unbound_stub_strategy_count: 2,
      }),
    ).toBe(158);
    expect(
      extractHiddenTestBreakdown({
        hidden_persona_strategy_count: 156,
        hidden_test_persona_strategy_count: null,
        hidden_unbound_stub_strategy_count: 2,
      }),
    ).toEqual({ testCount: 156, stubCount: 2 });

    // Null old key without new key
    expect(
      extractHiddenTestPersonaStrategyCount({
        hidden_test_persona_strategy_count: null,
        hidden_unbound_stub_strategy_count: 2,
      }),
    ).toBe(2);
    expect(
      extractHiddenTestBreakdown({
        hidden_test_persona_strategy_count: null,
        hidden_unbound_stub_strategy_count: 2,
      }),
    ).toBeUndefined();
    expect(
      extractHiddenTestPersonaStrategyCount({
        hidden_test_persona_strategy_count: null,
      }),
    ).toBeUndefined();

    // Null new key falls back to old key
    expect(
      extractHiddenTestPersonaStrategyCount({
        hidden_persona_strategy_count: null,
        hidden_test_persona_strategy_count: 14,
        hidden_unbound_stub_strategy_count: 3,
      }),
    ).toBe(17);
    expect(
      extractHiddenTestBreakdown({
        hidden_persona_strategy_count: null,
        hidden_test_persona_strategy_count: 14,
        hidden_unbound_stub_strategy_count: 3,
      }),
    ).toEqual({ testCount: 14, stubCount: 3 });
  });

  it("AC3/AC4/AC5: renders test and non-trading persona wording in zh-TW and en-US when meta.persona_exclusion_scope includes non_trading, keeps current wording otherwise, and issues no extra BFF call", async () => {
    expect(extractPersonaExclusionScope({ persona_exclusion_scope: ["test", "non_trading"] })).toEqual([
      "test",
      "non_trading",
    ]);
    expect(hasNonTradingPersonaExclusionScope({ persona_exclusion_scope: ["test", "non_trading"] })).toBe(true);
    expect(hasNonTradingPersonaExclusionScope({ persona_exclusion_scope: ["test"] })).toBe(false);
    expect(hasNonTradingPersonaExclusionScope({})).toBe(false);

    const strategySpy = vi.spyOn(lists, "strategies").mockImplementation(async (query) => {
      const q = (query ?? {}) as { include_test_personas?: boolean };
      const including = Boolean(q.include_test_personas);
      return {
        items: LIVE_STRATEGIES,
        cursor: {},
        pageSize: 3,
        estimatedTotal: 3,
        totalCountExact: true,
        meta: {
          state_counts: { draft: 7421, review: 1, approved: 170, retired: 1556 },
          visible_state_counts: { draft: 4205, review: 0, approved: 14, retired: 2 },
          hidden_retired_persona_count: 11,
          hidden_persona_strategy_count: including ? 0 : 156,
          hidden_test_persona_strategy_count: including ? 0 : null,
          ...(including ? {} : { persona_exclusion_scope: ["test", "non_trading"] }),
          hidden_unbound_stub_strategy_count: including ? 0 : 2,
          include_test_personas: including,
          page_info: { page_size: 20, total: 3, next_page_token: null },
        },
      };
    });

    await withLanguage("zh-TW", async () => {
      const { unmount } = render(
        <MemoryRouter initialEntries={["/management/strategies"]}>
          <StrategiesList />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("strategy-hidden-test-personas-text")).toHaveTextContent(
          "預設已隱藏 158 筆測試與非交易 Persona 策略。",
        );
      });
      expect(screen.getByTestId("strategy-hidden-test-breakdown")).toHaveTextContent(
        "其中 156 筆屬於測試與非交易 Persona，2 筆是未綁定的佔位策略。",
      );
      const toggleBtn = screen.getByTestId("strategy-toggle-test-personas-button");
      expect(toggleBtn).toHaveTextContent("顯示測試與非交易 Persona 策略（158）");
      expect(strategySpy).toHaveBeenCalledTimes(1);

      fireEvent.click(toggleBtn);
      await waitFor(() => {
        expect(screen.getByTestId("strategy-hidden-test-personas-text")).toHaveTextContent(
          "目前包含測試與非交易 Persona 策略。",
        );
      });
      expect(screen.getByTestId("strategy-toggle-test-personas-button")).toHaveTextContent(
        "隱藏測試與非交易 Persona 策略",
      );
      expect(strategySpy).toHaveBeenCalledTimes(2);
      unmount();
    });

    strategySpy.mockClear();

    await withLanguage("en-US", async () => {
      const { unmount } = render(
        <MemoryRouter initialEntries={["/management/strategies"]}>
          <StrategiesList />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("strategy-hidden-test-personas-text")).toHaveTextContent(
          "158 test and non-trading persona strategies are hidden by default.",
        );
      });
      expect(screen.getByTestId("strategy-hidden-test-breakdown")).toHaveTextContent(
        "156 from test and non-trading personas and 2 unbound placeholders.",
      );
      const toggleBtn = screen.getByTestId("strategy-toggle-test-personas-button");
      expect(toggleBtn).toHaveTextContent("Show test and non-trading persona strategies (158)");
      expect(strategySpy).toHaveBeenCalledTimes(1);

      fireEvent.click(toggleBtn);
      await waitFor(() => {
        expect(screen.getByTestId("strategy-hidden-test-personas-text")).toHaveTextContent(
          "Currently showing test and non-trading persona strategies.",
        );
      });
      expect(screen.getByTestId("strategy-toggle-test-personas-button")).toHaveTextContent(
        "Hide test and non-trading persona strategies",
      );
      expect(strategySpy).toHaveBeenCalledTimes(2);
      unmount();
    });
  });
});
