import { afterEach, describe, expect, it, vi } from "vitest";
import { actOnGovernedProposal, getGovernedProposal } from "./governance";

const proposal = { proposal_id: "prop-1", revision: 1, state: "draft" };
afterEach(() => vi.unstubAllGlobals());

describe("governed proposal transport", () => {
  it("requires the backend ETag on reads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: proposal }), { status: 200 })));
    await expect(getGovernedProposal("prop-1")).rejects.toMatchObject({ code: "BACKEND_UNAVAILABLE" });
  });

  it("sends If-Match and preserves the next revision ETag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ...proposal, revision: 2 } }), { status: 200, headers: { ETag: '"v2"' } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await actOnGovernedProposal("prop/1", { action: "modify", reason: "tighten", proposed_value: { limit: 2 } }, '"v1"');
    expect(fetchMock.mock.calls[0][0]).toContain("prop%2F1/actions");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["If-Match"]).toBe('"v1"');
    expect(result).toMatchObject({ etag: '"v2"', proposal: { revision: 2 } });
  });

  it("fails closed with the typed backend error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "PERMISSION_DENIED", message: "denied" } }), { status: 403 })));
    await expect(actOnGovernedProposal("prop-1", { action: "approve", reason: "ok" }, '"v1"')).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
  });
});
