import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { ObjectListPage, resolveObjectRowHref } from "./ObjectListPage";
import { CapitalPoolsList, EvolutionList, ResearchList } from "./Lists";
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
    expect(status).toHaveTextContent("strict typed error");
    expect(status).toHaveTextContent("Injected F15 5xx");
    expect(status).toHaveTextContent("seed fallback blocked");
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
    expect(status).toHaveTextContent("strict typed error");
    expect(status).toHaveTextContent("Page 2 of /bff/capital-pools returned HTTP 503");
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
    expect(unavailableStatus).toHaveTextContent("No data yet");
    expect(unavailableStatus).toHaveTextContent("research_tasks query failed: HTTPStatusError");
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
    expect(failedStatus).toHaveTextContent("strict typed error");
    expect(failedStatus).toHaveTextContent("research-executor upstream 503");
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
});
