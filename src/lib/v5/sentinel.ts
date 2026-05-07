// Q9 — Deterministic Sentinel derivation map from alerts/incidents/jobs/runtime/persona-health.

import type { Alert, Incident, Job, Runtime } from "@/lib/bff/types";
import type {
  SentinelFinding, EvidenceRef,
} from "./types";
import type { SentinelSeverity, SentinelFindingStatus } from "./enums";

interface SeedCtx {
  alerts: Alert[];
  incidents: Incident[];
  jobs?: Job[];
  runtimes?: Runtime[];
}

function severityFor(level: "critical" | "high" | "medium" | "low" | "info"): { sev: SentinelSeverity; conf: number } {
  switch (level) {
    case "critical": return { sev: "critical", conf: 0.88 };
    case "high":     return { sev: "warning",  conf: 0.76 };
    case "medium":   return { sev: "watch",    conf: 0.62 };
    case "low":      return { sev: "info",     conf: 0.45 };
  }
}

function statusFor(acknowledged: boolean): SentinelFindingStatus {
  return acknowledged ? "acknowledged" : "open";
}

function actionsForAlert(a: Alert): string[] {
  const m = (a.metric ?? "").toLowerCase();
  const t = a.title.toLowerCase();
  if (m.includes("drawdown") || m.includes("slippage") || t.includes("divergence")) {
    return ["reduce_allocation", "switch_persona_to_shadow", "start_evolution_run"];
  }
  if (a.source.toLowerCase().includes("runtime") || a.source.toLowerCase().includes("mcp") || m.includes("latency")) {
    return ["route_to_backup_runtime", "open_incident"];
  }
  if (m.includes("utilization") || m.includes("concentration") || t.includes("capital")) {
    return ["freeze_rebalance", "request_human_approval"];
  }
  if (t.includes("approval") && t.includes("sla")) return ["escalate_intervention"];
  return ["open_incident", "request_human_approval"];
}

function actionsForIncident(i: Incident): string[] {
  if (i.severity === "critical") return ["pause_persona_routing", "emergency_rollback"];
  return ["open_incident", "request_human_approval"];
}

export function deriveFindings(ctx: SeedCtx): SentinelFinding[] {
  const findings: SentinelFinding[] = [];

  for (const a of ctx.alerts) {
    const { sev, conf } = severityFor(a.severity);
    const evidence: EvidenceRef[] = [{ kind: "alert", id: a.id, snapshot: { value: a.observed, label: a.metric } }];
    const corroborating = ctx.incidents.filter((i) => i.affected?.includes(a.relatedTarget ?? "")).length;
    findings.push({
      id: `sf_a_${a.id}`,
      status: statusFor(a.acknowledged),
      severity: sev,
      confidence: Math.min(0.95, conf + 0.04 * corroborating),
      title: a.title,
      summary: a.description ?? a.title,
      source: "alert",
      detectedAt: a.openedAt,
      updatedAt: a.openedAt,
      blastRadius: { strategies: a.relatedTarget ? [a.relatedTarget] : [] },
      evidence,
      recommendedActionIds: actionsForAlert(a),
    });
  }

  for (const i of ctx.incidents) {
    const { sev, conf } = severityFor(i.severity);
    findings.push({
      id: `sf_i_${i.id}`,
      status: i.status === "resolved" ? "resolved" : i.status === "mitigating" ? "mitigating" : "open",
      severity: sev,
      confidence: Math.min(0.95, conf + 0.04 * (i.affected?.length ?? 0)),
      title: i.title,
      summary: i.description ?? i.title,
      source: "incident",
      detectedAt: i.openedAt,
      updatedAt: i.openedAt,
      blastRadius: { strategies: i.affected ?? [] },
      evidence: [{ kind: "incident", id: i.id }],
      recommendedActionIds: actionsForIncident(i),
    });
  }

  for (const r of ctx.runtimes ?? []) {
    if (r.status === "failed" || r.latencyP95Ms > 5000) {
      const { sev, conf } = severityFor(r.status === "failed" ? "high" : "medium");
      findings.push({
        id: `sf_r_${r.id}`,
        status: "open",
        severity: sev,
        confidence: conf,
        title: `Runtime ${r.name} degraded`,
        summary: `latency p95 ${r.latencyP95Ms}ms · status ${r.status}`,
        source: "runtime",
        detectedAt: r.updatedAt,
        updatedAt: r.updatedAt,
        blastRadius: {},
        evidence: [{ kind: "runtime", id: r.id, snapshot: { value: r.latencyP95Ms, label: "latencyP95Ms" } }],
        recommendedActionIds: ["route_to_backup_runtime", "open_incident"],
      });
    }
  }

  return findings;
}
