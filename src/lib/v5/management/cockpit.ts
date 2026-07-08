// 2026-05-20 PM-3 — Pathreon Management Cockpit view-model.
// Pure composition; no React, no env reads. Replaces ad-hoc card data in
// src/management/pages/oversight/_core.tsx::OneRingCockpitPage.

import type { ManagementAnomaly } from "./anomaly";
import { sortAnomaliesBySeverity } from "./anomaly";
import { buildLinkSet, type ManagementLinkSet } from "./links";

export type AutonomyState = "manual" | "guarded" | "supervised" | "autonomous";
export type OodaPhase = "Observe" | "Orient" | "Decide" | "Act" | "Learn";

export interface SystemStateField {
  key: string;
  label: string;
  value: string | number;
  tone?: "ok" | "warn" | "bad";
  href?: string;
}

export interface SystemStateStripModel {
  fields: SystemStateField[];
}

export interface LoopFlowNode {
  id: string;
  label: string;
  loop: "research" | "execution" | "optimization";
  severity: "ok" | "warn" | "bad";
  href?: string;
}

export interface LoopFlowEdge {
  from: string;
  to: string;
  severity: "ok" | "warn" | "bad";
}

export interface LoopFlowMapModel {
  nodes: LoopFlowNode[];
  edges: LoopFlowEdge[];
}

export interface PersonaOodaCell {
  personaId: string;
  phase: OodaPhase;
  state: "idle" | "active" | "blocked" | "alerting";
  href: string | null;
}

export interface PersonaOodaMatrixModel {
  personas: string[];
  phases: readonly OodaPhase[];
  cells: PersonaOodaCell[];
}

export const OODA_PHASES: readonly OodaPhase[] =
  ["Observe", "Orient", "Decide", "Act", "Learn"] as const;

export interface CockpitModel {
  strip: SystemStateStripModel;
  loopFlow: LoopFlowMapModel;
  matrix: PersonaOodaMatrixModel;
  anomalies: ManagementAnomaly[];
}

export interface CockpitSeed {
  autonomy: AutonomyState;
  humanPending: number;
  criticalFindings: number;
  personaOwners: number;
  personas: { id: string; phase: OodaPhase; state: PersonaOodaCell["state"] }[];
  brokerReady: boolean;
  capitalBound: boolean;
  strictPublishOk: boolean;
  bffHaOk: boolean;
  anomalies: ManagementAnomaly[];
}

