import { afterEach, describe, expect, it, vi } from "vitest";
import { actOnGovernedProposal, getGovernedProposal } from "./governance";
import { getAuthProvider, setAuthProvider } from "../headers";

const proposal = { proposal_id: "prop-1", revision: 1, state: "draft" };
const defaultAuthProvider = getAuthProvider();
afterEach(() => {
  vi.unstubAllGlobals();
  setAuthProvider(defaultAuthProvider);
});

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

  it("sends shared browser authorization and tenant scope headers", async () => {
    setAuthProvider({
      getToken: () => "viewer-token",
      getTenantId: () => "tenant-pint-010",
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: proposal }), {
      status: 200,
      headers: { ETag: '"v1"' },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await getGovernedProposal("prop-1");

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer viewer-token");
    expect(headers["X-Tenant-Id"]).toBe("tenant-pint-010");
    expect(headers["X-BFF-Api-Version"]).toBeTruthy();
  });

  it("preserves an unwrapped backend conflict status for actionable UI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "proposal ETag is stale" }), { status: 412 })));
    await expect(actOnGovernedProposal("prop-1", { action: "modify", reason: "tighten", proposed_value: { limit: 2 } }, '"stale"'))
      .rejects.toMatchObject({ status: 412, code: "STATE_CONFLICT" });
  });

  it("fails closed with the typed backend error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "PERMISSION_DENIED", message: "denied" } }), { status: 403 })));
    await expect(actOnGovernedProposal("prop-1", { action: "approve", reason: "ok" }, '"v1"')).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
  });
});
