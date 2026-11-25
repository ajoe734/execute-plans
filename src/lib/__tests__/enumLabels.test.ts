import { describe, expect, it } from "vitest";

import i18n from "@/i18n";
import enUS from "@/i18n/locales/en-US";
import zhTW from "@/i18n/locales/zh-TW";
import {
  BFF_ACTION_VALUES,
  BFF_DEPLOYMENT_STATUS_VALUES,
  BFF_INCIDENT_STATUS_VALUES,
  BFF_JOB_STATUS_VALUES,
  BFF_LINEAGE_EDGE_TYPES,
  BFF_LINEAGE_NODE_TYPES,
  BFF_MEETING_STATUS_VALUES,
  BFF_OUTCOME_VALUES,
  BFF_REASON_CODES,
  BFF_RISK_VALUES,
  BFF_STATUS_VALUES,
  GOVERNANCE_DECISION_STATES,
  actionLabel,
  deriveGovernanceDecisionState,
  governanceDecisionStateLabel,
  isNanLike,
  isTranslationKeyLike,
  lineageEdgeLabel,
  lineageNodeTypeLabel,
  normalizeStrategyOperationalStatus,
  notReportedLabel,
  outcomeLabel,
  postmortemStatusLabel,
  reasonCodeDisplay,
  rebalanceWorkflowLabel,
  resolveEnumLabel,
  resolveLineageNodeLabel,
  riskLabel,
  shortLineageNodeId,
  statusBadgeClass,
  statusLabel,
  strategyOperationalStatusClass,
} from "../enumLabels";

const tZh = i18n.getFixedT("zh-TW");
const tEn = i18n.getFixedT("en-US");

