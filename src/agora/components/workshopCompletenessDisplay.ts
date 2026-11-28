import type { StrategyCompleteness } from "@/lib/bff-v1/agora/types";
import type {
  WorkshopBlockCitation,
  WorkshopCard,
  WorkshopCompleteness,
  WorkshopDecisionOption,
  WorkshopNextDecision,
  WorkshopServantDefault,
  WorkshopStrategyBlock,
  WorkshopV10BlockId,
  WorkshopV10BlockState,
} from "@/lib/bff-v1/agora/workshops";

export interface WorkshopCompletenessDisplay {
  completeness_id?: string;
  strategy_ref?: string;
  workshop_id?: string;
  assessed_by_persona_id?: string;
  overall_grade: StrategyCompleteness["overall_grade"];
  strategy_family?: "winner_branch" | "generic";
  is_branch_strategy?: boolean;
  dimensions: Array<{
    dimension: string;
    grade: "complete" | "partial" | "missing";
    gaps?: string[];
    required_actions?: string[];
  }>;
  twelve_blocks: WorkshopStrategyBlock[];
  next_decision: WorkshopNextDecision | null;
  blockers: string[];
  research_ready?: boolean;
  assessed_at?: string;
  metadata?: Record<string, unknown>;
}

const COMPLETENESS_GRADES = new Set<StrategyCompleteness["overall_grade"]>([
  "complete",
  "mostly_complete",
  "partial",
  "incomplete",
]);

const V10_BLOCK_STATES = new Set<WorkshopV10BlockState>([
  "confirmed",
  "inferred",
  "missing",
  "weak",
  "conflict",
]);

const STATE_LABEL_ZH: Record<WorkshopV10BlockState, WorkshopStrategyBlock["state_label_zh"]> = {
  confirmed: "已確認",
  inferred: "助理推定",
  missing: "尚缺",
  weak: "薄弱",
  conflict: "衝突",
};

interface CanonicalV10BlockDef {
  order: number;
  v10_block_id: WorkshopV10BlockId;
  strategy_map_key: string;
  mapped_dimension: string;
  branch_title: string;
  generic_title: string;
  label_en: string;
  legacy_aliases: string[];
}

