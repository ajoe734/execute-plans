import { beforeEach, describe, expect, it, vi } from "vitest";

import { bffFetch } from "./client";
import { getPostmortem, listPostmortems } from "./postmortemClient";

vi.mock("./client", () => ({ bffFetch: vi.fn() }));

const canonicalRecord = {
  postmortem_id: "pm-canonical-001",
  incident_id: "incident-001",
  title: "Canonical incident review",
  status: "published",
  created_at: "2026-08-30T00:00:00Z",
  published_at: "2026-08-30T01:00:00Z",
  root_cause: "Durable owner timeout",
  action_items: ["Increase timeout"],
  author_ids: ["operator-1"],
};

describe("postmortemClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the canonical API list without synthesizing ids", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      data: [canonicalRecord],
      meta: { surfaces: { agora_postmortems: { status: "ok", source: "service_store" } } },
    });

    const result = await listPostmortems();

    expect(result.items[0]).toMatchObject({
      id: "pm-canonical-001",
      postmortem_id: "pm-canonical-001",
      incident_id: "incident-001",
    });
    expect(result.meta.surfaces?.agora_postmortems).toEqual(expect.objectContaining({
      status: "ok",
      source: "service_store",
    }));
    expect(bffFetch).toHaveBeenCalledWith({ method: "GET", path: "/api/v1/postmortems" });
  });

  it("rejects list records that omit canonical postmortem_id", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ items: [{ id: "pm-fabricated" }] });

    await expect(listPostmortems()).rejects.toThrow("missing canonical postmortem_id");
  });

  it("uses the API report_id for list and detail identity", async () => {
    const { postmortem_id, ...record } = canonicalRecord;
    const apiRecord = { ...record, report_id: postmortem_id };
    vi.mocked(bffFetch).mockResolvedValueOnce({ data: [apiRecord], meta: { total: 1 } });
    const result = await listPostmortems();
    expect(result.items[0]).toMatchObject({ id: postmortem_id, postmortem_id, title: record.title });
    vi.mocked(bffFetch).mockResolvedValueOnce({ data: apiRecord });
    expect((await getPostmortem(result.items[0].id)).item).toEqual(result.items[0]);
    expect(bffFetch).toHaveBeenLastCalledWith({ method: "GET", path: `/api/v1/postmortems/${postmortem_id}` });
  });

  it("propagates list failures instead of displaying an empty successful result", async () => {
    vi.mocked(bffFetch).mockRejectedValueOnce(new Error("Unavailable"));
    await expect(listPostmortems()).rejects.toThrow("Unavailable");
  });

  it("loads detail by the exact canonical postmortem_id", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      data: { ...canonicalRecord, postmortem_id: "pm/canonical" },
      meta: { staleness: { served_from: "service_store" } },
    });

    await expect(getPostmortem(" pm/canonical ")).resolves.toEqual(expect.objectContaining({
      item: expect.objectContaining({ postmortem_id: "pm/canonical" }),
    }));
    expect(bffFetch).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/v1/postmortems/pm%2Fcanonical",
    });
  });

  it("rejects a detail response bound to a different id", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: canonicalRecord });

    await expect(getPostmortem("pm-other")).rejects.toThrow("detail id mismatch");
  });

  it("sends page_size, page_token, q, and status to /api/v1/postmortems and normalizes page_info and meta.surfaces.postmortems", async () => {
    const realDraftRecord = {
      postmortem_id: "pm-inc-training-session-001",
      incident_id: "inc-training-session-001",
      title: "Postmortem draft: BFF downstream degradation: training-session",
      status: "draft",
      created_at: "2026-11-04T01:15:00Z",
      binding_id: "bind-paper-001",
      deployment_stage: "paper",
      deployment_plan_id: "plan-202611-001",
      capital_pool_id: "pool-alpha-01",
      persona_capital_binding_id: "pcb-alpha-001",
      artifact_id: "art-strat-001",
      artifact_version: "v1.0.0",
      runtime_id: "rt-paper-001",
      trace_id: "trace-inc-0001-9f8e7d6c5b4a",
      telemetry_event_ids: ["tel-0001-a", "tel-0001-b"],
      incident_evidence_summary: "Observed downstream degradation on training-session surface",
      lineage_ref: "art-strat-001@v1.0.0",
      incident_cluster_id: "cluster-deg-01",
      root_cause: "Draft generated from resolved incident inc-training-session-001; root cause pending analysis.",
      contributing_factors: [
        "incident_severity=high",
        "incident_cluster_id=cluster-deg-01",
      ],
      timeline: [
        { ts: "2026-11-04T01:00:00Z", description: "Incident inc-training-session-001 opened", actor: "incident-service" },
        { ts: "2026-11-04T01:15:00Z", description: "Postmortem draft generated from resolved incident evidence", actor: "postmortem-service" },
      ],
      action_items: [
        "Complete root cause analysis",
        "Validate remediation against linked telemetry and reconciliation evidence",
      ],
      author_ids: ["postmortem-draft-worker"],
    };

    vi.mocked(bffFetch).mockResolvedValueOnce({
      data: [realDraftRecord],
      page_info: {
        total: 2027,
        page_size: 50,
        next_page_token: "50",
      },
      meta: {
        total: 2027,
        staleness: null,
        surfaces: {
          postmortems: {
            status: "ok",
            source: "service_client",
          },
        },
      },
    });

    const result = await listPostmortems({
      page_size: 50,
      page_token: "50",
      q: "training-session",
      status: "draft",
    });

    expect(bffFetch).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/v1/postmortems",
      query: {
        page_size: 50,
        page_token: "50",
        q: "training-session",
        status: "draft",
      },
    });
    expect(result.page_info).toEqual({
      total: 2027,
      page_size: 50,
      next_page_token: "50",
    });
    expect(result.meta.surfaces?.postmortems).toEqual({
      status: "ok",
      source: "service_client",
      message: undefined,
      reason: undefined,
    });
    expect(result.items[0]).toMatchObject({
      id: "pm-inc-training-session-001",
      postmortem_id: "pm-inc-training-session-001",
      incident_id: "inc-training-session-001",
      title: "Postmortem draft: BFF downstream degradation: training-session",
      status: "draft",
      binding_id: "bind-paper-001",
      deployment_stage: "paper",
      deployment_plan_id: "plan-202611-001",
      capital_pool_id: "pool-alpha-01",
      persona_capital_binding_id: "pcb-alpha-001",
      artifact_id: "art-strat-001",
      artifact_version: "v1.0.0",
      runtime_id: "rt-paper-001",
      trace_id: "trace-inc-0001-9f8e7d6c5b4a",
      root_cause: "Draft generated from resolved incident inc-training-session-001; root cause pending analysis.",
      author_ids: ["postmortem-draft-worker"],
    });
  });

  it("prefers canonical postmortem_id when a legacy report_id is also present", async () => {
    vi.mocked(bffFetch).mockResolvedValueOnce({
      data: {
        ...canonicalRecord,
        postmortem_id: "pm-canonical-001",
        report_id: "legacy-report-999",
      },
      meta: {},
    });

    const detail = await getPostmortem("pm-canonical-001");
    expect(detail.item.id).toBe("pm-canonical-001");
    expect(detail.item.postmortem_id).toBe("pm-canonical-001");
  });
});
