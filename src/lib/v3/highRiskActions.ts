// v3 §6 High-Risk Actions / Confirmation Token.
// Resolves G03 / G66 / G86.

import type { ManagementRole } from "./availableActions";
import type { PlatformEnvironment, TradingEnvironment } from "./environment";

export type HighRiskApprovalMode = "approval_required" | "emergency_no_preapproval";

export interface HighRiskAction {
  entity: string;
  actionId: string;
  memoRequired: boolean;
  /** With placeholders {entityId} etc. */
  confirmPhraseTemplate: string;
  tokenTtlSeconds: number;
  allowedRoles: readonly ManagementRole[];
  approvalMode: HighRiskApprovalMode;
}

/** v3 §6.1 high-risk action catalog (canonical). */
export const HIGH_RISK_ACTIONS: readonly HighRiskAction[] = [
  { entity: "Strategy", actionId: "strategy.promote_paper",   memoRequired: true, confirmPhraseTemplate: "PROMOTE PAPER {strategyId}",   tokenTtlSeconds: 300, allowedRoles: ["admin","research_lead","risk_officer"],            approvalMode: "approval_required" },
  { entity: "Strategy", actionId: "strategy.deploy_live",     memoRequired: true, confirmPhraseTemplate: "DEPLOY LIVE {strategyId}",     tokenTtlSeconds: 300, allowedRoles: ["admin","risk_officer","system_operator"],         approvalMode: "approval_required" },
  { entity: "Strategy", actionId: "strategy.pause_live",      memoRequired: true, confirmPhraseTemplate: "PAUSE LIVE {strategyId}",      tokenTtlSeconds: 300, allowedRoles: ["admin","risk_officer","system_operator"],         approvalMode: "approval_required" },
  { entity: "Strategy", actionId: "strategy.resume_live",     memoRequired: true, confirmPhraseTemplate: "RESUME LIVE {strategyId}",     tokenTtlSeconds: 300, allowedRoles: ["admin","risk_officer","system_operator"],         approvalMode: "approval_required" },
  { entity: "Strategy", actionId: "strategy.rollback_live",   memoRequired: true, confirmPhraseTemplate: "ROLLBACK LIVE {strategyId}",   tokenTtlSeconds: 300, allowedRoles: ["admin","risk_officer","system_operator"],         approvalMode: "approval_required" },
  { entity: "Strategy", actionId: "strategy.emergency_kill",  memoRequired: true, confirmPhraseTemplate: "KILL {strategyId}",            tokenTtlSeconds: 120, allowedRoles: ["admin","risk_officer","system_operator"],         approvalMode: "emergency_no_preapproval" },
  { entity: "Strategy", actionId: "strategy.retire",          memoRequired: true, confirmPhraseTemplate: "RETIRE {strategyId}",          tokenTtlSeconds: 300, allowedRoles: ["admin","research_lead","risk_officer"],            approvalMode: "approval_required" },
  { entity: "CapitalPool", actionId: "capital_pool.edit_mandate",    memoRequired: true, confirmPhraseTemplate: "UPDATE MANDATE {poolId}",  tokenTtlSeconds: 300, allowedRoles: ["admin","capital_manager","risk_officer"],   approvalMode: "approval_required" },
  { entity: "CapitalPool", actionId: "capital_pool.set_risk_budget", memoRequired: true, confirmPhraseTemplate: "SET RISK {poolId}",        tokenTtlSeconds: 300, allowedRoles: ["admin","capital_manager","risk_officer"],   approvalMode: "approval_required" },
  { entity: "CapitalPool", actionId: "capital_pool.freeze",          memoRequired: true, confirmPhraseTemplate: "FREEZE {poolId}",          tokenTtlSeconds: 300, allowedRoles: ["admin","capital_manager","risk_officer"],   approvalMode: "approval_required" },
  { entity: "QuarterlyRebalance", actionId: "rebalance.apply_override", memoRequired: true, confirmPhraseTemplate: "OVERRIDE {rebalanceId}",         tokenTtlSeconds: 300, allowedRoles: ["admin","capital_manager","risk_officer"],   approvalMode: "approval_required" },
  { entity: "QuarterlyRebalance", actionId: "rebalance.apply",          memoRequired: true, confirmPhraseTemplate: "APPLY REBALANCE {rebalanceId}",  tokenTtlSeconds: 300, allowedRoles: ["admin","capital_manager","system_operator"], approvalMode: "approval_required" },
  { entity: "QuarterlyRebalance", actionId: "rebalance.rollback",       memoRequired: true, confirmPhraseTemplate: "ROLLBACK REBALANCE {rebalanceId}", tokenTtlSeconds: 300, allowedRoles: ["admin","capital_manager","risk_officer"], approvalMode: "approval_required" },
  { entity: "RankingFormula", actionId: "ranking_formula.activate", memoRequired: true, confirmPhraseTemplate: "ACTIVATE FORMULA {formulaId}", tokenTtlSeconds: 300, allowedRoles: ["admin","capital_manager","risk_officer"], approvalMode: "approval_required" },
  { entity: "RankingFormula", actionId: "ranking_formula.rollback", memoRequired: true, confirmPhraseTemplate: "ROLLBACK FORMULA {formulaId}", tokenTtlSeconds: 300, allowedRoles: ["admin","capital_manager","risk_officer"], approvalMode: "approval_required" },
  { entity: "Persona", actionId: "persona.update_route_policy", memoRequired: true, confirmPhraseTemplate: "PUBLISH POLICY {personaId}", tokenTtlSeconds: 300, allowedRoles: ["admin","research_lead","risk_officer"], approvalMode: "approval_required" },
  { entity: "Persona", actionId: "persona.activate",            memoRequired: true, confirmPhraseTemplate: "ACTIVATE PERSONA {personaId}", tokenTtlSeconds: 300, allowedRoles: ["admin","research_lead"], approvalMode: "approval_required" },
  { entity: "Persona", actionId: "persona.restrict",            memoRequired: true, confirmPhraseTemplate: "RESTRICT PERSONA {personaId}", tokenTtlSeconds: 300, allowedRoles: ["admin","risk_officer"], approvalMode: "approval_required" },
  { entity: "Persona", actionId: "persona.suspend",             memoRequired: true, confirmPhraseTemplate: "SUSPEND PERSONA {personaId}", tokenTtlSeconds: 300, allowedRoles: ["admin","risk_officer"], approvalMode: "approval_required" },
  { entity: "Runtime", actionId: "runtime.restart", memoRequired: true, confirmPhraseTemplate: "RESTART {runtimeId}", tokenTtlSeconds: 180, allowedRoles: ["admin","system_operator"], approvalMode: "approval_required" },
  { entity: "Runtime", actionId: "runtime.stop",    memoRequired: true, confirmPhraseTemplate: "STOP {runtimeId}",    tokenTtlSeconds: 180, allowedRoles: ["admin","system_operator","risk_officer"], approvalMode: "approval_required" },
  { entity: "Runtime", actionId: "runtime.drain",   memoRequired: true, confirmPhraseTemplate: "DRAIN {runtimeId}",   tokenTtlSeconds: 180, allowedRoles: ["admin","system_operator"], approvalMode: "approval_required" },
  { entity: "MCPServer", actionId: "mcp_server.disable",        memoRequired: true, confirmPhraseTemplate: "DISABLE MCP {serverId}",        tokenTtlSeconds: 300, allowedRoles: ["admin","capability_admin","risk_officer"], approvalMode: "approval_required" },
  { entity: "MCPServer", actionId: "mcp_server.rotate_secret",  memoRequired: true, confirmPhraseTemplate: "ROTATE MCP SECRET {serverId}",  tokenTtlSeconds: 300, allowedRoles: ["admin","capability_admin"], approvalMode: "approval_required" },
  { entity: "MCPTool",   actionId: "mcp_tool.grant_persona",    memoRequired: true, confirmPhraseTemplate: "GRANT MCP {toolId}",            tokenTtlSeconds: 300, allowedRoles: ["admin","capability_admin","risk_officer"], approvalMode: "approval_required" },
  { entity: "Tool",      actionId: "tool.disable",              memoRequired: true, confirmPhraseTemplate: "DISABLE TOOL {toolId}",         tokenTtlSeconds: 300, allowedRoles: ["admin","capability_admin","risk_officer"], approvalMode: "approval_required" },
  { entity: "Skill",     actionId: "skill.approve",             memoRequired: true, confirmPhraseTemplate: "APPROVE SKILL {skillId}",       tokenTtlSeconds: 300, allowedRoles: ["admin","capability_admin","risk_officer"], approvalMode: "approval_required" },
  { entity: "Skill",     actionId: "skill.deprecate",           memoRequired: true, confirmPhraseTemplate: "DEPRECATE SKILL {skillId}",     tokenTtlSeconds: 300, allowedRoles: ["admin","capability_admin"], approvalMode: "approval_required" },
  { entity: "MemoryItem",actionId: "memory.delete",             memoRequired: true, confirmPhraseTemplate: "DELETE MEMORY {memoryId}",      tokenTtlSeconds: 300, allowedRoles: ["admin","ai_trainer","risk_officer"], approvalMode: "approval_required" },
] as const;

