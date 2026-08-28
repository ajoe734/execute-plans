import { afterEach, describe, expect, it, vi } from "vitest";

import {
  allocationLimits,
  allocationSimulations,
  consultRules,
  evaluationRuns,
  evolutionCandidates,
  evolutionRuns,
  featureSets,
  fitnessFormulas,
  getAcceptLanguage,
  mcpSecrets,
  memoryUpdates,
  metricFreezes,
  mutationRules,
  objectVersions,
  performanceSeries,
  permissionMatrices,
  permissionMatrix,
  policyVersions,
  policyViolations,
  poolFreezes,
  promotions,
  rebalanceOverrides,
  routePolicies,
  strategies,
  watchers,
} from "@/lib/bff-v1";
import { getSeedHelperUnavailableReason } from "@/lib/bff-v1/domainReads";
import seedTaxonomy from "@/lib/bff-v1/seed-taxonomy.json";
import {
  getSeedHelperCategory,
  getSeedHelperLiveBehavior,
  seedHelperMustReturnEmptyInLive,
} from "@/lib/bff-v1/seedTaxonomy";

function stubLiveEnv() {
  vi.stubEnv("MODE", "development");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "auto");
}

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function pathFromFetchInput(input: Parameters<typeof fetch>[0]): string {
  return new URL(String(input), "https://bff.test").pathname;
}