export const V10_TWELVE_BLOCK_DEFS: ReadonlyArray<CanonicalV10BlockDef> = [
  {
    order: 1,
    v10_block_id: "market_scope",
    strategy_map_key: "universe",
    mapped_dimension: "market_scope",
    branch_title: "研究對象與市場範圍",
    generic_title: "研究對象與市場範圍",
    label_en: "Market Scope",
    legacy_aliases: ["universe", "universe_rule", "market_scope"],
  },
  {
    order: 2,
    v10_block_id: "insider_branch_mapping",
    strategy_map_key: "data_requirements",
    mapped_dimension: "data_dependencies",
    branch_title: "關係人與分點映射",
    generic_title: "核心資料與特徵映射",
    label_en: "Related-Party & Branch Mapping",
    legacy_aliases: ["data_requirements", "data_pit", "data_dependencies", "insider_branch_mapping"],
  },
  {
    order: 3,
    v10_block_id: "winner_branch_scoring",
    strategy_map_key: "hypothesis",
    mapped_dimension: "hypothesis",
    branch_title: "贏家分點評分",
    generic_title: "核心假說與因子評分",
    label_en: "Winner-Branch Scoring",
    legacy_aliases: ["hypothesis", "winner_branch_scoring"],
  },
  {
    order: 4,
    v10_block_id: "migration_reverse_flow",
    strategy_map_key: "regime_invalidation",
    mapped_dimension: "risk_constraints",
    branch_title: "分點遷移與反向流",
    generic_title: "結構遷移與失效條件",
    label_en: "Branch Migration & Reverse Flow",
    legacy_aliases: ["regime_invalidation", "migration_reverse_flow"],
  },
  {
    order: 5,
    v10_block_id: "event_lead",
    strategy_map_key: "governance_constraints",
    mapped_dimension: "governance",
    branch_title: "事件領先關聯",
    generic_title: "事件催化與治理邊界",
    label_en: "Event Lead",
    legacy_aliases: ["governance_constraints", "governance", "event_lead"],
  },
  {
    order: 6,
    v10_block_id: "signal_formation",
    strategy_map_key: "signal_definition",
    mapped_dimension: "hypothesis",
    branch_title: "信號形成",
    generic_title: "信號形成與觸發定義",
    label_en: "Signal Formation",
    legacy_aliases: ["signal_definition", "entry_signal", "signal_formation"],
  },
  {
    order: 7,
    v10_block_id: "entry_holding",
    strategy_map_key: "entry_rules",
    mapped_dimension: "execution_profile",
    branch_title: "進場與持有週期",
    generic_title: "進場與持有週期",
    label_en: "Entry & Holding",
    legacy_aliases: ["entry_rules", "execution_profile", "entry_holding"],
  },
  {
    order: 8,
    v10_block_id: "add_reduce_exit",
    strategy_map_key: "exit_rules",
    mapped_dimension: "execution_profile",
    branch_title: "加碼、減碼與出場",
    generic_title: "加碼、減碼與出場",
    label_en: "Add, Reduce & Exit",
    legacy_aliases: ["exit_rules", "exit_invalidation", "add_reduce_exit"],
  },
  {
    order: 9,
    v10_block_id: "sizing_leverage",
    strategy_map_key: "position_sizing",
    mapped_dimension: "risk_constraints",
    branch_title: "部位與槓桿",
    generic_title: "部位與槓桿配置",
    label_en: "Sizing & Leverage",
    legacy_aliases: ["position_sizing", "risk_controls", "risk_constraints", "sizing_leverage"],
  },
  {
    order: 10,
    v10_block_id: "cost_liquidity_capacity",
    strategy_map_key: "cost_liquidity_capacity",
    mapped_dimension: "execution_profile",
    branch_title: "成本、流動性與容量",
    generic_title: "成本、流動性與容量",
    label_en: "Cost, Liquidity & Capacity",
    legacy_aliases: ["cost_liquidity_capacity", "liquidity"],
  },
  {
    order: 11,
    v10_block_id: "validation_backtest_refutation",
    strategy_map_key: "validation_plan",
    mapped_dimension: "evaluation_plan",
    branch_title: "驗證、回測與反證",
    generic_title: "驗證、回測與反證",
    label_en: "Validation, Backtest & Refutation",
    legacy_aliases: ["validation_plan", "evaluation_plan", "validation_backtest_refutation"],
  },
  {
    order: 12,
    v10_block_id: "monitoring_update",
    strategy_map_key: "risk_controls",
    mapped_dimension: "governance",
    branch_title: "監控與策略更新",
    generic_title: "監控與策略更新",
    label_en: "Monitoring & Update",
    legacy_aliases: ["monitoring_update", "risk_controls", "governance"],
  },
];

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function completenessGrade(value: unknown): StrategyCompleteness["overall_grade"] | undefined {
  return typeof value === "string" && COMPLETENESS_GRADES.has(value as StrategyCompleteness["overall_grade"])
    ? (value as StrategyCompleteness["overall_grade"])
    : undefined;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    const record = recordFrom(item);
    const summary = optionalText(record.reason) ?? optionalText(record.field);
    return summary ? [summary] : [];
  });
}

function normalizeV10BlockState(value: unknown): WorkshopV10BlockState {
  const raw = optionalText(value)?.toLowerCase();
  if (!raw) return "missing";
  if (V10_BLOCK_STATES.has(raw as WorkshopV10BlockState)) {
    return raw as WorkshopV10BlockState;
  }
  if (raw === "complete" || raw === "satisfied") return "confirmed";
  if (raw === "inferred_needs_confirmation" || raw === "provisional") return "inferred";
  if (raw === "conflicting" || raw === "contradiction") return "conflict";
  if (raw === "partial") return "weak";
  return "missing";
}

function defaultNoteForState(state: WorkshopV10BlockState, title: string): string {
  switch (state) {
    case "confirmed":
      return `已由交易員對話確認「${title}」定義。`;
    case "inferred":
      return `助理已依現有策略描述推定「${title}」暫定規則，待交易員確認。`;
    case "weak":
      return `「${title}」僅有初步方向，統計檢驗或邊界條件仍偏薄弱。`;
    case "conflict":
      return `「${title}」存在前後條件或時點衝突，需交易員裁示。`;
    case "missing":
    default:
      return `尚未定義「${title}」，可在對話或下一個高價值決策補充。`;
  }
}

