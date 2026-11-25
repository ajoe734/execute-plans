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
  STRATEGY_RUNTIME_STATUSES,
  REGISTRY_LIST_SCOPES,
  KNOWN_PERSONA_ARCHETYPES,
  artifactKindText,
  artifactSourceText,
  normalizeRegistryListScope,
  normalizeStrategyRuntimeStatus,
  personaArchetypeText,
  shortOwnerText,
  strategyMetricsReasonText,
  strategyRuntimeReasonText,
  strategyRuntimeStatusClass,
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

describe("FE-REGISTRY-LISTS-CURRENT-FIRST-20261125 runtime status, metric reason, list scope and artifact words", () => {
  it("normalizes runtimeStatus and never invents one when the field is absent", () => {
    expect(normalizeStrategyRuntimeStatus(undefined)).toBeUndefined();
    expect(normalizeStrategyRuntimeStatus(null)).toBeUndefined();
    expect(normalizeStrategyRuntimeStatus("")).toBeUndefined();
    for (const status of STRATEGY_RUNTIME_STATUSES) {
      expect(normalizeStrategyRuntimeStatus(status.toUpperCase())).toBe(status);
      expect(tEn(`strategy.runtimeStatus.${status}`)).not.toContain("strategy.runtimeStatus");
      expect(tZh(`strategy.runtimeStatus.${status}`)).not.toContain("strategy.runtimeStatus");
    }
    // An unrecognised value is "unknown", never running.
    expect(normalizeStrategyRuntimeStatus("idle")).toBe("unknown");
    expect(strategyRuntimeStatusClass("running")).toContain("text-status-success");
    expect(strategyRuntimeStatusClass("paused_market_input")).toContain("text-status-warning");
  });

  it("turns recorded reasons into plain sentences in both locales and keeps the raw code", () => {
    expect(strategyRuntimeReasonText(null, tEn)).toBeUndefined();
    const market = strategyRuntimeReasonText("market_input_stale", tEn);
    expect(market).toEqual({ text: "Market data input stopped", code: "market_input_stale" });
    expect(strategyRuntimeReasonText("market_input_stale", tZh)?.text).toContain("行情輸入中斷");
    expect(strategyRuntimeReasonText("binding_status_failed", tEn)?.text).toBe("Binding status: failed");
    expect(strategyRuntimeReasonText("something_new", tEn)).toEqual({ text: "Recorded reason", code: "something_new" });

    expect(strategyMetricsReasonText(null, tEn)).toBeUndefined();
    expect(strategyMetricsReasonText("no_fills", tEn)).toEqual({ text: "No fills yet", code: "no_fills" });
    expect(strategyMetricsReasonText("no_fills", tZh)?.text).toBe("尚無成交");
    expect(strategyMetricsReasonText("marks_unavailable", tEn)?.text).toBe("Market prices unavailable");
    expect(strategyMetricsReasonText("brand_new_reason", tEn)).toEqual({ text: "Not recorded", code: "brand_new_reason" });
  });

  it("reads listScope / list_scope and treats anything else as unknown", () => {
    expect(normalizeRegistryListScope({ listScope: "test" })).toBe("test");
    expect(normalizeRegistryListScope({ list_scope: "Retired" })).toBe("retired");
    expect(normalizeRegistryListScope({ list_scope: "unbound" })).toBe("unbound");
    expect(normalizeRegistryListScope({ list_scope: "unknown" })).toBe("unknown");
    expect(normalizeRegistryListScope({ listScope: "zzz" })).toBe("unknown");
    expect(normalizeRegistryListScope({})).toBe("unknown");
    expect(normalizeRegistryListScope(null)).toBe("unknown");
    expect(REGISTRY_LIST_SCOPES).toContain("research");
  });

  it("gives artifact kind and source as words with the code kept for the tooltip", () => {
    expect(artifactKindText("execution_bundle", tEn)).toEqual({ text: "Execution bundle", code: "execution_bundle" });
    expect(artifactKindText("execution_bundle", tZh)?.text).toBe("執行包");
    expect(artifactKindText("factor_eval_report", tEn)?.text).toBe("Factor evaluation report");
    expect(artifactKindText("some_new_kind", tEn)).toEqual({ text: "Some new kind", code: "some_new_kind" });
    expect(artifactKindText("", tEn)).toBeUndefined();
    expect(artifactKindText(null, tEn)).toBeUndefined();
    expect(artifactSourceText("registry", tEn)).toEqual({ text: "Registry bundle", code: "registry" });
    expect(artifactSourceText("research_run_output", tZh)).toEqual({ text: "研究產出", code: "research_run_output" });
    expect(artifactSourceText("other_source", tEn)).toEqual({ text: "Other source", code: "other_source" });
    expect(artifactSourceText(undefined, tEn)).toBeUndefined();
  });

  it("has zh-TW and en-US parity for every new registry-list text and no developer wording in create texts", () => {
    const keysOf = (obj: unknown, prefix = ""): string[] =>
      obj && typeof obj === "object"
        ? Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k))
        : [prefix];
    const pick = (locale: any) => ({
      registryLists: locale.registryLists,
      runtimeStatus: locale.strategy.runtimeStatus,
      runtimeReason: locale.strategy.runtimeReason,
      metricsReason: locale.strategy.metricsReason,
      kindLabel: locale.artifact.kindLabel,
      listColumn: locale.strategy.list.column,
      listExtras: {
        asOf: locale.strategy.list.asOf,
        personaIdsTooltip: locale.strategy.list.personaIdsTooltip,
        noPersona: locale.strategy.list.noPersona,
        draftNotice: locale.strategy.list.draftNotice,
        hiddenTestBreakdown: locale.strategy.list.hiddenTestBreakdown,
      },
    });
    expect(keysOf(pick(zhTW)).sort()).toEqual(keysOf(pick(enUS)).sort());
    const developerWording = /typed durable|BFF owner|generic CRUD|OpenClaw|SOUL|archetype field|slug/i;
    for (const locale of [enUS, zhTW] as any[]) {
      const texts = [
        locale.entityCreate.footerNote,
        locale.entityCreate.hint.mandate,
        locale.entityCreate.hint.archetype,
        locale.entityCreate.hint.alpha,
        locale.entityCreate.field.alpha,
        locale.entityCreate.error.slugFormat,
        locale.registryLists.create.paperPersona,
        locale.registryLists.create.disabledNoOwner,
      ];
      for (const text of texts) expect(text).not.toMatch(developerWording);
    }
  });

  it("FE-PERSONA-LIST-PLAIN-WORDS-20261125: maps recorded persona archetype codes to zh-TW and en-US words with code tooltip, keeps unknown codes as-is, flags sentences, and strips shared pantheon-dev- owner prefix", () => {
    expect(KNOWN_PERSONA_ARCHETYPES).toEqual(["momentum", "generalist", "agora_servant"]);
    expect(personaArchetypeText("momentum", tEn)).toEqual({
      text: "Momentum",
      tooltip: "momentum",
      code: "momentum",
      isSentence: false,
      isKnown: true,
    });
    expect(personaArchetypeText("momentum", tZh)?.text).toBe("動能");
    expect(personaArchetypeText("generalist", tEn)?.text).toBe("Generalist");
    expect(personaArchetypeText("generalist", tZh)?.text).toBe("通用");
    expect(personaArchetypeText("agora_servant", tEn)).toEqual({
      text: "Agora servant",
      tooltip: "agora_servant",
      code: "agora_servant",
      isSentence: false,
      isKnown: true,
    });
    expect(personaArchetypeText("agora_servant", tZh)?.text).toBe("交易僕人");

    // Unknown code is shown as it is (never humanized).
    expect(personaArchetypeText("mean_reversion", tEn)).toEqual({
      text: "mean_reversion",
      tooltip: "mean_reversion",
      code: "mean_reversion",
      isSentence: false,
      isKnown: false,
    });
    expect(personaArchetypeText("mean_reversion", tZh)?.text).toBe("mean_reversion");

    // Recorded Risk Officer and Red Team sentences.
    const riskSentence =
      "Independent risk reviewer. Never trades. Reviews trial admission, envelope publication and every harness patch; may veto.";
    expect(personaArchetypeText(riskSentence, tEn)).toEqual({
      text: riskSentence,
      tooltip: riskSentence,
      isSentence: true,
      isKnown: false,
    });
    expect(personaArchetypeText("", tEn)).toBeUndefined();
    expect(personaArchetypeText(null, tEn)).toBeUndefined();

    // Owner prefix stripping.
    expect(shortOwnerText("pantheon-dev-admin-test")).toEqual({
      text: "admin-test",
      full: "pantheon-dev-admin-test",
    });
    expect(shortOwnerText("pantheon-dev-operator-a")).toEqual({
      text: "operator-a",
      full: "pantheon-dev-operator-a",
    });
    expect(shortOwnerText("pantheon-dev-operator-b")).toEqual({
      text: "operator-b",
      full: "pantheon-dev-operator-b",
    });
    expect(shortOwnerText("pantheon-dev-paper-provisioner")).toEqual({
      text: "paper-provisioner",
      full: "pantheon-dev-paper-provisioner",
    });
    expect(shortOwnerText("operator-bff")).toEqual({
      text: "operator-bff",
      full: "operator-bff",
    });
    expect(shortOwnerText("")).toBeUndefined();
    expect(shortOwnerText(null)).toBeUndefined();
  });
});