describe("enumLabels shared BFF enum localization helper (FE-MGMT-LABELS-AND-RAW-VALUES-20261120)", () => {
  it("provides zh-TW and en-US labels for every Job, Incident, Deployment, and Meeting status value", () => {
    const groups = {
      job: BFF_JOB_STATUS_VALUES,
      incident: BFF_INCIDENT_STATUS_VALUES,
      deployment: BFF_DEPLOYMENT_STATUS_VALUES,
      meeting: BFF_MEETING_STATUS_VALUES,
      allStatuses: BFF_STATUS_VALUES,
    };

    for (const [groupName, values] of Object.entries(groups)) {
      for (const status of values) {
        expect(
          (zhTW.status as Record<string, string>)[status],
          `zh-TW status.${status} (${groupName})`,
        ).toBeTruthy();
        expect(
          (enUS.status as Record<string, string>)[status],
          `en-US status.${status} (${groupName})`,
        ).toBeTruthy();

        const zhResolved = resolveEnumLabel("status", status, tZh);
        const enResolved = resolveEnumLabel("status", status, tEn);

        expect(zhResolved.isKnown, `isKnown for ${status}`).toBe(true);
        expect(zhResolved.label.trim().length).toBeGreaterThan(0);
        expect(enResolved.label.trim().length).toBeGreaterThan(0);
        expect(isTranslationKeyLike(zhResolved.label), `zh-TW label for ${status} leaked key`).toBe(false);
        expect(isTranslationKeyLike(enResolved.label), `en-US label for ${status} leaked key`).toBe(false);
        expect(zhResolved.label.toLowerCase()).not.toBe("nan");
        expect(enResolved.label.toLowerCase()).not.toBe("nan");
      }
    }
  });

  it("maps resolved incidents to 已解決 / Resolved and never 成功 (coordinator sweep 2026-11-20 BFF fb8ed951d)", () => {
    expect(statusLabel("resolved", tZh)).toBe("已解決");
    expect(statusLabel("resolved", tZh)).not.toBe("成功");
    expect(statusLabel("resolved", tEn)).toBe("Resolved");
    expect(statusLabel("resolved", tEn)).not.toBe("Success");

    // Coordinator sweep reproduction states: completed, executed, canceled, refused, convened
    expect(statusLabel("completed", tZh)).toBe("已完成");
    expect(statusLabel("executed", tZh)).toBe("已執行");
    expect(statusLabel("canceled", tZh)).toBe("已取消");
    expect(statusLabel("refused", tZh)).toBe("已拒絕召開");
    expect(statusLabel("convened", tZh)).toBe("已召開");

    expect(statusLabel("completed", tEn)).toBe("Completed");
    expect(statusLabel("executed", tEn)).toBe("Executed");
    expect(statusLabel("canceled", tEn)).toBe("Canceled");
    expect(statusLabel("refused", tEn)).toBe("Refused");
    expect(statusLabel("convened", tEn)).toBe("Convened");
  });

  it("provides zh-TW and en-US labels for every BFF outcome, action, risk, reason code, and lineage edge type", () => {
    for (const outcome of BFF_OUTCOME_VALUES) {
      expect((zhTW.enumLabels.outcomes as Record<string, string>)[outcome], `zh-TW outcome ${outcome}`).toBeTruthy();
      expect((enUS.enumLabels.outcomes as Record<string, string>)[outcome], `en-US outcome ${outcome}`).toBeTruthy();
      expect(isTranslationKeyLike(outcomeLabel(outcome, tZh))).toBe(false);
      expect(isTranslationKeyLike(outcomeLabel(outcome, tEn))).toBe(false);
    }

    for (const action of BFF_ACTION_VALUES) {
      expect((zhTW.enumLabels.actions as Record<string, string>)[action], `zh-TW action ${action}`).toBeTruthy();
      expect((enUS.enumLabels.actions as Record<string, string>)[action], `en-US action ${action}`).toBeTruthy();
      expect(isTranslationKeyLike(actionLabel(action, tZh))).toBe(false);
      expect(isTranslationKeyLike(actionLabel(action, tEn))).toBe(false);
    }

    for (const risk of BFF_RISK_VALUES) {
      expect((zhTW.risk as Record<string, string>)[risk], `zh-TW risk ${risk}`).toBeTruthy();
      expect((enUS.risk as Record<string, string>)[risk], `en-US risk ${risk}`).toBeTruthy();
      expect(isTranslationKeyLike(riskLabel(risk, tZh))).toBe(false);
      expect(isTranslationKeyLike(riskLabel(risk, tEn))).toBe(false);
    }

    for (const reason of BFF_REASON_CODES) {
      const i18nKey = reason.replace(/:/g, "__");
      expect((zhTW.enumLabels.reasons as Record<string, string>)[i18nKey], `zh-TW reason ${reason}`).toBeTruthy();
      expect((enUS.enumLabels.reasons as Record<string, string>)[i18nKey], `en-US reason ${reason}`).toBeTruthy();
      const zhReason = reasonCodeDisplay(reason, tZh);
      const enReason = reasonCodeDisplay(reason, tEn);
      expect(zhReason.isKnown, `isKnown reason ${reason}`).toBe(true);
      expect(zhReason.text).not.toBe(reason);
      expect(enReason.text).not.toBe(reason);
      expect(zhReason.code).toBe(reason);
      expect(isTranslationKeyLike(zhReason.text)).toBe(false);
      expect(isTranslationKeyLike(enReason.text)).toBe(false);
    }

    for (const edgeType of BFF_LINEAGE_EDGE_TYPES) {
      expect((zhTW.enumLabels.lineageEdges as Record<string, string>)[edgeType], `zh-TW lineageEdge ${edgeType}`).toBeTruthy();
      expect((enUS.enumLabels.lineageEdges as Record<string, string>)[edgeType], `en-US lineageEdge ${edgeType}`).toBeTruthy();
      expect(isTranslationKeyLike(lineageEdgeLabel(edgeType, tZh))).toBe(false);
      expect(isTranslationKeyLike(lineageEdgeLabel(edgeType, tEn))).toBe(false);
    }

    for (const nodeType of BFF_LINEAGE_NODE_TYPES) {
      expect((zhTW.enumLabels.lineageNodeTypes as Record<string, string>)[nodeType], `zh-TW lineageNodeType ${nodeType}`).toBeTruthy();
      expect((enUS.enumLabels.lineageNodeTypes as Record<string, string>)[nodeType], `en-US lineageNodeType ${nodeType}`).toBeTruthy();
      expect(isTranslationKeyLike(lineageNodeTypeLabel(nodeType, tZh))).toBe(false);
      expect(isTranslationKeyLike(lineageNodeTypeLabel(nodeType, tEn))).toBe(false);
    }
  });

  it("resolves lineage node labels from display_name or falls back to localized plain kind plus short id when name_missing", () => {
    expect(lineageNodeTypeLabel("Strategy", tZh)).toBe("策略");
    expect(lineageNodeTypeLabel("CapitalPool", tZh)).toBe("資金池");
    expect(lineageNodeTypeLabel("CapitalPool", tEn)).toBe("Capital Pool");
    expect(lineageEdgeLabel("source_dataset", tZh)).toBe("來源資料集");
    expect(lineageEdgeLabel("source_dataset", tEn)).toBe("Source Dataset");

    expect(
      resolveLineageNodeLabel(
        {
          id: "persona-ee7112a829d38b9135ac",
          label: "persona-ee7112a829d38b9135ac",
          type: "Persona",
          display_name: "衡岳",
          name_missing: false,
        },
        tZh,
      ),
    ).toBe("衡岳");

    expect(
      resolveLineageNodeLabel(
        {
          id: "artifact-persona-pool-a81b4fd15944698341aa-v2",
          label: "artifact-persona-pool-a81b4fd15944698341aa-v2",
          type: "Artifact",
          display_name: null,
          name_missing: true,
        },
        tZh,
      ),
    ).toBe("產出物 a81b4fd1-v2");

    expect(
      resolveLineageNodeLabel(
        {
          id: "artifact-persona-pool-a81b4fd15944698341aa-v2",
          label: "artifact-persona-pool-a81b4fd15944698341aa-v2",
          type: "Artifact",
          display_name: null,
          name_missing: true,
        },
        tEn,
      ),
    ).toBe("Artifact a81b4fd1-v2");

    expect(shortLineageNodeId("reg-strategy-spec-persona-baseline-a81b4fd15944698341aa")).toBe("baseline-a81b4fd1");
    expect(tZh("lineage.empty")).toBe("尚無血緣資料。");
    expect(tEn("lineage.empty")).toBe("No lineage available.");
    expect(tZh("lineageExplorer.unavailable")).toBe("血緣服務不可用。");
    expect(tEn("lineageExplorer.unavailable")).toBe("Lineage surface unavailable.");
  });

  it("formats persona fleet, LLM provider auth, and meeting reason codes into plain-language text with secondary code", () => {
    const fleetReason = reasonCodeDisplay("tool_record_unavailable:no_proposal_submitted", tZh);
    expect(fleetReason.text).toBe("無法取得工具執行紀錄：未提交提案");
    expect(fleetReason.code).toBe("tool_record_unavailable:no_proposal_submitted");

    const codexMountReason = reasonCodeDisplay("codex_mount_missing_credentials", tZh);
    expect(codexMountReason.text).toBe("Codex CLI 憑證掛載缺失");
    expect(codexMountReason.code).toBe("codex_mount_missing_credentials");

    const meetingRefusal = reasonCodeDisplay("insufficient_participants", tZh);
    expect(meetingRefusal.text).toBe("合格參與人數不足，無法召開會議");
    expect(meetingRefusal.code).toBe("insufficient_participants");
  });

  it("never renders nan and provides 未回報 / Not reported for missing values", () => {
    expect(isNanLike("nan")).toBe(true);
    expect(isNanLike("NaN")).toBe(true);
    expect(isNanLike(Number.NaN)).toBe(true);
    expect(statusLabel("nan", tZh)).toBe("—");
    expect(notReportedLabel(tZh)).toBe("未回報");
    expect(notReportedLabel(tEn)).toBe("Not reported");
  });

  it("detects leaked translation keys and verifies capabilities.actions.disabledReason is translated in both locales", () => {
    expect(isTranslationKeyLike("capabilities.actions.disabledReason")).toBe(true);
    expect(isTranslationKeyLike("status.completed")).toBe(true);
    expect(isTranslationKeyLike("此能力目錄為唯讀")).toBe(false);
    expect(isTranslationKeyLike("This capability registry is read-only")).toBe(false);

    const zhDisabled = tZh("capabilities.actions.disabledReason");
    const enDisabled = tEn("capabilities.actions.disabledReason");
    expect(isTranslationKeyLike(zhDisabled)).toBe(false);
    expect(isTranslationKeyLike(enDisabled)).toBe(false);
    expect(zhDisabled).toContain("唯讀");
    expect(enDisabled).toContain("read-only");
  });

  it("folds PostmortemLibrary, governanceDecisionState, and Lists status maps into the shared helper", () => {
    expect(postmortemStatusLabel("draft", tZh)).toBe(tZh("postmortem.status.draft"));
    expect(postmortemStatusLabel("published", tEn)).toBe(tEn("postmortem.status.published"));

    for (const state of GOVERNANCE_DECISION_STATES) {
      expect(governanceDecisionStateLabel(state, tZh)).toBeTruthy();
      expect(governanceDecisionStateLabel(state, tEn)).toBeTruthy();
    }
    expect(deriveGovernanceDecisionState({ status: "approved", canProceed: true })).toBe("approval");
    expect(deriveGovernanceDecisionState({ status: "review", canProceed: false, blockingReasons: ["x"] })).toBe("blocked");

    expect(rebalanceWorkflowLabel("draft", tZh)).toBe("建議");
    expect(rebalanceWorkflowLabel("deployed", tEn)).toBe("Applied");
    expect(normalizeStrategyOperationalStatus("RUNNING")).toBe("running");
    expect(strategyOperationalStatusClass("running")).toContain("text-status-success");
    expect(statusBadgeClass("resolved")).toContain("text-accent");
  });
});
