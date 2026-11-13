import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/i18n";
import { alphaFactory, normalizeAlphaFactoryEnvelope } from "@/lib/bff-v1/alphaFactory";
import { AlphaFactoryBoardPage } from "./AlphaFactoryBoard";

const card = (id: string, extra: Record<string, unknown> = {}) => ({
  id, admission_id: id, lane: "replicated", strategy_id: `s-${id}`, status: "admitted",
  admission_status: "admitted", queue_status: "completed", ...extra,
});

function renderBoard() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <AlphaFactoryBoardPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("AlphaFactoryBoard discovery fields (FE-DISCOVERY-VIEWS-20261110)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders card metrics/lineage/attribution and template evaluations", async () => {
    const env = normalizeAlphaFactoryEnvelope({
      data: {
        templates: [{ template_id: "t-1", name: "KMID", evaluation: { rank_ic: 0.03 } }],
      },
      items: [
          card("with", {
            metrics: { in_sample: { sharpe_ratio: 1.1 }, out_of_sample: { sharpe_ratio: 0.4 } },
            lineage: { source_records: [{ source_record_id: "src-1", href: "/bff/management/evidence/src-1" }] },
            attribution: { provider: "data.gov.tw", text: "gov attribution" },
          }),
          card("without"),
      ],
    });
    expect(env.data.items.find((c) => c.id === "with")?.discovery).toBeDefined();
    expect(env.data.items.find((c) => c.id === "without")?.discovery).toBeUndefined();
    vi.spyOn(alphaFactory, "get").mockResolvedValue(env);
    renderBoard();
    await waitFor(() => expect(screen.getByTestId("alpha-factory-metrics-with")).toBeInTheDocument());
    expect(screen.getByTestId("alpha-factory-metrics-with-in-sharpe_ratio")).toHaveTextContent("1.10");
    expect(screen.getByTestId("alpha-factory-metrics-with-out-sharpe_ratio")).toHaveTextContent("0.40");
    expect(screen.getByTestId("alpha-factory-lineage-with-source-records")).toHaveTextContent("src-1");
    expect(screen.getByTestId("alpha-factory-attribution-with")).toHaveTextContent("gov attribution");
    expect(screen.getByTestId("alpha-factory-metrics-without-absent")).toHaveTextContent(/^—$/);
    expect(screen.getByTestId("alpha-factory-attribution-without")).toHaveTextContent(/—$/);
    expect(screen.getByTestId("alpha-factory-templates-scores-t-1")).toHaveTextContent("rank_ic 0.03");
  });

  it("shows the template dash when the BFF omits templates", async () => {
    vi.spyOn(alphaFactory, "get").mockResolvedValue(normalizeAlphaFactoryEnvelope({ data: {}, items: [card("a")] }));
    renderBoard();
    await waitFor(() => expect(screen.getByTestId("alpha-factory-templates-empty")).toHaveTextContent("—"));
  });
});
