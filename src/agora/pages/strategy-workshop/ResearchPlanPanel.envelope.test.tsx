import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/agora/useAgoraWriteAccess", () => ({
  useAgoraWriteAccess: () => ({ loading: false, writeAllowed: true, writeDisabledReason: "" }),
}));
const bffFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bff-v1/client", () => ({ bffFetch: (req: unknown) => bffFetch(req) }));

import { ResearchPlanPanel } from "./ResearchPlanPanel";

const etag = 'W/"research-plan:p1:v3"';
let status = "draft";
const envelope = () => ({
  allowedActions:
    status === "draft" ? { approve: true, cancel: true, dispatch: false } : { approve: false, cancel: true, dispatch: true },
  data: { plan_id: "p1", status, stages: [{ stage_type: "rolling_oos" }] },
  meta: { etag },
});

beforeEach(() => {
  status = "draft";
  bffFetch.mockReset();
  bffFetch.mockImplementation(async (req: { method: string; path: string }) => {
    if (req.path.endsWith("/research-plans") && req.method === "GET") return { data: [envelope().data] };
    if (req.path.endsWith("/research-plans/p1")) return envelope();
    if (req.path.endsWith("/runs") && req.method === "GET") return { data: [] };
    if (req.path.endsWith("/approve")) status = "approved";
    return { status: "accepted", data: null, meta: {} };
  });
});

describe("ResearchPlanPanel with real BFF envelopes", () => {
  it("approves a draft, then offers dispatch and cancel with If-Match", async () => {
    render(<ResearchPlanPanel workshopId="w" strategySpec={{ strategyId: "s1", registryId: "r1" }} />);
    await screen.findByTestId("research-plan-p1");
    expect(screen.getByTestId("research-plan-dispatch")).toBeDisabled();
    fireEvent.click(screen.getByTestId("research-plan-approve"));
    await waitFor(() => expect(screen.getByTestId("research-plan-dispatch")).toBeEnabled());
    expect(bffFetch.mock.calls.find(([r]) => r.path.endsWith("/approve"))![0].headers).toEqual({ "If-Match": etag });
    expect(screen.getByTestId("research-plan-approve")).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId("research-plan-cancel")).toBeEnabled());
    fireEvent.click(screen.getByTestId("research-plan-cancel"));
    await waitFor(() => expect(bffFetch.mock.calls.some(([r]) => r.path.endsWith("/cancel"))).toBe(true));
    expect(bffFetch.mock.calls.find(([r]) => r.path.endsWith("/cancel"))![0].headers).toEqual({ "If-Match": etag });
  });

  it("reads an approved plan back after reload", async () => {
    status = "approved";
    render(<ResearchPlanPanel workshopId="w" strategySpec={{ strategyId: "s1", registryId: "r1" }} />);
    await screen.findByTestId("research-plan-p1");
    expect(screen.getByTestId("research-plan-dispatch")).toBeEnabled();
  });
});
