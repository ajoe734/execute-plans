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

  it("reads the canonical Agora list without synthesizing ids", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      items: [canonicalRecord],
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
    expect(bffFetch).toHaveBeenCalledWith({ method: "GET", path: "/bff/agora/postmortems" });
  });

  it("rejects list records that omit canonical postmortem_id", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ items: [{ id: "pm-fabricated" }] });

    await expect(listPostmortems()).rejects.toThrow("missing canonical postmortem_id");
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