const HRA_INDEX: ReadonlyMap<string, HighRiskAction> = new Map(
  HIGH_RISK_ACTIONS.map((a) => [a.actionId, a]),
);

export function getHighRiskAction(actionId: string): HighRiskAction | undefined {
  return HRA_INDEX.get(actionId);
}

export function buildConfirmPhrase(action: HighRiskAction, params: Record<string, string>): string {
  return action.confirmPhraseTemplate.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
}

// ---------- §6.2 Confirmation Token API ----------

export interface ConfirmTokenRequest {
  actionId: string;
  entityType: string;
  entityId: string;
  payloadHash: string;
  tradingEnvironment: TradingEnvironment;
  platformEnvironment: PlatformEnvironment;
}

export interface ConfirmTokenResponse {
  confirmToken: string;
  expiresAt: string;
  ttlSeconds: number;
  requiredPhrase: string;
  requiresMemo: boolean;
  auditEventPreview: string;
}

/** Mock issuance of a confirm token (BFF endpoint: POST /bff/command-confirmations). */
export function issueConfirmToken(req: ConfirmTokenRequest, params: Record<string, string>): ConfirmTokenResponse {
  const action = HRA_INDEX.get(req.actionId);
  if (!action) throw new Error(`unknown high-risk action: ${req.actionId}`);
  const ttl = action.tokenTtlSeconds;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const token = `ctok_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  return {
    confirmToken: token,
    expiresAt,
    ttlSeconds: ttl,
    requiredPhrase: buildConfirmPhrase(action, { ...params, [`${req.entityType}Id`]: req.entityId }),
    requiresMemo: action.memoRequired,
    auditEventPreview: `${req.actionId}.requested`,
  };
}

// ---------- §6.3 Emergency Kill ----------

export type EmergencyKillTarget =
  | "live_strategy" | "runtime" | "broker_connection"
  | "mcp_server" | "tool" | "skill";

export interface EmergencyKillEntryPoint {
  entryPoint: string;
  target: EmergencyKillTarget | EmergencyKillTarget[];
  routePattern: string;
  uiPath: string;
}

export const EMERGENCY_KILL_ENTRY_POINTS: readonly EmergencyKillEntryPoint[] = [
  { entryPoint: "Live Strategy Detail", target: "live_strategy", routePattern: "/management/strategies/:strategyId", uiPath: "Paper/Live Execution tab → Danger Zone → Emergency Kill" },
  { entryPoint: "Runtime Monitor",      target: "runtime",       routePattern: "/management/runtimes/:runtimeId",   uiPath: "Runtime Actions → Emergency Kill Runtime" },
  { entryPoint: "Incident Detail",      target: ["live_strategy","runtime","broker_connection"], routePattern: "/management/incidents/:incidentId", uiPath: "Emergency Actions panel" },
  { entryPoint: "MCP Server Detail",    target: "mcp_server",    routePattern: "/management/mcp/:serverId",         uiPath: "Danger Zone → Disable Immediately" },
  { entryPoint: "Tool Detail",          target: "tool",          routePattern: "/management/tools/:toolId",         uiPath: "Danger Zone → Disable Immediately" },
  { entryPoint: "Skill Detail",         target: "skill",         routePattern: "/management/skills/:skillId",       uiPath: "Danger Zone → Block Immediately" },
] as const;

/** SLA: open modal ≤1s, fetch token ≤2s, submit ≤2s, total user-controlled portion. */
export const EMERGENCY_KILL_SLA = {
  openModalMs: 1000,
  fetchTokenMs: 2000,
  submitCommandMs: 2000,
  createIncidentMs: 5000,
} as const;
