import { describe, expect, it } from "vitest";
import {
  CANONICAL_CENTERS,
  LEGACY_REDIRECTS,
  MANAGEMENT_SIDEBAR_GROUPS,
  canonicalCenterUrl,
  isCanonicalCenterPath,
  resolveLegacyRedirect,
} from "./managementRouteManifest";

describe("MGMT-PERF-IA-001 canonical route manifest", () => {
  it("assigns every sidebar item a unique id", () => {
    const ids = MANAGEMENT_SIDEBAR_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("assigns every sidebar item a unique label key", () => {
    const labelKeys = MANAGEMENT_SIDEBAR_GROUPS.flatMap((g) => g.items.map((i) => i.labelKey));
    expect(new Set(labelKeys).size).toBe(labelKeys.length);
  });

  it("never renders a canonical center twice across the sidebar", () => {
    const centerIds = Object.keys(CANONICAL_CENTERS);
    const toValues = MANAGEMENT_SIDEBAR_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    for (const centerId of centerIds) {
      const path = CANONICAL_CENTERS[centerId as keyof typeof CANONICAL_CENTERS].path;
      const occurrences = toValues.filter((to) => to.startsWith(`${path}?`) || to === path);
      expect(occurrences, `${centerId} should appear exactly once in the sidebar`).toHaveLength(1);
    }
  });

  it("does not duplicate a group label across groups", () => {
    const groupLabels = MANAGEMENT_SIDEBAR_GROUPS.map((g) => g.labelKey);
    expect(new Set(groupLabels).size).toBe(groupLabels.length);
  });

  it("gives every canonical center a tab list containing its default tab", () => {
    for (const center of Object.values(CANONICAL_CENTERS)) {
      expect(center.tabs.some((t) => t.id === center.defaultTab)).toBe(true);
    }
  });

  it("never targets a legacy redirect source as a canonical destination (no redirect loops)", () => {
    for (const rule of LEGACY_REDIRECTS) {
      const canonicalPath = CANONICAL_CENTERS[rule.center].path;
      expect(isCanonicalCenterPath(canonicalPath)).toBe(true);
      // A canonical center path must never itself match another rule's source
      // regexp, otherwise resolving once more could bounce again.
      for (const other of LEGACY_REDIRECTS) {
        expect(other.match.test(canonicalPath)).toBe(false);
      }
    }
  });

  it("resolving a legacy redirect twice terminates (second resolution is a no-op)", () => {
    const sampleLegacyPaths = [
      "/management/portfolio-book",
      "/management/performance-attribution",
      "/management/capital",
      "/management/persona-league",
      "/management/quarterly-ranking",
      "/management/capital-pools",
      "/management/rebalances",
      "/management/ranking",
      "/management/ranking/formulas",
      "/management/ranking-formulas",
      "/management/promotion-allocation",
    ];
    for (const from of sampleLegacyPaths) {
      const resolved = resolveLegacyRedirect(from, "");
      expect(resolved, `${from} should resolve to a canonical destination`).not.toBeNull();
      const second = resolveLegacyRedirect(resolved!.pathname, resolved!.search);
      expect(second, `${resolved!.pathname} must not itself be a legacy redirect source`).toBeNull();
    }
  });

  it("preserves only allow-listed query context and drops unknown keys", () => {
    const resolved = resolveLegacyRedirect(
      "/management/performance-attribution",
      "?dimension=persona&persona=persona-tw&period=30d&unknown_debug=1",
    );
    expect(resolved).toEqual({
      pathname: "/management/performance",
      search: "?tab=attribution&dimension=persona&persona=persona-tw&period=30d",
    });
  });

  it("preserves Portfolio workflow snake_case context through canonical redirects", () => {
    expect(resolveLegacyRedirect(
      "/management/portfolio-book",
      "?deployment_stage=paper&runtime_id=rt-1&source_status=degraded&stale_telemetry=false&risk_state=missing_binding&persona_id=persona-a&unknown_debug=1",
    )).toEqual({
      pathname: "/management/performance",
      search: "?tab=overview&persona_id=persona-a&deployment_stage=paper&runtime_id=rt-1&source_status=degraded&stale_telemetry=false&risk_state=missing_binding",
    });

    expect(resolveLegacyRedirect(
      "/management/performance-attribution",
      "?persona_id=persona-a&runtime_id=rt-1&dimension=persona&unknown_debug=1",
    )).toEqual({
      pathname: "/management/performance",
      search: "?tab=attribution&dimension=persona&persona_id=persona-a&runtime_id=rt-1",
    });
  });

  it("routes persona-league to the rankings rolling tab with context", () => {
    const resolved = resolveLegacyRedirect("/management/persona-league", "?persona=persona-a&sort=score");
    expect(resolved).toEqual({ pathname: "/management/rankings", search: "?tab=rolling&persona=persona-a&sort=score" });
  });

  it("routes quarterly-ranking to the rankings quarterly tab with context", () => {
    const resolved = resolveLegacyRedirect("/management/quarterly-ranking", "?persona=persona-a&quarter=2026Q3");
    expect(resolved).toEqual({ pathname: "/management/rankings", search: "?tab=quarterly&persona=persona-a&quarter=2026Q3" });
  });

  it("routes bare capital to the performance exposure tab, not governance", () => {
    const resolved = resolveLegacyRedirect("/management/capital", "?pool=pool-a");
    expect(resolved).toEqual({ pathname: "/management/performance", search: "?tab=exposure&pool=pool-a" });
  });

  it("routes capital-pools and rebalances to the governance capital tab", () => {
    expect(resolveLegacyRedirect("/management/capital-pools", "?capital_id=pool-a")).toEqual({
      pathname: "/management/governance-decisions",
      search: "?tab=capital&capital_id=pool-a",
    });
    expect(resolveLegacyRedirect("/management/rebalances", "?rebalance_id=rb-1")).toEqual({
      pathname: "/management/governance-decisions",
      search: "?tab=capital&rebalance_id=rb-1",
    });
    expect(resolveLegacyRedirect("/management/rebalance", "?rebalance_id=rb-1")).toEqual({
      pathname: "/management/governance-decisions",
      search: "?tab=capital&rebalance_id=rb-1",
    });
  });

  it("routes ranking formula aliases to the governance policy tab", () => {
    for (const path of ["/management/ranking", "/management/ranking/formulas", "/management/ranking-formulas"]) {
      expect(resolveLegacyRedirect(path, "?formula_id=rf-1")).toEqual({
        pathname: "/management/governance-decisions",
        search: "?tab=policy&formula_id=rf-1",
      });
    }
  });

  it("routes each promotion-allocation tab to its matrix-defined canonical destination", () => {
    expect(resolveLegacyRedirect("/management/promotion-allocation", "?tab=real-ranking&persona=p1")).toEqual({
      pathname: "/management/rankings",
      search: "?tab=rolling&persona=p1",
    });
    expect(resolveLegacyRedirect("/management/promotion-allocation", "?tab=paper-candidates&persona=p1")).toEqual({
      pathname: "/management/rankings",
      search: "?tab=quarterly&persona=p1",
    });
    expect(resolveLegacyRedirect("/management/promotion-allocation", "?tab=quarterly-capital&capital_id=pool-a")).toEqual({
      pathname: "/management/governance-decisions",
      search: "?tab=capital&capital_id=pool-a",
    });
    expect(resolveLegacyRedirect("/management/promotion-allocation", "?tab=formula-policy&formula_id=rf-1")).toEqual({
      pathname: "/management/governance-decisions",
      search: "?tab=policy&formula_id=rf-1",
    });
    // default (no tab) matches the current PromotionAllocationPage default.
    expect(resolveLegacyRedirect("/management/promotion-allocation", "")).toEqual({
      pathname: "/management/rankings",
      search: "?tab=quarterly",
    });
  });

  it("returns null for unrelated paths", () => {
    expect(resolveLegacyRedirect("/management/cockpit", "")).toBeNull();
    expect(resolveLegacyRedirect("/management/performance", "?tab=overview")).toBeNull();
  });

  it("canonicalCenterUrl builds a default-tab url when no tab is given", () => {
    expect(canonicalCenterUrl("performance")).toBe("/management/performance?tab=overview");
    expect(canonicalCenterUrl("rankings", "quarterly")).toBe("/management/rankings?tab=quarterly");
  });
});
