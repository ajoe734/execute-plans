import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { EvolutionDetail } from "./EvolutionDetail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("EvolutionDetail load states", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  it("renders Evolution Program Not Found on 404 instead of staying on loading", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/evolution-programs/")) {
        return jsonResponse({ detail: "Evolution program not found" }, 404);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/evolution/evo-missing"]}>
          <Routes>
            <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Evolution Program Not Found")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("renders Could Not Load Evolution Program on 500", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/evolution-programs/")) {
        return jsonResponse({ detail: "Evolution service unavailable" }, 500);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/evolution/evo-500"]}>
          <Routes>
            <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Could Not Load Evolution Program")).toBeInTheDocument();
    expect(screen.getByText(/Failed to load Evolution Program detail for ID evo-500: HTTP 500/)).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});

describe("EvolutionDetail qualification criteria, governance-gated review, and real runs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_REAL_WRITES", "true");
    process.env.VITE_BFF_REAL_WRITES = "true";
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem("pantheon.bff.bearerToken", "test_tok_operator");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    cleanup();
    delete process.env.VITE_BFF_REAL_WRITES;
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  const makeAutoProgramUnderReview = (overrides: Record<string, unknown> = {}) => ({
    id: "evp-auto-001",
    program_id: "evp-auto-001",
    name: "Auto Drawdown Breach Program",
    status: "under_review",
    state: "under_review",
    origin: "auto_qualified",
    source_decision_ids: [
      "evo-sweep-agent-000b205c0ef9-0000",
      "evo-sweep-agent-000b205c0ef9-0001",
    ],
    run_ids: [],
    allowedActions: ["approve_program", "reject_program"],
    allowed_actions: ["approve_program", "reject_program"],
    review: {
      approval_id: "apr-evo-001",
      approval_revision: 1,
      submitted_by: "evolution-qualifier",
      submitted_at: "2026-11-05T00:00:00Z",
    },
    qualification: {
      policy_version: "evolution-qualification.v1",
      evaluated_at: "2026-11-05T00:00:00Z",
      decision_id: "evo-sweep-agent-000b205c0ef9-0000",
      target_id: "persona-alpha-01",
      metric_name: "max_drawdown",
      qualified: true,
      criteria: [
        {
          criterion: "real_threshold_signal",
          result: "passed",
          observed: 0.18,
          threshold: 0.12,
          reason: null,
        },
        {
          criterion: "real_target",
          result: "passed",
          observed: "persona:persona-alpha-01",
          threshold: "resolvable_target",
          reason: null,
        },
        {
          criterion: "persistent_breach",
          result: "passed",
          observed: 3,
          threshold: 2,
          reason: null,
        },
        {
          criterion: "fresh_evidence",
          result: "passed",
          observed: "2026-11-05T00:00:00Z",
          threshold: "<= 24h",
          reason: null,
        },
        {
          criterion: "executable_action",
          result: "passed",
          observed: "tighten_drawdown_stop",
          threshold: "executable_research_action",
          reason: null,
        },
        {
          criterion: "no_open_duplicate",
          result: "passed",
          observed: 0,
          threshold: 0,
          reason: null,
        },
      ],
    },
    updated_at: "2026-11-05T00:05:00Z",
    updatedAt: "2026-11-05T00:05:00Z",
    ...overrides,
  });

  it("renders all six qualification criteria with observed, threshold, result, and policy_version, links each source decision to /management/evolution-journal?decision=<id>, and blocks approve until bound governance approval is approved", async () => {
    const program = makeAutoProgramUnderReview();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/bff/evolution-programs/evp-auto-001")) {
        return jsonResponse({ data: program });
      }
      if (url.endsWith("/bff/evolution-programs/evp-auto-001/runs")) {
        return jsonResponse({ data: [], items: [] });
      }
      if (url.includes("/bff/approvals")) {
        return jsonResponse({
          data: [
            {
              id: "apr-evo-001",
              kind: "evolution_program_review",
              subject: "Evolution program review evp-auto-001",
              requester: "evolution-qualifier",
              state: "pending",
              riskLevel: "medium",
              targetId: "evp-auto-001",
              createdAt: "2026-11-05T00:00:00Z",
            },
          ],
        });
      }
      return jsonResponse({ data: [], items: [] });
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution/evp-auto-001"]}>
            <Routes>
              <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Auto Drawdown Breach Program")).toBeInTheDocument();
    expect(screen.getByTestId("evolution-detail-origin")).toHaveTextContent("Automatic");
    expect(screen.getByTestId("evolution-detail-waiting-review")).toHaveTextContent(
      "Waiting for human review",
    );

    // Policy version & 6 criteria
    expect(screen.getByTestId("evolution-detail-policy-version")).toHaveTextContent(
      "evolution-qualification.v1",
    );
    const expectedCriteria = [
      ["real_threshold_signal", "0.18", "0.12", "passed"],
      ["real_target", "persona:persona-alpha-01", "resolvable_target", "passed"],
      ["persistent_breach", "3", "2", "passed"],
      ["fresh_evidence", "2026-11-05T00:00:00Z", "<= 24h", "passed"],
      ["executable_action", "tighten_drawdown_stop", "executable_research_action", "passed"],
      ["no_open_duplicate", "0", "0", "passed"],
    ] as const;

    for (const [criterionId, observed, threshold, result] of expectedCriteria) {
      expect(screen.getByTestId(`evolution-criterion-row-${criterionId}`)).toBeInTheDocument();
      expect(screen.getByTestId(`evolution-criterion-observed-${criterionId}`)).toHaveTextContent(
        observed,
      );
      expect(screen.getByTestId(`evolution-criterion-threshold-${criterionId}`)).toHaveTextContent(
        threshold,
      );
      expect(screen.getByTestId(`evolution-criterion-result-${criterionId}`)).toHaveAttribute(
        "data-result",
        result,
      );
    }

    // Source decision links
    const link0 = screen.getByTestId(
      "evolution-source-decision-link-evo-sweep-agent-000b205c0ef9-0000",
    );
    expect(link0).toHaveAttribute(
      "href",
      "/management/evolution-journal?decision=evo-sweep-agent-000b205c0ef9-0000",
    );
    const link1 = screen.getByTestId(
      "evolution-source-decision-link-evo-sweep-agent-000b205c0ef9-0001",
    );
    expect(link1).toHaveAttribute(
      "href",
      "/management/evolution-journal?decision=evo-sweep-agent-000b205c0ef9-0001",
    );

    // Bound governance approval is pending -> Approve button is disabled & blocked notice links to approvals queue
    await waitFor(() => {
      expect(screen.getByTestId("evolution-bound-approval")).toHaveTextContent("apr-evo-001");
      expect(screen.getByTestId("evolution-bound-approval-state")).toHaveTextContent("pending");
    });

    const approveBtn = screen.getByTestId("evolution-approve-btn");
    expect(approveBtn).toBeDisabled();
    const blockedNotice = screen.getByTestId("evolution-approve-blocked-notice");
    expect(blockedNotice).toHaveTextContent(/blocked until governance approval apr-evo-001 is approved/i);
    expect(screen.getByTestId("evolution-approvals-queue-link")).toHaveAttribute(
      "href",
      "/management/governance",
    );
    expect(screen.getByTestId("evolution-bound-approval-link")).toHaveAttribute(
      "href",
      "/management/governance/apr-evo-001",
    );
  });

  it("executes approve_program when governance approval is approved, reads back program and real runs (including failed run) from owner, and surfaces owner error without optimistic state", async () => {
    let ownerProgramState = makeAutoProgramUnderReview({
      approval: { approval_id: "apr-evo-001", status: "approved" },
    });
    let ownerRuns: Array<Record<string, unknown>> = [];
    let shouldFailApprove = true;
    const commandBodies: Array<Record<string, unknown>> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) {
        return jsonResponse({
          data: {
            session: { authenticated: true, session_kind: "bearer" },
            environment: { name: "dev", strict_auth: false },
          },
        });
      }
      if (url.endsWith("/bff/evolution-programs/evp-auto-001")) {
        return jsonResponse({ data: ownerProgramState });
      }
      if (url.endsWith("/bff/evolution-programs/evp-auto-001/runs")) {
        return jsonResponse({ data: ownerRuns, items: ownerRuns });
      }
      if (url.includes("/bff/approvals")) {
        return jsonResponse({
          data: [
            {
              id: "apr-evo-001",
              kind: "evolution_program_review",
              subject: "Evolution program review evp-auto-001",
              requester: "evolution-qualifier",
              state: "approved",
              riskLevel: "medium",
              targetId: "evp-auto-001",
              createdAt: "2026-11-05T00:00:00Z",
            },
          ],
        });
      }
      if (url.endsWith("/bff/v1/commands")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        commandBodies.push(body);
        if (shouldFailApprove) {
          return jsonResponse(
            {
              error: {
                code: "STATE_CONFLICT",
                message: "Owner rejected approve_program: governance approval revision mismatch",
              },
            },
            409,
          );
        }
        ownerProgramState = makeAutoProgramUnderReview({
          status: "active",
          state: "active",
          allowedActions: ["pause_program", "complete_program", "stop"],
          allowed_actions: ["pause_program", "complete_program", "stop"],
          run_ids: ["resrun-dispatch-001", "resrun-failed-002"],
        });
        ownerRuns = [
          {
            run_id: "resrun-dispatch-001",
            program_id: "evp-auto-001",
            decision_id: "evo-sweep-agent-000b205c0ef9-0000",
            status: "running",
            downstream_status: "running",
            detail: { adapter: "vectorbt" },
            linked_at: "2026-11-05T01:00:00Z",
          },
          {
            run_id: "resrun-failed-002",
            program_id: "evp-auto-001",
            decision_id: "evo-sweep-agent-000b205c0ef9-0001",
            status: "failed",
            downstream_status: "failed",
            detail: { reason: "task_not_found" },
            linked_at: "2026-11-05T01:00:05Z",
          },
        ];
        return jsonResponse(
          {
            status: "accepted",
            data: { commandId: "cmd-approve-001", status: "accepted" },
          },
          202,
        );
      }
      return jsonResponse({ data: [], items: [] });
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution/evp-auto-001"]}>
            <Routes>
              <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    const approveBtn = await screen.findByTestId("evolution-approve-btn");
    await waitFor(() => {
      expect(approveBtn).not.toBeDisabled();
    });

    // 1. First attempt fails on owner -> surfaces owner error and keeps under_review state (no optimistic state)
    fireEvent.click(approveBtn);
    const errorAlert = await screen.findByTestId("evolution-action-error");
    expect(errorAlert).toHaveTextContent(
      "Owner rejected approve_program: governance approval revision mismatch",
    );
    expect(screen.getByTestId("evolution-approve-btn")).toBeInTheDocument();

    // 2. Second attempt succeeds on owner -> reads back active state and real runs (including failed run)
    shouldFailApprove = false;
    fireEvent.click(screen.getByTestId("evolution-approve-btn"));

    await waitFor(() => {
      expect(screen.queryByTestId("evolution-approve-btn")).not.toBeInTheDocument();
      expect(screen.getByTestId("evolution-pause-btn")).toBeInTheDocument();
      expect(screen.getByTestId("evolution-run-id-resrun-dispatch-001")).toHaveTextContent(
        "resrun-dispatch-001",
      );
      expect(screen.getByTestId("evolution-run-id-resrun-failed-002")).toHaveTextContent(
        "resrun-failed-002",
      );
      expect(screen.getByTestId("evolution-run-failed-resrun-failed-002")).toHaveTextContent(
        "Failed",
      );
    });
    expect(commandBodies.some((b) => b.action === "approve_program")).toBe(true);
  });

  it("requires a reason for reject_program, posts reject_program to owner, reads back retired state, and hides approve/reject when owner allowedActions omit them", async () => {
    let ownerProgramState = makeAutoProgramUnderReview();
    const commandBodies: Array<Record<string, unknown>> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) {
        return jsonResponse({
          data: {
            session: { authenticated: true, session_kind: "bearer" },
            environment: { name: "dev", strict_auth: false },
          },
        });
      }
      if (url.endsWith("/bff/evolution-programs/evp-auto-001")) {
        return jsonResponse({ data: ownerProgramState });
      }
      if (url.endsWith("/bff/evolution-programs/evp-auto-001/runs")) {
        return jsonResponse({ data: [], items: [] });
      }
      if (url.endsWith("/bff/v1/commands")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        commandBodies.push(body);
        ownerProgramState = makeAutoProgramUnderReview({
          status: "retired",
          state: "retired",
          allowedActions: [],
          allowed_actions: [],
          rejection: {
            reason: "Signal caused by transient feed outage",
            rejected_by: "operator-1",
            rejected_at: "2026-11-05T02:00:00Z",
          },
        });
        return jsonResponse(
          {
            status: "accepted",
            data: { commandId: "cmd-reject-001", status: "accepted" },
          },
          202,
        );
      }
      return jsonResponse({ data: [], items: [] });
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution/evp-auto-001"]}>
            <Routes>
              <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    const rejectBtn = await screen.findByTestId("evolution-reject-btn");
    const reasonInput = screen.getByTestId("evolution-reject-reason-input");

    // Disabled until reason is provided
    expect(rejectBtn).toBeDisabled();
    fireEvent.change(reasonInput, {
      target: { value: "Signal caused by transient feed outage" },
    });
    expect(rejectBtn).not.toBeDisabled();

    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(screen.getByTestId("evolution-rejection-banner")).toHaveTextContent(
        "Signal caused by transient feed outage",
      );
      expect(screen.queryByTestId("evolution-approve-btn")).not.toBeInTheDocument();
      expect(screen.queryByTestId("evolution-reject-btn")).not.toBeInTheDocument();
      expect(screen.getByTestId("evolution-no-allowed-actions")).toBeInTheDocument();
    });

    expect(commandBodies).toHaveLength(1);
    expect(commandBodies[0].action).toBe("reject_program");
    expect((commandBodies[0].params as Record<string, unknown>).reason).toBe(
      "Signal caused by transient feed outage",
    );
  });

  it("states that approval starts no work for a manual program with no source decisions in both locales", async () => {
    const manualProgram = {
      id: "evp-manual-empty",
      program_id: "evp-manual-empty",
      name: "Manual Exploratory Program",
      status: "under_review",
      state: "under_review",
      origin: "manual",
      source_decision_ids: [],
      run_ids: [],
      allowedActions: ["approve_program", "reject_program"],
      allowed_actions: ["approve_program", "reject_program"],
      qualification: null,
      review: {
        approval_id: "apr-manual-001",
        approval_revision: 1,
      },
      updated_at: "2026-11-05T03:00:00Z",
      updatedAt: "2026-11-05T03:00:00Z",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/bff/evolution-programs/evp-manual-empty")) {
        return jsonResponse({ data: manualProgram });
      }
      if (url.endsWith("/bff/evolution-programs/evp-manual-empty/runs")) {
        return jsonResponse({ data: [], items: [] });
      }
      return jsonResponse({ data: [], items: [] });
    });

    await i18n.changeLanguage("en-US");
    const { unmount } = render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution/evp-manual-empty"]}>
            <Routes>
              <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Manual Exploratory Program")).toBeInTheDocument();
    expect(screen.getByTestId("evolution-detail-origin")).toHaveTextContent("Manual");
    expect(screen.queryByTestId("evolution-detail-waiting-review")).not.toBeInTheDocument();
    expect(screen.getByTestId("evolution-manual-no-work-notice")).toHaveTextContent(
      "Manual program with no source decisions: approval starts no work.",
    );
    unmount();

    await i18n.changeLanguage("zh-TW");
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution/evp-manual-empty"]}>
            <Routes>
              <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Manual Exploratory Program")).toBeInTheDocument();
    expect(screen.getByTestId("evolution-detail-origin")).toHaveTextContent("手動建立");
    expect(screen.getByTestId("evolution-manual-no-work-notice")).toHaveTextContent(
      "此手動方案沒有來源決策提案：核准後不會啟動任何執行工作。",
    );
  });
});

