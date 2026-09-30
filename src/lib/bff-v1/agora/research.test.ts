import { describe, it, expect, vi, beforeEach } from "vitest";

const bffFetch = vi.fn();
vi.mock("../client", () => ({ bffFetch: (req: unknown) => bffFetch(req) }));

import { BffError } from "../errors";
import {
  RESEARCH_STAGE_TYPES,
  approveResearchPlan,
  cancelResearchPlan,
  createWorkshopResearchPlan,
  dispatchResearchPlan,
  getResearchPlan,
  isStaleEtagError,
  listWorkshopResearchPlans,
} from "./research";

beforeEach(() => bffFetch.mockReset());

describe("research client uses the shared BFF fetch", () => {
  it("creates a plan with only the accepted fields", async () => {
    bffFetch.mockResolvedValue({ allowedActions: { approve: true, cancel: true, dispatch: false }, data: { plan_id: "p1" }, meta: { etag: 'W/"research-plan:p1:v1"' } });
    const snap = await createWorkshopResearchPlan("ws/1", {
      spec_version: "1.0",
      strategy_id: "s",
      strategy_spec_registry_id: "r",
      stages: [{ stage_type: RESEARCH_STAGE_TYPES["Prototype backtest"] }],
    });
    const req = bffFetch.mock.calls[0][0];
    expect(req.path).toBe("/bff/agora/workshops/ws%2F1/research-plans");
    expect(Object.keys(req.body).sort()).toEqual(["spec_version", "stages", "strategy_id", "strategy_spec_registry_id"]);
    expect(snap.etag).toBe('W/"research-plan:p1:v1"');
    expect(snap.allowedActions).toEqual(["approve", "cancel"]);
  });

  it("maps the four V10 stage labels", () => {
    expect(Object.values(RESEARCH_STAGE_TYPES)).toEqual(["prototype_backtest", "rolling_oos", "econometric_validation", "portfolio_synthesis"]);
  });

  it("reads allowed actions from a boolean record and keeps the ETag", async () => {
    bffFetch.mockResolvedValue({ data: { plan_id: "p1" }, meta: { etag: "W/\"x\"", allowed_actions: { canDispatch: true, canApprove: false } } });
    const snap = await getResearchPlan("p1");
    expect(snap?.allowedActions).toEqual(["canDispatch"]);
  });

  it("reads root-level allowedActions from the real approved-plan envelope", async () => {
    bffFetch.mockResolvedValue({
      allowedActions: { approve: false, cancel: true, dispatch: true },
      data: { plan_id: "p1", status: "approved" },
      meta: { etag: 'W/"research-plan:p1:v3"' },
    });
    const snap = await getResearchPlan("p1");
    expect(snap?.allowedActions).toEqual(["cancel", "dispatch"]);
    expect(snap?.etag).toBe('W/"research-plan:p1:v3"');
  });

  it.each([
    ["approve", approveResearchPlan, "/approve"],
    ["cancel", cancelResearchPlan, "/cancel"],
    ["dispatch", dispatchResearchPlan, "/runs"],
  ] as const)("%s sends ETag as If-Match", async (_n, fn, suffix) => {
    bffFetch.mockResolvedValue({ status: "accepted", data: null, meta: {} });
    await fn("p1", { ifMatch: 'W/"research-plan:p1:v2"', idempotencyKey: "k" });
    const req = bffFetch.mock.calls[0][0];
    expect(req.method).toBe("POST");
    expect(req.path).toBe(`/bff/agora/research-plans/p1${suffix}`);
    expect(req.headers).toEqual({ "If-Match": 'W/"research-plan:p1:v2"' });
    expect(req.idempotencyKey).toBe("k");
  });

  it("lists plans from an items envelope", async () => {
    bffFetch.mockResolvedValue({ data: { items: [{ plan_id: "a" }] } });
    expect(await listWorkshopResearchPlans("w")).toHaveLength(1);
  });

  it("flags 412 and 409 as stale ETag", () => {
    const err = (s: number) => new BffError(s, { error: { code: "STATE_CONFLICT", message: "m" } } as never);
    expect(isStaleEtagError(err(412))).toBe(true);
    expect(isStaleEtagError(err(409))).toBe(true);
    expect(isStaleEtagError(err(500))).toBe(false);
  });
});
