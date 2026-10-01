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
const bffFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bff-v1/client", () => ({ bffFetch: (req: unknown) => bffFetch(req) }));
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

describe("ResearchPlanPanel with real BFF envelopes", () => {
  const etag = 'W/"research-plan:p1:v3"';
  let status = "draft";
  const envelope = () => ({
    allowedActions: status === "draft" ? { approve: true, cancel: true, dispatch: false } : { approve: false, cancel: true, dispatch: true },
    data: { plan_id: "p1", status, stages: [{ stage_type: "rolling_oos" }] },
    meta: { etag },
  });
  const called = (suffix: string) => bffFetch.mock.calls.map(([r]) => r).find((r) => r.path.endsWith(suffix));

  beforeEach(async () => {
    const realResearch = await vi.importActual<Record<string, never>>("@/lib/bff-v1/agora/research");
    status = "draft";
    bffFetch.mockReset();
    for (const name of Object.keys(api) as (keyof typeof api)[]) api[name].mockImplementation(realResearch[name]);
    bffFetch.mockImplementation(async (req: { method: string; path: string }) => {
      if (req.path.endsWith("/research-plans") && req.method === "GET") return { data: [envelope().data] };
      if (req.path.endsWith("/research-plans/p1")) return envelope();
      if (req.path.endsWith("/runs") && req.method === "GET") return { data: [] };
      if (req.path.endsWith("/approve")) status = "approved";
      return { status: "accepted", data: null, meta: {} };
    });
  });

  it("approves a draft, then offers dispatch and cancel with If-Match", async () => {
    render(<ResearchPlanPanel workshopId="w" strategySpec={spec} />);
    await screen.findByTestId("research-plan-p1");
    expect(screen.getByTestId("research-plan-dispatch")).toBeDisabled();
    fireEvent.click(screen.getByTestId("research-plan-approve"));
    await waitFor(() => expect(screen.getByTestId("research-plan-dispatch")).toBeEnabled());
    expect(called("/approve").headers).toEqual({ "If-Match": etag });
    expect(screen.getByTestId("research-plan-approve")).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId("research-plan-cancel")).toBeEnabled());
    fireEvent.click(screen.getByTestId("research-plan-cancel"));
    await waitFor(() => expect(called("/cancel")).toBeTruthy());
    expect(called("/cancel").headers).toEqual({ "If-Match": etag });
  });

  it("reads an approved plan back after reload", async () => {
    status = "approved";
    render(<ResearchPlanPanel workshopId="w" strategySpec={spec} />);
    await screen.findByTestId("research-plan-p1");
    expect(screen.getByTestId("research-plan-dispatch")).toBeEnabled();
  });
});
