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
});
