import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { mgmt, type ManagementPersonaFleetPage, type ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { PersonaFleetPage } from "./_core";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function fleetRow(
  personaId: string,
  personaName: string,
  overrides: Partial<ManagementPersonaFleetRow> = {},
): ManagementPersonaFleetRow {
  const row: ManagementPersonaFleetRow = {
    personaId,
    personaName,
    owner: "pathreon-management",
    ooda: "Orient",
    autonomy: "supervised",
    perfDelta: 0.095,
    hasTradingTelemetry: true,
    humanNeeded: true,
    lastMutation: "2026-06-07",
    state: "needs_human_approval",
    currentWork: `${personaName} research review`,
    dataSourceStatus: {
      state: "readback_ok",
      providerStatuses: { shioaji: "read_ok" },
      readbackRefs: [],
      unavailableRefs: [],
      readOnly: true,
      liveIngestionEnabled: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
    },
    dataSources: [{
      providerKey: "shioaji",
      provider: "Shioaji quote",
      status: "read_ok",
      orderCapableProvider: false,
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
      linkTargets: {
        dataSource: `/management/data-sources?persona=${personaId}&source=shioaji`,
      },
    }],
    researchStatus: {
      stage: "management_review_linked",
      frameworks: ["qlib"],
      pendingTaskIds: [],
      canDeploy: false,
      summary: `${personaName} summary`,
    },
    currentResearchProjects: [{
      projectId: "MGMT-QLIB-006",
      title: `${personaName} linked review`,
      stage: "management_review_linked",
      frameworks: ["qlib"],
      experimentId: "exp-mgmt-qlib-006",
      blockedByTaskIds: [],
      canDeploy: false,
    }],
    linkTargets: {
      persona: `/management/personas/${personaId}`,
      dataSources: `/management/data-sources?persona=${personaId}`,
      orient: "/management/experiments/exp-mgmt-qlib-006",
      performance: `/management/performance-attribution?dimension=persona&persona=${personaId}`,
      mutation: `/management/evolution-journal?persona=${personaId}`,
      humanGate: `/management/human-inbox/readiness_blocker%3Apersona%3A${personaId}`,
      runtime: `/management/runtimes?persona=${personaId}&runtime=rt-${personaId}`,
      onboarding: `/management/personas/${personaId}/onboarding`,
    },
  };
  return { ...row, ...overrides };
}

function fleetPage(
  rows: ManagementPersonaFleetRow[],
  extra: Partial<ManagementPersonaFleetPage> = {},
): ManagementPersonaFleetPage {
  return {
    rows,
    nextPageToken: null,
    total: rows.length,
    population: { authorizedTotal: rows.length, activeTotal: rows.length, archivedTotal: 0, byPurpose: {}, byDataScope: {} },
    asOf: "2026-10-29T00:00:00.000Z",
    ...extra,
  };
}

/** Mocks the live hook with a server page built from `data` rows (tests only supply the rows). */
function mockFleet(state: {
  data?: ManagementPersonaFleetRow[] | ManagementPersonaFleetPage;
  loading?: boolean;
  error?: unknown;
  refresh?: () => unknown;
}) {
  const data = Array.isArray(state.data) ? fleetPage(state.data) : state.data;
  mocks.useV5Live.mockReturnValue({ loading: false, error: null, refresh: vi.fn(), ...state, data });
}

function renderFleet(initialEntry: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/persona-fleet" element={<PersonaFleetPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("PersonaFleetPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("honors the persona query by showing only the actionable persona row", () => {
    mockFleet({
      data: [
        fleetRow("persona-live-crypto", "Live Crypto Persona"),
        fleetRow("persona-live-us-equity", "Live US Equity Persona"),
        fleetRow("persona-live-tw-equity", "Live Taiwan Equity Persona"),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet?persona=persona-live-tw-equity");

    expect(screen.getByText("Focused persona: persona-live-tw-equity")).toBeInTheDocument();
    expect(screen.getByText("Live Taiwan Equity Persona")).toBeInTheDocument();
    expect(screen.queryByText("Live Crypto Persona")).not.toBeInTheDocument();
    expect(screen.queryByText("Live US Equity Persona")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show all personas" })).toHaveAttribute(
      "href",
      "/management/persona-fleet",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity human gate" })).toHaveAttribute(
      "href",
      "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-live-tw-equity",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity OODA Orient stage" })).toHaveAttribute(
      "href",
      "/management/experiments/exp-mgmt-qlib-006",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity research detail" })).toHaveAttribute(
      "href",
      "/management/experiments/exp-mgmt-qlib-006",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity performance attribution" })).toHaveAttribute(
      "href",
      "/management/performance?tab=attribution&dimension=persona&persona=persona-live-tw-equity",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity mutation history" })).toHaveAttribute(
      "href",
      "/management/evolution-journal?persona=persona-live-tw-equity",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity status detail" })).toHaveAttribute(
      "href",
      "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-live-tw-equity",
    );
  });

  it("marks a market-default seed and leaves unavailable trading performance unlinked", () => {
    mockFleet({
      data: [
        fleetRow("persona-tw-equity", "Taiwan Equity Persona", {
          perfDelta: Number.NaN,
          hasTradingTelemetry: false,
          isMarketPersonaDefault: true,
          seedRow: true,
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet?persona=persona-tw-equity");

    expect(screen.getByText("Seed Fixture")).toBeInTheDocument();
    expect(screen.getByLabelText("persona-tw-equity performance attribution unavailable")).toHaveTextContent("—");
    expect(screen.queryByRole("link", { name: "persona-tw-equity performance attribution" })).not.toBeInTheDocument();
    expect(screen.queryByText("9.50%")).not.toBeInTheDocument();
  });

  it("honors the canonical persona_id query from Portfolio Book links", () => {
    mockFleet({
      data: [
        fleetRow("persona-live-crypto", "Live Crypto Persona"),
        fleetRow("persona-live-tw-equity", "Live Taiwan Equity Persona"),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet?persona_id=persona-live-tw-equity");

    expect(screen.getByText("Focused persona: persona-live-tw-equity")).toBeInTheDocument();
    expect(screen.getByText("Live Taiwan Equity Persona")).toBeInTheDocument();
    expect(screen.queryByText("Live Crypto Persona")).not.toBeInTheDocument();
  });

  describe("server-paginated fleet (stateful hook fake)", () => {
    type Q = Parameters<typeof mgmt.personaFleet.page>[0];
    const PAGE = 20;
    // 130 mixed rows: regular paper/draft/live, explicit test, unknown, retired, plus one advisory assistant.
    const universe: ManagementPersonaFleetRow[] = [];
    for (let i = 0; i < 130; i += 1) {
      const id = `p-${String(i).padStart(3, "0")}`;
      const bucket = i % 13;
      const overrides: Partial<ManagementPersonaFleetRow> =
        bucket < 7 ? { dataScope: "regular", capitalMode: "paper", state: "paper_running" }
        : bucket === 7 ? { dataScope: "regular", state: "draft", capitalMode: undefined }
        : bucket === 8 ? { dataScope: "regular", capitalMode: "live", state: "live_running" }
        : bucket < 11 ? { dataScope: "test", capitalMode: "paper", state: "paper_running" }
        : bucket === 11 ? { dataScope: "unknown", classificationConfirmed: false, state: "draft" }
        : { dataScope: "regular", state: "retired", archived: true };
      universe.push(fleetRow(id, `Persona ${id}`, { personaPurpose: "trading", archived: false, ...overrides }));
    }
    universe.push(fleetRow("servant-1", "My Assistant", { personaPurpose: "advisory_assistant", dataScope: "regular", state: "advisory" }));

    function serve(q: NonNullable<Q>) {
      const matches = universe.filter((r) => {
        if (q.purpose && q.purpose !== "all" && r.personaPurpose !== q.purpose) return false;
        if (q.dataScope && q.dataScope !== "all" && r.dataScope !== q.dataScope) return false;
        if (q.archived === "exclude" && r.archived) return false;
        if (q.archived === "only" && !r.archived) return false;
        if (q.q && !`${r.personaId} ${r.personaName}`.toLowerCase().includes(q.q.toLowerCase())) return false;
        return true;
      });
      const start = q.pageToken ? Number(q.pageToken) : 0;
      const slice = matches.slice(start, start + (q.pageSize ?? PAGE));
      const next = start + slice.length < matches.length ? String(start + slice.length) : null;
      return fleetPage(slice, {
        total: matches.length,
        nextPageToken: next,
        population: {
          authorizedTotal: universe.length,
          activeTotal: universe.filter((r) => !r.archived).length,
          archivedTotal: universe.filter((r) => r.archived).length,
          byPurpose: {},
          byDataScope: {},
        },
      });
    }

    function installLiveHook() {
      mocks.useV5Live.mockImplementation((loader: (signal: AbortSignal) => Promise<unknown>, deps: unknown[]) => {
        const [state, setState] = useState<{ data?: unknown; loading: boolean; error: unknown }>({ loading: true, error: null });
        useEffect(() => {
          const controller = new AbortController();
          setState({ loading: true, error: null });
          loader(controller.signal).then(
            (data) => { if (!controller.signal.aborted) setState({ data, loading: false, error: null }); },
            (error) => { if (!controller.signal.aborted) setState({ loading: false, error }); },
          );
          return () => controller.abort();
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, deps);
        return { ...state, refresh: vi.fn() };
      });
    }

    beforeEach(() => {
      installLiveHook();
    });

    it("does not resurrect an old page after a scope round trip", async () => {
      vi.spyOn(mgmt.personaFleet, "page").mockImplementation(async (q) => serve(q ?? {}));
      renderFleet("/management/persona-fleet");
      await screen.findByText("Persona p-000");
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByText("Page 2");
      fireEvent.click(screen.getByRole("radio", { name: "Test / acceptance" }));
      await screen.findByText("Persona p-009");
      expect(screen.getByText("Page 1")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("radio", { name: "Regular" }));
      await waitFor(() => expect(screen.getByText("Page 1")).toBeInTheDocument());
      expect(screen.getByText("Persona p-000")).toBeInTheDocument();
    });

    it("keeps the mapped legacy test scope when requesting archives", async () => {
      const page = vi.spyOn(mgmt.personaFleet, "page").mockImplementation(async (q) => serve(q ?? {}));
      renderFleet("/management/persona-fleet?tab=non-production");
      await screen.findByText("Persona p-009");
      fireEvent.click(screen.getByRole("button", { name: "Archived (10)" }));
      await waitFor(() => expect(page.mock.calls.at(-1)?.[0]).toMatchObject({dataScope: "test", archived: "only"}));
    });

    it("requests 20 trading/regular/non-archived rows, paginates beyond 100 without gaps or duplicates", async () => {
      const page = vi.spyOn(mgmt.personaFleet, "page").mockImplementation(async (q) => serve(q ?? {}));
      renderFleet("/management/persona-fleet");
      await screen.findByText("Persona p-000");
      expect(page.mock.calls[0]?.[0]).toMatchObject({
        purpose: "trading", dataScope: "regular", archived: "exclude", pageSize: 20,
      });
      expect(screen.queryByText("My Assistant")).not.toBeInTheDocument();
      const regularTotal = universe.filter((r) => r.personaPurpose === "trading" && r.dataScope === "regular" && !r.archived).length;
      expect(screen.getByTestId("persona-fleet-pager").textContent).toContain(`of ${regularTotal}`);

      const seen: string[] = [];
      for (let guard = 0; guard < 20; guard += 1) {
        const ids = await screen.findAllByText(/^p-\d{3}$/);
        seen.push(...ids.map((n) => n.textContent ?? ""));
        const next = screen.getByRole("button", { name: "Next" });
        if ((next as HTMLButtonElement).disabled) break;
        const before = seen.length;
        fireEvent.click(next);
        await waitFor(() => expect(screen.getAllByText(/^p-\d{3}$/)[0]?.textContent).not.toBe(seen[before - ids.length]));
      }
      expect(seen).toHaveLength(regularTotal);
      expect(new Set(seen).size).toBe(regularTotal);
      expect(regularTotal).toBeGreaterThan(60);
      // previous page returns to the prior slice
      fireEvent.click(screen.getByRole("button", { name: "Previous" }));
      await waitFor(() => expect(screen.getByText(/Page \d+/)).toBeInTheDocument());
    });

    it("keeps test and unknown data behind explicit filters and labels them", async () => {
      vi.spyOn(mgmt.personaFleet, "page").mockImplementation(async (q) => serve(q ?? {}));
      renderFleet("/management/persona-fleet?data=unknown");
      await screen.findByText("Persona p-011");
      expect(screen.getByTestId("fleet-data-scope-p-011").textContent).toContain("Unconfirmed");
      expect(screen.getByTestId("fleet-data-scope-p-011").textContent).toContain("to confirm");
      expect(screen.queryByText("Persona p-000")).not.toBeInTheDocument();
    });

    it("maps legacy ?tab=non-production to test data and never classifies by name", async () => {
      const page = vi.spyOn(mgmt.personaFleet, "page").mockImplementation(async (q) => serve(q ?? {}));
      renderFleet("/management/persona-fleet?tab=non-production");
      await screen.findByText("Persona p-009");
      expect(page.mock.calls[0]?.[0]).toMatchObject({ dataScope: "test" });
      expect(screen.getByTestId("fleet-data-scope-p-009").textContent).toContain("Test");
    });

    it("lazy-loads archived rows only on request and reports the full archived count", async () => {
      const page = vi.spyOn(mgmt.personaFleet, "page").mockImplementation(async (q) => serve(q ?? {}));
      renderFleet("/management/persona-fleet");
      const archivedTotal = universe.filter((r) => r.archived).length;
      const toggle = await screen.findByRole("button", { name: `Archived (${archivedTotal})` });
      expect(page.mock.calls.every(([q]) => q?.archived === "exclude")).toBe(true);
      fireEvent.click(toggle);
      await screen.findByText("Persona p-012");
      expect(page.mock.calls.at(-1)?.[0]).toMatchObject({ archived: "only", pageToken: undefined });
    });

    it("resets to page one on filter change and ignores a late response for a superseded scope", async () => {
      const resolvers: Array<() => void> = [];
      vi.spyOn(mgmt.personaFleet, "page").mockImplementation((q, opts) => new Promise((resolve) => {
        const result = serve(q ?? {});
        resolvers.push(() => resolve(result));
        opts?.signal?.addEventListener("abort", () => resolve(result)); // late/aborted response still resolves
      }));
      renderFleet("/management/persona-fleet");
      resolvers.splice(0).forEach((r) => r());
      await screen.findByText("Persona p-000");
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() => expect(resolvers.length).toBe(1));
      // switch scope while the page-2 request is still pending
      fireEvent.click(screen.getByRole("radio", { name: "Test / acceptance" }));
      await waitFor(() => expect(resolvers.length).toBe(2));
      resolvers.splice(0).forEach((r) => r());
      await screen.findByText("Persona p-009");
      expect(screen.getByText("Page 1")).toBeInTheDocument();
      expect(screen.queryByText("Persona p-000")).not.toBeInTheDocument();
    });

    it("locates a focused persona beyond the first page across all scopes, including advisory exclusion", async () => {
      const page = vi.spyOn(mgmt.personaFleet, "page").mockImplementation(async (q) => serve(q ?? {}));
      renderFleet("/management/persona-fleet?persona_id=p-125");
      await screen.findByText("Persona p-125");
      expect(page.mock.calls[0]?.[0]).toMatchObject({ q: "p-125", purpose: "all", dataScope: "all", archived: "include" });
      expect(screen.getByText("Focused persona: p-125")).toBeInTheDocument();
    });

    it("finds a focused persona past the first substring-match page by walking next pages", async () => {
      const base = universe[0]!;
      const mk = (id: string) => ({ ...base, personaId: id, personaName: id });
      const first = Array.from({ length: 20 }, (_, i) => mk(`p-target-${i}`));
      const page = vi.spyOn(mgmt.personaFleet, "page").mockImplementation(async (q) =>
        q?.pageToken
          ? fleetPage([mk("p-target")], { nextPageToken: null })
          : fleetPage(first, { nextPageToken: "20" }),
      );
      renderFleet("/management/persona-fleet?persona_id=p-target");
      await screen.findByText("Focused persona: p-target");
      expect(page.mock.calls.map(([q]) => q?.pageToken)).toEqual([undefined, "20"]);
      expect(screen.queryByText("No persona fleet row found for p-target.")).not.toBeInTheDocument();
    });

    it("never renders an advisory assistant as a fleet row even when the focus targets it", async () => {
      vi.spyOn(mgmt.personaFleet, "page").mockImplementation(async (q) => serve(q ?? {}));
      renderFleet("/management/persona-fleet?persona_id=servant-1");
      await screen.findByText("No persona fleet row found for servant-1.");
      expect(screen.queryByText("My Assistant")).not.toBeInTheDocument();
    });

    it("shows an owner error, not an empty fleet", async () => {
      vi.spyOn(mgmt.personaFleet, "page").mockRejectedValue(new Error("owner down"));
      renderFleet("/management/persona-fleet");
      expect(await screen.findByRole("alert")).toHaveTextContent("Live Persona Fleet data unavailable");
      expect(screen.queryByText("No personas yet")).not.toBeInTheDocument();
    });

    it("distinguishes true-empty from filtered-empty", async () => {
      vi.spyOn(mgmt.personaFleet, "page").mockResolvedValue(fleetPage([], { total: 0, population: { authorizedTotal: 0, activeTotal: 0, archivedTotal: 0, byPurpose: {}, byDataScope: {} } }));
      const { unmount } = renderFleet("/management/persona-fleet");
      await screen.findByText("No personas yet");
      unmount();
      vi.spyOn(mgmt.personaFleet, "page").mockResolvedValue(fleetPage([], { total: 0, population: { authorizedTotal: 5, activeTotal: 5, archivedTotal: 0, byPurpose: {}, byDataScope: {} } }));
      renderFleet("/management/persona-fleet?data=test");
      await screen.findByText(/No personas match current filters/);
      expect(screen.queryByText("No personas yet")).not.toBeInTheDocument();
    });
  });

  it("keeps the table in a scroll viewport while paginating", () => {
    mockFleet({ data: fleetPage([fleetRow("p-1", "One")], { nextPageToken: "1", total: 40 }) });
    renderFleet("/management/persona-fleet");
    expect(screen.getByTestId("persona-fleet-table-scroll")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("renders Persona Fleet as a native table viewport that fills the page remainder", () => {
    mockFleet({
      data: [
        fleetRow("persona-live-gold", "Gold Futures Persona"),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    const tableScroll = screen.getByTestId("persona-fleet-table-scroll");
    expect(tableScroll).toHaveAttribute("data-management-table-scroll", "pinned-horizontal");
    expect(tableScroll).toHaveAttribute("data-management-table-scroll-mode", "native");
    expect(tableScroll).toHaveClass("flex-1");
    expect(tableScroll).toHaveClass("min-h-0");
    expect(tableScroll.querySelector("[data-management-table-scrollbar='pinned']")).toBeNull();
    const native = tableScroll.querySelector("[data-management-table-scrollbar='native']");
    expect(native).toBeTruthy();
    expect(native).not.toHaveClass("max-h-[calc(100vh-220px)]");
    expect(native).toHaveClass("h-full");
    expect(native).toHaveClass("min-h-0");
    expect(native).toHaveClass("overflow-auto");
    expect(native).toHaveClass("pb-4");
    expect(native).not.toHaveClass("pinned-horizontal-scroll__native");
    expect(screen.getByRole("table")).toHaveClass("min-w-[1840px]");
  });

  it("renders snake_case live data source and research lists inline", () => {
    mockFleet({
      data: [{
        personaId: "persona-20260528-aabbccdd",
        personaName: "TW Live Persona",
        owner: "pathreon-management",
        ooda: "Orient",
        autonomy: "supervised",
        perfDelta: 0.095,
        humanNeeded: false,
        lastMutation: "2026-06-07",
        state: "deployed",
        dataSourceStatus: {
          provider_statuses: {
            shioaji: "read_ok",
            finmind: "read_ok",
          },
          live_source_connector_ids: ["tw-finmind-datasets"],
          live_ingestion_enabled: true,
          order_side_effects_allowed: false,
        },
        researchStatus: {
          stage: "management_review_linked",
          frameworks: ["qlib", "vectorbt"],
          experiment_id: "exp-mgmt-qlib-006",
          artifact_id: "qlib-model-v1",
          can_deploy: false,
        },
        current_research_projects: [{
          project_id: "MGMT-QLIB-006",
          title: "Qlib TW cross-sectional equity alpha admission linkage",
          stage: "management_review_linked",
          frameworks: ["qlib", "vectorbt"],
          experiment_id: "exp-mgmt-qlib-006",
          artifact_id: "qlib-model-v1",
          can_deploy: false,
          blocked_by_task_ids: ["MGMT-QLIB-003"],
        }],
        linkTargets: {
          dataSources: {
            shioaji: "/management/data-sources?persona=persona-20260528-aabbccdd&source=shioaji",
            finmind: "/management/data-sources?persona=persona-20260528-aabbccdd&source=finmind",
          },
          orient: "/management/experiments/exp-mgmt-qlib-006",
        },
      } as unknown as ManagementPersonaFleetRow],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.queryByText("View data sources")).not.toBeInTheDocument();
    expect(screen.getByText("shioaji: read ok")).toBeInTheDocument();
    expect(screen.getByText("finmind: read ok")).toBeInTheDocument();
    expect(screen.getByText("Qlib TW cross-sectional equity alpha admission linkage")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "persona-20260528-aabbccdd data source shioaji" })).toHaveAttribute(
      "href",
      "/management/data-sources?persona=persona-20260528-aabbccdd&source=shioaji",
    );
    expect(screen.getByRole("link", { name: "persona-20260528-aabbccdd research detail" })).toHaveAttribute(
      "href",
      "/management/experiments/exp-mgmt-qlib-006",
    );
  });

  it("renders loop-only research projects as plain titles with an explicit execution link", () => {
    mockFleet({
      data: [
        fleetRow("persona-live-loop-only", "Loop Only Persona", {
          humanNeeded: false,
          state: "deployed",
          currentWork: "Loop-only research execution",
          researchStatus: {
            stage: "act",
            frameworks: ["vectorbt"],
            pendingTaskIds: [],
            canDeploy: false,
          },
          currentResearchProjects: [{
            projectId: "nan",
            title: "Loop-only research execution",
            stage: "act",
            frameworks: ["vectorbt"],
            blockedByTaskIds: [],
            canDeploy: false,
            linkTargets: {
              research: "/management/loops/research?persona=persona-live-loop-only&project=nan",
            },
          }],
          linkTargets: {
            persona: "/management/personas/persona-live-loop-only",
            dataSources: "/management/data-sources?persona=persona-live-loop-only",
            orient: "/management/loops/research?persona=persona-live-loop-only&project=nan",
            performance: "/management/performance-attribution?dimension=persona&persona=persona-live-loop-only",
            mutation: "/management/evolution-journal?persona=persona-live-loop-only",
          },
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByText("Loop-only research execution").closest("a")).toBeNull();
    expect(screen.queryByRole("link", { name: "persona-live-loop-only research detail" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View research execution/ })).toHaveAttribute(
      "href",
      "/management/loops/research?persona=persona-live-loop-only",
    );
  });

  it("renders paper capital, league rank, and human review context from fleet rows", () => {
    mockFleet({
      data: [
        fleetRow("persona-live-paper-alpha", "Paper League Persona", {
          humanNeeded: true,
          state: "deployed",
          capitalMode: "paper",
          capitalPoolId: "pool-paper-alpha",
          paperCapitalPoolId: "pool-paper-alpha",
          paperLedgerId: "paper-ledger-persona-live-paper-alpha",
          paperLedger: {
            id: "paper-ledger-persona-live-paper-alpha",
            mode: "paper",
            isolated: true,
          },
          runtimeId: "rt-paper-alpha",
          runtimeBindingId: "rb-paper-alpha",
          runtimeBinding: {
            id: "rb-paper-alpha",
            runtimeId: "rt-paper-alpha",
            state: "running",
            deploymentStage: "paper",
            capitalMode: "paper",
            health: "healthy",
          },
          runtimeHealth: { status: "healthy" },
          reviewType: "paper_to_live",
          reviewStatus: "pending_human_review",
          promotionReviewId: "review-paper-alpha",
          leagueRank: 3,
          leagueScore: 87.4,
          linkTargets: {
            humanGate: "/management/human-inbox/promotion_review%3Areview-paper-alpha",
            runtime: "/management/runtimes?persona=persona-live-paper-alpha&runtime=rt-paper-alpha&binding=rb-paper-alpha",
            performance: "/management/performance-attribution?dimension=persona&persona=persona-live-paper-alpha",
            mutation: "/management/evolution-journal?persona=persona-live-paper-alpha",
            dataSources: "/management/data-sources?persona=persona-live-paper-alpha",
            orient: "/management/experiments/exp-mgmt-qlib-006",
          },
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet?tab=non-production");

    expect(screen.getByText("paper-ledger-persona-live-paper-alpha")).toBeInTheDocument();
    expect(screen.queryByText("pool-paper-alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("cp-paper-alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Paper ledger")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open capital for persona-live-paper-alpha" })).toHaveAttribute(
      "href",
      "/management/performance?tab=overview&persona_id=persona-live-paper-alpha&capital_pool_id=paper-ledger-persona-live-paper-alpha",
    );
    expect(screen.queryByText("Open capital")).not.toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "persona-live-paper-alpha persona league ranking" })).toHaveAttribute(
      "href",
      "/management/rankings?tab=quarterly&persona=persona-live-paper-alpha",
    );
    expect(screen.getByText("score 87.4")).toBeInTheDocument();
    expect(screen.getByText("healthy")).toBeInTheDocument();
    expect(screen.getByText("paper_running")).toBeInTheDocument();
    expect(screen.getByText("paper to live")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "paper to live" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review human gate for persona-live-paper-alpha" })).toHaveAttribute(
      "href",
      "/management/human-inbox/promotion_review%3Areview-paper-alpha",
    );
  });

  it("distinguishes a real sleeve from a paper ledger and links it to the persona capital view", () => {
    mockFleet({
      data: [fleetRow("persona-live-real-alpha", "Real Sleeve Persona", {
        humanNeeded: false,
        state: "live_running",
        capitalMode: "live",
        capitalScope: "live_sleeve",
        capitalScopeId: "real-sleeve-persona-alpha",
        capitalSleeveId: "real-sleeve-persona-alpha",
        capitalPoolId: "pool-real-alpha",
      })],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByText("Real sleeve")).toBeInTheDocument();
    expect(screen.getByText("real-sleeve-persona-alpha")).toBeInTheDocument();
    expect(screen.queryByText("pool-real-alpha")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open capital for persona-live-real-alpha" })).toHaveAttribute(
      "href",
      "/management/performance?tab=overview&persona_id=persona-live-real-alpha&capital_pool_id=pool-real-alpha",
    );
  });

  it("does not turn summary-only data source counts into provider chips", () => {
    mockFleet({
      data: [{
        personaId: "persona-live-summary",
        personaName: "Live Summary Persona",
        owner: "pantheon-dev-browser",
        ooda: "Act",
        autonomy: "supervised",
        perfDelta: 0.182,
        hasTradingTelemetry: true,
        humanNeeded: true,
        lastMutation: "2026-06-07",
        state: "paper_running",
        currentWork: "paper broker sandbox readback and funding-rate stress review",
        dataSourceStatus: {
          state: "datasource_smoke_ok",
          providerStatuses: {},
          providerStatusCounts: {
            datasource_smoke_ok: 1,
            read_unavailable: 1,
          },
          providerCount: 2,
          readbackRefs: [],
          unavailableRefs: [],
          readOnly: true,
          orderSideEffectsAllowed: false,
          capitalSideEffectsAllowed: false,
          liveIngestionEnabled: false,
        },
        researchStatus: {
          stage: "act",
          framework: "vectorbt",
          frameworks: ["vectorbt"],
          frameworkCount: 3,
          artifactId: "artifact-live-summary-v1",
          pendingTaskIds: [],
          canDeploy: false,
        },
      } as ManagementPersonaFleetRow],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.queryByText("1 datasource smoke ok")).not.toBeInTheDocument();
    expect(screen.queryByText("1 read unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("1/2 readable")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "persona-live-summary data sources" })).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "persona-live-summary data source status" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("persona-live-summary research detail")).toHaveTextContent("act");
    expect(screen.getByText("paper broker sandbox readback and funding-rate stress review")).toBeInTheDocument();
    expect(screen.getByText(/vectorbt \/ 2 more frameworks/)).toBeInTheDocument();
    expect(screen.getByText(/artifact-live-summary-v1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "persona-live-summary performance attribution" })).toHaveAttribute(
      "href",
      "/management/performance?tab=attribution&dimension=persona&persona=persona-live-summary",
    );
  });

  it("does not report a focused persona as missing before live fleet data loads", () => {
    mockFleet({
      data: undefined,
      loading: true,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet?persona=persona-tw-equity");

    expect(screen.getByText("Loading persona row for persona-tw-equity…")).toBeInTheDocument();
    expect(screen.queryByText("No persona fleet row found for persona-tw-equity.")).not.toBeInTheDocument();
    expect(screen.queryByText("Taiwan Equity Persona")).not.toBeInTheDocument();
  });

  it("shows a live-only empty state instead of demo fleet rows", () => {
    mockFleet({
      data: undefined,
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByText("Live Persona Fleet data unavailable")).toBeInTheDocument();
    expect(screen.getByText("This page does not render demo, seed, or non-production Persona Fleet rows.")).toBeInTheDocument();
    expect(screen.queryByText("Crypto Macro Persona")).not.toBeInTheDocument();
    expect(screen.queryByText("US Equity Persona")).not.toBeInTheDocument();
    expect(screen.queryByText("Taiwan Equity Persona")).not.toBeInTheDocument();
  });

  it("routes paper-running personas to runtime management instead of onboarding", () => {
    mockFleet({
      data: [
        fleetRow("persona-paper", "Paper Persona", {
          humanNeeded: false,
          state: "paper_running",
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByRole("link", { name: "View runtime for persona-paper" })).toHaveAttribute(
      "href",
      "/management/runtimes?persona=persona-paper&runtime=rt-persona-paper",
    );
    expect(screen.queryByRole("link", { name: "Complete paper setup for persona-paper" })).not.toBeInTheDocument();
  });

  it("routes deployed personas to runtime management instead of persona onboarding", () => {
    mockFleet({
      data: [
        fleetRow("persona-deployed", "Deployed Persona", {
          humanNeeded: false,
          state: "deployed",
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByRole("link", { name: "View runtime for persona-deployed" })).toHaveAttribute(
      "href",
      "/management/runtimes?persona=persona-deployed&runtime=rt-persona-deployed",
    );
    expect(screen.getByText("paper_running")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Complete paper setup for persona-deployed" })).not.toBeInTheDocument();
  });

  it("routes personas waiting on humans to the human gate", () => {
    mockFleet({
      data: [
        fleetRow("persona-approval", "Approval Persona", {
          ooda: "Decide",
          humanNeeded: true,
          state: "needs_human_approval",
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByRole("link", { name: "Review human gate for persona-approval" })).toHaveAttribute(
      "href",
      "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-approval",
    );
    expect(screen.getByRole("link", { name: "persona-approval OODA Decide stage" })).toHaveAttribute(
      "href",
      "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-approval",
    );
    expect(screen.queryByRole("link", { name: "Complete paper setup for persona-approval" })).not.toBeInTheDocument();
  });

  it("does not route explicit promotion review ids without a canonical target", () => {
    mockFleet({
      data: [
        fleetRow("persona-review", "Review Persona", {
          ooda: "Decide",
          humanNeeded: true,
          state: "promotion_review_pending",
          inboxId: "promotion_review:review-persona-review",
          linkTargets: undefined,
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.queryByRole("link", { name: "Review human gate for persona-review" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review human gate for persona-review" })).toBeDisabled();
  });

  it("routes researching personas with deployable artifacts to research instead of onboarding", () => {
    mockFleet({
      data: [
        fleetRow("persona-researching", "Researching Persona", {
          humanNeeded: false,
          state: "researching",
          currentResearchProjects: [{
            projectId: "MGMT-RESEARCH-001",
            title: "Researching Persona candidate review",
            stage: "researching",
            frameworks: ["qlib"],
            experimentId: "exp-researching-001",
            artifactId: "artifact-researching-001",
            blockedByTaskIds: [],
            canDeploy: true,
          }],
          linkTargets: {
            dataSources: "/management/data-sources?persona=persona-researching",
            orient: "/management/experiments/exp-researching-001",
            performance: "/management/performance-attribution?dimension=persona&persona=persona-researching",
            mutation: "/management/evolution-journal?persona=persona-researching",
          },
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByRole("link", { name: "View research for persona-researching" })).toHaveAttribute(
      "href",
      "/management/experiments/exp-researching-001",
    );
    expect(screen.queryByRole("link", { name: "Complete paper setup for persona-researching" })).not.toBeInTheDocument();
  });

  it("keeps onboarding as the primary action only for draft personas", () => {
    mockFleet({
      data: [
        fleetRow("persona-draft", "Draft Persona", {
          humanNeeded: false,
          state: "draft",
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByRole("link", { name: "Complete paper setup for persona-draft" })).toHaveAttribute(
      "href",
      "/management/personas/persona-draft/onboarding",
    );
  });
});