function normalizeCitations(value: unknown): WorkshopBlockCitation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const rec = recordFrom(item);
    const refType = optionalText(rec.ref_type) ?? "event";
    const refId = optionalText(rec.ref_id);
    if (!refId) return [];
    return [{
      ref_type: refType,
      ref_id: refId,
      message_number: typeof rec.message_number === "number" ? rec.message_number : undefined,
      sequence_no: typeof rec.sequence_no === "number" ? rec.sequence_no : undefined,
      decision_id: optionalText(rec.decision_id) ?? null,
      option_id: optionalText(rec.option_id) ?? null,
      summary: optionalText(rec.summary),
    }];
  });
}

function normalizeExplicitBlocks(rawBlocks: unknown, isBranch: boolean): WorkshopStrategyBlock[] {
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) return [];
  const byId = new Map<string, WorkshopStrategyBlock>();
  const usedOrder = new Set<number>();

  rawBlocks.forEach((raw, idx) => {
    const rec = recordFrom(raw);
    const def = V10_TWELVE_BLOCK_DEFS[idx] ?? V10_TWELVE_BLOCK_DEFS[0];
    const explicitId = optionalText(rec.block_id) ?? optionalText(rec.v10_block_id) ?? optionalText(rec.block_key);
    const matchedDef =
      V10_TWELVE_BLOCK_DEFS.find(
        (d) =>
          d.v10_block_id === explicitId ||
          d.strategy_map_key === explicitId ||
          d.legacy_aliases.includes(explicitId ?? ""),
      ) ?? def;
    const blockId = (explicitId ?? matchedDef.v10_block_id) as WorkshopV10BlockId;
    const state = normalizeV10BlockState(rec.state ?? rec.status ?? rec.grade ?? rec.current_grade);
    const defaultTitle = isBranch ? matchedDef.branch_title : matchedDef.generic_title;
    const title =
      optionalText(rec.title_zh)
      ?? optionalText(rec.title)
      ?? optionalText(rec.name)
      ?? optionalText(rec.block_name)
      ?? defaultTitle;
    const note = optionalText(rec.note) ?? optionalText(rec.summary) ?? defaultNoteForState(state, title);
    const citations = normalizeCitations(rec.source_citations ?? rec.citations);
    const order = typeof rec.order === "number" ? rec.order : matchedDef.order;
    usedOrder.add(order);
    byId.set(blockId, {
      order,
      block_id: blockId,
      block_key: optionalText(rec.block_key) ?? blockId,
      block_name: optionalText(rec.block_name) ?? title,
      v10_block_id: matchedDef.v10_block_id,
      strategy_map_key: optionalText(rec.strategy_map_key) ?? matchedDef.strategy_map_key,
      mapped_dimension: optionalText(rec.mapped_dimension) ?? matchedDef.mapped_dimension,
      name: optionalText(rec.name) ?? title,
      title,
      title_zh: title,
      label_en: optionalText(rec.label_en) ?? matchedDef.label_en,
      state,
      state_label_zh: STATE_LABEL_ZH[state],
      note,
      summary: optionalText(rec.summary) ?? note,
      missing_definitions: stringItems(rec.missing_definitions),
      source_citations: citations,
      citations,
    });
  });

  for (const def of V10_TWELVE_BLOCK_DEFS) {
    if (!byId.has(def.v10_block_id) && !usedOrder.has(def.order)) {
      const title = isBranch ? def.branch_title : def.generic_title;
      const note = defaultNoteForState("missing", title);
      byId.set(def.v10_block_id, {
        order: def.order,
        block_id: def.v10_block_id,
        block_key: def.v10_block_id,
        block_name: title,
        v10_block_id: def.v10_block_id,
        strategy_map_key: def.strategy_map_key,
        mapped_dimension: def.mapped_dimension,
        name: title,
        title,
        title_zh: title,
        label_en: def.label_en,
        state: "missing",
        state_label_zh: STATE_LABEL_ZH.missing,
        note,
        summary: note,
        missing_definitions: [],
        source_citations: [],
        citations: [],
      });
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.order - b.order);
}

