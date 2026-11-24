import type { ResearchTask } from "@/lib/bff-v1";
import type { TranslateFn } from "@/lib/enumLabels";

export function isCollectorQueryPlan(task: ResearchTask): boolean {
  return (task.taskType ?? task.task_type) === "collector_query_plan";
}

export function collectorCheckStatus(task: ResearchTask, t: TranslateFn): string {
  if (task.status === "no_change") return t("research.collector.noChange");
  if (task.status === "proposed") return t("research.collector.proposed");
  return t("research.detail.notReported");
}

export function researchTitle(task: ResearchTask, t: TranslateFn): string {
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