describe("seed taxonomy live gating", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("classifies helpers from the BFF-CONSOL-007 taxonomy JSON", () => {
    expect(getSeedHelperCategory("bff.watchers.forSubject")).toBe("mock_only_dev");
    expect(getSeedHelperCategory("bff.fitnessFormulas.list")).toBe("deferred");
    expect(getSeedHelperCategory("bff.evolutionRuns.list")).toBe("live_required");
    expect(getSeedHelperCategory("bff.strategies.list")).toBe("live_required");
    expect(getSeedHelperLiveBehavior("bff.fitnessFormulas.list")).toBe("empty_state");
    expect(getSeedHelperLiveBehavior("bff.evolutionRuns.list")).toBe("live_required");
  });

  it("does not leave BFF-CONSOL-028 adjunct decisions as pending follow-ups", () => {
    const deferredHelpers = seedTaxonomy.helpers.filter((helper) => helper.category === "deferred");

    expect(deferredHelpers.length).toBe(15);
    for (const helper of deferredHelpers) {
      expect(helper.follow_up_tasks ?? []).not.toContain("BFF-CONSOL-025");
      expect(helper.follow_up_tasks ?? []).not.toContain("BFF-CONSOL-028");
      expect(helper.replacement?.length ?? 0).toBeGreaterThan(0);
      expect(helper.notes ?? "").toContain("strict live");
    }
  });

  it("does not disable seed helpers in mock mode", async () => {
    const watcherList = await watchers.forSubject("Strategy", "stg_001");

    expect(seedHelperMustReturnEmptyInLive("bff.watchers.forSubject")).toBe(false);
    expect(watcherList.length).toBeGreaterThan(0);
    expect(getAcceptLanguage()).toMatch(/en-US|zh-TW/);
  });

  it("disables mock_only_dev helpers in live mode instead of returning seed rows", async () => {
    stubLiveEnv();

    await expect(allocationSimulations.forRebalance("rb_q2_2026")).resolves.toEqual([]);
    await expect(watchers.forSubject("Strategy", "stg_001")).resolves.toEqual([]);
    await expect(mcpSecrets.forServer("mcp_alpha")).resolves.toEqual([]);
    expect(getAcceptLanguage()).toBeNull();
    expect(getSeedHelperUnavailableReason("bff.watchers.forSubject")).toMatch(/Development-only/);
  });

  it("returns explicit empty values for deferred helpers in live mode", async () => {
    stubLiveEnv();

    await expect(policyVersions.list("rp_quant_v2")).resolves.toEqual([]);
    await expect(permissionMatrix.get("persona-tool")).resolves.toBeUndefined();
    await expect(permissionMatrices.list()).resolves.toEqual([]);
    await expect(fitnessFormulas.list()).resolves.toEqual([]);
    await expect(fitnessFormulas.get("ff_default")).resolves.toBeUndefined();
    await expect(mutationRules.list()).resolves.toEqual([]);
    await expect(policyViolations.list()).resolves.toEqual([]);
    await expect(policyViolations.forSubject("Persona", "per_quant")).resolves.toEqual([]);
    await expect(featureSets.forStrategy("stg_001")).resolves.toEqual([]);
    await expect(performanceSeries.forStrategy("stg_001", "day")).resolves.toBeUndefined();
    await expect(allocationLimits.forPool("cp_alpha")).resolves.toEqual([]);
    await expect(poolFreezes.forPool("cp_alpha")).resolves.toEqual([]);
    await expect(promotions.forProgram("ev_001")).resolves.toEqual([]);
    await expect(metricFreezes.forRebalance("rb_q2_2026")).resolves.toEqual([]);
    await expect(rebalanceOverrides.forRebalance("rb_q2_2026")).resolves.toEqual([]);
    expect(getSeedHelperUnavailableReason("bff.fitnessFormulas.list")).toMatch(/Live route deferred/);
  });

  it("routes BFF-CONSOL-028 foldable adjunct helpers through live BFF routes", async () => {
    stubLiveEnv();
    const fetchSpy = vi.fn((input: Parameters<typeof fetch>[0]) => {
      const path = pathFromFetchInput(input);
      if (path === "/bff/personas") {
        return jsonResponse({ items: [{ id: "per_live", name: "Live Persona" }] });
      }
      if (path === "/bff/personas/per_live/route-policy") {
        return jsonResponse({
          data: {
            id: "rp_live",
            personaId: "per_live",
            version: "v9",
            rules: [],
            consult_policy: {
              owner: "ops",
              updated_at: "2026-05-13T00:00:00Z",
              trigger_rules: [
                {
                  id: "cr_live",
                  condition: "risk.high",
                  mode: "blocking",
                  description: "Live risk consult",
                  env_scope: ["live"],
                  to_persona_id: "per_risk",
                },
              ],
            },
          },
        });
      }
      if (path === "/bff/personas/per_live/memory") {
        return jsonResponse({ items: [{ id: "mem_live", kind: "fact" }] });
      }
      if (path === "/bff/personas/per_live/evaluations") {
        return jsonResponse({ items: [{ session_id: "eval_live", score: 0.9 }] });
      }
      if (path === "/bff/evolution-programs") {
        return jsonResponse({ items: [{ id: "evp_live", name: "Live Evolution" }] });
      }
      if (path === "/bff/evolution-programs/evp_live/runs") {
        return jsonResponse({ items: [{ run_id: "run_live", program_id: "evp_live", status: "success" }] });
      }
      if (path === "/bff/evolution-programs/evp_live/candidates") {
        return jsonResponse({ items: [{ candidate_id: "cand_live", run_id: "run_live", fitness: 2.1 }] });
      }
      if (path === "/bff/strategies/stg_live/specs") {
        return jsonResponse({ items: [{ spec_version_id: "spec_live", spec_version: "v4", created_by: "alice" }] });
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(routePolicies.list()).resolves.toEqual([
      expect.objectContaining({ id: "rp_live", personaId: "per_live" }),
    ]);
    await expect(routePolicies.get("rp_live")).resolves.toEqual(expect.objectContaining({ id: "rp_live" }));
    await expect(memoryUpdates.list()).resolves.toEqual([
      expect.objectContaining({ id: "mem_live", personaId: "per_live" }),
    ]);
    await expect(consultRules.list()).resolves.toEqual([
      expect.objectContaining({ id: "cr_live", fromPersonaId: "per_live", trigger: "risk.high" }),
    ]);
    await expect(consultRules.get("cr_live")).resolves.toEqual(expect.objectContaining({ id: "cr_live" }));
    await expect(evolutionRuns.list()).resolves.toEqual([
      expect.objectContaining({ id: "run_live", programId: "evp_live" }),
    ]);
    await expect(evolutionCandidates.forRun("run_live")).resolves.toEqual([
      expect.objectContaining({ id: "cand_live", runId: "run_live" }),
    ]);
    await expect(evaluationRuns.list()).resolves.toEqual([
      expect.objectContaining({ id: "eval_live", subjectKind: "Persona", subjectId: "per_live" }),
    ]);
    await expect(evaluationRuns.forSubject("Persona", "per_live")).resolves.toEqual([
      expect.objectContaining({ id: "eval_live", subjectKind: "Persona", subjectId: "per_live" }),
    ]);
    await expect(evaluationRuns.forSubject("Skill", "sk_signal_review")).resolves.toEqual([]);
    await expect(objectVersions.forSubject("Strategy", "stg_live")).resolves.toEqual([
      expect.objectContaining({ id: "spec_live", subjectKind: "Strategy", subjectId: "stg_live" }),
    ]);
    await expect(objectVersions.forSubject("Persona", "per_live")).resolves.toEqual([]);

    const calledPaths = fetchSpy.mock.calls.map(([input]) => pathFromFetchInput(input));
    expect(calledPaths).toContain("/bff/personas/per_live/route-policy");
    expect(calledPaths).toContain("/bff/personas/per_live/memory");
    expect(calledPaths).toContain("/bff/personas/per_live/evaluations");
    expect(calledPaths).toContain("/bff/evolution-programs/evp_live/runs");
    expect(calledPaths).toContain("/bff/evolution-programs/evp_live/candidates");
    expect(calledPaths).toContain("/bff/strategies/stg_live/specs");
  });

  it("routes live_required helpers to the live BFF route instead of seed data", async () => {
    stubLiveEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "live_strategy", name: "Live Strategy" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    expect(seedHelperMustReturnEmptyInLive("bff.strategies.list")).toBe(false);
    await expect(strategies.list()).resolves.toEqual([{ id: "live_strategy", name: "Live Strategy" }]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/bff/strategies");
  });
});