function projectFallbackTwelveBlocks(
  stateMap: Record<string, unknown>,
  dimensions: WorkshopCompletenessDisplay["dimensions"],
  isBranch: boolean,
): WorkshopStrategyBlock[] {
  const dimByName = new Map(dimensions.map((d) => [d.dimension, d]));
  const hasStateMap = Object.keys(stateMap).length > 0;
  const hasDimensions = dimensions.length > 0;
  if (!hasStateMap && !hasDimensions) return [];

  return V10_TWELVE_BLOCK_DEFS.map((def) => {
    const title = isBranch ? def.branch_title : def.generic_title;
    let rawEntry: unknown;
    for (const key of [def.v10_block_id, def.strategy_map_key, ...def.legacy_aliases]) {
      if (key in stateMap) {
        rawEntry = stateMap[key];
        break;
      }
    }
    let state: WorkshopV10BlockState = "missing";
    let note = "";
    let missingDefs: string[] = [];

    if (rawEntry !== undefined) {
      if (typeof rawEntry === "string") {
        state = normalizeV10BlockState(rawEntry);
      } else {
        const entryRec = recordFrom(rawEntry);
        state = normalizeV10BlockState(entryRec.state ?? entryRec.status ?? entryRec.grade);
        note = optionalText(entryRec.note) ?? optionalText(entryRec.summary) ?? "";
        missingDefs = stringItems(entryRec.missing_definitions);
      }
    } else {
      const mappedDim = dimByName.get(def.mapped_dimension);
      if (mappedDim) {
        state = normalizeV10BlockState(mappedDim.grade);
        if (mappedDim.gaps && mappedDim.gaps.length > 0) {
          missingDefs = mappedDim.gaps;
        }
      }
    }
    if (!note) {
      note = defaultNoteForState(state, title);
    }

    return {
      order: def.order,
      block_id: def.v10_block_id,
      block_key: def.v10_block_id,
      block_name: title,
      v10_block_id: def.v10_block_id,
      strategy_map_key: def.strategy_map_key,
      mapped_dimension: def.mapped_dimension,
      name: title,
      title,
      title_zh: title,
      label_en: def.label_en,
      state,
      state_label_zh: STATE_LABEL_ZH[state],
      note,
      summary: note,
      missing_definitions: missingDefs,
      source_citations: [],
      citations: [],
    };
  });
}

function normalizeDecisionOptions(rawOptions: unknown, rawAnswerOptions: unknown, defaultOptionId?: string | null): WorkshopDecisionOption[] {
  if (Array.isArray(rawOptions) && rawOptions.length > 0) {
    const mapped = rawOptions.flatMap((item, index) => {
      if (typeof item === "string" && item.trim()) {
        const text = item.trim();
        const optionId = String.fromCharCode(65 + index);
        return [{
          option_id: optionId,
          id: optionId,
          label: text,
          text,
          description: null,
          is_default: defaultOptionId ? optionId === defaultOptionId : index === 0,
        }];
      }
      const rec = recordFrom(item);
      const optionId = optionalText(rec.option_id) ?? optionalText(rec.id) ?? String.fromCharCode(65 + index);
      const label = optionalText(rec.label) ?? optionalText(rec.text);
      if (!label) return [];
      return [{
        option_id: optionId,
        id: optionalText(rec.id) ?? optionId,
        label,
        text: optionalText(rec.text) ?? label,
        summary: optionalText(rec.summary) ?? optionalText(rec.description) ?? undefined,
        description: optionalText(rec.description) ?? optionalText(rec.summary) ?? null,
        is_default: typeof rec.is_default === "boolean"
          ? rec.is_default
          : defaultOptionId
            ? optionId === defaultOptionId
            : false,
      }];
    });
    if (mapped.length > 0) return mapped;
  }

  const answerStrings = stringItems(rawAnswerOptions);
  return answerStrings.map((raw, index) => {
    const match = raw.match(/^([A-D])[.、:：\s]+(.+)$/i);
    const optionId = match ? match[1].toUpperCase() : String.fromCharCode(65 + index);
    const label = match ? match[2].trim() : raw;
    return {
      option_id: optionId,
      id: optionId,
      label,
      text: raw,
      summary: undefined,
      description: null,
      is_default: defaultOptionId ? optionId === defaultOptionId : false,
    };
  });
}

