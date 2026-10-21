import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { search } from "@/lib/bff-v1/search";
import searchFixture from "./fixtures/hosted-20261020/search.json";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("search BFF contract adapter (hosted-20261020 fixture)", () => {
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

  it("maps lowercase/snake_case BFF search types strategy, persona, and capital_pool and returns persona + strategy names", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(searchFixture));

    const results = await search("38055178182");
    expect(results).toHaveLength(3);

    const strategy = results.find((r) => r.id === "strategy-persona-ed49ca07814374a816fb");
    const persona = results.find((r) => r.id === "persona-02fc6ca929d84dc0e71a");
    const pool = results.find((r) => r.id === "pool-persona-paper-ed49ca07814374a816fb");

    expect(strategy).toMatchObject({
      id: "strategy-persona-ed49ca07814374a816fb",
      type: "Strategy",
      name: "Pantheon Dev Paper Release 38055178182 Attempt 1",
    });
    expect(persona).toMatchObject({
      id: "persona-02fc6ca929d84dc0e71a",
      type: "Persona",
      name: "Pantheon Dev Paper Release 38055178182 Attempt 1",
    });
    expect(pool).toMatchObject({
      id: "pool-persona-paper-ed49ca07814374a816fb",
      type: "CapitalPool",
      name: "Pantheon Dev Paper Release 38055178182 Attempt 1 paper pool",
    });
  });
});
