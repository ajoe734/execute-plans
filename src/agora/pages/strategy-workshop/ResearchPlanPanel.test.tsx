import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const access = { loading: false, writeAllowed: true, writeDisabledReason: "Writes are disabled" };
vi.mock("@/agora/useAgoraWriteAccess", () => ({ useAgoraWriteAccess: () => access }));

const api = vi.hoisted(() => ({
  listWorkshopResearchPlans: vi.fn(),
  getResearchPlan: vi.fn(),
  listResearchPlanRuns: vi.fn(),
  createWorkshopResearchPlan: vi.fn(),
  approveResearchPlan: vi.fn(),
  cancelResearchPlan: vi.fn(),
  dispatchResearchPlan: vi.fn(),
}));
vi.mock("@/lib/bff-v1/agora/research", async (orig) => ({ ...(await orig<object>()), ...api }));

import { BffError } from "@/lib/bff-v1/errors";
import { ResearchPlanPanel } from "./ResearchPlanPanel";

const spec = { strategyId: "s1", registryId: "r1" };
const plan = { plan_id: "p1", status: "approved", stages: [{ stage_type: "rolling_oos" }] };

beforeEach(() => {
  Object.assign(access, { loading: false, writeAllowed: true });
  Object.values(api).forEach((m) => m.mockReset());
  api.listWorkshopResearchPlans.mockResolvedValue([plan]);
  api.getResearchPlan.mockResolvedValue({ plan, etag: 'W/"research-plan:p1:v2"', allowedActions: ["approve", "cancel"] });
  api.listResearchPlanRuns.mockResolvedValue([]);
});

describe("ResearchPlanPanel", () => {
  it("lists persisted plans, offers dispatch only when allowed", async () => {
    render(<ResearchPlanPanel workshopId="w" strategySpec={spec} />);
    await screen.findByTestId("research-plan-p1");
    expect(screen.getByTestId("research-plan-dispatch")).toBeDisabled();
    expect(screen.getByTestId("research-plan-approve")).toBeEnabled();
  });

  it("creates a plan from the StrategySpec identity", async () => {
    api.createWorkshopResearchPlan.mockResolvedValue({});
    render(<ResearchPlanPanel workshopId="w" strategySpec={spec} />);
    fireEvent.click(screen.getByTestId("research-plan-create"));
    await waitFor(() => expect(api.createWorkshopResearchPlan).toHaveBeenCalled());
    const body = api.createWorkshopResearchPlan.mock.calls[0][1];
    expect(body.strategy_id).toBe("s1");
    expect(body.strategy_spec_registry_id).toBe("r1");
    expect(JSON.stringify(body)).not.toMatch(/live|canary/);
  });

  it("sends the ETag on approve and reports a stale ETag", async () => {
    api.approveResearchPlan.mockRejectedValue(new BffError(412, { error: { code: "STATE_CONFLICT", message: "stale" } } as never));
    render(<ResearchPlanPanel workshopId="w" strategySpec={spec} />);
    await screen.findByTestId("research-plan-p1");
    fireEvent.click(screen.getByTestId("research-plan-approve"));
    await screen.findByText(/plan changed/i);
    expect(api.approveResearchPlan).toHaveBeenCalledWith("p1", { ifMatch: 'W/"research-plan:p1:v2"' });
  });

  it("shows run progress and outcome from the BFF", async () => {
    api.listResearchPlanRuns.mockResolvedValue([{ run_id: "r9", execution_status: "running", outcome: "pending", progress: { phase: "fit", percent: 40, updated_at: "t" } }]);
    render(<ResearchPlanPanel workshopId="w" strategySpec={spec} />);
    expect(await screen.findByTestId("research-run-status")).toHaveTextContent("running");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  });

  it("disables actions and shows the reason when writes are off", async () => {
    access.writeAllowed = false;
    render(<ResearchPlanPanel workshopId="w" strategySpec={spec} />);
    await screen.findByTestId("research-plan-p1");
    expect(screen.getByTestId("research-plan-create")).toBeDisabled();
    expect(screen.getByTestId("research-plan-approve")).toBeDisabled();
    expect(screen.getByTestId("research-plan-disabled-reason")).toHaveTextContent("Writes are disabled");
  });
});
