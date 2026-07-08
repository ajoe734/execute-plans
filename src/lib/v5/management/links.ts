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

import type { EvidenceRef, SentinelFinding } from "../types";

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

export type SentinelResolutionLinkKind =
  | "decision"
  | "human_gate"
  | "evidence"
  | "source"
  | "target"
  | "readiness"
  | "runtime"
  | "evolution"
  | "deployment";

export interface SentinelResolutionLink {
  id: string;
  kind: SentinelResolutionLinkKind;
  href: string;
  labelKey: string;
  label: string;
  priority: number;
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
      return safeId ? `/management/promotion-allocation?tab=quarterly-capital&capital_id=${safeId}` : null;
    case "capital_pool_live":
      return `/management/promotion-allocation?tab=quarterly-capital${opts.poolId ? `&capital_id=${encodeURIComponent(opts.poolId)}` : ""}`;
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

function evidenceRefHref(refId: string): string {
  return `/management/evidence?ref_id=${encodeURIComponent(refId)}`;
}

function firstOf(items: string[] | undefined): string | undefined {
  return items?.find(Boolean);
}

function sourceHrefForEvidence(ref: EvidenceRef): SentinelResolutionLink | null {
  const encoded = encodeURIComponent(ref.id);
  switch (ref.kind) {
    case "incident":
      return {
        id: `source:incident:${ref.id}`,
        kind: "source",
        href: `/management/incidents/${encoded}`,
        labelKey: "v5.sentinel.linkOpenIncident",
        label: "Open incident",
        priority: 30,
      };
    case "alert":
      return {
        id: `source:alert:${ref.id}`,
        kind: "source",
        href: `/management/alerts?alert=${encoded}`,
        labelKey: "v5.sentinel.linkOpenAlert",
        label: "Open alert",
        priority: 32,
      };
    case "runtime":
      return {
        id: `source:runtime:${ref.id}`,
        kind: "runtime",
        href: `/management/runtimes?runtime=${encoded}`,
        labelKey: "v5.sentinel.linkOpenRuntime",
        label: "Open runtime",
        priority: 34,
      };
    case "job":
      return {
        id: `source:job:${ref.id}`,
        kind: "source",
        href: `/management/jobs?job=${encoded}`,
        labelKey: "v5.sentinel.linkOpenJob",
        label: "Open job",
        priority: 36,
      };
    case "audit":
      return {
        id: `source:audit:${ref.id}`,
        kind: "source",
        href: `/management/audit?item=${encoded}`,
        labelKey: "v5.sentinel.linkOpenAudit",
        label: "Open audit trail",
        priority: 38,
      };
    case "approval":
      return {
        id: `source:approval:${ref.id}`,
        kind: "decision",
        href: `/management/governance/${encoded}`,
        labelKey: "v5.sentinel.linkOpenApproval",
        label: "Open approval",
        priority: 40,
      };
    case "policy":
      return {
        id: `source:policy:${ref.id}`,
        kind: "decision",
        href: `/management/governance/policies/${encoded}`,
        labelKey: "v5.sentinel.linkOpenPolicy",
        label: "Open policy",
        priority: 42,
      };
    case "deployment":
      return {
        id: `source:deployment:${ref.id}`,
        kind: "deployment",
        href: `/management/deployments/${encoded}`,
        labelKey: "v5.sentinel.linkOpenDeployment",
        label: "Open deployment",
        priority: 44,
      };
    case "persona":
      return {
        id: `source:persona:${ref.id}`,
        kind: "target",
        href: `/management/personas/${encoded}`,
        labelKey: "v5.sentinel.linkOpenPersona",
        label: "Open persona",
        priority: 46,
      };
    case "strategy":
      return {
        id: `source:strategy:${ref.id}`,
        kind: "target",
        href: `/management/strategies/${encoded}`,
        labelKey: "v5.sentinel.linkOpenStrategy",
        label: "Open strategy",
        priority: 48,
      };
    case "metric":
      return null;
  }
}

function pushUnique(links: SentinelResolutionLink[], link: SentinelResolutionLink | null): void {
  if (!link) return;
  if (links.some((existing) => existing.href === link.href)) return;
  links.push(link);
}

export function buildSentinelResolutionLinks(finding: SentinelFinding): SentinelResolutionLink[] {
  const links: SentinelResolutionLink[] = [];
  const actionKinds = new Set(finding.recommendedActionIds);
  const personaId = firstOf(finding.blastRadius.personas);
  const strategyId = firstOf(finding.blastRadius.strategies);
  const poolId = firstOf(finding.blastRadius.pools);
  const deploymentId = firstOf(finding.blastRadius.deployments);
  const firstEvidence = finding.evidence[0];

  pushUnique(links, {
    id: `decision:${finding.id}`,
    kind: "decision",
    href: `/management/interventions?finding=${encodeURIComponent(finding.id)}`,
    labelKey: "v5.sentinel.linkReviewIntervention",
    label: "Review intervention",
    priority: 10,
  });

  if (personaId && (actionKinds.has("request_human_approval") || actionKinds.has("pause_persona_routing") || actionKinds.has("switch_persona_to_shadow"))) {
    pushUnique(links, {
      id: `human-gate:${personaId}`,
      kind: "human_gate",
      href: `/management/human-inbox?persona=${encodeURIComponent(personaId)}`,
      labelKey: "v5.sentinel.linkOpenHumanInbox",
      label: "Open human inbox",
      priority: 12,
    });
  }

  if (firstEvidence) {
    pushUnique(links, {
      id: `evidence:${firstEvidence.id}`,
      kind: "evidence",
      href: evidenceRefHref(firstEvidence.id),
      labelKey: "v5.sentinel.linkInspectEvidence",
      label: "Inspect evidence",
      priority: 20,
    });
  }

  for (const ref of finding.evidence) {
    pushUnique(links, sourceHrefForEvidence(ref));
  }

  if (strategyId) {
    pushUnique(links, {
      id: `target:strategy:${strategyId}`,
      kind: "target",
      href: `/management/strategies/${encodeURIComponent(strategyId)}`,
      labelKey: "v5.sentinel.linkOpenStrategy",
      label: "Open strategy",
      priority: 50,
    });
  }

  if (personaId) {
    pushUnique(links, {
      id: `target:persona:${personaId}`,
      kind: "target",
      href: `/management/persona-fleet?persona=${encodeURIComponent(personaId)}`,
      labelKey: "v5.sentinel.linkOpenPersonaReadiness",
      label: "Open persona readiness",
      priority: 52,
    });
  }

  if (poolId) {
    pushUnique(links, {
      id: `readiness:capital:${poolId}`,
      kind: "readiness",
      href: `/management/promotion-allocation?tab=quarterly-capital&capital_id=${encodeURIComponent(poolId)}`,
      labelKey: "v5.sentinel.linkOpenCapitalGate",
      label: "Open capital gate",
      priority: 54,
    });
  } else if (actionKinds.has("reduce_allocation") || actionKinds.has("freeze_rebalance")) {
    pushUnique(links, {
      id: "readiness:capital",
      kind: "readiness",
      href: "/management/promotion-allocation?tab=quarterly-capital",
      labelKey: "v5.sentinel.linkOpenCapitalRegistry",
      label: "Open capital registry",
      priority: 56,
    });
  }

  if (deploymentId || actionKinds.has("emergency_rollback")) {
    pushUnique(links, {
      id: `deployment:${deploymentId ?? "registry"}`,
      kind: "deployment",
      href: deploymentId ? `/management/deployments/${encodeURIComponent(deploymentId)}` : "/management/deployments",
      labelKey: "v5.sentinel.linkOpenDeployment",
      label: "Open deployment",
      priority: 58,
    });
  }

  if (actionKinds.has("route_to_backup_runtime")) {
    pushUnique(links, {
      id: "runtime:registry",
      kind: "runtime",
      href: "/management/runtimes",
      labelKey: "v5.sentinel.linkOpenRuntimes",
      label: "Open runtimes",
      priority: 60,
    });
  }

  if (actionKinds.has("start_evolution_run")) {
    pushUnique(links, {
      id: `evolution:${strategyId ?? finding.id}`,
      kind: "evolution",
      href: `/management/evolution-journal${strategyId ? `?strategy=${encodeURIComponent(strategyId)}` : ""}`,
      labelKey: "v5.sentinel.linkOpenEvolution",
      label: "Open evolution journal",
      priority: 62,
    });
  }

  return links.sort((a, b) => a.priority - b.priority).slice(0, 8);
}
