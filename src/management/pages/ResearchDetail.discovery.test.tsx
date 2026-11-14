import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import i18n from "@/i18n";
import { ResearchDetail } from "./ResearchDetail";

const mocks = vi.hoisted(() => ({ researchGet: vi.fn(), auditList: vi.fn(), personaFleetGet: vi.fn() }));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    bffV1: {
      ...actual.bffV1,
      research: { ...actual.bffV1.research, get: mocks.researchGet },
      audit: { ...actual.bffV1.audit, list: mocks.auditList },
    },
    mgmt: { ...actual.mgmt, personaFleet: { ...actual.mgmt.personaFleet, get: mocks.personaFleetGet } },
  };
});

function renderDetail() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/management/experiments/exp-1"]}>
        <Routes>
          <Route path="/management/experiments/:id" element={<ResearchDetail />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

const base = {
  id: "exp-1", name: "Exp 1", owner: "o", updatedAt: "2026-11-01T00:00:00Z", state: "review", risk: "low",
  hypothesis: "h", status: "review", metric: "m", metricValue: 1,
};

describe("ResearchDetail discovery fields (FE-DISCOVERY-VIEWS-20261110)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    mocks.auditList.mockResolvedValue([]);
    mocks.personaFleetGet.mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders hypothesis, metrics, lineage and attribution when the BFF supplies them", async () => {
    mocks.researchGet.mockResolvedValue({
      ...base,
      hypothesis_card: { claim: "Momentum persists", cited_spans: [] },
      metrics: { in_sample: { sharpe_ratio: 1.25 }, out_of_sample: { sharpe_ratio: 0.5 } },
      lineage: { evidence_bundle_id: "bundle-9", source_records: [] },
      attribution: { provider: "data.gov.tw", text: "data.gov.tw attribution" },
    });
    renderDetail();
    await waitFor(() => expect(screen.getByTestId("research-discovery")).toBeInTheDocument());
    expect(screen.getByTestId("research-discovery-hypothesis-claim")).toHaveTextContent("Momentum persists");
    expect(screen.getByTestId("research-discovery-metrics-in-sharpe_ratio")).toHaveTextContent("1.25");
    expect(screen.getByTestId("research-discovery-metrics-out-sharpe_ratio")).toHaveTextContent("0.50");
    expect(screen.getByTestId("research-discovery-lineage-evidence-bundle")).toHaveTextContent("bundle-9");
    expect(screen.getByTestId("research-discovery-attribution")).toHaveTextContent("data.gov.tw attribution");
  });

  it("renders dashes when the BFF has not shipped the fields", async () => {
    mocks.researchGet.mockResolvedValue(base);
    renderDetail();
    await waitFor(() => expect(screen.getByTestId("research-discovery")).toBeInTheDocument());
    expect(screen.getByTestId("research-discovery-hypothesis-claim")).toHaveTextContent(/^—$/);
    expect(screen.getByTestId("research-discovery-metrics-in-sharpe_ratio")).toHaveTextContent(/^—$/);
    expect(screen.getByTestId("research-discovery-lineage-evidence-bundle")).toHaveTextContent(/^—$/);
  });
});
