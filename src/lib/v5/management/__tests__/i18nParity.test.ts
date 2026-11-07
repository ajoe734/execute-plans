// 2026-05-22 Pack PM-i18n — i18n parity for Management revamp surface.
// Ensures every mgmt.* key exists in both locales with matching shape.
import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en-US";
import zh from "@/i18n/locales/zh-TW";
import {
  SUPPORTED_ATTRIBUTION_DIMENSIONS,
  UNSUPPORTED_ATTRIBUTION_DIMENSIONS,
} from "@/lib/v5/management/performanceAttribution";

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
      "mgmt.portfolio.avgEntry",
      "mgmt.portfolio.lastClose",
      "mgmt.portfolio.markAsOfFmt",
      "mgmt.portfolio.realizedPnlFmt",
      "mgmt.portfolio.shortPosition",
      "mgmt.portfolio.markStale",
      "mgmt.portfolio.markStaleWithDateFmt",
      "mgmt.portfolio.markUnavailable",
      "mgmt.portfolio.noAverageCost",
      "mgmt.portfolio.staleTelemetry",
      "mgmt.portfolio.noReportedSourceIssue",
    ];
    for (const k of portfolioStateKeys) {
      expect(enKeys.has(k), `en missing ${k}`).toBe(true);
      expect(zhKeys.has(k), `zh missing ${k}`).toBe(true);
    }
  });

  it("includes BFF-supported attribution dimension labels and excludes unsupported 422 dimensions in both locales", () => {
    expect(enKeys.has("mgmt.attribution.unsupportedDimensionNoticeFmt")).toBe(true);
    expect(zhKeys.has("mgmt.attribution.unsupportedDimensionNoticeFmt")).toBe(true);

    for (const d of [...SUPPORTED_ATTRIBUTION_DIMENSIONS, "pool", "asset", "instrument", "regime"]) {
      const k = `mgmt.attribution.dimensions.${d}`;
      expect(enKeys.has(k), `en missing ${k}`).toBe(true);
      expect(zhKeys.has(k), `zh missing ${k}`).toBe(true);
    }

    for (const unsupported of UNSUPPORTED_ATTRIBUTION_DIMENSIONS) {
      const k = `mgmt.attribution.dimensions.${unsupported}`;
      expect(enKeys.has(k), `en should not include unsupported ${k}`).toBe(false);
      expect(zhKeys.has(k), `zh should not include unsupported ${k}`).toBe(false);
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

  it("includes all evolution program qualification, list column, origin, human review, governance gate, and runs keys in both locales", () => {
    const evolutionProgramReviewKeys = [
      "lifecycle.evolution.stopped",
      "evolution.waitingForHumanReview",
      "evolution.columns.name",
      "evolution.columns.status",
      "evolution.columns.origin",
      "evolution.columns.sourceDecisionCount",
      "evolution.columns.runCount",
      "evolution.columns.updatedAt",
      "evolution.origin.label",
      "evolution.origin.automatic",
      "evolution.origin.manual",
      "evolution.qualification.summaryTitle",
      "evolution.qualification.detailTitle",
      "evolution.qualification.policyVersion",
      "evolution.qualification.evaluatedAt",
      "evolution.qualification.evaluated",
      "evolution.qualification.qualified",
      "evolution.qualification.drafted",
      "evolution.qualification.failingByCriterion",
      "evolution.qualification.zeroProgramsTitle",
      "evolution.qualification.zeroProgramsQualifiedZero",
      "evolution.qualification.zeroProgramsNoSweep",
      "evolution.qualification.zeroProgramsWithQualified",
      "evolution.qualification.criterion",
      "evolution.qualification.observed",
      "evolution.qualification.threshold",
      "evolution.qualification.result",
      "evolution.qualification.reason",
      "evolution.qualification.results.passed",
      "evolution.qualification.results.failed",
      "evolution.qualification.results.not_evaluated",
      "evolution.qualification.criteria.real_threshold_signal",
      "evolution.qualification.criteria.real_target",
      "evolution.qualification.criteria.persistent_breach",
      "evolution.qualification.criteria.fresh_evidence",
      "evolution.qualification.criteria.executable_action",
      "evolution.qualification.criteria.no_open_duplicate",
      "evolution.sourceDecisions.title",
      "evolution.sourceDecisions.empty",
      "evolution.sourceDecisions.openInJournal",
      "evolution.review.title",
      "evolution.review.submitForReview",
      "evolution.review.approve",
      "evolution.review.reject",
      "evolution.review.boundApproval",
      "evolution.review.approvalState",
      "evolution.review.noBoundApproval",
      "evolution.review.approveBlockedUntilGovernanceApproved",
      "evolution.review.approveBlockedNoApproval",
      "evolution.review.openApprovalsQueue",
      "evolution.review.openApprovalDetail",
      "evolution.review.rejectReasonLabel",
      "evolution.review.rejectReasonPlaceholder",
      "evolution.review.rejectReasonRequired",
      "evolution.review.rejectedBanner",
      "evolution.review.noAllowedActions",
      "evolution.runs.panelTitle",
      "evolution.runs.empty",
      "evolution.runs.manualNoSourceDecisions",
      "evolution.runs.runId",
      "evolution.runs.decisionId",
      "evolution.runs.status",
      "evolution.runs.downstreamStatus",
      "evolution.runs.detail",
      "evolution.runs.linkedAt",
      "evolution.runs.failedBadge",
    ];
    for (const k of evolutionProgramReviewKeys) {
      expect(enKeys.has(k), `en missing ${k}`).toBe(true);
      expect(zhKeys.has(k), `zh missing ${k}`).toBe(true);
    }
  });

  it("includes Trading Pulse retired runtime exclusion key in both locales", () => {
    expect(enKeys.has("mgmt.pulse.retiredExcludedFmt")).toBe(true);
    expect(zhKeys.has("mgmt.pulse.retiredExcludedFmt")).toBe(true);
    expect(enKeys.has("mgmt.pulse.notRequired")).toBe(true);
    expect(zhKeys.has("mgmt.pulse.notRequired")).toBe(true);
    expect(enKeys.has("mgmt.pulse.sharpeBuildingBadge")).toBe(true);
    expect(zhKeys.has("mgmt.pulse.sharpeBuildingBadge")).toBe(true);
    expect(enKeys.has("mgmt.pulse.sharpeBuildingHistory")).toBe(true);
    expect(zhKeys.has("mgmt.pulse.sharpeBuildingHistory")).toBe(true);
    expect(enKeys.has("mgmt.pulse.sharpeShortSampleCaption")).toBe(true);
    expect(zhKeys.has("mgmt.pulse.sharpeShortSampleCaption")).toBe(true);
  });

  it("includes alerts page empty and unavailable keys in both locales", () => {
    expect(enKeys.has("page.alertsEmpty")).toBe(true);
    expect(zhKeys.has("page.alertsEmpty")).toBe(true);
    expect(enKeys.has("page.alertsUnavailable")).toBe(true);
    expect(zhKeys.has("page.alertsUnavailable")).toBe(true);
    expect(en.page.alertsEmpty).toBe("No active alerts.");
    expect(zh.page.alertsEmpty).toBe("目前沒有警報。");
    expect(en.page.alertsUnavailable).toBe("Alerts are temporarily unavailable.");
    expect(zh.page.alertsUnavailable).toBe("暫時無法取得警報資料。");
  });
});
