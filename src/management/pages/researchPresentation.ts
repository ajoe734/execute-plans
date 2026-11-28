import type { ResearchDemand, ResearchTask, ResearchTaskRun } from "@/lib/bff-v1";
import type { TranslateFn } from "@/lib/enumLabels";

export function isCollectorQueryPlan(task: ResearchTask): boolean {
  return (task.taskType ?? task.task_type) === "collector_query_plan";
}

export function collectorCheckStatus(task: ResearchTask, t: TranslateFn): string {
  if (task.status === "no_change") return t("research.collector.noChange");
  if (task.status === "proposed") return t("research.collector.proposed");
  return t("research.detail.notReported");
}

export const KNOWN_REASON_TOKENS = [
  "mandate_universe_missing",
  "market_boundary_empty",
  "template_integrity_mismatch",
  "run_budget_exhausted",
  "owner_credential_unconfigured",
  "no_external_match",
  "retrain_failed",
  "template_search_unavailable",
] as const;

/**
 * Plain-language text for a recorded search failure code. Codes look like
 * `template_search_unavailable:ValueError:mandate_universe_missing`; the most specific
 * known token wins. The raw code is returned only when the text is generic or unknown,
 * so the page can show it as secondary text.
 */
export function demandReasonText(code: string | null | undefined, t: TranslateFn): { text: string; raw: string | null } | null {
  const raw = code?.trim();
  if (!raw) return null;
  const parts = raw.split(":").map((part) => part.trim());
  const token = [...parts].reverse().find((part) => (KNOWN_REASON_TOKENS as readonly string[]).includes(part));
  if (!token) return { text: t("research.demand.reasonUnknown"), raw };
  const count = parts[parts.indexOf("template_integrity_mismatch") + 1];
  const text = t(`research.demand.reasons.${token}`, {
    count: count && /^\d+$/.test(count) ? Number(count) : t("research.detail.notReported"),
  });
  return { text, raw: token === "template_search_unavailable" ? raw : null };
}

/** Match the BFF reason precedence; rejection.reason is only a generic wrapper. */
export function runReasonCode(run: ResearchTaskRun): string | undefined {
  const rejection = run.rejection;
  const detail = rejection && typeof rejection === "object" && "detail" in rejection ? rejection.detail : undefined;
  return (typeof detail === "string" && detail.trim()) || run.template_search?.reason?.trim() || undefined;
}

export function templateSearchCounts(search: NonNullable<ResearchTaskRun["template_search"]>) {
  const attempted = search.templates_attempted ??
    (search.attempts && Object.keys(search.attempts).length === 0 ? 0 : null);
  const excluded = search.excluded_by_reason ?? (search.excluded ?? []).reduce<Record<string, number>>((counts, row) => {
    const reason = row.reason || "reason_not_recorded";
    counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});
  return { attempted, excluded };
}

export function demandMeasureText(measure: string | null | undefined, t: TranslateFn): string {
  const key = measure?.trim();
  if (!key) return t("research.demand.measureUnknown");
  return t(`research.demand.measures.${key}`, { defaultValue: key });
}

export function isTemplateSearchTask(task: ResearchTask): boolean {
  return Boolean(task.demand) || /^search registered templates for rd-/i.test(task.title?.trim() ?? task.name?.trim() ?? "");
}

export function demandPersonaName(
  demand: Pick<ResearchDemand, "persona_display_name" | "persona_id"> | null | undefined,
  t: TranslateFn,
): string {
  return demand?.persona_display_name?.trim() || demand?.persona_id?.trim() || t("research.demand.personaUnknown");
}

export function researchTitle(task: ResearchTask, t: TranslateFn, demands?: readonly ResearchDemand[]): string {
  if (isTemplateSearchTask(task) && !isCollectorQueryPlan(task)) {
    const demandId = task.demand?.demand_id;
    const joined = demands?.find((d) => d.demand_id === demandId);
    const hasPersona = Boolean(joined?.persona_display_name || task.demand?.persona_id);
    const measure = joined?.short_measure ?? task.demand?.short_measure;
    // Only retitle when the persona and the lacking measure are recorded.
    if (hasPersona && measure) {
      return t("research.demand.searchTitle", {
        persona: demandPersonaName({ persona_display_name: joined?.persona_display_name ?? null, persona_id: task.demand?.persona_id ?? null }, t),
        measure: demandMeasureText(measure, t),
      });
    }
  }

  if (isCollectorQueryPlan(task)) {
    return task.query_plan?.week
      ? t("research.collector.weeklyTitle", { week: task.query_plan.week })
      : t("research.collector.title");
  }

  const type = task.taskType ?? task.task_type ?? "";
  const typeLabel = t(`research.taskTypes.${type}`, { defaultValue: t("research.list.unnamed") });
  const name = task.name?.trim() ?? "";
  const generatedName = !name || task.name_is_fallback_id || name === task.id || name === task.taskId ||
    name.toLowerCase().replace(/ /g, "_") === type ||
    (type === "rapid_eval" && /^rapid evaluation for strategy candidate [a-f0-9]+$/i.test(name));
  if (!generatedName) return name;

  const summary = task.display_summary;
  const symbol = typeof summary === "object" ? summary?.symbol : undefined;
  return symbol ? t("research.list.titleWithSymbol", { type: typeLabel, symbol }) : typeLabel;
}

export function isNonRealRun(adapter?: string, dispatchMode?: string): boolean {
  return [adapter, dispatchMode].some((value) => {
    const mode = value?.trim().toLowerCase();
    return mode === "stub" || mode === "manual";
  });
}