describe("EvolutionDetail run outcomes from GET /bff/evolution-programs/{id}/runs", () => {
  const programId = "evp-outcome-001";

  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  const baseRun = {
    program_id: programId,
    decision_id: null,
    downstream_status: "completed",
    detail: "retrain finished",
    linked_at: "2026-11-06T01:00:00Z",
    outcome: null,
    outcome_reason: null,
    candidate_artifact_id: null,
    baseline_metrics: null,
    candidate_metrics: null,
    session_id: null,
  };

  async function renderWithRuns(runs: Record<string, unknown>[]) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith(`/bff/evolution-programs/${programId}/runs`)) {
        return jsonResponse({ data: runs, items: runs });
      }
      if (url.endsWith(`/bff/evolution-programs/${programId}`)) {
        return jsonResponse({
          data: {
            id: programId,
            program_id: programId,
            name: "Outcome Program",
            status: "active",
            state: "active",
            origin_kind: "manual",
            created_at: "2026-11-06T00:00:00Z",
            updated_at: "2026-11-06T00:00:00Z",
          },
        });
      }
      return jsonResponse({ data: [], items: [] });
    });
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[`/management/evolution/${programId}`]}>
            <Routes>
              <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );
    await screen.findByText("Outcome Program");
  }

  it("shows candidate_created with reason, both metric sets side by side, and an artifact link but no promote action", async () => {
    await renderWithRuns([
      {
        ...baseRun,
        run_id: "resrun-created",
        status: "completed",
        outcome: "candidate_created",
        outcome_reason: "candidate Sharpe exceeded baseline",
        candidate_artifact_id: "art-child-001",
        session_id: "ts-001",
        baseline_metrics: { sharpe_ratio: 0.8, sharpe_defined: true, total_return: 0.1, max_drawdown: 0.2 },
        candidate_metrics: { sharpe_ratio: 1.2, sharpe_defined: true, total_return: 0.15, max_drawdown: 0.05 },
      },
    ]);
    expect(await screen.findByTestId("evolution-run-outcome-label-resrun-created")).toHaveTextContent(
      "Candidate created",
    );
    expect(screen.getByTestId("evolution-run-outcome-reason-resrun-created")).toHaveTextContent(
      "candidate Sharpe exceeded baseline",
    );
    expect(screen.getByTestId("evolution-run-metric-resrun-created-sharpe_ratio-baseline")).toHaveTextContent("0.8");
    expect(screen.getByTestId("evolution-run-metric-resrun-created-sharpe_ratio-candidate")).toHaveTextContent("1.2");
    expect(screen.getByTestId("evolution-run-metric-resrun-created-total_return-baseline")).toHaveTextContent("0.1");
    expect(screen.getByTestId("evolution-run-metric-resrun-created-total_return-candidate")).toHaveTextContent("0.15");
    expect(screen.getByTestId("evolution-run-metric-resrun-created-max_drawdown-baseline")).toHaveTextContent("0.2");
    expect(screen.getByTestId("evolution-run-metric-resrun-created-max_drawdown-candidate")).toHaveTextContent("0.05");
    expect(screen.getByTestId("evolution-run-candidate-artifact-resrun-created")).toHaveAttribute(
      "href",
      "/management/artifacts/art-child-001",
    );
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });

  it("never presents a completed no_candidate run as a successful evolution and shows null candidate metrics as not reported, not zero", async () => {
    await renderWithRuns([
      {
        ...baseRun,
        run_id: "resrun-nocand",
        status: "completed",
        outcome: "no_candidate",
        outcome_reason: "no bounded control change available",
        baseline_metrics: { sharpe_ratio: 0.8, sharpe_defined: true, total_return: null, max_drawdown: 0.2 },
        candidate_metrics: null,
      },
    ]);
    expect(await screen.findByTestId("evolution-run-outcome-label-resrun-nocand")).toHaveTextContent(
      "No candidate produced",
    );
    expect(screen.getByTestId("evolution-run-outcome-notice-resrun-nocand")).toHaveTextContent(
      /not a successful evolution/i,
    );
    expect(screen.getByTestId("evolution-run-outcome-reason-resrun-nocand")).toHaveTextContent(
      "no bounded control change available",
    );
    // the raw status stays visible but is never styled as success (StatusBadge maps no "completed" style)
    expect(screen.getByTestId("evolution-run-status-resrun-nocand")).not.toHaveTextContent(/success|succeeded/i);
    expect(screen.queryByTestId("evolution-run-candidate-artifact-resrun-nocand")).not.toBeInTheDocument();
    expect(screen.getByTestId("evolution-run-metric-resrun-nocand-total_return-baseline")).toHaveTextContent(
      "Not reported",
    );
    for (const key of ["sharpe_ratio", "total_return", "max_drawdown"]) {
      const cell = screen.getByTestId(`evolution-run-metric-resrun-nocand-${key}-candidate`);
      expect(cell).toHaveTextContent("Not reported");
      expect(cell).not.toHaveTextContent(/^0/);
    }
  });

  it("shows evaluation_rejected as not successful with its reason", async () => {
    await renderWithRuns([
      {
        ...baseRun,
        run_id: "resrun-rejected",
        status: "completed",
        outcome: "evaluation_rejected",
        outcome_reason: "candidate evaluation rejected: sharpe_ratio_below_threshold",
        baseline_metrics: { sharpe_ratio: 0.8, sharpe_defined: true, total_return: 0.1, max_drawdown: 0.2 },
        candidate_metrics: { sharpe_ratio: -0.2, sharpe_defined: true, total_return: 0.02, max_drawdown: 0.08 },
      },
    ]);
    expect(await screen.findByTestId("evolution-run-outcome-label-resrun-rejected")).toHaveTextContent(
      "Evaluation rejected",
    );
    expect(screen.getByTestId("evolution-run-outcome-notice-resrun-rejected")).toHaveTextContent(
      /not a successful evolution/i,
    );
    expect(screen.getByTestId("evolution-run-outcome-reason-resrun-rejected")).toHaveTextContent(
      "sharpe_ratio_below_threshold",
    );
    expect(screen.getByTestId("evolution-run-metric-resrun-rejected-sharpe_ratio-candidate")).toHaveTextContent("-0.2");
  });

  it("labels failed and running runs without an outcome and states that no evaluation result is recorded", async () => {
    await renderWithRuns([
      { ...baseRun, run_id: "resrun-failed", status: "failed", downstream_status: "failed" },
      { ...baseRun, run_id: "resrun-running", status: "running", downstream_status: "running" },
    ]);
    expect(await screen.findByTestId("evolution-run-outcome-label-resrun-failed")).toHaveTextContent("Failed");
    expect(screen.getByTestId("evolution-run-outcome-label-resrun-running")).toHaveTextContent("Running");
    expect(screen.getByTestId("evolution-run-no-evaluation-resrun-failed")).toHaveTextContent(
      "No evaluation result is recorded",
    );
  });

  it("shows the raw status and no-evaluation notice for a completed run without an outcome field", async () => {
    const { outcome: _o, outcome_reason: _r, candidate_artifact_id: _c, baseline_metrics: _b, candidate_metrics: _m, session_id: _s, ...legacy } = baseRun;
    await renderWithRuns([{ ...legacy, run_id: "resrun-legacy", status: "completed" }]);
    expect(await screen.findByTestId("evolution-run-status-resrun-legacy")).toHaveTextContent("completed");
    expect(screen.getByTestId("evolution-run-no-evaluation-resrun-legacy")).toHaveTextContent(
      "No evaluation result is recorded",
    );
    expect(screen.queryByTestId("evolution-run-outcome-label-resrun-legacy")).not.toBeInTheDocument();
    expect(screen.getByTestId("evolution-run-metrics-resrun-legacy")).toHaveTextContent("—");
  });

  it("renders outcome labels in zh-TW", async () => {
    await i18n.changeLanguage("zh-TW");
    await renderWithRuns([
      { ...baseRun, run_id: "resrun-zh", status: "completed", outcome: "no_candidate", outcome_reason: "無可調整的控制項" },
    ]);
    expect(await screen.findByTestId("evolution-run-outcome-label-resrun-zh")).toHaveTextContent("未產生候選");
    expect(screen.getByTestId("evolution-run-outcome-notice-resrun-zh")).toHaveTextContent("不代表演化成功");
  });
});
