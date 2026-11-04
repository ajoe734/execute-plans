import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { ObjectListPage, resolveObjectRowHref } from "./ObjectListPage";
import { CapitalPoolsList } from "./Lists";
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
});
