import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { LiveStatusBanner } from "@/components/layout/LiveStatusBanner";
import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { ObjectListPage, resolveObjectRowHref, shouldNavigateOnCreatedEntity } from "./ObjectListPage";
import { ArtifactsList, CapitalPoolsList, EvolutionList, ResearchList, StrategiesList } from "./Lists";
import { StrategyDetail } from "./StrategyDetail";
import type { CreateBehavior } from "@/lib/writeIntents/types";
import capitalPoolsFixture from "@/lib/bff-v1/__tests__/fixtures/hosted-20261020/capital-pools.json";

const mocks = vi.hoisted(() => ({
  useLiveListV1: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    useLiveListV1: mocks.useLiveListV1,
  };
});

void i18n.changeLanguage("en-US");

function stubLiveEnv() {
  vi.stubEnv("MODE", "development");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "strict");
  vi.stubEnv("VITE_BFF_REAL_WRITES", "true");
  liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
}

function renderObjectList(createBehavior?: CreateBehavior) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/management/strategies"]}>
          <Routes>
            <Route
              path="/management/strategies"
              element={(
                <ObjectListPage
                  title="Strategies"
                  loader={vi.fn()}
                  basePath="/management/strategies"
                  createBehavior={createBehavior}
                />
              )}
            />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </I18nextProvider>,
  );
}

