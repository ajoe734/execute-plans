import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { ResearchExperiment } from "@/lib/bff/types";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { ResearchDetail } from "./ResearchDetail";

const mocks = vi.hoisted(() => ({
  researchGet: vi.fn(),
  auditList: vi.fn(),
  personaFleetGet: vi.fn(),
  runActionSafe: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    bff: {
      ...actual.bff,
      research: { ...actual.bff.research, get: mocks.researchGet },
      audit: { ...actual.bff.audit, list: mocks.auditList },
    },
    mgmt: {
      ...actual.mgmt,
      personaFleet: { ...actual.mgmt.personaFleet, get: mocks.personaFleetGet },
    },
    runActionSafe: mocks.runActionSafe,
  };
});

void i18n.changeLanguage("en-US");

function renderDetail() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/management/experiments/exp-mgmt-qlib-006"]}>
        <Routes>
          <Route path="/management/experiments/:id" element={<ResearchDetail />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function experiment(): ResearchExperiment {
  return {
    id: "exp-mgmt-qlib-006",
    name: "MGMT-QLIB-006 Qlib TW admission linkage",
    owner: "pathreon-management",
    updatedAt: "2026-05-15T17:30:00Z",
    state: "review",
    risk: "medium",
    hypothesis: "Management linkage packet is ready.",
    status: "review",
    metric: "admission",
    metricValue: 1,
    artifactId: "qlib-tw-cross-sectional-alpha-model-draft-v1",
  };
}

function fleetRow(): ManagementPersonaFleetRow {
  return {
    personaId: "persona-20260528-5937dea1",
    personaName: "TW-Index-Arbitrage",
    owner: "pantheon-dev-browser",
    ooda: "Decide",
    autonomy: "supervised",
    perfDelta: 0.095,
    humanNeeded: true,
    lastMutation: "2026-06-03",
    researchStatus: {
      stage: "management_review_linked",
      framework: "qlib",
      frameworks: ["qlib", "vectorbt", "statsmodels"],
      experimentId: "exp-mgmt-qlib-006",
      datasetRef: "dataset:tw-equity-ohlcv-top50-2024-daily",
      registryAdmissionStatus: "pending_upstream_task",
      pendingTaskIds: ["MGMT-QLIB-003", "MGMT-QLIB-005"],
      canDeploy: false,
    },
    currentResearchProjects: [{
      projectId: "MGMT-QLIB-006",
      title: "Qlib TW cross-sectional equity alpha admission linkage",
      stage: "management_review_linked",
      status: "needs_human_approval",
      frameworks: ["qlib", "vectorbt", "statsmodels"],
      datasetRef: "dataset:tw-equity-ohlcv-top50-2024-daily",
      artifactId: "qlib-tw-cross-sectional-alpha-model-draft-v1",
      experimentId: "exp-mgmt-qlib-006",
      blockedByTaskIds: ["MGMT-QLIB-003", "MGMT-QLIB-005"],
      canDeploy: false,
    }],
  };
}

describe("ResearchDetail", () => {
  beforeEach(() => {
    mocks.researchGet.mockReset();
    mocks.auditList.mockReset();
    mocks.personaFleetGet.mockReset();
    mocks.runActionSafe.mockReset();
  });

  it("renders Persona Fleet research context for OODA Orient detail links", async () => {
    mocks.researchGet.mockResolvedValue(experiment());
    mocks.auditList.mockResolvedValue([]);
    mocks.personaFleetGet.mockResolvedValue([fleetRow()]);

    renderDetail();

    await waitFor(() => expect(screen.getByText("Management research context")).toBeInTheDocument());
    expect(screen.getByText("TW-Index-Arbitrage")).toBeInTheDocument();
    expect(screen.getByText("persona-20260528-5937dea1")).toBeInTheDocument();
    expect(screen.getByText("MGMT-QLIB-006")).toBeInTheDocument();
    expect(screen.getByText("qlib / vectorbt / statsmodels")).toBeInTheDocument();
    expect(screen.getByText("dataset:tw-equity-ohlcv-top50-2024-daily")).toBeInTheDocument();
    expect(screen.getByText("pending_upstream_task")).toBeInTheDocument();
    expect(screen.getByText("MGMT-QLIB-003 / MGMT-QLIB-005")).toBeInTheDocument();
  });
});
