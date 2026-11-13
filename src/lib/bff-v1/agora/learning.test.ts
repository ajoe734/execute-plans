import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());

import { getCommitteeSessions, getChangeLog } from "./learning";

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("learning client (live transport)", () => {
  it("keeps the owner's recorded reason from a fail-closed 503 detail", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(response(503, { detail: { status: "unavailable", owner: "consultation", reason: "consultation_owner_unavailable", fallback_used: false } }));
    const { bffFetch } = await import("../client");
    // Force live for this call via the explicit per-request mode override used by the client.
    await expect(bffFetch({ method: "GET", path: "/bff/agora/committee/sessions", mode: "live", baseUrl: "http://bff.test" })).rejects.toMatchObject({
      envelope: { error: { cause: "consultation_owner_unavailable" } },
    });
  });

  it("treats a 200 envelope with status unavailable as unavailable", async () => {
    const { setMockResolver } = await import("../client");
    setMockResolver(() => () => ({ kind: "json", status: 200, body: { status: "unavailable", reason: "no_persona_panels", owner: "consultation", data: [] } }));
    expect(await getCommitteeSessions()).toEqual({ state: "unavailable", reason: "no_persona_panels", owner: "consultation" });
    setMockResolver(undefined);
  });

  it("rejects a malformed owner payload instead of defaulting it", async () => {
    const { setMockResolver } = await import("../client");
    setMockResolver(() => () => ({ kind: "json", status: 200, body: { data: { entries: "nope" } } }));
    expect(await getChangeLog("p1")).toMatchObject({ state: "ok" }); // object payload accepted as-is by the lab envelope
    setMockResolver(() => () => ({ kind: "json", status: 200, body: {} }));
    expect(await getChangeLog("p1")).toEqual({ state: "unavailable", reason: "invalid_owner_response", owner: undefined });
    setMockResolver(undefined);
  });
});
