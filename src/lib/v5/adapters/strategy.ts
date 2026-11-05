// seed.strategy → v5 StrategyExecutionHealth.

import type { Strategy, Alert, Incident } from "@/lib/bff-v1";
import { computeStrategyHealthScore } from "../health";
import type { StrategyExecutionHealth } from "../types";

function riskScore(s: Strategy): number {
  switch (s.risk) {
    case "low": return 90;
    case "medium": return 70;
    case "high": return 45;
    case "critical": return 25;
    default: return 70;
  }
}

export function adaptStrategyHealth(
  strategy: Strategy,
  ctx: { alerts?: Alert[]; incidents?: Incident[] } = {},
): StrategyExecutionHealth {

  const findingsCount = (ctx.alerts ?? []).filter((a) => a.relatedTarget === strategy.id).length;
  const incidentPenalty = (ctx.incidents ?? []).filter(
    (i) => i.affected?.includes(strategy.id) && i.status !== "resolved",
  ).length * 25;

  const hasPnl30d = typeof strategy.pnl30d === "number" && Number.isFinite(strategy.pnl30d);
  const hasDrawdown = typeof strategy.drawdown === "number" && Number.isFinite(strategy.drawdown);
  const perf = hasPnl30d ? Math.max(0, Math.min(100, 50 + strategy.pnl30d * 500)) : 0;
  const exec = hasDrawdown ? Math.max(0, Math.min(100, 80 - Math.abs(strategy.drawdown) * 200)) : 0;
  const lifecycle = strategy.state === "deployed" ? 95 : strategy.state === "review" ? 70 : strategy.state === "paused" ? 40 : 60;

  const inputs = {
    performance: perf,
    risk: riskScore(strategy),
    executionQuality: exec,
    lifecycleConsistency: lifecycle,
    sentinelIncidentPenalty: Math.min(100, findingsCount * 10 + incidentPenalty),
  };

  const criticalOverride =
    strategy.risk === "critical" ||
    (ctx.incidents ?? []).some((i) => i.severity === "critical" && i.affected?.includes(strategy.id) && i.status !== "resolved");

  const { score, status, formulaVersion } = computeStrategyHealthScore(inputs, { criticalOverride });

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    status,
    score,
    formulaVersion,
    inputs,
    pnl30d: hasPnl30d ? strategy.pnl30d : null,
    drawdown: hasDrawdown ? strategy.drawdown : null,
    openFindings: findingsCount,
    updatedAt: strategy.updatedAt,
  };
}
