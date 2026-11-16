import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import i18n from "@/i18n";
import { CANONICAL_CENTERS } from "@/management/navigation/managementRouteManifest";

vi.mock("@/management/pages/oversight/PortfolioBook", () => ({ PortfolioBookPage: () => <div>book</div> }));
vi.mock("@/management/pages/oversight/PerformanceAttribution", () => ({ PerformanceAttributionPage: () => <div>formal-attribution</div> }));
vi.mock("@/management/pages/oversight/PortfolioExposure", () => ({ PortfolioExposurePage: () => <div>exposure</div> }));
vi.mock("@/management/pages/performance/OutliersAttributionTab", () => ({ OutliersAttributionTab: () => <div data-testid="outliers-tab" /> }));
vi.mock("@/management/pages/performance/ShadowComparisonTab", () => ({ ShadowComparisonTab: () => <div data-testid="shadow-tab" /> }));

import { PerformanceCenterPage } from "./PerformanceCenterPage";

void i18n.changeLanguage("en-US");
afterEach(cleanup);

describe("PerformanceCenterPage", () => {
  it("registers the shadow tab in the manifest", () => {
    expect(CANONICAL_CENTERS.performance.tabs.map((t) => t.id)).toEqual(["overview", "attribution", "exposure", "shadow"]);
  });
  it("mounts outliers under the attribution tab", () => {
    render(<MemoryRouter initialEntries={["/management/performance?tab=attribution"]}><PerformanceCenterPage /></MemoryRouter>);
    expect(screen.getByText("formal-attribution")).toBeTruthy();
    expect(screen.getByTestId("outliers-tab")).toBeTruthy();
  });
  it("mounts the shadow comparison tab", () => {
    render(<MemoryRouter initialEntries={["/management/performance?tab=shadow"]}><PerformanceCenterPage /></MemoryRouter>);
    expect(screen.getByTestId("shadow-tab")).toBeTruthy();
  });
});
