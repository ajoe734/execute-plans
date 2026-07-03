import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { TradingPulsePage } from "./_core";
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

  it("does not render raw NaN values on the Quarterly Ranking empty state", () => {
    const { container } = renderPage(<QuarterlyRankingPage />);

    expect(container.textContent).not.toContain("NaN");
  });
});
