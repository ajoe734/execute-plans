import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { OneRingCockpitPage, TradingPulsePage } from "./_core";
import { Ep5CanaryReadinessPage } from "./Ep5CanaryReadiness";
import { PersonaIntentTracesPage } from "./PersonaIntentTraces";
import { PersonaLeaguePage } from "./PersonaLeague";
import { PortfolioBookPage } from "./PortfolioBook";
import { QuarterlyRankingPage } from "./QuarterlyRanking";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

vi.mock("@/management/components/openclaw/OpenClawLlmAuthPanel", () => ({
  OpenClawLlmAuthPanel: () => null,
}));

void i18n.changeLanguage("en-US");

function renderPage(element: ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        {element}
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("live-only management page fallbacks", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
    mocks.useV5Live.mockReturnValue({ data: undefined, loading: false, refresh: vi.fn() });
  });

  it("does not render the local Trading Pulse seed model when live data is unavailable", () => {
    renderPage(<TradingPulsePage />);

    expect(screen.getByText("Live data unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Live Trading Pulse data is unavailable.")).not.toBeInTheDocument();
  });

  it("renders the actual cockpit aggregate and its degraded status without invented Loops", () => {
    mocks.useV5Live.mockReturnValueOnce({ loading: false, data: {
      snapshotAt: "2026-09-13T07:36:00Z", status: "degraded", message: "Telemetry is unavailable.",
      health: { status: "ok", headline: "Control plane healthy", message: "Owners responding." },
      cards: [{ id: "runtime", label: "Runtime", status: "ok", summary: "No active runtime bindings." }],
    } });
    renderPage(<OneRingCockpitPage />);
    expect(screen.getByText("Control plane healthy")).toBeInTheDocument();
    expect(screen.getByText("Telemetry is unavailable.")).toBeInTheDocument();
    expect(screen.getByText("No active runtime bindings.")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-live-aggregate")).toHaveTextContent("degraded");
    expect(screen.queryByText("Live data unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId("cockpit-projection-unavailable")).toBeInTheDocument();
  });

  it("keeps the cockpit unavailable when no aggregate was returned", () => {
    renderPage(<OneRingCockpitPage />);
    expect(screen.getByText("Live data unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-live-aggregate")).not.toBeInTheDocument();
  });

  it("does not render seeded readiness checklist rows", () => {
    renderPage(<Ep5CanaryReadinessPage />);

    expect(screen.getByText("Live readiness data unavailable")).toBeInTheDocument();
    expect(screen.queryByText("EP4 governed paper proof present")).not.toBeInTheDocument();
    expect(screen.queryByText("Kill-switch demo present")).not.toBeInTheDocument();
  });

  it("does not render deterministic Persona Intent traces", () => {
    renderPage(<PersonaIntentTracesPage />);

    expect(screen.queryByText("Rebalance momentum sleeve toward higher beta names.")).not.toBeInTheDocument();
    expect(screen.queryByText("trace-001")).not.toBeInTheDocument();
  });

  it("does not render seeded Persona League rows", () => {
    renderPage(<PersonaLeaguePage />);

    expect(screen.queryByText("Alpha Trader")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk Guard")).not.toBeInTheDocument();
  });

  it("does not render seeded Portfolio Book rows", () => {
    renderPage(<PortfolioBookPage />);

    expect(screen.getByText("Live data unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Alpha US Equity")).not.toBeInTheDocument();
    expect(screen.queryByText("BTCUSD")).not.toBeInTheDocument();
  });

  it("does not render seeded Quarterly Ranking rows", () => {
    renderPage(<QuarterlyRankingPage />);

    expect(screen.queryByText("Alpha Trader")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk Guard")).not.toBeInTheDocument();
  });

  it("does not render raw NaN values on the Quarterly Ranking empty state", () => {
    const { container } = renderPage(<QuarterlyRankingPage />);

    expect(container.textContent).not.toContain("NaN");
  });

  it("renders saved owner recommendation and rationale instead of fabricated no_change when ranking rows omit recommendation", () => {
    const rankingRow = {
      persona_id: "persona-projection-test",
      score: 69.25,
      eligibility: "eligible",
    };
    const savedRecommendation = {
      persona_id: "persona-projection-test",
      action_id: "promote_to_canary_candidate",
      rationale: "Saved provider rationale for existing read-only report",
      ranking_snapshot_id: "ranking-projection-test",
      evaluator_run_id: "evaluator-projection-test",
      human_review_state: {
        status: "advisory_report",
        decision_status: "not_applicable",
        owner_decision: null,
      },
    };
    mocks.useV5Live.mockImplementation((_loader, _deps, opts?: { cacheKey?: string }) => ({
      data: opts?.cacheKey?.includes("recommendations")
        ? [savedRecommendation]
        : opts?.cacheKey?.includes("formula")
          ? undefined
          : [rankingRow],
      loading: false,
      refresh: vi.fn(),
    }));

    const quarterly = renderPage(<QuarterlyRankingPage />);
    expect(screen.getByText("Promote to canary candidate")).toBeInTheDocument();
    expect(screen.getByText("Saved provider rationale for existing read-only report")).toBeInTheDocument();
    expect(screen.getByText("evaluator-projection-test · ranking-projection-test")).toBeInTheDocument();
    expect(screen.queryByText("No change")).not.toBeInTheDocument();
    quarterly.unmount();

    renderPage(<PersonaLeaguePage />);
    expect(screen.getByText("Promote to canary candidate")).toBeInTheDocument();
    expect(screen.getByText("Saved provider rationale for existing read-only report")).toBeInTheDocument();
    expect(screen.getByText("evaluator-projection-test · ranking-projection-test")).toBeInTheDocument();
    expect(screen.queryByText("No change")).not.toBeInTheDocument();
  });

  it("does not fabricate no_change on Quarterly Ranking or Persona League when saved owner recommendations are unavailable", () => {
    const rankingRow = {
      persona_id: "persona-projection-test",
      score: 69.25,
      eligibility: "eligible",
    };
    mocks.useV5Live.mockImplementation((_loader, _deps, opts?: { cacheKey?: string }) => ({
      data: opts?.cacheKey?.includes("recommendations") || opts?.cacheKey?.includes("formula")
        ? undefined
        : [rankingRow],
      loading: false,
      refresh: vi.fn(),
    }));

    const quarterly = renderPage(<QuarterlyRankingPage />);
    expect(screen.getByText("persona-projection-test")).toBeInTheDocument();
    expect(screen.queryByText("No change")).not.toBeInTheDocument();
    quarterly.unmount();

    renderPage(<PersonaLeaguePage />);
    expect(screen.getByText("persona-projection-test")).toBeInTheDocument();
    expect(screen.queryByText("No change")).not.toBeInTheDocument();
  });
});
