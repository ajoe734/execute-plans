// Planner Response §B3 / D22 (2026-05-07) — list endpoint totalCount classification.
// Source: .lovable/feedback/2026-05-07-planner-response/Pantheon_System_Dev_Response_to_34_Spec_Backlog_2026-05-07.md §B3

export type TotalCountClass = "exact" | "estimated" | "absent";

export interface ListPolicy {
  /** Path or matcher prefix, e.g. "/bff/strategies", "/bff/audit". */
  pathPrefix: string;
  totalCount: TotalCountClass;
  notes?: string;
}

/** Per Planner §B3 table — registry + governance = exact; audit = estimated; infinite = absent. */
export const LIST_TOTAL_COUNT_POLICIES: readonly ListPolicy[] = [
  // Entity registries — exact
  { pathPrefix: "/bff/strategies",       totalCount: "exact" },
  { pathPrefix: "/bff/personas",         totalCount: "exact" },
  { pathPrefix: "/bff/capital-pools",    totalCount: "exact" },
  { pathPrefix: "/bff/deployments",      totalCount: "exact" },
  { pathPrefix: "/bff/tools",            totalCount: "exact" },
  { pathPrefix: "/bff/skills",           totalCount: "exact" },
  { pathPrefix: "/bff/ranking-formulas", totalCount: "exact" },
  { pathPrefix: "/bff/rebalances",       totalCount: "exact" },

  // Governance queues — exact
  { pathPrefix: "/bff/approvals",        totalCount: "exact" },
  { pathPrefix: "/bff/v5/interventions", totalCount: "exact" },

  // v5 loops — exact preferred (mock OK with true)
  { pathPrefix: "/bff/v5/loop-runs",     totalCount: "exact" },

  // Sentinel — exact preferred
  { pathPrefix: "/bff/v5/sentinel/findings", totalCount: "exact" },

  // Audit feed — estimated
  { pathPrefix: "/bff/audit",            totalCount: "estimated", notes: "estimated allowed" },

  // Realtime / notification feeds — absent
  { pathPrefix: "/bff/notifications",    totalCount: "absent" },
  { pathPrefix: "/bff/events/recent",    totalCount: "absent" },
] as const;

export function classifyListPath(path: string): TotalCountClass {
  const match = LIST_TOTAL_COUNT_POLICIES.find((p) => path.startsWith(p.pathPrefix));
  return match?.totalCount ?? "exact";
}

export function totalCountExactFor(path: string): boolean {
  return classifyListPath(path) === "exact";
}

export const LIST_TOTAL_COUNT_SOURCE = "planner-response-2026-05-07" as const;