describe("ObjectListPage", () => {
  beforeEach(() => {
    stubLiveEnv();
    mocks.useLiveListV1.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it("surfaces strict live typed errors instead of looking like an empty seed page", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [],
      pending: 0,
      refresh: vi.fn(),
      meta: {
        degradation: {
          reason: "Injected F15 5xx",
          strictFallbackBlocked: true,
        },
        surfaces: {
          strategies: { status: "unavailable" },
        },
      },
    });

    renderObjectList();

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Strategies is temporarily unavailable");
    expect(status).toHaveTextContent("Injected F15 5xx");
    expect(status).not.toHaveTextContent("strict typed error");
    expect(status).not.toHaveTextContent("seed fallback blocked");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("does not label governed 4xx list errors as strict seed-fallback blocks", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [],
      pending: 0,
      refresh: vi.fn(),
      meta: {
        degradation: {
          reason: "Injected F15 governed 4xx",
          strictFallbackBlocked: false,
        },
        surfaces: {
          strategies: { status: "unavailable" },
        },
      },
    });

    renderObjectList();

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Injected F15 governed 4xx");
    expect(status).not.toHaveTextContent("strict typed error");
    expect(status).not.toHaveTextContent("seed fallback blocked");
  });

  it("renders registry tables as viewport-filling scroll regions", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [{
        id: "strategy-1",
        name: "Strategy One",
        state: "deployed",
        risk: "low",
        owner: "ops",
        updatedAt: "2026-07-08T00:00:00Z",
      }],
      pending: 0,
      refresh: vi.fn(),
      meta: {},
    });

    const { container } = renderObjectList();

    const pageBody = container.querySelector('[data-page-body-mode="fill"]');
    expect(pageBody).toHaveClass("flex", "min-h-0", "flex-1", "overflow-hidden");

    const dataTable = container.querySelector('[data-data-table-layout="fill"]');
    expect(dataTable).toHaveClass("flex-1", "min-h-0", "overflow-hidden");

    const scrollRoot = container.querySelector('[data-management-table-scroll="pinned-horizontal"]');
    expect(scrollRoot).toHaveClass("h-full", "flex-1", "min-h-0");

    const native = container.querySelector('[data-management-table-scrollbar="native"]');
    expect(native).toHaveClass("h-full", "min-h-0", "overflow-auto");
    expect(native).not.toHaveClass("max-h-[calc(100dvh-10rem)]");
  });

  it("visibly disables a legacy drawer without a durable create owner", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [],
      pending: 0,
      refresh: vi.fn(),
      meta: {},
    });

    renderObjectList({ kind: "drawer", entity: "artifact" });

    expect(screen.getByRole("button", {
      name: "Create disabled: artifact has no typed durable BFF owner.",
    })).toBeDisabled();
  });

  it("keeps the Persona drawer enabled because it has a typed durable owner", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [],
      pending: 0,
      refresh: vi.fn(),
      meta: {},
    });

    renderObjectList({ kind: "drawer", entity: "persona" });

    expect(screen.getByRole("button", { name: "Create Paper Persona" })).toBeEnabled();
  });

  it("renders returned rows and summary when a response carries rows alongside a degraded surface both without and with scopeConfig", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [{
        id: "strategy-1",
        name: "Strategy One",
        state: "deployed",
        risk: "low",
        owner: "ops",
        updatedAt: "2026-07-08T00:00:00Z",
      }],
      pending: 0,
      refresh: vi.fn(),
      meta: {
        degradation: {
          reason: "Upstream telemetry partially degraded",
        },
        surfaces: {
          strategies: { status: "unavailable" },
        },
      },
    });

    const { unmount } = render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/strategies"]}>
            <Routes>
              <Route
                path="/management/strategies"
                element={(
                  <ObjectListPage
                    title="Strategies"
                    loader={vi.fn()}
                    basePath="/management/strategies"
                    summary={(rows) => <div>Strategies summary: {rows.length}</div>}
                  />
                )}
              />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(screen.getByText("Strategy One")).toBeInTheDocument();
    expect(screen.getByText("Strategies summary: 1")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();

    mocks.useLiveListV1.mockReturnValue({
      items: [{
        id: "hosted-all12-h12-claude-20261027-4923-pool",
        poolId: "hosted-all12-h12-claude-20261027-4923-pool",
        name: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
        owner: "tenant-dev",
        status: "active",
        state: undefined,
        risk: undefined,
        currency: "TWD",
        allocated: 0,
        utilized: undefined,
        riskBudget: undefined,
        updatedAt: "2026-11-01T08:41:17Z",
        capitalScope: "paper",
        reportedFields: {
          currency: true,
          allocated: false,
          utilized: false,
          riskBudget: false,
          risk: false,
        },
      }],
      pending: 0,
      refresh: vi.fn(),
      meta: {
        degradation: {
          reason: "Secondary surface degraded",
        },
        surfaces: {
          persona_fleet: { status: "degraded" },
        },
      },
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/governance-decisions?tab=capital&capital_scope=paper"]}>
            <Routes>
              <Route path="/management/governance-decisions" element={<CapitalPoolsList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(screen.getByRole("button", { name: "Paper (1)" })).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 active")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("states how many paper and archived pools exist on the formal empty state, links to the paper scope, and translates new labels in both locales", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(capitalPoolsFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    function LocationProbe() {
      const loc = useLocation();
      return <output data-testid="location">{loc.pathname}{loc.search}</output>;
    }

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/governance-decisions?tab=capital"]}>
            <Routes>
              <Route
                path="/management/governance-decisions"
                element={(
                  <>
                    <CapitalPoolsList />
                    <LocationProbe />
                  </>
                )}
              />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("No formal capital pools (2 paper, 0 archived)")).toBeInTheDocument();
    expect(screen.queryByText(/upstream is not producing/i)).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Formal (0)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Paper (2)" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Archived (0)" })).toHaveAttribute("aria-pressed", "false");

    const paperScopeLink = screen.getByRole("link", { name: "View paper pools (2)" });
    expect(paperScopeLink).toHaveAttribute(
      "href",
      "/management/governance-decisions?tab=capital&capital_scope=paper",
    );
    fireEvent.click(paperScopeLink);

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/management/governance-decisions?tab=capital&capital_scope=paper",
    );
    expect(screen.getByRole("button", { name: "Paper (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getAllByText("Isolated PAPER human quorum acceptance 20261010; NOT ACTIVE").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Pantheon Dev Paper Release 38705291459 Attempt 1 paper pool").length,
    ).toBeGreaterThan(0);

    expect(i18n.getFixedT("zh-TW")("mgmt.dataSources.detail.cadenceCron")).not.toBe("mgmt.dataSources.detail.cadenceCron");
    expect(i18n.getFixedT("zh-TW")("mgmt.dataSources.detail.timezone")).not.toBe("mgmt.dataSources.detail.timezone");

    for (const locale of ["en-US", "zh-TW"] as const) {
      const fixedT = i18n.getFixedT(locale);
      for (const key of [
        "governanceDecisions.capitalScopes.groupLabel",
        "governanceDecisions.capitalScopes.formal",
        "governanceDecisions.capitalScopes.paper",
        "governanceDecisions.capitalScopes.archived",
        "governanceDecisions.capitalNotReported",
        "governanceDecisions.capitalEmptyState.paperHiddenTitle",
        "governanceDecisions.capitalEmptyState.paperHiddenDescription",
        "governanceDecisions.capitalEmptyState.openPaperScope",
        "governanceDecisions.capitalEmptyState.paperEmptyTitle",
        "governanceDecisions.capitalEmptyState.paperEmptyDescription",
        "governanceDecisions.capitalEmptyState.archivedEmptyTitle",
        "governanceDecisions.capitalEmptyState.archivedEmptyDescription",
      ]) {
        expect(fixedT(key, { paperCount: 14, archivedCount: 114, count: 14 })).not.toBe(key);
      }
    }
    expect(i18n.getFixedT("zh-TW")("governanceDecisions.capitalScopes.formal")).toBe("正式");
    expect(i18n.getFixedT("zh-TW")("governanceDecisions.capitalScopes.paper")).toBe("模擬");
    expect(i18n.getFixedT("zh-TW")("governanceDecisions.capitalScopes.archived")).toBe("已封存");
    expect(i18n.getFixedT("zh-TW")("governanceDecisions.capitalNotReported")).toBe("未回報");
  });

  it("loads every page of GET /bff/capital-pools via next_page_token through the real useLiveListV1 hook, shows exact counts per scope, persists capital_scope in the URL, and navigates to /management/capital/<id> on row click", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);

    const realOwnerPool = {
      id: "hosted-all12-h12-claude-20261027-4923-pool",
      pool_id: "hosted-all12-h12-claude-20261027-4923-pool",
      name: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
      owner_id: "tenant-dev",
      owner_type: "org",
      status: "active",
      created_at: "2026-11-01T08:41:17Z",
      currency: "TWD",
      single_runtime_enforced: true,
      risk_limits: {},
      metadata: {
        internal: true,
        execution_context: "paper",
        tenant_id: "tenant-dev",
        fixture: "hosted_all12",
        paper_only: true,
      },
    };
    const page2PaperPool = {
      ...realOwnerPool,
      id: "hosted-all12-page2-paper-pool",
      pool_id: "hosted-all12-page2-paper-pool",
      name: "persona-strat-hosted-all12-page2-src-222222222222 paper pool",
      status: "active",
    };
    const page2ArchivedPool = {
      ...realOwnerPool,
      id: "hosted-all12-page2-archived-pool",
      pool_id: "hosted-all12-page2-archived-pool",
      name: "persona-strat-hosted-all12-archived-src-333333333333 paper pool",
      status: "archived",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url, "http://localhost");
      if (parsed.pathname === "/bff/capital-pools") {
        const pageToken = parsed.searchParams.get("page_token");
        if (!pageToken) {
          return new Response(
            JSON.stringify({
              data: [realOwnerPool],
              items: [realOwnerPool],
              meta: {},
              page_info: { next_page_token: "page-2-token", total: 3 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (pageToken === "page-2-token") {
          return new Response(
            JSON.stringify({
              data: [page2PaperPool, page2ArchivedPool],
              items: [page2PaperPool, page2ArchivedPool],
              meta: {},
              page_info: { next_page_token: null, total: 3 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      return new Response(JSON.stringify({ data: [], items: [], meta: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    function LocationProbe() {
      const loc = useLocation();
      return <output data-testid="location">{loc.pathname}{loc.search}</output>;
    }

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/governance-decisions?tab=capital"]}>
            <Routes>
              <Route
                path="/management/governance-decisions"
                element={(
                  <>
                    <CapitalPoolsList />
                    <LocationProbe />
                  </>
                )}
              />
              <Route path="/management/capital/:id" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("No formal capital pools (2 paper, 1 archived)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Formal (0)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Paper (2)" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Archived (1)" })).toHaveAttribute("aria-pressed", "false");

    // Switch to Paper scope: both page 1 and page 2 paper pools appear, and count (2) equals rows shown (2)
    fireEvent.click(screen.getByRole("button", { name: "Paper (2)" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/management/governance-decisions?tab=capital&capital_scope=paper",
    );
    expect(
      screen.getByText("persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("persona-strat-hosted-all12-page2-src-222222222222 paper pool"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("persona-strat-hosted-all12-archived-src-333333333333 paper pool"),
    ).not.toBeInTheDocument();

    // Active status counts as active in summary card (2 active), and unreported fields show "Not reported" and never read as 0
    expect(screen.getByText("2 active")).toBeInTheDocument();
    expect(screen.getAllByText("Not reported").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("TWD 0")).not.toBeInTheDocument();
    expect(screen.queryByText("0.0% utilized")).not.toBeInTheDocument();
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();

    // Switch to Archived scope: archived pool from page 2 appears, and count (1) equals rows shown (1)
    fireEvent.click(screen.getByRole("button", { name: "Archived (1)" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/management/governance-decisions?tab=capital&capital_scope=archived",
    );
    expect(
      screen.getByText("persona-strat-hosted-all12-archived-src-333333333333 paper pool"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool"),
    ).not.toBeInTheDocument();

    // Clicking a pool row opens /management/capital/<pool id>
    fireEvent.click(screen.getByText("persona-strat-hosted-all12-archived-src-333333333333 paper pool"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/management/capital/hosted-all12-page2-archived-pool",
    );
  });

  it("shows the degraded error state with no rows and never a partial list or paper-hidden empty text when page 2 fails through the real useLiveListV1 hook", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);

    const realOwnerPool = {
      id: "hosted-all12-h12-claude-20261027-4923-pool",
      pool_id: "hosted-all12-h12-claude-20261027-4923-pool",
      name: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
      owner_id: "tenant-dev",
      owner_type: "org",
      status: "active",
      created_at: "2026-11-01T08:41:17Z",
      currency: "TWD",
      single_runtime_enforced: true,
      risk_limits: {},
      metadata: {
        internal: true,
        execution_context: "paper",
        tenant_id: "tenant-dev",
        fixture: "hosted_all12",
        paper_only: true,
      },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url, "http://localhost");
      if (parsed.pathname === "/bff/capital-pools") {
        const pageToken = parsed.searchParams.get("page_token");
        if (!pageToken) {
          return new Response(
            JSON.stringify({
              data: [realOwnerPool],
              items: [realOwnerPool],
              meta: {},
              page_info: { next_page_token: "page-2-token", total: 2 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            error: {
              code: "UPSTREAM_UNAVAILABLE",
              message: "Page 2 of /bff/capital-pools returned HTTP 503",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [], items: [], meta: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/governance-decisions?tab=capital"]}>
            <Routes>
              <Route path="/management/governance-decisions" element={<CapitalPoolsList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Capital Pools is temporarily unavailable");
    expect(status).toHaveTextContent("Page 2 of /bff/capital-pools returned HTTP 503");
    expect(status).not.toHaveTextContent("strict typed error");
    expect(status).not.toHaveTextContent("seed fallback blocked");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Formal (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paper (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archived (0)" })).toBeInTheDocument();
    expect(screen.queryByText(/No formal capital pools/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText("persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("excludes unreported pools from summary totals while summing pools that do report allocated, utilized, and risk budget", () => {
    const unreportedOwnerPool = {
      id: "hosted-all12-h12-claude-20261027-4923-pool",
      poolId: "hosted-all12-h12-claude-20261027-4923-pool",
      name: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
      owner: "tenant-dev",
      status: "active",
      state: undefined,
      risk: undefined,
      currency: "TWD",
      allocated: 0,
      utilized: undefined,
      riskBudget: undefined,
      updatedAt: "2026-11-01T08:41:17Z",
      capitalScope: "paper",
      reportedFields: {
        currency: true,
        allocated: false,
        utilized: false,
        riskBudget: false,
        risk: false,
      },
    };
    const reportedPaperPool = {
      id: "paper-pool-reported",
      poolId: "paper-pool-reported",
      name: "Reported Paper Pool",
      owner: "tenant-dev",
      status: "active",
      state: undefined,
      risk: "low" as const,
      currency: "TWD" as const,
      allocated: 1_000_000,
      utilized: 250_000,
      riskBudget: 0.05,
      updatedAt: "2026-11-01T08:41:17Z",
      capitalScope: "paper",
      reportedFields: {
        currency: true,
        allocated: true,
        utilized: true,
        riskBudget: true,
        risk: true,
      },
    };

    mocks.useLiveListV1.mockReturnValue({
      items: [unreportedOwnerPool, reportedPaperPool],
      pending: 0,
      refresh: vi.fn(),
      meta: {},
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/governance-decisions?tab=capital&capital_scope=paper"]}>
            <Routes>
              <Route path="/management/governance-decisions" element={<CapitalPoolsList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    // Both pools are active by owner status
    expect(screen.getByText("2 active")).toBeInTheDocument();
    // Totals come strictly from reportedPaperPool; unreportedOwnerPool is excluded and does not dilute weighted risk budget
    expect(screen.getAllByText("TWD 1,000,000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("TWD 250,000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("5.00%")).toBeInTheDocument();

    const unreportedRow = screen
      .getByText("persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool")
      .closest("tr");
    expect(unreportedRow).not.toBeNull();
    expect(unreportedRow).toHaveTextContent("TWD · Not reported");
    expect(unreportedRow).not.toHaveTextContent("TWD 0");
  });

  it.each([
    [
      "capital_id naming a paper pool",
      "/management/governance-decisions?tab=capital&capital_id=hosted-all12-h12-claude-20261027-4923-pool",
      "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
      "Paper (1)",
    ],
    [
      "pool naming an archived pool",
      "/management/governance-decisions?tab=capital&pool=hosted-all12-archived-pool",
      "persona-strat-hosted-all12-archived paper pool",
      "Archived (1)",
    ],
    [
      "capital_id using persona alias matched by capitalPoolMatchesFocus",
      "/management/governance-decisions?tab=capital&capital_id=persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a",
      "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
      "Paper (1)",
    ],
  ])("automatically reveals the focused row without manual switching for %s", (_caseLabel, initialUrl, expectedName, expectedActiveScopeButton) => {
    const paperPool = {
      id: "hosted-all12-h12-claude-20261027-4923-pool",
      poolId: "hosted-all12-h12-claude-20261027-4923-pool",
      name: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
      owner: "tenant-dev",
      status: "active",
      state: undefined,
      risk: undefined,
      currency: "TWD",
      allocated: 0,
      utilized: undefined,
      riskBudget: undefined,
      updatedAt: "2026-11-01T08:41:17Z",
      capitalScope: "paper",
      reportedFields: {
        currency: true,
        allocated: false,
        utilized: false,
        riskBudget: false,
        risk: false,
      },
    };
    const archivedPool = {
      ...paperPool,
      id: "hosted-all12-archived-pool",
      poolId: "hosted-all12-archived-pool",
      name: "persona-strat-hosted-all12-archived paper pool",
      status: "archived",
      state: "retired" as const,
    };

    mocks.useLiveListV1.mockReturnValue({
      items: [paperPool, archivedPool],
      pending: 0,
      refresh: vi.fn(),
      meta: {},
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[initialUrl]}>
            <Routes>
              <Route path="/management/governance-decisions" element={<CapitalPoolsList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(screen.getByRole("button", { name: expectedActiveScopeButton })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(expectedName)).toBeInTheDocument();
  });

  it("does not make a row without an id clickable and does not navigate to /undefined or build hrefs containing undefined", () => {
    const missingIdRow = {
      id: undefined as unknown as string,
      name: "Artifact Without ID",
      state: "approved" as const,
      risk: "low" as const,
      owner: "research",
      updatedAt: "2026-10-20T18:40:00Z",
    };

    expect(resolveObjectRowHref(missingIdRow, "/management/artifacts")).toBeUndefined();
    expect(
      resolveObjectRowHref(
        missingIdRow,
        "/management/artifacts",
        (r) => `/management/artifacts/${encodeURIComponent(r.id)}`,
      ),
    ).toBeUndefined();

    mocks.useLiveListV1.mockReturnValue({
      items: [missingIdRow],
      pending: 0,
      refresh: vi.fn(),
      meta: {},
    });

    function LocationProbe() {
      const loc = useLocation();
      return <output data-testid="location">{loc.pathname}{loc.search}</output>;
    }

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/artifacts"]}>
            <Routes>
              <Route
                path="/management/artifacts"
                element={(
                  <>
                    <ObjectListPage
                      title="Artifacts"
                      loader={vi.fn()}
                      basePath="/management/artifacts"
                    />
                    <LocationProbe />
                  </>
                )}
              />
              <Route path="/management/artifacts/:id" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    const rowCell = screen.getByText("Artifact Without ID");
    const rowElement = rowCell.closest("tr");
    expect(rowElement).not.toBeNull();
    expect(rowElement).not.toHaveClass("cursor-pointer");

    fireEvent.click(rowCell);
    expect(screen.getByTestId("location")).toHaveTextContent("/management/artifacts");
    expect(screen.getByTestId("location")).not.toHaveTextContent("/management/artifacts/undefined");
  });

  it("renders GET /bff/research-tasks rows with name, status, latest run, run count, created by, and updated at; removes duplicate status, risk, metric, value, and owner columns; marks stub/manual runs as non-real; disables research create with workflow explanation in both locales; and navigates to /management/experiments/<task_id>", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);

    const researchTasksPayload = {
      items: [
        {
          id: "rtask-20261023-008",
          task_id: "rtask-20261023-008",
          name: "VectorBT Factor Validation",
          objective: "Evaluate cross-sectional factor stability across TW50 universe",
          status: "completed",
          task_type: "factor_eval",
          created_by: "research-worker",
          created_at: "2026-10-23T11:00:00Z",
          updated_at: "2026-10-23T12:00:00Z",
          run_count: 2,
          latest_run: {
            run_id: "rrun-20261023-002",
            status: "completed",
            adapter: "vectorbt",
            dispatch_mode: "real",
            requested_mode: "real",
            created_by: "research-worker",
            created_at: "2026-10-23T11:45:00Z",
          },
        },
        {
          id: "rtask-exp-sic-30bcef4d067e4c0111fc28cfe8101a7b",
          task_id: "rtask-exp-sic-30bcef4d067e4c0111fc28cfe8101a7b",
          name: "SIC Hypothesis Task",
          objective: "Check SIC industry momentum hypothesis",
          status: "queued",
          task_type: "hypothesis_test",
          created_by: "operator",
          created_at: "2026-10-24T08:00:00Z",
          updated_at: "2026-10-24T09:00:00Z",
          run_count: 1,
          latest_run: {
            run_id: "rrun-20261024-stub",
            status: "completed",
            adapter: "stub",
            dispatch_mode: "stub",
            requested_mode: "stub",
            created_by: "operator",
            created_at: "2026-10-24T08:30:00Z",
          },
        },
        {
          id: "rtask-20261023-manual",
          task_id: "rtask-20261023-manual",
          name: "Manual Check Task",
          objective: "Manual inspection record",
          status: "completed",
          task_type: "manual_check",
          created_by: "operator-lead",
          created_at: "2026-10-23T09:00:00Z",
          updated_at: "2026-10-23T10:00:00Z",
          run_count: 1,
          latest_run: {
            run_id: "rrun-20261023-001",
            status: "completed",
            adapter: "manual",
            dispatch_mode: "manual",
            requested_mode: "manual",
            created_by: "operator-lead",
            created_at: "2026-10-23T09:30:00Z",
          },
        },
      ],
      meta: {
        surfaces: {
          research_tasks: { status: "ok", source: "research-executor" },
        },
      },
      page_info: { next_page_token: null, total: 3 },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(researchTasksPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    function LocationProbe() {
      const loc = useLocation();
      return <output data-testid="location">{loc.pathname}{loc.search}</output>;
    }

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/experiments"]}>
            <Routes>
              <Route
                path="/management/experiments"
                element={(
                  <>
                    <ResearchList />
                    <LocationProbe />
                  </>
                )}
              />
              <Route path="/management/experiments/:id" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("VectorBT Factor Validation")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/bff/research-tasks");

    // Verify exact table column headers and removal of duplicate status, risk, metric, value, and owner columns
    const columnHeaders = screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());
    expect(columnHeaders).toEqual([
      "Name",
      "Status",
      "Latest run",
      "Run count",
      "Created by",
      "Last updated",
    ]);
    expect(columnHeaders).not.toContain("State");
    expect(columnHeaders).not.toContain("Risk");
    expect(columnHeaders).not.toContain("Metric");
    expect(columnHeaders).not.toContain("Value");
    expect(columnHeaders).not.toContain("Owner");

    // Verify real vs stub/manual run rendering
    const realRow = screen.getByText("VectorBT Factor Validation").closest("tr");
    expect(realRow).toHaveTextContent("rrun-20261023-002");
    expect(realRow).toHaveTextContent("vectorbt / real");
    expect(realRow).not.toHaveTextContent("Non-real execution");

    const stubRow = screen.getByText("SIC Hypothesis Task").closest("tr");
    expect(stubRow).toHaveTextContent("rrun-20261024-stub");
    expect(stubRow).toHaveTextContent("stub / stub");
    expect(stubRow).toHaveTextContent("Non-real execution (stub / stub)");

    const manualRow = screen.getByText("Manual Check Task").closest("tr");
    expect(manualRow).toHaveTextContent("rrun-20261023-001");
    expect(manualRow).toHaveTextContent("manual / manual");
    expect(manualRow).toHaveTextContent("Non-real execution (manual / manual)");

    // Verify research create button stays disabled with workflow reason and never mentions "no typed durable BFF owner"
    const createBtn = screen.getByRole("button", { name: /^create$/i });
    expect(createBtn).toBeDisabled();
    expect(createBtn).toHaveAttribute(
      "title",
      "Research items are generated by research workflows; manual creation is disabled because no executor consumes manually created rows yet.",
    );
    expect(screen.queryByText(/no typed durable BFF owner/i)).not.toBeInTheDocument();
    expect(
      i18n.getFixedT("zh-TW")("research.createDisabledReason"),
    ).toBe("研究項目由研究工作流自動建立；手動建立因尚無執行者處理而維持關閉。");

    // Clicking a row navigates to /management/experiments/<task_id>
    fireEvent.click(screen.getByText("VectorBT Factor Validation"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/management/experiments/rtask-20261023-008",
    );
  });

  it("shows degraded error state for meta.surfaces.research_tasks unavailable or failed read, never 無結果, and shows healthy empty state when no research work has run yet", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);

    // 1. Surface status: "unavailable"
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [],
          meta: {
            surfaces: {
              research_tasks: {
                status: "unavailable",
                source: "research-executor",
                message: "research_tasks query failed: HTTPStatusError",
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { unmount } = render(
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

    const unavailableStatus = await screen.findByRole("status");
    expect(unavailableStatus).toHaveTextContent("Research & Experiments is temporarily unavailable");
    expect(unavailableStatus).toHaveTextContent("research_tasks query failed: HTTPStatusError");
    expect(unavailableStatus).not.toHaveTextContent("No data yet");
    expect(unavailableStatus).not.toHaveTextContent("strict typed error");
    expect(unavailableStatus).not.toHaveTextContent("seed fallback blocked");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("無結果")).not.toBeInTheDocument();
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
    expect(screen.queryByText(/No research work has run yet/i)).not.toBeInTheDocument();
    unmount();

    // 2. Failed read (HTTP 503)
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "BACKEND_UNAVAILABLE",
            message: "research-executor upstream 503",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { unmount: unmountFailed } = render(
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

    const failedStatus = await screen.findByRole("status");
    expect(failedStatus).toHaveTextContent("Research & Experiments is temporarily unavailable");
    expect(failedStatus).toHaveTextContent("research-executor upstream 503");
    expect(failedStatus).not.toHaveTextContent("strict typed error");
    expect(failedStatus).not.toHaveTextContent("seed fallback blocked");
    expect(failedStatus).not.toHaveTextContent("No data yet");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("無結果")).not.toBeInTheDocument();
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
    unmountFailed();

    // 3. Healthy empty list
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [],
          meta: {
            surfaces: {
              research_tasks: {
                status: "ok",
                source: "research-executor",
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
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

    const emptyStatus = await screen.findByRole("status");
    expect(emptyStatus).toHaveTextContent("No research tasks yet");
    expect(emptyStatus).toHaveTextContent("No research work has run yet.");
    expect(screen.queryByText("無結果")).not.toBeInTheDocument();
    expect(i18n.getFixedT("zh-TW")("research.emptyState.title")).toBe("尚無研究任務");
    expect(i18n.getFixedT("zh-TW")("research.emptyState.description")).toContain("目前尚未執行任何研究工作");
  });

  it("creates an evolution program with only name and Idempotency-Key, reads it back as draft from GET /bff/evolution-programs with no optimistic row, and keeps name while displaying 422, 403, and 503 errors in the drawer", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);

    let persistedPrograms: Array<Record<string, unknown>> = [];
    const postCalls: Array<{ body: Record<string, unknown>; idempotencyKey: string | null }> = [];
    let nextPostResponse: () => Response = () =>
      new Response(JSON.stringify({ error: { code: "UNKNOWN_ERROR", message: "unconfigured" } }), { status: 500 });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url, "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();
      if (parsed.pathname === "/bff/evolution-programs" && method === "GET") {
        return new Response(
          JSON.stringify({
            items: persistedPrograms,
            meta: { surfaces: { evolution_programs: { status: "ok" } } },
            page_info: { next_page_token: null, total: persistedPrograms.length },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (parsed.pathname === "/bff/evolution-programs" && method === "POST") {
        const headers = new Headers(init?.headers);
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        postCalls.push({
          body,
          idempotencyKey: headers.get("Idempotency-Key"),
        });
        return nextPostResponse();
      }
      return new Response(JSON.stringify({ items: [], meta: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution"]}>
            <Routes>
              <Route path="/management/evolution" element={<EvolutionList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    const openDrawerBtn = await screen.findByRole("button", { name: /^create$/i });
    expect(openDrawerBtn).toBeEnabled();
    fireEvent.click(openDrawerBtn);

    // Drawer shows only the Name field; parentAlpha and population are removed
    const nameInput = await screen.findByLabelText(/name/i);
    expect(nameInput).toBeInTheDocument();
    expect(screen.queryByLabelText(/parent alpha/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/population/i)).not.toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: "Cross-Sectional Alpha v2" } });

    // 1. 422 error shows in drawer and keeps entered name
    nextPostResponse = () =>
      new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION_FAILED",
            message: "422 Unprocessable Entity: extra fields not permitted",
          },
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );

    const submitButtons = screen.getAllByRole("button", { name: /^create$/i });
    const drawerSubmitBtn = submitButtons[submitButtons.length - 1];
    fireEvent.click(drawerSubmitBtn);

    expect(await screen.findByTestId("entity-create-error")).toHaveTextContent(
      "422 Unprocessable Entity: extra fields not permitted",
    );
    expect(nameInput).toHaveValue("Cross-Sectional Alpha v2");

    // 2. 403 error shows in drawer and keeps entered name
    nextPostResponse = () =>
      new Response(
        JSON.stringify({
          error: {
            code: "PERMISSION_DENIED",
            message: "403 Forbidden: tenant scope mismatch",
          },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );

    fireEvent.click(drawerSubmitBtn);
    expect(await screen.findByTestId("entity-create-error")).toHaveTextContent(
      "403 Forbidden: tenant scope mismatch",
    );
    expect(nameInput).toHaveValue("Cross-Sectional Alpha v2");

    // 3. 503 error shows in drawer and keeps entered name
    nextPostResponse = () =>
      new Response(
        JSON.stringify({
          error: {
            code: "BACKEND_UNAVAILABLE",
            message: "503 Service Unavailable: evolution store unreachable",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );

    fireEvent.click(drawerSubmitBtn);
    expect(await screen.findByTestId("entity-create-error")).toHaveTextContent(
      "503 Service Unavailable: evolution store unreachable",
    );
    expect(nameInput).toHaveValue("Cross-Sectional Alpha v2");

    // 4. Successful 201 create sends only { name } + Idempotency-Key and reads back from GET /bff/evolution-programs as draft
    nextPostResponse = () => {
      const createdRow = {
        program_id: "evo-prog-20261104-001",
        name: "Cross-Sectional Alpha v2",
        status: "draft",
        updated_at: "2026-11-04T15:00:00Z",
      };
      persistedPrograms = [createdRow];
      return new Response(JSON.stringify({ data: createdRow }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    fireEvent.click(drawerSubmitBtn);

    const createdCell = await screen.findByText("Cross-Sectional Alpha v2");
    const createdRowEl = createdCell.closest("tr");
    expect(createdRowEl).not.toBeNull();
    expect(createdRowEl).toHaveTextContent(/draft/i);

    expect(postCalls.length).toBe(4);
    for (const call of postCalls) {
      expect(call.body).toEqual({ name: "Cross-Sectional Alpha v2" });
      expect(Object.keys(call.body)).toEqual(["name"]);
      expect(call.idempotencyKey).toBeTruthy();
    }
  });

  it("keeps the create button disabled with the read-only reason when the deployment profile disables real writes", () => {
    vi.stubEnv("VITE_BFF_REAL_WRITES", "false");
    mocks.useLiveListV1.mockReturnValue({
      items: [],
      pending: 0,
      refresh: vi.fn(),
      meta: {},
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution"]}>
            <Routes>
              <Route path="/management/evolution" element={<EvolutionList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    const createBtn = screen.getByRole("button", { name: /^create$/i });
    expect(createBtn).toBeDisabled();
    expect(createBtn).toHaveAttribute("title", "Real writes are disabled (read-only mode).");
    fireEvent.click(createBtn);
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
    expect(i18n.getFixedT("zh-TW")("mgmt.dataSources.realWritesRequired")).toBe(
      "實體寫入已停用（唯讀模式）。",
    );
  });

  it("renders GET /bff/artifacts across pages for both registry bundles and research run outputs with real kind, version, state, risk, hash, source_kind label/filter, no 0 MB fabrication, and reachable detail links", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);

    const registryRow = {
      id: "reg-bundle-001",
      registry_id: "reg-bundle-001",
      artifact_id: "art-exec-bundle-001",
      strategy_id: "strat-persona-bundle-001",
      name: "strat-persona-bundle-001",
      kind: "execution_bundle",
      artifact_type: "execution_bundle",
      version: "1.0.1",
      state: "approved",
      artifact_state: "approved",
      risk: "low",
      hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0001",
      checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0001",
      owner: "gov-approver-alpha",
      approver: "gov-approver-alpha",
      updatedAt: "2026-11-04T12:01:00Z",
      updated_at: "2026-11-04T12:01:00Z",
      source_kind: "registry",
    };

    const researchRow = {
      id: "res-run-output-001",
      artifact_id: "res-run-output-001",
      name: "Qlib Alpha158 Factor Evaluation Output",
      title: "Qlib Alpha158 Factor Evaluation Output",
      kind: "factor_eval_report",
      artifact_type: "factor_eval_report",
      version: null,
      state: null,
      status: "",
      risk: null,
      hash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      checksum: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      owner: "research-worker-qlib",
      author: "research-worker-qlib",
      created_by: "research-worker-qlib",
      updatedAt: "2026-11-04T17:00:00Z",
      updated_at: "2026-11-04T17:00:00Z",
      source_kind: "research_run_output",
    };

    const fetchUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchUrls.push(url);
      if (url.includes("page_token=1")) {
        return new Response(
          JSON.stringify({
            data: [researchRow],
            items: [researchRow],
            total: 2,
            total_complete: true,
            cursor: { next: null },
            page_info: { page_size: 100, total: 2, has_more: false, next_page_token: null },
            meta: {
              snapshot_at: "2026-11-04T18:00:00Z",
              total_complete: true,
              surfaces: {
                artifact_list: { status: "ok", source: "registry+research" },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [registryRow],
          items: [registryRow],
          total: 2,
          total_complete: true,
          cursor: { next: "1" },
          page_info: { page_size: 100, total: 2, has_more: true, next_page_token: "1" },
          meta: {
            snapshot_at: "2026-11-04T18:00:00Z",
            total_complete: true,
            surfaces: {
              artifact_list: { status: "ok", source: "registry+research" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    function LocationProbe() {
      const loc = useLocation();
      return <output data-testid="artifact-location">{loc.pathname}{loc.search}</output>;
    }

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/artifacts"]}>
            <Routes>
              <Route
                path="/management/artifacts"
                element={(
                  <>
                    <ArtifactsList />
                    <LocationProbe />
                  </>
                )}
              />
              <Route path="/management/artifacts/:id" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    const regCell = await screen.findByText("strat-persona-bundle-001");
    const resCell = await screen.findByText("Qlib Alpha158 Factor Evaluation Output");
    expect(fetchUrls.some((u) => u.includes("/bff/artifacts?page_size=100"))).toBe(true);
    expect(fetchUrls.some((u) => u.includes("page_token=1"))).toBe(true);

    const regTr = regCell.closest("tr");
    expect(regTr).not.toBeNull();
    expect(regTr).toHaveTextContent("registry");
    expect(regTr).toHaveTextContent("execution_bundle");
    expect(regTr).toHaveTextContent("1.0.1");
    expect(regTr).toHaveTextContent("Approved");
    expect(regTr).toHaveTextContent("Low");
    // FE-MGMT-CATALOG-LEGIBILITY-20261105: hash is shortened in the cell; the full value is still exposed via title.
    expect(regTr.querySelector('[data-full-hash="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0001"]')).toHaveAttribute(
      "title",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0001",
    );
    expect(regTr).toHaveTextContent("aaaaaaaa…aa0001");
    expect(regTr).toHaveTextContent("gov-approver-alpha");
    expect(regTr).toHaveTextContent("No data");
    expect(regTr).not.toHaveTextContent("0 MB");

    const resTr = resCell.closest("tr");
    expect(resTr).not.toBeNull();
    expect(resTr).toHaveTextContent("research_run_output");
    expect(resTr).toHaveTextContent("factor_eval_report");
    expect(resTr.querySelector('[data-full-hash="sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"]')).toHaveAttribute(
      "title",
      "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
    expect(resTr).toHaveTextContent("sha256:9f86d081…f00a08");
    expect(resTr).toHaveTextContent("research-worker-qlib");
    expect(resTr).not.toHaveTextContent("0 MB");
    expect(resTr).not.toHaveTextContent("Unavailable");
    expect(resTr?.textContent?.match(/No data/g)?.length).toBeGreaterThanOrEqual(4);

    // Filter by source_kind
    const registryScopeBtn = screen.getByRole("button", { name: "Registry bundle (1)" });
    const researchScopeBtn = screen.getByRole("button", { name: "Research output (1)" });
    const allScopeBtn = screen.getByRole("button", { name: "All sources (2)" });
    expect(allScopeBtn).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(registryScopeBtn);
    expect(screen.getByText("strat-persona-bundle-001")).toBeInTheDocument();
    expect(screen.queryByText("Qlib Alpha158 Factor Evaluation Output")).not.toBeInTheDocument();

    fireEvent.click(researchScopeBtn);
    expect(screen.getByText("Qlib Alpha158 Factor Evaluation Output")).toBeInTheDocument();
    expect(screen.queryByText("strat-persona-bundle-001")).not.toBeInTheDocument();

    fireEvent.click(allScopeBtn);
    expect(screen.getByText("strat-persona-bundle-001")).toBeInTheDocument();
    expect(screen.getByText("Qlib Alpha158 Factor Evaluation Output")).toBeInTheDocument();

    // Every row is reachable
    fireEvent.click(screen.getByText("Qlib Alpha158 Factor Evaluation Output"));
    expect(screen.getByTestId("artifact-location")).toHaveTextContent("/management/artifacts/res-run-output-001");
  });

  it("shows a partial-data banner naming the failed source when artifact_list surface is degraded while rendering surviving rows", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);

    const researchRow = {
      id: "res-run-output-001",
      artifact_id: "res-run-output-001",
      name: "Qlib Alpha158 Factor Evaluation Output",
      kind: "factor_eval_report",
      version: null,
      state: null,
      risk: null,
      hash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      owner: "research-worker-qlib",
      updatedAt: "2026-11-04T17:00:00Z",
      source_kind: "research_run_output",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [researchRow],
          items: [researchRow],
          total: 1,
          total_complete: false,
          cursor: { next: null },
          page_info: { page_size: 100, total: 1, has_more: false, next_page_token: null },
          meta: {
            snapshot_at: "2026-11-04T18:00:00Z",
            total_complete: false,
            surfaces: {
              artifact_list: {
                status: "degraded",
                source: "research",
                failed_source: "registry",
                failed_sources: ["registry"],
                degraded_sources: ["registry"],
                message: "Artifact catalog is degraded because registry owner read failed.",
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/artifacts"]}>
            <Routes>
              <Route path="/management/artifacts" element={<ArtifactsList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Qlib Alpha158 Factor Evaluation Output")).toBeInTheDocument();
    const banner = screen.getByTestId("partial-data-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute("data-failed-source", "registry");
    expect(banner).toHaveTextContent(/Partial artifact catalog — failed source: registry/i);
    expect(banner).toHaveTextContent("Artifact catalog is degraded because registry owner read failed.");
  });

  it("renders qualification summary from GET /bff/management/evolution-qualification with 649 evaluated and 0 qualified in both locales and explains why there are zero programs", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);

    const hostedQualificationReport = {
      data: {
        tenant_id: "default",
        sweep_id: "evo-qual-sweep-20261105-0001",
        policy_version: "evolution-qualification.v1",
        evaluated_at: "2026-11-05T00:00:00Z",
        evaluated: 649,
        qualified: 0,
        drafted: 0,
        counts_by_first_failing_criterion: {
          real_threshold_signal: 649,
        },
        failure_reason: null,
        items: [
          {
            decision_id: "evo-sweep-agent-000b205c0ef9-0000",
            sweep_id: "evo-qual-sweep-20261105-0001",
            tenant_id: "default",
            target_type: "infra_component",
            target_id: "infra-component-agent-finding-000b205c0ef9",
            metric_name: "incident_followup_required",
            qualified: false,
            first_failing_criterion: "real_threshold_signal",
            failure_reason: "metric incident_followup_required is not a numeric threshold breach",
            policy_version: "evolution-qualification.v1",
            evaluated_at: "2026-11-05T00:00:00Z",
            program_id: null,
            criteria: [],
          },
        ],
        total: 649,
        limit: 50,
        offset: 0,
      },
      meta: { snapshot_at: "2026-11-05T00:00:00Z" },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/management/evolution-qualification")) {
        return new Response(JSON.stringify(hostedQualificationReport), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/bff/evolution-programs")) {
        return new Response(
          JSON.stringify({
            data: [],
            items: [],
            total: 0,
            total_complete: true,
            cursor: { next: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await i18n.changeLanguage("en-US");
    const { unmount } = render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution"]}>
            <Routes>
              <Route path="/management/evolution" element={<EvolutionList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    const summary = await screen.findByTestId("evolution-qualification-summary");
    expect(summary).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("qualification-policy-version")).toHaveTextContent(
        "evolution-qualification.v1",
      );
      expect(screen.getByTestId("qualification-evaluated-at")).toHaveTextContent(
        "2026-11-05T00:00:00Z",
      );
      expect(screen.getByTestId("qualification-evaluated-count")).toHaveTextContent("649");
      expect(screen.getByTestId("qualification-qualified-count")).toHaveTextContent("0");
      expect(
        screen.getByTestId("qualification-criterion-count-real_threshold_signal"),
      ).toHaveTextContent("649");
    });

    expect(screen.getByTestId("qualification-criterion-real_threshold_signal")).toHaveTextContent(
      "Real threshold signal",
    );
    expect(screen.getByTestId("qualification-criterion-real_target")).toHaveTextContent(
      "Real target",
    );
    expect(screen.getByTestId("qualification-criterion-persistent_breach")).toHaveTextContent(
      "Persistent breach",
    );
    expect(screen.getByTestId("qualification-criterion-fresh_evidence")).toHaveTextContent(
      "Fresh evidence",
    );
    expect(screen.getByTestId("qualification-criterion-executable_action")).toHaveTextContent(
      "Executable action",
    );
    expect(screen.getByTestId("qualification-criterion-no_open_duplicate")).toHaveTextContent(
      "No open duplicate",
    );

    const zeroExplanation = screen.getByTestId("evolution-zero-programs-explanation");
    expect(zeroExplanation).toHaveTextContent("Why there are 0 evolution programs");
    expect(zeroExplanation).toHaveTextContent(
      /649 proposals were evaluated under policy evolution-qualification\.v1.*0 qualified/i,
    );
    unmount();

    // Verify zh-TW locale labels
    await i18n.changeLanguage("zh-TW");
    const { unmount: unmountZh } = render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution"]}>
            <Routes>
              <Route path="/management/evolution" element={<EvolutionList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("qualification-evaluated-count")).toHaveTextContent("649");
    });
    expect(screen.getByTestId("qualification-criterion-real_threshold_signal")).toHaveTextContent(
      "真實門檻訊號",
    );
    expect(screen.getByTestId("qualification-criterion-real_target")).toHaveTextContent(
      "真實演化目標",
    );
    expect(screen.getByTestId("qualification-criterion-persistent_breach")).toHaveTextContent(
      "持續性突破門檻",
    );
    expect(screen.getByTestId("qualification-criterion-fresh_evidence")).toHaveTextContent(
      "新鮮證據時效",
    );
    expect(screen.getByTestId("qualification-criterion-executable_action")).toHaveTextContent(
      "可執行研究動作",
    );
    expect(screen.getByTestId("qualification-criterion-no_open_duplicate")).toHaveTextContent(
      "無進行中重複方案",
    );
    expect(screen.getByTestId("evolution-zero-programs-explanation")).toHaveTextContent(
      "目前沒有演化方案的原因",
    );
    unmountZh();
    await i18n.changeLanguage("en-US");
  });

  it("renders EvolutionList with name, status, origin, source decision count, run count, and updated at columns, removes legacy generation/population/fitness/progress columns, and marks automatic under_review programs as waiting for human review", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);

    const programsPayload = {
      data: [
        {
          id: "evp-auto-001",
          program_id: "evp-auto-001",
          name: "Auto Drawdown Breach Program",
          status: "under_review",
          state: "under_review",
          origin: "auto_qualified",
          source_decision_ids: [
            "evo-sweep-agent-000b205c0ef9-0000",
            "evo-sweep-agent-000b205c0ef9-0001",
          ],
          run_ids: [],
          updated_at: "2026-11-05T01:00:00Z",
          updatedAt: "2026-11-05T01:00:00Z",
        },
        {
          id: "evp-manual-002",
          program_id: "evp-manual-002",
          name: "Manual Operator Program",
          status: "active",
          state: "active",
          origin: "manual",
          source_decision_ids: [],
          run_ids: ["resrun-001"],
          updated_at: "2026-11-05T02:00:00Z",
          updatedAt: "2026-11-05T02:00:00Z",
        },
      ],
      items: [
        {
          id: "evp-auto-001",
          program_id: "evp-auto-001",
          name: "Auto Drawdown Breach Program",
          status: "under_review",
          state: "under_review",
          origin: "auto_qualified",
          source_decision_ids: [
            "evo-sweep-agent-000b205c0ef9-0000",
            "evo-sweep-agent-000b205c0ef9-0001",
          ],
          run_ids: [],
          updated_at: "2026-11-05T01:00:00Z",
          updatedAt: "2026-11-05T01:00:00Z",
        },
        {
          id: "evp-manual-002",
          program_id: "evp-manual-002",
          name: "Manual Operator Program",
          status: "active",
          state: "active",
          origin: "manual",
          source_decision_ids: [],
          run_ids: ["resrun-001"],
          updated_at: "2026-11-05T02:00:00Z",
          updatedAt: "2026-11-05T02:00:00Z",
        },
      ],
      total: 2,
      total_complete: true,
      cursor: { next: null },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/evolution-programs")) {
        return new Response(JSON.stringify(programsPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/bff/management/evolution-qualification")) {
        return new Response(
          JSON.stringify({
            data: {
              tenant_id: "default",
              sweep_id: "evo-qual-sweep-20261105-0002",
              policy_version: "evolution-qualification.v1",
              evaluated_at: "2026-11-05T01:00:00Z",
              evaluated: 650,
              qualified: 1,
              drafted: 1,
              counts_by_first_failing_criterion: { real_threshold_signal: 649 },
              items: [],
              total: 650,
              limit: 50,
              offset: 0,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await i18n.changeLanguage("en-US");
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution"]}>
            <Routes>
              <Route path="/management/evolution" element={<EvolutionList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Auto Drawdown Breach Program")).toBeInTheDocument();
    expect(screen.getByText("Manual Operator Program")).toBeInTheDocument();

    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      "Name",
      "Status",
      "Origin",
      "Source decisions",
      "Runs",
      "Updated at",
    ]);
    expect(headers).not.toContain("Version");
    expect(headers).not.toContain("Members");
    expect(headers).not.toContain("Performance");
    expect(headers).not.toContain("Progress");

    expect(screen.getByTestId("evolution-origin-evp-auto-001")).toHaveTextContent("Automatic");
    expect(screen.getByTestId("evolution-waiting-review-evp-auto-001")).toHaveTextContent(
      "Waiting for human review",
    );
    expect(screen.getByTestId("evolution-source-decision-count-evp-auto-001")).toHaveTextContent("2");
    expect(screen.getByTestId("evolution-run-count-evp-auto-001")).toHaveTextContent("0");

    expect(screen.getByTestId("evolution-origin-evp-manual-002")).toHaveTextContent("Manual");
    expect(screen.queryByTestId("evolution-waiting-review-evp-manual-002")).not.toBeInTheDocument();
    expect(screen.getByTestId("evolution-source-decision-count-evp-manual-002")).toHaveTextContent("0");
    expect(screen.getByTestId("evolution-run-count-evp-manual-002")).toHaveTextContent("1");
  });

  it("shows a loading state while the first read is in flight (never 無結果 / No results), shows localized unavailable wording with retry on network failure or HTTP 504 (never strict typed error / seed fallback / 尚無資料), and shows 無結果 only after a successful read with zero rows", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    let rejectFirstRead!: (reason?: unknown) => void;
    let resolveThirdRead!: (response: Response) => void;
    let callCount = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<Response>((_resolve, reject) => {
          rejectFirstRead = reject;
        });
      }
      if (callCount === 2) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: "BACKEND_UNAVAILABLE",
                message: "HTTP 504 Gateway Timeout on /bff/strategies",
              },
            }),
            { status: 504, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return new Promise<Response>((resolve) => {
        resolveThirdRead = resolve;
      });
    });

    await i18n.changeLanguage("zh-TW");
    const { unmount } = render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/strategies"]}>
            <Routes>
              <Route path="/management/strategies" element={<StrategiesList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    // 1. While the first read is in flight: shows loading state and never 無結果 / 尚無資料
    expect(screen.getByTestId("data-table-loading")).toHaveTextContent("載入中…");
    expect(screen.queryByText("無結果")).not.toBeInTheDocument();
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
    expect(screen.queryByText("尚無資料")).not.toBeInTheDocument();

    // 2. Network failure ("Failed to fetch") -> localized unavailable state with retry action
    rejectFirstRead(new TypeError("Failed to fetch"));
    const networkFailedStatus = await screen.findByRole("status");
    expect(networkFailedStatus).toHaveTextContent("目前無法載入策略與 Alpha");
    expect(networkFailedStatus).toHaveTextContent("無法從伺服器取得資料（網路連線失敗），請重試。");
    expect(networkFailedStatus).not.toHaveTextContent("尚無資料");
    expect(networkFailedStatus).not.toHaveTextContent("strict typed error");
    expect(networkFailedStatus).not.toHaveTextContent("seed fallback");
    expect(screen.queryByText("無結果")).not.toBeInTheDocument();

    // 3. Retry triggers second read (HTTP 504) -> localized unavailable state with retry action
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("HTTP 504 Gateway Timeout on /bff/strategies");
    });
    const gatewayTimeoutStatus = screen.getByRole("status");
    expect(gatewayTimeoutStatus).toHaveTextContent("目前無法載入策略與 Alpha");
    expect(gatewayTimeoutStatus).not.toHaveTextContent("尚無資料");
    expect(gatewayTimeoutStatus).not.toHaveTextContent("strict typed error");
    expect(gatewayTimeoutStatus).not.toHaveTextContent("seed fallback");
    expect(screen.queryByText("無結果")).not.toBeInTheDocument();

    // 4. Retry triggers third read: while in flight shows loading state, then resolves with 0 rows -> shows 無結果
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(await screen.findByTestId("data-table-loading")).toHaveTextContent("載入中…");
    expect(screen.queryByText("無結果")).not.toBeInTheDocument();

    resolveThirdRead(
      new Response(
        JSON.stringify({
          data: [],
          items: [],
          total: 0,
          total_complete: true,
          cursor: { next: null },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    expect(await screen.findByTestId("data-table-empty")).toHaveTextContent("無結果");
    expect(screen.queryByTestId("data-table-loading")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    unmount();
    await i18n.changeLanguage("en-US");
  });

  it("renders EvolutionList when /bff/management/evolution-qualification returns an array body without opening STRICT TYPED ERROR or FALLBACK DATA banners and fetches qualification only once", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);
    stubLiveEnv();

    let qualificationCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/management/evolution-qualification")) {
        qualificationCalls += 1;
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/bff/evolution-programs")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "evp-array-qual-001",
                program_id: "evp-array-qual-001",
                name: "Resilient Evolution Program",
                status: "active",
                state: "active",
                origin: "manual",
                source_decision_ids: [],
                run_ids: ["run-1"],
                updated_at: "2026-11-05T02:00:00Z",
              },
            ],
            total: 1,
            total_complete: true,
            cursor: { next: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await i18n.changeLanguage("en-US");
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution"]}>
            <LiveStatusBanner />
            <Routes>
              <Route path="/management/evolution" element={<EvolutionList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Resilient Evolution Program")).toBeInTheDocument();
    expect(screen.getByTestId("qualification-policy-version")).toHaveTextContent("—");
    expect(screen.getByTestId("qualification-evaluated-at")).toHaveTextContent("Not evaluated yet");
    expect(screen.getByTestId("qualification-evaluated-count")).toHaveTextContent("0");
    expect(screen.getByTestId("qualification-qualified-count")).toHaveTextContent("0");
    expect(qualificationCalls).toBe(1);
    expect(liveStatus.get().effective).toBe("live");
    expect(liveStatus.get().lastError).toBeUndefined();
    expect(screen.queryByText(/strict typed error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FALLBACK DATA/i)).not.toBeInTheDocument();
  });

  it("requests exclude_state=draft by default on /management/strategies, shows hidden draft count with one-click Show drafts action, filters via BFF with state query param (default, approved, review, retired, draft, all, and CommandCenter DTO states), and pages one server page at a time up to row 4898", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);
    stubLiveEnv();

    const realApprovedRow = {
      id: "strategy-persona-59b2143dcecf205acbf1",
      strategy_id: "strategy-persona-59b2143dcecf205acbf1",
      name: "Pantheon Dev Paper Release 42123862167 Attempt 1",
      state: "approved",
      risk: "low",
      capitalPoolId: "pool-persona-paper-59b2143dcecf205acbf1",
      capital_pool_id: "pool-persona-paper-59b2143dcecf205acbf1",
      owner: "persona-59b2143dcecf205acbf1",
      updated_at: "2026-11-06T01:00:00Z",
    };
    const realReviewRow = {
      ...realApprovedRow,
      id: "strategy-persona-59b2143dcecf205acbf1-review",
      strategy_id: "strategy-persona-59b2143dcecf205acbf1-review",
      name: "Pantheon Dev Paper Release 42123862167 Review Candidate",
      state: "review",
    };
    const realRetiredRow = {
      ...realApprovedRow,
      id: "strategy-persona-59b2143dcecf205acbf1-retired",
      strategy_id: "strategy-persona-59b2143dcecf205acbf1-retired",
      name: "Pantheon Dev Paper Release 42123862167 Retired",
      state: "retired",
    };
    const realDraftRow = {
      ...realApprovedRow,
      id: "strategy-persona-59b2143dcecf205acbf1-draft",
      strategy_id: "strategy-persona-59b2143dcecf205acbf1-draft",
      name: "Pantheon Dev Paper Release 42123862167 Draft",
      state: "draft",
    };
    const realLastPageRow = {
      ...realDraftRow,
      id: "strategy-persona-59b2143dcecf205acbf1-4898",
      strategy_id: "strategy-persona-59b2143dcecf205acbf1-4898",
      name: "Pantheon Dev Paper Release 42123862167 Row 4898",
    };

    const hostedStateCounts = {
      draft: 4764,
      review: 1,
      approved: 133,
      paper_running: 0,
      canary_running: 0,
      live_running: 0,
      deployed: 0,
      paused: 0,
      retired: 2,
    };

    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requestedUrls.push(url);
      const parsed = new URL(url, "http://localhost");
      const state = parsed.searchParams.get("state");
      const excludeState = parsed.searchParams.get("exclude_state");
      const pageToken = parsed.searchParams.get("page_token");

      if (excludeState === "draft") {
        return new Response(
          JSON.stringify({
            data: [realApprovedRow, realReviewRow],
            items: [realApprovedRow, realReviewRow],
            meta: { state_counts: hostedStateCounts },
            page_info: { page_size: 20, total: 134, next_page_token: "20" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (state === "approved") {
        return new Response(
          JSON.stringify({
            data: [realApprovedRow],
            items: [realApprovedRow],
            meta: { state_counts: hostedStateCounts },
            page_info: { page_size: 20, total: 133, next_page_token: "20" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (state === "review") {
        return new Response(
          JSON.stringify({
            data: [realReviewRow],
            items: [realReviewRow],
            meta: { state_counts: hostedStateCounts },
            page_info: { page_size: 20, total: 1, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (state === "retired") {
        return new Response(
          JSON.stringify({
            data: [realRetiredRow],
            items: [realRetiredRow],
            meta: { state_counts: hostedStateCounts },
            page_info: { page_size: 20, total: 2, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (state === "draft") {
        return new Response(
          JSON.stringify({
            data: [realDraftRow],
            items: [realDraftRow],
            meta: { state_counts: hostedStateCounts },
            page_info: { page_size: 20, total: 4764, next_page_token: "20" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      // All view (no state, no exclude_state)
      if (!state && !excludeState) {
        if (pageToken === "20") {
          return new Response(
            JSON.stringify({
              data: [{ ...realApprovedRow, id: "strategy-persona-59b2143dcecf205acbf1-p2", name: "Pantheon Dev Paper Release Page 2" }],
              items: [{ ...realApprovedRow, id: "strategy-persona-59b2143dcecf205acbf1-p2", name: "Pantheon Dev Paper Release Page 2" }],
              meta: { state_counts: hostedStateCounts },
              page_info: { page_size: 20, total: 4898, next_page_token: "40" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (pageToken === "4880") {
          return new Response(
            JSON.stringify({
              data: [realLastPageRow],
              items: [realLastPageRow],
              meta: { state_counts: hostedStateCounts },
              page_info: { page_size: 20, total: 4898, next_page_token: null },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            data: [realApprovedRow, realDraftRow],
            items: [realApprovedRow, realDraftRow],
            meta: { state_counts: hostedStateCounts },
            page_info: { page_size: 20, total: 4898, next_page_token: "20" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          data: [],
          items: [],
          meta: { state_counts: hostedStateCounts },
          page_info: { page_size: 20, total: 0, next_page_token: null },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    function LocationProbe() {
      const loc = useLocation();
      return <output data-testid="strategy-location">{loc.pathname}{loc.search}</output>;
    }

    await i18n.changeLanguage("en-US");
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/strategies"]}>
            <Routes>
              <Route
                path="/management/strategies"
                element={(
                  <>
                    <StrategiesList />
                    <LocationProbe />
                  </>
                )}
              />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    // AC 1: Default view requests exclude_state=draft and shows no draft row
    expect(await screen.findByText("Pantheon Dev Paper Release 42123862167 Attempt 1")).toBeInTheDocument();
    expect(requestedUrls).toEqual(["/bff/strategies?exclude_state=draft&page_size=20"]);
    expect(screen.queryByText("Pantheon Dev Paper Release 42123862167 Draft")).not.toBeInTheDocument();

    // AC 2: State control offers default, approved, review, retired, draft, and all with counts from meta.state_counts
    expect(screen.getByRole("button", { name: "Default (hide drafts) (134)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Approved (133)" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "In Review (1)" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Retired (2)" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Draft (4764)" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All (4898)" })).toHaveAttribute("aria-pressed", "false");

    // AC 3: Default view states how many drafts are hidden with one-click action to see them
    const hiddenBanner = screen.getByTestId("strategy-hidden-drafts-banner");
    expect(hiddenBanner).toHaveTextContent("4764 draft strategies are hidden by default.");
    const showDraftsBtn = screen.getByTestId("strategy-show-drafts-button");
    expect(showDraftsBtn).toHaveTextContent("Show drafts (4764)");

    // Clicking Show drafts switches to state=draft in URL and fetches state=draft from BFF
    fireEvent.click(showDraftsBtn);
    expect(await screen.findByText("Pantheon Dev Paper Release 42123862167 Draft")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-location")).toHaveTextContent("/management/strategies?state=draft");
    expect(requestedUrls[requestedUrls.length - 1]).toBe("/bff/strategies?state=draft&page_size=20");
    expect(screen.queryByTestId("strategy-hidden-drafts-banner")).not.toBeInTheDocument();

    // Switch to retired
    fireEvent.click(screen.getByRole("button", { name: "Retired (2)" }));
    expect(await screen.findByText("Pantheon Dev Paper Release 42123862167 Retired")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-location")).toHaveTextContent("/management/strategies?state=retired");
    expect(requestedUrls[requestedUrls.length - 1]).toBe("/bff/strategies?state=retired&page_size=20");

    // Switch to all view and verify server paging through 4898 rows without loading all pages at once (AC 4)
    const callCountBeforeAll = requestedUrls.length;
    fireEvent.click(screen.getByRole("button", { name: "All (4898)" }));
    expect(await screen.findByText("Pantheon Dev Paper Release 42123862167 Attempt 1")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-location")).toHaveTextContent("/management/strategies?state=all");
    // Only 1 request was made for page 1 of all view
    expect(requestedUrls.length - callCountBeforeAll).toBe(1);
    expect(requestedUrls[requestedUrls.length - 1]).toBe("/bff/strategies?page_size=20");
    expect(screen.getByTestId("strategy-list-total")).toHaveTextContent("Showing 1–2 of 4898");
    expect(screen.getByTestId("strategy-list-page-indicator")).toHaveTextContent("Page 1 of 245");

    // Next page sends page_token=20
    fireEvent.click(screen.getByTestId("strategy-page-next"));
    expect(await screen.findByText("Pantheon Dev Paper Release Page 2")).toBeInTheDocument();
    expect(requestedUrls[requestedUrls.length - 1]).toBe("/bff/strategies?page_size=20&page_token=20");
    expect(screen.getByTestId("strategy-list-page-indicator")).toHaveTextContent("Page 2 of 245");

    // Last page sends page_token=4880 and reaches row 4898 in 1 click without fetching intermediate pages
    const callCountBeforeLast = requestedUrls.length;
    fireEvent.click(screen.getByTestId("strategy-page-last"));
    expect(await screen.findByText("Pantheon Dev Paper Release 42123862167 Row 4898")).toBeInTheDocument();
    expect(requestedUrls.length - callCountBeforeLast).toBe(1);
    expect(requestedUrls[requestedUrls.length - 1]).toBe("/bff/strategies?page_size=20&page_token=4880");
    expect(screen.getByTestId("strategy-list-page-indicator")).toHaveTextContent("Page 245 of 245");
    expect(screen.getByTestId("strategy-page-next")).toBeDisabled();
  });

  it("handles meta.state_counts: null without inventing counts, lands on CommandCenter state=<value> query links, and keeps drafts reachable by direct URL while navigating on strategy onCreated", async () => {
    const { useLiveListV1: actualUseLiveListV1 } = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actualUseLiveListV1);
    stubLiveEnv();

    const realApprovedRow = {
      id: "strategy-persona-59b2143dcecf205acbf1",
      strategy_id: "strategy-persona-59b2143dcecf205acbf1",
      name: "Pantheon Dev Paper Release 42123862167 Attempt 1",
      state: "approved",
      risk: "low",
      capitalPoolId: "pool-persona-paper-59b2143dcecf205acbf1",
      capital_pool_id: "pool-persona-paper-59b2143dcecf205acbf1",
    };

    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requestedUrls.push(url);
      if (url.includes("/bff/strategies/strategy-persona-59b2143dcecf205acbf1-draft")) {
        return new Response(
          JSON.stringify({
            data: {
              ...realApprovedRow,
              id: "strategy-persona-59b2143dcecf205acbf1-draft",
              strategy_id: "strategy-persona-59b2143dcecf205acbf1-draft",
              name: "Pantheon Dev Paper Release 42123862167 Draft",
              state: "draft",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [realApprovedRow],
          items: [realApprovedRow],
          meta: { state_counts: null },
          page_info: { page_size: 20, total: 1, next_page_token: null },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const { unmount } = render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/strategies"]}>
            <Routes>
              <Route path="/management/strategies" element={<StrategiesList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Pantheon Dev Paper Release 42123862167 Attempt 1")).toBeInTheDocument();
    // When state_counts is null, buttons show labels only with no invented count
    expect(screen.getByRole("button", { name: "Default (hide drafts)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approved" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "In Review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retired" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByTestId("strategy-hidden-drafts-banner")).toHaveTextContent(
      "Draft strategies are hidden by default.",
    );
    expect(screen.getByTestId("strategy-show-drafts-button")).toHaveTextContent(/^Show drafts$/);
    unmount();

    // CommandCenter deep link with state=paper_running lands on that filter and sends state=paper_running to BFF
    const { unmount: unmountCmd } = render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/strategies?state=paper_running"]}>
            <Routes>
              <Route path="/management/strategies" element={<StrategiesList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Pantheon Dev Paper Release 42123862167 Attempt 1")).toBeInTheDocument();
    expect(requestedUrls[requestedUrls.length - 1]).toBe("/bff/strategies?state=paper_running&page_size=20");
    expect(screen.getByRole("button", { name: "Paper Running" })).toHaveAttribute("aria-pressed", "true");
    unmountCmd();

    // Direct URL to a draft strategy remains reachable (AC 6)
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/strategies/strategy-persona-59b2143dcecf205acbf1-draft"]}>
            <Routes>
              <Route path="/management/strategies/:id" element={<StrategyDetail />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Pantheon Dev Paper Release 42123862167 Draft")).toBeInTheDocument();
    expect(shouldNavigateOnCreatedEntity("strategy")).toBe(true);
    expect(shouldNavigateOnCreatedEntity("persona")).toBe(true);
    expect(shouldNavigateOnCreatedEntity("evolutionProgram")).toBe(false);
  });
});