export function normalizeNextDecision(raw: unknown): WorkshopNextDecision | null {
  const rec = recordFrom(raw);
  const question = optionalText(rec.question) ?? optionalText(rec.text) ?? optionalText(rec.prompt);
  const whyNow =
    optionalText(rec.why_high_value)
    ?? optionalText(rec.why_now)
    ?? optionalText(rec.why_it_matters)
    ?? optionalText(rec.reason)
    ?? "";
  const scoreTotal = typeof rec.score_total === "number"
    ? rec.score_total
    : typeof rec.score === "number"
      ? rec.score
      : undefined;
  if (!question && !whyNow && scoreTotal === undefined) return null;

  const questionId = optionalText(rec.question_id) ?? optionalText(rec.id) ?? optionalText(rec.decision_id) ?? "next_decision";
  const decisionId = optionalText(rec.decision_id) ?? questionId;
  const servantDefaultRec = recordFrom(rec.servant_default);
  const servantDefault: WorkshopServantDefault | null =
    optionalText(servantDefaultRec.option_id) && optionalText(servantDefaultRec.label)
      ? {
          option_id: optionalText(servantDefaultRec.option_id)!,
          label: optionalText(servantDefaultRec.label)!,
          summary: optionalText(servantDefaultRec.summary) ?? optionalText(servantDefaultRec.label)!,
          provisional_assumption: optionalText(servantDefaultRec.provisional_assumption),
        }
      : null;
  const defaultOptionId = optionalText(rec.default_option_id) ?? servantDefault?.option_id ?? null;
  const options = normalizeDecisionOptions(rec.options, rec.answer_options, defaultOptionId);
  const resolves = stringItems(rec.resolves);
  const targetBlocks = stringItems(rec.target_blocks ?? rec.impacted_blocks);

  return {
    decision_id: decisionId,
    question_id: questionId,
    question: question ?? "",
    text: optionalText(rec.text) ?? question ?? "",
    why_now: whyNow,
    why_high_value: whyNow || undefined,
    why_it_matters: optionalText(rec.why_it_matters) ?? (whyNow || undefined),
    resolves: resolves.length > 0 ? resolves : targetBlocks,
    target_blocks: targetBlocks.length > 0 ? targetBlocks : resolves,
    impacted_blocks: targetBlocks.length > 0 ? targetBlocks : resolves,
    options,
    answer_options: stringItems(rec.answer_options),
    default_option_id: defaultOptionId,
    servant_default: servantDefault,
    score_total: scoreTotal,
    freeform_allowed: typeof rec.freeform_allowed === "boolean" ? rec.freeform_allowed : true,
    defer_allowed: typeof rec.defer_allowed === "boolean" ? rec.defer_allowed : true,
  };
}

function dimensionGrade(value: unknown): "complete" | "partial" | "missing" {
  if (value === "confirmed" || value === "complete" || value === "satisfied") return "complete";
  if (
    value === "partial"
    || value === "weak"
    || value === "conflicting"
    || value === "conflict"
    || value === "inferred"
    || value === "inferred_needs_confirmation"
  ) {
    return "partial";
  }
  return "missing";
}

function completenessDimensions(
  value: unknown,
  gradeKey: "grade" | "current_grade",
): WorkshopCompletenessDisplay["dimensions"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = recordFrom(item);
    const dimension = optionalText(record.dimension);
    if (!dimension) return [];
    return [{
      dimension,
      gaps: stringItems(record.gaps),
      grade: dimensionGrade(record[gradeKey] ?? record.grade ?? record.current_grade ?? record.state),
      required_actions: stringItems(record.required_actions),
    }];
  });
}

function matchingCompletenessCard(
  completeness: Record<string, unknown>,
  card?: WorkshopCard | null,
): WorkshopCard | null {
  if (!card || card.card_type !== "completeness_update") return null;

  const snapshotWorkshopId = optionalText(completeness.workshop_id);
  if (snapshotWorkshopId && card.workshop_id !== snapshotWorkshopId) return null;

  const snapshotId = optionalText(completeness.snapshot_id);
  if (snapshotId && card.card_id !== `card_completeness_${snapshotId}`) return null;

  const snapshotVersionId = optionalText(completeness.strategy_version_id);
  if (snapshotVersionId && card.workshop_version_id && card.workshop_version_id !== snapshotVersionId) {
    return null;
  }
  return card;
}

