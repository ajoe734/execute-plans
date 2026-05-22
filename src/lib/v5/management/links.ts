// 2026-05-20 PM-2 — Monitoring-to-Management Deep Link Model.
// Every monitor row across Cockpit / Fleet / Inbox / Pulse / Evolution /
// Evidence / Intent / Readiness MUST attach a ManagementLinkSet so the user
// goes from "I see something wrong" to "I am on the page that fixes it"
// without hunting the side nav.
//
// HARD RULES:
//   - All hrefs must resolve to existing in-app routes.
//   - When a kind has no matching route, return `null` — never invent paths.
//   - This module is pure (no React, no env reads) and 100% testable.

export type ManagementHrefKind =
  | "persona"
  | "strategy"
  | "capital_pool"
  | "capital_pool_live"
  | "approval"
  | "human_gate"
  | "deployment"
  | "runtime"
  | "evidence"
  | "postmortem"
  | "evolution"
  | "loop_run"
  | "sentinel"
  | "intervention"
  | "broker_live"
  | "bff_ha"
  | "strict_publish";

export interface ManagementRelatedHref {
  label: string;
  href: string;
  kind: Extract<
    ManagementHrefKind,
    | "persona"
    | "strategy"
    | "capital_pool"
    | "deployment"
    | "runtime"
    | "approval"
    | "evidence"
    | "postmortem"
    | "evolution"
    | "loop_run"
  > | "loop";
}

export interface ManagementLinkSet {
  /** Primary "open the management page that owns this object" link. Required. */
  manageHref: string;
  /** Optional jump to the evidence packet that proves / disproves the signal. */
  evidenceHref?: string;
  /** Optional canonical detail link for the underlying object. */
  primaryObjectHref?: string;
  /** Optional recommended next action (e.g. human-gate decision URL). */
  recommendedActionHref?: string;
  /** Optional audit trail anchor for this signal. */
  auditHref?: string;
  /** Optional bag of supporting links. */
  relatedHrefs?: ManagementRelatedHref[];
}

export interface ResolveHrefOpts {
  /** For `loop_run`: which loop family (research / execution / optimization). */
  loopKind?: "research" | "execution" | "optimization";
  /** For `capital_pool_live`: pool id passed as `?pool=` query. */
  poolId?: string;
  /** For `runtime` / `postmortem` / `evolution` / `sentinel` / `intervention`: query item id. */
  itemId?: string;
}

/**
 * Resolve a single management deep link. Returns `null` only when required
 * inputs are missing — callers MUST surface "No deep link available" instead
 * of inventing a URL.
 */
export function resolveManagementHref(
  kind: ManagementHrefKind,
  id: string | undefined,
  opts: ResolveHrefOpts = {},
): string | null {
  const safeId = id ? encodeURIComponent(id) : "";
  switch (kind) {
    case "persona":
      return safeId ? `/management/personas/${safeId}` : null;
    case "strategy":
      return safeId ? `/management/strategies/${safeId}` : null;
    case "capital_pool":
      return safeId ? `/management/capital/${safeId}` : null;
    case "capital_pool_live":
      return `/management/readiness/capital-binding-live${opts.poolId ? `?pool=${encodeURIComponent(opts.poolId)}` : ""}`;
    case "approval":
      return safeId ? `/management/governance/${safeId}` : "/management/governance";
    case "human_gate":
      return safeId ? `/management/human-inbox/${safeId}` : "/management/human-inbox";
    case "deployment":
      return safeId ? `/management/deployments/${safeId}` : "/management/deployments";
    case "runtime":
      return `/management/runtimes${opts.itemId ?? id ? `?runtime=${encodeURIComponent(opts.itemId ?? id ?? "")}` : ""}`;
    case "evidence":
      return safeId ? `/management/evidence/${safeId}` : "/management/evidence";
    case "postmortem":
      return `/management/postmortems${(opts.itemId ?? id) ? `?item=${encodeURIComponent(opts.itemId ?? id ?? "")}` : ""}`;
    case "evolution":
      return `/management/evolution-journal${(opts.itemId ?? id) ? `?item=${encodeURIComponent(opts.itemId ?? id ?? "")}` : ""}`;
    case "loop_run": {
      const lk = opts.loopKind;
      const base = lk ? `/management/loops/${lk}` : "/management/loops";
      return id ? `${base}?run=${encodeURIComponent(id)}` : base;
    }
    case "sentinel":
      return `/management/sentinel${(opts.itemId ?? id) ? `?finding=${encodeURIComponent(opts.itemId ?? id ?? "")}` : ""}`;
    case "intervention":
      return `/management/interventions${(opts.itemId ?? id) ? `?item=${encodeURIComponent(opts.itemId ?? id ?? "")}` : ""}`;
    case "broker_live":
      return "/management/readiness/broker-live";
    case "bff_ha":
      return "/management/readiness/bff-ha";
    case "strict_publish":
      return "/management/readiness/strict-publish";
  }
}

/** Fallback labels — UI MUST use these when a link is missing instead of hiding the affordance. */
export const MANAGE_HREF_FALLBACK_LABEL = "No management page available";
export const EVIDENCE_HREF_FALLBACK_LABEL = "Evidence missing";
export const ACTION_HREF_FALLBACK_LABEL = "No action required";

/**
 * Convenience: build a complete ManagementLinkSet for a primary object plus
 * an optional evidence + recommended-action pairing. Throws if `manageHref`
 * cannot be resolved — every monitor row MUST have one.
 */
export function buildLinkSet(input: {
  primary: { kind: ManagementHrefKind; id?: string; opts?: ResolveHrefOpts };
  evidence?: { id: string };
  recommendedAction?: { kind: ManagementHrefKind; id?: string; opts?: ResolveHrefOpts };
  audit?: { id?: string };
  related?: ManagementRelatedHref[];
}): ManagementLinkSet {
  const manageHref = resolveManagementHref(input.primary.kind, input.primary.id, input.primary.opts);
  if (!manageHref) {
    throw new Error(
      `buildLinkSet: cannot resolve manageHref for kind=${input.primary.kind} id=${input.primary.id ?? "<undef>"}`,
    );
  }
  const evidenceHref = input.evidence ? (resolveManagementHref("evidence", input.evidence.id) ?? undefined) : undefined;
  const recommendedActionHref = input.recommendedAction
    ? (resolveManagementHref(input.recommendedAction.kind, input.recommendedAction.id, input.recommendedAction.opts) ?? undefined)
    : undefined;
  return {
    manageHref,
    primaryObjectHref: manageHref,
    evidenceHref,
    recommendedActionHref,
    auditHref: input.audit?.id ? `/management/audit?item=${encodeURIComponent(input.audit.id)}` : undefined,
    relatedHrefs: input.related,
  };
}
