import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { getRoutePolicy, listRoutePolicies } from "@/lib/bff-v1/governance";
import routePoliciesFixture from "./fixtures/hosted-20261020/route-policies.json";
import personasFixture from "./fixtures/hosted-20261020/personas.json";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("routePolicies BFF contract adapter (hosted-20261020 fixtures)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  it("reads GET /bff/route-policies once instead of per-persona route-policy N+1 requests and synthesizes default v1 policies", async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requestedUrls.push(url);
      if (url.includes("/bff/route-policies")) {
        return jsonResponse(routePoliciesFixture);
      }
      if (url.endsWith("/bff/personas")) {
        return jsonResponse(personasFixture);
      }
      return jsonResponse({ detail: `Unexpected request: ${url}` }, 500);
    });

    const policies = await listRoutePolicies();

    expect(requestedUrls.filter((u) => u.includes("/bff/route-policies"))).toHaveLength(1);
    expect(requestedUrls.filter((u) => u.includes("/route-policy"))).toHaveLength(0);
    expect(policies).toHaveLength(2);
    expect(policies[0]).toMatchObject({
      id: "persona:persona-d57f6d76254c20418a9e:v1",
      personaId: "persona-d57f6d76254c20418a9e",
      version: "v1",
      rules: [],
      consult_policy: null,
    });

    requestedUrls.length = 0;
    const detail = await getRoutePolicy("persona:persona-21cdbed183c80cf371df:v1");
    expect(requestedUrls.filter((u) => u.includes("/bff/route-policies"))).toHaveLength(1);
    expect(requestedUrls.filter((u) => u.includes("/route-policy"))).toHaveLength(0);
    expect(detail).toMatchObject({
      id: "persona:persona-21cdbed183c80cf371df:v1",
      personaId: "persona-21cdbed183c80cf371df",
      version: "v1",
      rules: [],
      consult_policy: null,
    });
  });
});
