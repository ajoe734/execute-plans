// 2026-05-20 PM-5 — Unified Management Anomaly model.
// Used across Cockpit, Persona Fleet, Human Inbox, Trading Pulse,
// Evolution Journal, Readiness, Evidence Explorer, Persona Intent Traces.

import type { ManagementLinkSet } from "./links";

export type ManagementAnomalySeverity =
  | "critical" | "high" | "medium" | "low" | "info";

export const MANAGEMENT_ANOMALY_SEVERITIES: readonly ManagementAnomalySeverity[] = [
  "critical", "high", "medium", "low", "info",
] as const;

export type ManagementAnomalyDomain =
  | "persona"
  | "strategy"
  | "capital_pool"
  | "deployment"
  | "runtime"
  | "trading"
  | "evolution"
  | "readiness"
  | "broker"
  | "approval"
  | "evidence"
  | "system";

export const MANAGEMENT_ANOMALY_DOMAINS: readonly ManagementAnomalyDomain[] = [
  "persona", "strategy", "capital_pool", "deployment", "runtime",
  "trading", "evolution", "readiness", "broker", "approval",
  "evidence", "system",
] as const;

export interface ManagementAnomaly {
  id: string;
  severity: ManagementAnomalySeverity;
  domain: ManagementAnomalyDomain;
  title: string;
  why: string;
  recommendedAction: string;
  detectedAt: string;
  links: ManagementLinkSet;
  /** Optional symbol the anomaly is bound to (persona id, deployment id, …). */
  subjectId?: string;
  /** Optional ack flag — does NOT change underlying state; UI hint only. */
  acknowledged?: boolean;
}

export function severityWeight(s: ManagementAnomalySeverity): number {
  return s === "critical" ? 5 : s === "high" ? 4 : s === "medium" ? 3
       : s === "low" ? 2 : 1;
}

export function sortAnomaliesBySeverity(list: readonly ManagementAnomaly[]): ManagementAnomaly[] {
  return [...list].sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}
