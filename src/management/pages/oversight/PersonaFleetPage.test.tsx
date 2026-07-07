import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
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
    mocks.useV5Live.mockReturnValue({
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
      "/management/performance-attribution?dimension=persona&persona=persona-live-tw-equity",
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

  it("hides non-production live rows by default", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        fleetRow("persona-crypto", "Crypto Persona"),
        fleetRow("dry-run-write-probe-persona", "Dry Run Probe Persona"),
        fleetRow("persona-live-gold", "Gold Futures Persona"),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByText("Gold Futures Persona")).toBeInTheDocument();
    expect(screen.queryByText("Crypto Persona")).not.toBeInTheDocument();
    expect(screen.queryByText("Dry Run Probe Persona")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show non-production (2)" })).toBeInTheDocument();
  });

  it("renders Persona Fleet as a bounded native table viewport for long row sets", () => {
    mocks.useV5Live.mockReturnValue({
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
    expect(tableScroll.querySelector("[data-management-table-scrollbar='pinned']")).toBeNull();
    const native = tableScroll.querySelector("[data-management-table-scrollbar='native']");
    expect(native).toBeTruthy();
    expect(native).toHaveClass("max-h-[calc(100vh-220px)]");
    expect(native).toHaveClass("overflow-auto");
    expect(native).not.toHaveClass("pinned-horizontal-scroll__native");
    expect(screen.getByRole("table")).toHaveClass("min-w-[1840px]");
  });

  it("renders snake_case live data source and research lists inline", () => {
    mocks.useV5Live.mockReturnValue({
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

  it("renders paper capital, league rank, and human review context from fleet rows", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        fleetRow("persona-live-paper-alpha", "Paper League Persona", {
          humanNeeded: true,
          state: "deployed",
          capitalMode: "paper",
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

    renderFleet("/management/persona-fleet");

    expect(screen.getByText("paper-ledger-persona-live-paper-alpha")).toBeInTheDocument();
    expect(screen.queryByText("cp-paper-alpha")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open capital for persona-live-paper-alpha" })).toHaveAttribute(
      "href",
      "/management/capital?pool=paper-ledger-persona-live-paper-alpha",
    );
    expect(screen.queryByText("Open capital")).not.toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "persona-live-paper-alpha persona league ranking" })).toHaveAttribute(
      "href",
      "/management/promotion-allocation?tab=real-ranking&persona=persona-live-paper-alpha",
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

  it("does not turn summary-only data source counts into provider chips", () => {
    mocks.useV5Live.mockReturnValue({
      data: [{
        personaId: "persona-live-summary",
        personaName: "Live Summary Persona",
        owner: "pantheon-dev-browser",
        ooda: "Act",
        autonomy: "supervised",
        perfDelta: 0.182,
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
    expect(screen.getByText("nan")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "persona-live-summary data source status" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("persona-live-summary research detail")).toHaveTextContent("act");
    expect(screen.getByText("paper broker sandbox readback and funding-rate stress review")).toBeInTheDocument();
    expect(screen.getByText(/vectorbt \/ 2 more frameworks/)).toBeInTheDocument();
    expect(screen.getByText(/artifact-live-summary-v1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "persona-live-summary performance attribution" })).toHaveAttribute(
      "href",
      "/management/performance-attribution?dimension=persona&persona=persona-live-summary",
    );
  });

  it("does not report a focused persona as missing before live fleet data loads", () => {
    mocks.useV5Live.mockReturnValue({
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
    mocks.useV5Live.mockReturnValue({
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
    mocks.useV5Live.mockReturnValue({
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
    mocks.useV5Live.mockReturnValue({
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
    mocks.useV5Live.mockReturnValue({
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
    mocks.useV5Live.mockReturnValue({
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
    mocks.useV5Live.mockReturnValue({
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
    mocks.useV5Live.mockReturnValue({
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
