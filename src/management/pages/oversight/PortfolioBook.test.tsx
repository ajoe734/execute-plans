import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PortfolioBookPage } from "./PortfolioBook";

const items = Array.from({ length: 14 }, (_, index) => ({
  holdingId: `holding-${index}`, runtimeId: `runtime-${index}`, symbol: `SYM${index}`,
  deploymentStage: ["paper", "canary", "live", "unknown"][index % 4], sourceStatus: "degraded",
  telemetryStale: false, riskState: "missing_binding", sourceIssues: [{ code: "MISSING_PERSONA_BINDING", message: "Binding missing" }],
  capitalScope: { stage: "unknown", scopeKind: (["paper_ledger", "canary_sleeve", "live_capital_pool", "unclassified"] as const)[index % 4], scopeId: index % 4 === 3 ? undefined : `scope-${index}` }, links: {},
}));
const incidents = items.map((row) => ({ id: `incident-${row.holdingId}`, holdingId: row.holdingId, severity: "high", message: "Binding missing", riskState: "missing_binding", sourceStatus: "degraded", sourceIssues: row.sourceIssues, links: { human_review: `/management/human-inbox?holding_id=${row.holdingId}` } }));

const liveState = vi.hoisted(() => ({ data: undefined as unknown }));
const coverage = { holdingCount: 14, sourceRowCount: 4, runtimeCount: 14, telemetryRuntimeCount: 4, staleRowCount: 0, missingBindingCount: 10, degradedSourceCount: 14, incidentCount: 14 };

vi.mock("@/management/pages/v5/useV5Live", () => ({ useV5Live: () => ({ loading: false, refresh: vi.fn(), data: liveState.data }) }));

describe("PortfolioBookPage monitor", () => {
  it("renders all incidents and distinct capital scope labels without optimistic confidence", () => {
    liveState.data = { items, incidents, surfaceStatus: "degraded", coverage };
    render(<MemoryRouter initialEntries={["/management/portfolio-book?deployment_stage=paper"]}><PortfolioBookPage /></MemoryRouter>);
    expect(screen.getAllByTestId("portfolio-incident")).toHaveLength(14);
    expect(screen.getAllByText(/Paper ledger/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Canary sleeve/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Live capital pool/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unknown capital scope").length).toBeGreaterThan(0);
    expect(screen.queryByText(/formal attribution|covered/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Stage")).toHaveValue("paper");
  });

  it.each([
    ["empty", "ok", "No holdings match the current filters."],
    ["partial", "partial", "No holdings match the current filters."],
    ["stale", "stale", "No holdings match the current filters."],
    ["unavailable", "unavailable", "Portfolio holdings source is unavailable."],
  ])("renders the %s monitor state independently", (_name, surfaceStatus, emptyMessage) => {
    liveState.data = { items: [], incidents: [], surfaceStatus, surfaceMessage: `${surfaceStatus} source`, coverage: { ...coverage, holdingCount: 0, incidentCount: 0 } };
    render(<MemoryRouter initialEntries={["/management/portfolio-book"]}><PortfolioBookPage /></MemoryRouter>);
    expect(screen.getByText(`Source: ${surfaceStatus}`)).toBeInTheDocument();
    expect(screen.getByText(`${surfaceStatus} source`)).toBeInTheDocument();
    expect(screen.getByText(emptyMessage)).toBeInTheDocument();
    expect(screen.queryByTestId("portfolio-holding")).not.toBeInTheDocument();
  });
});
