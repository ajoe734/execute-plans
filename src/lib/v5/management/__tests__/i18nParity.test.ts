// 2026-05-22 Pack PM-i18n — i18n parity for Management revamp surface.
// Ensures every mgmt.* key exists in both locales with matching shape.
import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en-US";
import zh from "@/i18n/locales/zh-TW";

function flatten(obj: Record<string, unknown>, prefix = "", out: Set<string> = new Set()): Set<string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out);
    else out.add(key);
  }
  return out;
}

describe("Pack PM-i18n parity", () => {
  const enKeys = flatten(en as unknown as Record<string, unknown>);
  const zhKeys = flatten(zh as unknown as Record<string, unknown>);
  const enMgmt = [...enKeys].filter((k) => k.startsWith("mgmt.")).sort();
  const zhMgmt = [...zhKeys].filter((k) => k.startsWith("mgmt.")).sort();

  it("has at least 80 mgmt.* keys in en-US", () => {
    expect(enMgmt.length).toBeGreaterThanOrEqual(80);
  });

  it("mgmt.* keys are 1:1 between en-US and zh-TW", () => {
    expect(zhMgmt).toEqual(enMgmt);
  });

  it("dictionaries are globally symmetric", () => {
    const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k));
    const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k));
    expect(onlyEn).toEqual([]);
    expect(onlyZh).toEqual([]);
  });

  it("19 previously-missing keys are present in both locales", () => {
    const needed = [
      "approval.quorum.label",
      "capitalPool.mandate.autoActions",
      "capitalPool.mandate.breachCadence",
      "confirm.cooldown.remaining",
      "confirm.cooldown.title",
      "confirm.memoIncidentRef",
      "confirm.memoTooLong",
      "confirm.memoTooShort",
      "confirm.twoMan.distinctFamily",
      "confirm.twoMan.distinctUser",
      "confirm.twoMan.title",
      "incident.viewRollbackSaga",
      "settings.tab.breakglass",
      "v5.loops.research.emptyDesc",
      "v5.loops.research.emptyTitle",
      "v5.loops.research.reviewPending",
      "v5.loops.research.runs",
      "v5.loops.research.runsHint",
      "v5.loops.research.subtitle",
    ];
    for (const k of needed) {
      expect(enKeys.has(k), `en missing ${k}`).toBe(true);
      expect(zhKeys.has(k), `zh missing ${k}`).toBe(true);
    }
  });

  it("includes portfolio book loading, refresh, and error keys in both locales", () => {
    const portfolioStateKeys = [
      "mgmt.portfolio.loading",
      "mgmt.portfolio.loadingTitle",
      "mgmt.portfolio.loadingBody",
      "mgmt.portfolio.refresh",
      "mgmt.portfolio.refreshing",
      "mgmt.portfolio.refreshingNotice",
      "mgmt.portfolio.loadErrorBody",
      "mgmt.portfolio.retry",
    ];
    for (const k of portfolioStateKeys) {
      expect(enKeys.has(k), `en missing ${k}`).toBe(true);
      expect(zhKeys.has(k), `zh missing ${k}`).toBe(true);
    }
  });

  it("includes evolution journal history, auto_proposal_counts, evidence_class, and degraded keys in both locales", () => {
    const evolutionJournalKeys = [
      "mgmt.evolution.viewHistory",
      "mgmt.evolution.viewAutoProposals",
      "mgmt.evolution.viewAll",
      "mgmt.evolution.showAutoProposals",
      "mgmt.evolution.showHistory",
      "mgmt.evolution.autoProposalsSummaryFmt",
      "mgmt.evolution.autoProposalsTotal",
      "mgmt.evolution.incidentFollowup",
      "mgmt.evolution.incidentSeverity",
      "mgmt.evolution.postmortemDraft",
      "mgmt.evolution.filteredSummaryFmt",
      "mgmt.evolution.summaryDecisions",
      "mgmt.evolution.summaryMutationReviews",
      "mgmt.evolution.summaryPostmortems",
      "mgmt.evolution.summaryRollbacks",
      "mgmt.evolution.summaryFreezeOrders",
      "mgmt.evolution.emptyHistoryTitle",
      "mgmt.evolution.emptyHistoryWithProposalsFmt",
      "mgmt.evolution.emptyAutoProposals",
      "mgmt.evolution.evidenceClass",
      "mgmt.evolution.evidenceClasses.threshold_signal",
      "mgmt.evolution.evidenceClasses.incident_followup",
      "mgmt.evolution.evidenceClasses.incident_severity",
      "mgmt.evolution.evidenceClasses.unclassified",
      "mgmt.evolution.degradedTitle",
      "mgmt.evolution.degradedBody",
      "mgmt.evolution.retry",
      "mgmt.evolution.pager.rangeFmt",
      "mgmt.evolution.pager.pageFmt",
      "mgmt.evolution.pager.previous",
      "mgmt.evolution.pager.next",
    ];
    for (const k of evolutionJournalKeys) {
      expect(enKeys.has(k), `en missing ${k}`).toBe(true);
      expect(zhKeys.has(k), `zh missing ${k}`).toBe(true);
    }
  });

  it("includes Alpha Factory replication card, empty-state, and unavailable keys in both locales and removes legacy replicated note", () => {
    const alphaFactoryKeys = [
      "alphaFactory.source.surface",
      "alphaFactory.empty.noCandidateSource",
      "alphaFactory.unavailable.title",
      "alphaFactory.unavailable.description",
      "alphaFactory.card.strategyId",
      "alphaFactory.card.approver",
      "alphaFactory.card.approvedAt",
      "alphaFactory.card.queueStatus",
      "alphaFactory.card.attemptCount",
      "alphaFactory.card.lastRevalidationAt",
      "alphaFactory.card.experimentRunCount",
      "alphaFactory.card.authorityTask",
      "alphaFactory.card.openStrategy",
      "alphaFactory.card.openExperiment",
      "alphaFactory.card.notReported",
    ];
    for (const k of alphaFactoryKeys) {
      expect(enKeys.has(k), `en missing ${k}`).toBe(true);
      expect(zhKeys.has(k), `zh missing ${k}`).toBe(true);
    }
    expect(enKeys.has("alphaFactory.replicated.note")).toBe(false);
    expect(zhKeys.has("alphaFactory.replicated.note")).toBe(false);
  });
});
