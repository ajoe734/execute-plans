// Phase 18 — Cross-page linkage helper.
// Given an entity id (e.g. "stg_001", "per_quant", "dp_001"), infer the
// canonical entity kind and the management route, plus build deep links
// to LineageExplorer and DecisionJournal for cross-surface navigation.

export type EntityKind =
  | "Strategy" | "Persona" | "CapitalPool" | "RankingFormula"
  | "Rebalance" | "Deployment" | "Evolution" | "Research" | "Artifact"
  | "Tool" | "McpServer" | "McpTool" | "Skill" | "Channel"
  | "Incident" | "Alert" | "Approval" | "RoutePolicy";

interface Resolved {
  kind: EntityKind;
  id: string;
  /** Management detail route. */
  route: string;
  /** Short label used in tooltips / buttons. */
  label: string;
}

/** Map id prefixes to entity metadata. Order matters (longer prefixes first). */
const RULES: Array<{ prefix: string; kind: EntityKind; path: string; label: string }> = [
  { prefix: "stg_",          kind: "Strategy",       path: "strategies",       label: "Strategy" },
  { prefix: "per_",          kind: "Persona",        path: "personas",         label: "Persona" },
  { prefix: "cp_",           kind: "CapitalPool",    path: "capital",          label: "Capital Pool" },
  { prefix: "rf_",           kind: "RankingFormula", path: "ranking/formulas", label: "Ranking Formula" },
  { prefix: "rb_",           kind: "Rebalance",      path: "rebalance",        label: "Rebalance" },
  { prefix: "dp_",           kind: "Deployment",     path: "deployments",      label: "Deployment" },
  { prefix: "ev_",           kind: "Evolution",      path: "evolution",        label: "Evolution" },
  { prefix: "exp_",          kind: "Research",       path: "experiments",      label: "Experiment" },
  { prefix: "art_",          kind: "Artifact",       path: "artifacts",        label: "Artifact" },
  { prefix: "tl_",           kind: "Tool",           path: "tools",            label: "Tool" },
  { prefix: "mcp_tool_",     kind: "McpTool",        path: "mcp-tools",        label: "MCP Tool" },
  { prefix: "mcp_",          kind: "McpServer",      path: "mcp",              label: "MCP Server" },
  { prefix: "sk_",           kind: "Skill",          path: "skills",           label: "Skill" },
  { prefix: "ch_",           kind: "Channel",        path: "channels",         label: "Channel" },
  { prefix: "inc_",          kind: "Incident",       path: "incidents",        label: "Incident" },
  { prefix: "alr_",          kind: "Alert",          path: "alerts",           label: "Alert" },
  { prefix: "apr_",          kind: "Approval",       path: "governance",       label: "Approval" },
  { prefix: "rp_",           kind: "RoutePolicy",    path: "governance/policies", label: "Route Policy" },
];

export function resolveEntity(id?: string | null): Resolved | null {
  if (!id) return null;
  for (const r of RULES) {
    if (id.startsWith(r.prefix)) {
      return { kind: r.kind, id, route: `/management/${r.path}/${id}`, label: r.label };
    }
  }
  return null;
}

/** Deep link to LineageExplorer rooted at this entity. Only Strategy is supported as root today;
 *  for other kinds we still link to the explorer so users can pivot. */
export function lineageHref(id?: string | null): string {
  const e = resolveEntity(id);
  if (!e) return "/management/lineage";
  return `/management/lineage?root=${encodeURIComponent(e.id)}`;
}

/** Deep link to DecisionJournal filtered to this subject. */
export function decisionsHref(kindOrId?: string | null, id?: string | null): string {
  // Accept either (kind, id) or just (id) and infer kind.
  let kind: string | null = null;
  let subjectId: string | null = null;
  if (kindOrId && id) { kind = kindOrId; subjectId = id; }
  else if (kindOrId) {
    const r = resolveEntity(kindOrId);
    if (r) { kind = r.kind; subjectId = r.id; }
  }
  if (!kind || !subjectId) return "/agora/journal";
  const qs = new URLSearchParams({ subjectKind: kind, subjectId });
  return `/agora/journal?${qs.toString()}`;
}

/** Deep link to AuditPage filtered to this target id. */
export function auditHref(target?: string | null): string {
  if (!target) return "/management/audit";
  return `/management/audit?target=${encodeURIComponent(target)}`;
}