/** Pure composer — UI just renders the result. */
export function composeCockpit(seed: CockpitSeed): CockpitModel {
  const strip: SystemStateStripModel = {
    fields: [
      { key: "autonomy", label: "Autonomy", value: seed.autonomy, tone: seed.autonomy === "manual" ? "warn" : "ok", href: "/management/governance" },
      { key: "humanPending", label: "Human pending", value: seed.humanPending, tone: seed.humanPending > 0 ? "warn" : "ok", href: "/management/human-inbox" },
      { key: "critical", label: "Critical findings", value: seed.criticalFindings, tone: seed.criticalFindings > 0 ? "bad" : "ok", href: "/management/sentinel" },
      { key: "owners", label: "Persona owners", value: seed.personaOwners, href: "/management/personas" },
      { key: "personas", label: "Personas", value: seed.personas.length, href: "/management/persona-fleet" },
      { key: "broker", label: "Broker live", value: seed.brokerReady ? "ready" : "blocked", tone: seed.brokerReady ? "ok" : "bad", href: "/management/readiness/broker-live" },
      { key: "capital", label: "Capital bound", value: seed.capitalBound ? "ready" : "blocked", tone: seed.capitalBound ? "ok" : "bad", href: "/management/promotion-allocation?tab=quarterly-capital" },
      { key: "strict", label: "Strict publish", value: seed.strictPublishOk ? "ok" : "blocked", tone: seed.strictPublishOk ? "ok" : "bad", href: "/management/readiness/strict-publish" },
      { key: "bffHa", label: "BFF HA", value: seed.bffHaOk ? "ok" : "degraded", tone: seed.bffHaOk ? "ok" : "warn", href: "/management/readiness/bff-ha" },
    ],
  };

  const loopFlow: LoopFlowMapModel = {
    nodes: [
      { id: "r-observe", label: "Research · Observe", loop: "research", severity: "ok", href: "/management/loops/research" },
      { id: "r-orient",  label: "Research · Orient",  loop: "research", severity: "ok", href: "/management/loops/research" },
      { id: "r-decide",  label: "Research · Decide",  loop: "research", severity: seed.humanPending > 0 ? "warn" : "ok", href: "/management/loops/research" },
      { id: "e-act",     label: "Execution · Act",    loop: "execution", severity: seed.criticalFindings > 0 ? "bad" : "ok", href: "/management/loops/execution" },
      { id: "e-learn",   label: "Execution · Learn",  loop: "execution", severity: "ok", href: "/management/loops/execution" },
      { id: "o-observe", label: "Optimization · Observe", loop: "optimization", severity: "ok", href: "/management/loops/optimization" },
      { id: "o-orient",  label: "Optimization · Orient",  loop: "optimization", severity: "ok", href: "/management/loops/optimization" },
      { id: "o-decide",  label: "Optimization · Decide",  loop: "optimization", severity: "ok", href: "/management/loops/optimization" },
      { id: "o-act",     label: "Optimization · Act",     loop: "optimization", severity: "ok", href: "/management/loops/optimization" },
      { id: "o-learn",   label: "Optimization · Learn",   loop: "optimization", severity: "ok", href: "/management/loops/optimization" },
    ],
    edges: [
      { from: "r-observe", to: "r-orient", severity: "ok" },
      { from: "r-orient",  to: "r-decide", severity: "ok" },
      { from: "r-decide",  to: "e-act",    severity: seed.humanPending > 0 ? "warn" : "ok" },
      { from: "e-act",     to: "e-learn",  severity: seed.criticalFindings > 0 ? "bad" : "ok" },
      { from: "e-learn",   to: "o-observe", severity: "ok" },
      { from: "o-observe", to: "o-orient",  severity: "ok" },
      { from: "o-orient",  to: "o-decide",  severity: "ok" },
      { from: "o-decide",  to: "o-act",     severity: "ok" },
      { from: "o-act",     to: "o-learn",   severity: "ok" },
      { from: "o-learn",   to: "r-observe", severity: "ok" },
    ],
  };

  const personaIds = Array.from(new Set(seed.personas.map((p) => p.id)));
  const cells: PersonaOodaCell[] = [];
  for (const pid of personaIds) {
    for (const phase of OODA_PHASES) {
      const hit = seed.personas.find((p) => p.id === pid && p.phase === phase);
      cells.push({
        personaId: pid,
        phase,
        state: hit ? hit.state : "idle",
        href: hit ? `/management/personas/${encodeURIComponent(pid)}` : null,
      });
    }
  }

  return {
    strip,
    loopFlow,
    matrix: { personas: personaIds, phases: OODA_PHASES, cells },
    anomalies: sortAnomaliesBySeverity(seed.anomalies).slice(0, 8),
  };
}

/** Convenience: a stable seed for Phase 1 mocks. */
export function defaultCockpitSeed(): CockpitSeed {
  const link = (kind: Parameters<typeof buildLinkSet>[0]["primary"]["kind"], id?: string): ManagementLinkSet =>
    buildLinkSet({ primary: { kind, id } });
  return {
    autonomy: "guarded",
    humanPending: 3,
    criticalFindings: 1,
    personaOwners: 4,
    personas: [
      { id: "alpha-trader", phase: "Decide", state: "blocked" },
      { id: "risk-guard", phase: "Observe", state: "active" },
      { id: "fx-scout", phase: "Orient", state: "active" },
      { id: "capital-steward", phase: "Act", state: "alerting" },
    ],
    brokerReady: true,
    capitalBound: false,
    strictPublishOk: true,
    bffHaOk: true,
    anomalies: [
      {
        id: "anom-001", severity: "critical", domain: "trading",
        title: "Beta drift on momentum sleeve",
        why: "Live beta 1.42 vs sanctioned 1.10 for 18m",
        recommendedAction: "Reduce sleeve or open intervention",
        detectedAt: "2026-05-20T09:30:00Z",
        subjectId: "alpha-trader",
        links: link("persona", "alpha-trader"),
      },
      {
        id: "anom-002", severity: "high", domain: "capital_pool",
        title: "Capital pool unbound",
        why: "Pool cp-eu-mid-cap lost broker binding",
        recommendedAction: "Re-bind broker in Capital Binding Live",
        detectedAt: "2026-05-20T08:10:00Z",
        subjectId: "cp-eu-mid-cap",
        links: link("capital_pool_live"),
      },
      {
        id: "anom-003", severity: "medium", domain: "evolution",
        title: "Mutation degraded vs champion",
        why: "ev-103 underperforms champion baseline 11%",
        recommendedAction: "Roll back or extend paper window",
        detectedAt: "2026-05-19T22:00:00Z",
        subjectId: "ev-103",
        links: link("evolution"),
      },
    ],
  };
}