function gradeFromTwelveBlocks(blocks: WorkshopStrategyBlock[]): StrategyCompleteness["overall_grade"] | undefined {
  if (blocks.length === 0) return undefined;
  const confirmedOrInferred = blocks.filter((b) => b.state === "confirmed" || b.state === "inferred").length;
  const conflictCount = blocks.filter((b) => b.state === "conflict").length;
  if (confirmedOrInferred === blocks.length && conflictCount === 0) return "complete";
  if (confirmedOrInferred >= 9 && conflictCount === 0) return "mostly_complete";
  if (confirmedOrInferred >= 3 || blocks.some((b) => b.state === "weak")) return "partial";
  return "incomplete";
}

/**
 * Builds the single completeness view consumed by the workshop rail.
 *
 * The matching, server-derived completeness_update card is authoritative when
 * present because it uses the same grading policy as the visible card. A
 * canonical StrategyCompleteness payload or twelve-block projection remains a
 * compatibility fallback. Raw snapshots without either source stay unassessed
 * rather than emitting an undefined percentage.
 */
export function materializeWorkshopCompleteness(
  completeness: WorkshopCompleteness | null,
  completenessCard?: WorkshopCard | null,
): WorkshopCompletenessDisplay | null {
  const record = recordFrom(completeness);
  const card = matchingCompletenessCard(record, completenessCard);
  if (completenessCard && completenessCard.card_type === "completeness_update" && !card) {
    return null;
  }
  const cardPayload = card ? recordFrom(card.payload) : {};

  const isBranch =
    optionalBoolean(cardPayload.is_branch_strategy)
    ?? optionalBoolean(record.is_branch_strategy)
    ?? (cardPayload.strategy_family === "winner_branch" || record.strategy_family === "winner_branch");
  const strategyFamily: "winner_branch" | "generic" = isBranch ? "winner_branch" : "generic";

  const explicitBlocks = normalizeExplicitBlocks(
    cardPayload.twelve_blocks ?? cardPayload.blocks ?? record.twelve_blocks ?? record.blocks,
    isBranch,
  );

  const cardDimensions = completenessDimensions(cardPayload.dimension_updates, "current_grade");
  const canonicalDimensions = completenessDimensions(record.dimensions, "grade");
  const dimensions = cardDimensions.length > 0 ? cardDimensions : canonicalDimensions;

  const overallGrade = completenessGrade(cardPayload.overall_grade)
    ?? completenessGrade(record.overall_grade)
    ?? gradeFromTwelveBlocks(explicitBlocks);
  if (!overallGrade) return null;

  const stateMap = recordFrom(record.state_map_json);
  const twelveBlocks = explicitBlocks.length > 0
    ? explicitBlocks
    : Object.keys(stateMap).length > 0
      ? projectFallbackTwelveBlocks(stateMap, dimensions, isBranch)
      : [];

  const nextDecision =
    normalizeNextDecision(cardPayload.next_decision)
    ?? normalizeNextDecision(record.next_decision)
    ?? normalizeNextDecision(record.next_question_json);

  const blockers = Array.isArray(cardPayload.blockers)
    ? stringItems(cardPayload.blockers)
    : Array.isArray(record.blockers)
      ? stringItems(record.blockers)
      : stringItems(record.blocking_items_json);

  return {
    assessed_at: optionalText(record.assessed_at)
      ?? optionalText(record.created_at)
      ?? optionalText(card?.created_at),
    assessed_by_persona_id: optionalText(record.assessed_by_persona_id),
    blockers,
    completeness_id: optionalText(record.completeness_id) ?? optionalText(record.snapshot_id),
    dimensions,
    is_branch_strategy: isBranch,
    metadata: recordFrom(record.metadata),
    next_decision: nextDecision,
    overall_grade: overallGrade,
    research_ready: optionalBoolean(cardPayload.research_ready)
      ?? optionalBoolean(record.research_ready),
    strategy_family: strategyFamily,
    strategy_ref: optionalText(record.strategy_ref)
      ?? optionalText(record.strategy_version_id)
      ?? optionalText(card?.strategy_spec_registry_id),
    twelve_blocks: twelveBlocks,
    workshop_id: optionalText(record.workshop_id) ?? optionalText(card?.workshop_id),
  };
}
