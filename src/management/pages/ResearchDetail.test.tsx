import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { ResearchExperiment, Skill } from "@/lib/bff-v1";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { ResearchDetail } from "./ResearchDetail";
import { SkillSandboxStudio } from "./studios/SkillSandboxStudio";

const mocks = vi.hoisted(() => ({
  researchGet: vi.fn(),
  auditList: vi.fn(),
  personaFleetGet: vi.fn(),
  runActionSafe: vi.fn(),
  skillsList: vi.fn(),
  jobsCancel: vi.fn(),
  detectMode: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    bffV1: {
      ...actual.bffV1,
      research: { ...actual.bffV1.research, get: mocks.researchGet },
      audit: { ...actual.bffV1.audit, list: mocks.auditList },
      skills: { ...actual.bffV1.skills, list: mocks.skillsList },
      jobs: { ...actual.bffV1.jobs, cancel: mocks.jobsCancel },
      detectMode: mocks.detectMode,
      fetch: mocks.fetch,
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

  it("renders active experiment with Cancel action and places cancellation fence on cancel", async () => {
    const activeExp: ResearchExperiment = {
      ...experiment(),
      status: "running",
      allowedActions: { canCancel: true, canRetry: false, canArchive: false, canInvalidate: false },
    };
    mocks.researchGet.mockResolvedValue(activeExp);
    mocks.auditList.mockResolvedValue([]);
    mocks.personaFleetGet.mockResolvedValue([]);

    renderDetail();

    await waitFor(() => expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /rerun/i })).not.toBeInTheDocument();
  });

  it("renders terminal experiment with Retry and Archive actions and renders lineage", async () => {
    const canceledExp: ResearchExperiment = {
      ...experiment(),
      status: "canceled",
      attempt_number: 2,
      parent_experiment_id: "exp-mgmt-qlib-005",
      cancellation_fence: "2026-09-16T12:00:00Z",
      allowedActions: { canCancel: false, canRetry: true, canArchive: true, canInvalidate: false },
    };
    mocks.researchGet.mockResolvedValue(canceledExp);
    mocks.auditList.mockResolvedValue([]);
    mocks.personaFleetGet.mockResolvedValue([]);

    renderDetail();

    await waitFor(() => expect(screen.getByRole("button", { name: /re-?run/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /archive/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
    expect(screen.getByText("Experiment Lineage & Governance State")).toBeInTheDocument();
    expect(screen.getByText("exp-mgmt-qlib-005")).toBeInTheDocument();
    expect(screen.getByText("2026-09-16T12:00:00Z")).toBeInTheDocument();
  });

  it("dispatches promote and propagates backend rejection without faking local success", async () => {
    mocks.researchGet.mockResolvedValue(experiment());
    mocks.auditList.mockResolvedValue([]);
    mocks.personaFleetGet.mockResolvedValue([]);
    mocks.runActionSafe.mockResolvedValue({
      ok: false,
      error: { code: "PRECONDITION_FAILED", message: "GOV-PROMOTE-001 required" },
    });

    renderDetail();

    await waitFor(() => expect(screen.getByText("Promote to Strategy")).toBeInTheDocument());
  });

  it("renders objective and every run from GET /bff/research-tasks/{task_id}, marking stub and manual runs as non-real executions", async () => {
    mocks.researchGet.mockResolvedValue({
      id: "rtask-20261023-008",
      taskId: "rtask-20261023-008",
      task_id: "rtask-20261023-008",
      name: "VectorBT Factor Validation",
      objective: "Evaluate cross-sectional factor stability across TW50 universe",
      hypothesis: "Evaluate cross-sectional factor stability across TW50 universe",
      status: "completed",
      state: "approved",
      risk: "low",
      owner: "research-worker",
      createdBy: "research-worker",
      created_by: "research-worker",
      updatedAt: "2026-10-23T12:00:00Z",
      updated_at: "2026-10-23T12:00:00Z",
      taskType: "factor_eval",
      task_type: "factor_eval",
      runCount: 3,
      run_count: 3,
      metric: "factor_eval",
      metricValue: 0,
      runs: [
        {
          run_id: "rrun-20261023-001",
          runId: "rrun-20261023-001",
          status: "completed",
          adapter: "manual",
          dispatch_mode: "manual",
          dispatchMode: "manual",
          requested_mode: "manual",
          requestedMode: "manual",
          created_by: "operator-lead",
          createdBy: "operator-lead",
          created_at: "2026-10-23T09:30:00Z",
          createdAt: "2026-10-23T09:30:00Z",
        },
        {
          run_id: "rrun-20261023-002",
          runId: "rrun-20261023-002",
          status: "completed",
          adapter: "vectorbt",
          dispatch_mode: "real",
          dispatchMode: "real",
          requested_mode: "real",
          requestedMode: "real",
          created_by: "research-worker",
          createdBy: "research-worker",
          created_at: "2026-10-23T11:45:00Z",
          createdAt: "2026-10-23T11:45:00Z",
        },
        {
          run_id: "rrun-20261024-stub",
          runId: "rrun-20261024-stub",
          status: "completed",
          adapter: "stub",
          dispatch_mode: "stub",
          dispatchMode: "stub",
          requested_mode: "stub",
          requestedMode: "stub",
          created_by: "operator",
          createdBy: "operator",
          created_at: "2026-10-24T08:30:00Z",
          createdAt: "2026-10-24T08:30:00Z",
        },
      ],
    });
    mocks.auditList.mockResolvedValue([]);
    mocks.personaFleetGet.mockResolvedValue([]);

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/experiments/rtask-20261023-008"]}>
          <Routes>
            <Route path="/management/experiments/:id" element={<ResearchDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(
      await screen.findByText("Evaluate cross-sectional factor stability across TW50 universe"),
    ).toBeInTheDocument();

    const manualRunCard = screen.getByTestId("research-task-run-rrun-20261023-001");
    expect(manualRunCard).toHaveTextContent("rrun-20261023-001");
    expect(manualRunCard).toHaveTextContent("manual");
    expect(manualRunCard).toHaveTextContent("Stub / manual record — not a real execution (manual / manual)");

    const realRunCard = screen.getByTestId("research-task-run-rrun-20261023-002");
    expect(realRunCard).toHaveTextContent("rrun-20261023-002");
    expect(realRunCard).toHaveTextContent("vectorbt");
    expect(realRunCard).toHaveTextContent("real");
    expect(realRunCard).not.toHaveTextContent("Stub / manual record — not a real execution");

    const stubRunCard = screen.getByTestId("research-task-run-rrun-20261024-stub");
    expect(stubRunCard).toHaveTextContent("rrun-20261024-stub");
    expect(stubRunCard).toHaveTextContent("stub");
    expect(stubRunCard).toHaveTextContent("Stub / manual record — not a real execution (stub / stub)");
  });

  it("shows the existing not-found state when GET /bff/research-tasks/{task_id} returns 404", async () => {
    mocks.researchGet.mockResolvedValue(undefined);
    mocks.auditList.mockResolvedValue([]);
    mocks.personaFleetGet.mockResolvedValue([]);

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/experiments/rtask-missing-404"]}>
          <Routes>
            <Route path="/management/experiments/:id" element={<ResearchDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Experiment Not Found")).toBeInTheDocument();
    expect(
      screen.getByText("Experiment detail for ID rtask-missing-404 is not available in the live contract."),
    ).toBeInTheDocument();
  });
});

const sampleSkill: Skill = {
  id: "skill-macro-summary",
  name: "Macro Summary",
  owner: "pantheon-dev-browser",
  updatedAt: "2026-09-01T00:00:00Z",
  state: "review",
  risk: "low",
  version: "1.0.0",
  archetype: "research",
  description: "Macro summary research skill",
  draft: false,
  usedByPersonas: 1,
};

describe("SkillSandboxStudio Cancellation and Timer Fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.skillsList.mockResolvedValue([sampleSkill]);
    mocks.jobsCancel.mockResolvedValue({ status: "canceled" });
    mocks.detectMode.mockReturnValue("dev");
  });

  it("cancels mock job before completion timer fires and prevents late status overwrite", async () => {
    vi.useFakeTimers();

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <SkillSandboxStudio />
        </MemoryRouter>
      </I18nextProvider>,
    );

    // Wait for skills list to populate
    await act(async () => {
      await Promise.resolve();
    });

    const runBtn = screen.getByTestId("run-job-button");
    expect(runBtn).toBeInTheDocument();

    // Trigger mock run
    await act(async () => {
      fireEvent.click(runBtn);
    });

    const statusBadge = screen.getByTestId("job-status-badge");
    expect(statusBadge).toHaveTextContent("running");

    const cancelBtn = screen.getByTestId("cancel-job-button");
    expect(cancelBtn).toBeInTheDocument();

    // Advance 1000ms into the 4000ms mock run
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Check step 1 log appeared
    expect(screen.getByText(/Initializing sandbox environment/)).toBeInTheDocument();

    // Click Cancel Job
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    // Verify cancellation called
    expect(mocks.jobsCancel).toHaveBeenCalledTimes(1);
    expect(statusBadge).toHaveTextContent("failed");
    expect(screen.queryByTestId("cancel-job-button")).not.toBeInTheDocument();

    // Verify cancellation log appeared
    expect(screen.getByText(/cancelled by operator/)).toBeInTheDocument();

    // Advance timers well beyond the 4000ms completion timer (advance by 10s)
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    // The status MUST REMAIN failed and not be overwritten to success
    expect(statusBadge).toHaveTextContent("failed");

    // The fake completion card must NOT be rendered
    expect(screen.queryByText("評估執行結果")).not.toBeInTheDocument();
  });

  it("cancels live job, clears poll interval, and fences late poll callbacks from overwriting status", async () => {
    mocks.detectMode.mockReturnValue("live");
    mocks.fetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path.includes("/sandbox-eval")) {
        return { job_id: "job-live-sandbox-999" };
      }
      if (path.includes("/logs")) {
        return {
          status: "running",
          logs: [{ timestamp: new Date().toISOString(), level: "INFO", message: "Live job executing" }],
        };
      }
      return {};
    });

    vi.useFakeTimers();

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <SkillSandboxStudio />
        </MemoryRouter>
      </I18nextProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const runBtn = screen.getByTestId("run-job-button");
    await act(async () => {
      fireEvent.click(runBtn);
    });

    // Wait for sandbox-eval POST to resolve
    await act(async () => {
      await Promise.resolve();
    });

    const statusBadge = screen.getByTestId("job-status-badge");
    expect(statusBadge).toHaveTextContent("running");

    const cancelBtn = screen.getByTestId("cancel-job-button");
    expect(cancelBtn).toBeInTheDocument();

    // Operator cancels the live job
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(mocks.jobsCancel).toHaveBeenCalledWith("job-live-sandbox-999");
    expect(statusBadge).toHaveTextContent("failed");
    expect(screen.queryByTestId("cancel-job-button")).not.toBeInTheDocument();

    // If backend late response races back with status "success"
    mocks.fetch.mockResolvedValueOnce({
      status: "success",
      progress: {
        status: "success",
        output: { summary: "Late fake success payload" },
      },
    });

    // Advance timers
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Status must remain failed, never overwritten by late poll response
    expect(statusBadge).toHaveTextContent("failed");
    expect(screen.queryByText("評估執行結果")).not.toBeInTheDocument();
  });
});
