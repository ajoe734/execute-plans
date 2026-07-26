import type { StrategyCompleteness } from "@/lib/bff-v1/agora/types";
import type {
  WorkshopCard,
  WorkshopCompleteness,
} from "@/lib/bff-v1/agora/workshops";

export interface WorkshopCompletenessDisplay {
  completeness_id?: string;
  strategy_ref?: string;
  workshop_id?: string;
  assessed_by_persona_id?: string;
  overall_grade: StrategyCompleteness["overall_grade"];
  dimensions: Array<{
    dimension: string;
    grade: "complete" | "partial" | "missing";
    gaps?: string[];
    required_actions?: string[];
  }>;
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
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item];
    const record = recordFrom(item);
    const summary = optionalText(record.reason) ?? optionalText(record.field);
    return summary ? [summary] : [];
  });
}

function dimensionGrade(value: unknown): "complete" | "partial" | "missing" {
  if (value === "confirmed" || value === "complete" || value === "satisfied") return "complete";
  if (
    value === "partial"
    || value === "weak"
    || value === "conflicting"
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
      grade: dimensionGrade(record[gradeKey]),
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

/**
 * Builds the single completeness view consumed by the workshop rail.
 *
 * The matching, server-derived completeness_update card is authoritative when
 * present because it uses the same grading policy as the visible card. A
 * canonical StrategyCompleteness payload remains a compatibility fallback.
 * Raw snapshots without either source stay unassessed rather than emitting an
 * undefined percentage.
 */
export function materializeWorkshopCompleteness(
  completeness: WorkshopCompleteness | null,
  completenessCard?: WorkshopCard | null,
): WorkshopCompletenessDisplay | null {
  const record = recordFrom(completeness);
  const card = matchingCompletenessCard(record, completenessCard);
  const cardPayload = card ? recordFrom(card.payload) : {};
  const overallGrade = completenessGrade(cardPayload.overall_grade)
    ?? completenessGrade(record.overall_grade);
  if (!overallGrade) return null;

  const cardDimensions = completenessDimensions(cardPayload.dimension_updates, "current_grade");
  const canonicalDimensions = completenessDimensions(record.dimensions, "grade");
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
    dimensions: cardDimensions.length > 0 ? cardDimensions : canonicalDimensions,
    metadata: recordFrom(record.metadata),
    overall_grade: overallGrade,
    research_ready: optionalBoolean(cardPayload.research_ready)
      ?? optionalBoolean(record.research_ready),
    strategy_ref: optionalText(record.strategy_ref)
      ?? optionalText(record.strategy_version_id)
      ?? optionalText(card?.strategy_spec_registry_id),
    workshop_id: optionalText(record.workshop_id) ?? optionalText(card?.workshop_id),
  };
}
