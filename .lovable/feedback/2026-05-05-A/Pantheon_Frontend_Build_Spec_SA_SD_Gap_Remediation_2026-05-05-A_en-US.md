# Pantheon Frontend Build Spec — SA/SD Gap Remediation Pack 2026-05-05-A

**Document status**: Normative Addendum. This document overrides all conflicting or incomplete statements in Parts 1–8.  
**Scope**: Pantheon Management Console, Pantheon Agora Workbench, BFF Contract, State Machines, Permissions, Mock Data.  
**Source**: `Pantheon Spec Gap Audit — 2026-05-05-A`. The audit found 92 gaps across Parts 1–8. Markdown gap labels count H=28, M=41, L=23; the overview table reports H=27 and L=24. This document follows the per-item severity labels.

---

## 1. Remediation Rules

1. This specification must not end requirements with unexplained words such as “etc.” or “and so on.”
2. Every enum must list all values, label keys, usage surfaces, and terminal-state behavior.
3. Every high-risk action must define entity, endpoint, role, memo rule, confirmation token rule, and audit event.
4. Every actionable UI element must come from BFF `availableActions`; the frontend must not infer permissions locally.
5. Every long-running operation must become a Job and update the UI through realtime events.
6. Agora may create handoffs, insights, training examples, research tasks, memos, and drafts. It must not directly deploy, rebalance, or grant production capabilities.

---

## 2. Override Priority

| Priority | Source | Rule |
|---:|---|---|
| 1 | This SA/SD Gap Remediation Pack | If Parts 1–8 conflict with this document, this document wins. |
| 2 | Part 6 BFF API Contract | After applying this document, Part 6 defines BFF DTOs. |
| 3 | Part 7 Component System / State Machines | After applying this document, Part 7 defines components and UI state machines. |
| 4 | Parts 1–5 / Part 8 | Product intent, page intent, and implementation prompts. |

---

## 3. Process-to-Surface Mapping

| Management process | Primary surface | Secondary surface | Required action surface | Realtime surface | Audit surface |
|---|---|---|---|---|---|
| Insight Intake | Management Command Center / Agora Insight Inbox | Knowledge & Lineage | Convert to Strategy, Create Research Task, Archive | `insight.created`, `handoff.created` | Insight Audit Timeline |
| Strategy Lifecycle | Strategy & Alpha Management | Governance, Deployment, Experiments | Submit Review, Promote Paper, Request Live, Rollback, Retire | `strategy.state_changed` | Strategy Audit Timeline |
| Strategy Spec / Artifact | Strategy Detail / Artifacts | Lineage | Lock Spec, Promote Artifact, Deprecate Artifact | `artifact.updated` | Artifact Audit Timeline |
| Research / Experiment | Research & Experiments | Strategy Detail | Run, Cancel, Retry, Compare, Attach Evidence | `job.progress`, `experiment.completed` | Experiment Audit Timeline |
| Governance / Approval | Governance & Approvals | Command Center | Approve, Reject, Request Changes, Escalate | `approval.requested`, `approval.decided` | Approval History |
| Deployment / Runtime / Risk | Deployment, Runtime & Risk | Strategy Detail | Deploy, Pause, Resume, Rollback, Emergency Kill | `deployment.updated`, `runtime.heartbeat`, `risk.alert_created` | Deployment Audit Timeline |
| Persona Lifecycle | Persona Directorate | Trainer Studio | Activate, Restrict, Suspend, Retire | `persona.updated`, `persona.policy_changed` | Persona Audit Timeline |
| Persona Policy / Permissions | Persona Detail / Tools, MCP & Skills | Governance | Grant, Revoke, Publish Policy, Rollback Policy | `persona.permission_changed` | Permission Audit |
| Persona Memory / Training | Persona Detail / Agora Memory Review | Trainer Studio | Approve Memory, Quarantine Memory, Create Training Example | `memory.updated`, `training_example.created` | Memory Audit Timeline |
| Capital Pool / Risk Budget | Capital, Ranking & Rebalance | Risk Center | Freeze Pool, Set Risk Budget, Bind Persona, Bind Strategy | `capital_pool.updated` | Capital Audit Timeline |
| Performance Ranking / Formula | Performance Ranking / Formula Studio | Capital Pool Detail | Test Formula, Activate Formula, Rollback Formula | `ranking.recalculated`, `formula.activated` | Formula Audit Timeline |
| Quarterly Rebalance | Quarterly Rebalance Detail | Capital Pool Detail | Freeze Metrics, Simulate, Override, Approve, Apply, Rollback | `rebalance.updated` | Rebalance Audit Timeline |
| Evolution Steering | Evolution Program Detail | Strategy Detail | Start Run, Pause Run, Promote Candidate | `evolution_run.updated` | Evolution Audit Timeline |
| Tool / MCP / Skill | Tools, MCP & Skills | Persona Detail | Register, Discover, Sandbox, Approve, Grant, Revoke | `tool.call_completed`, `mcp.call_failed`, `skill.sandbox_completed` | Capability Audit Timeline |
| Jobs / Events / Audit | Jobs, Events & Audit | All entity inspectors | Cancel, Retry, Clone, Export Audit | `job.progress`, `audit.created` | Global Audit Explorer |

---

## 4. Canonical Status / State Machines

Strategy uses three separate fields. `under_review` is not a lifecycle status. `paused` is not a lifecycle status.

```ts
type StrategyLifecycleStatus =
  | 'discovered'
  | 'scaffolded'
  | 'replicated'
  | 'approved'
  | 'paper'
  | 'live'
  | 'degraded'
  | 'retired';

type StrategyReviewStatus =
  | 'none'
  | 'draft'
  | 'submitted'
  | 'validator_running'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'cancelled';

type StrategyDeploymentStatus =
  | 'not_deployed'
  | 'scheduled'
  | 'deploying'
  | 'running'
  | 'paused'
  | 'rolling_back'
  | 'failed'
  | 'stopped';
```

### Strategy lifecycle transition table

| From | To | Action | Allowed roles | Approval | Confirm token | Required evidence | Audit event |
|---|---|---|---|---|---|---|---|
| discovered | scaffolded | `strategy.scaffold` | Admin, Research Lead, Strategy Manager | No | No | thesis, source, ownerPersonaId | `strategy.scaffolded` |
| scaffolded | replicated | `strategy.mark_replicated` | Admin, Research Lead, Strategy Manager | No | No | completed backtest, completed OOS, reproducibilityHash | `strategy.replicated` |
| replicated | approved | `strategy.approve_review` | Admin, Reviewer, Risk Officer | Yes | No | reviewDecisionId, validatorResults | `strategy.approved` |
| approved | paper | `strategy.promote_paper` | Admin, Research Lead, Risk Officer | Yes | Yes | artifactId, capitalPoolId, riskBudgetId, paperRuntimeId | `strategy.paper_promoted` |
| paper | live | `strategy.deploy_live` | Admin, Risk Officer, System Operator | Yes | Yes | artifactId, liveRuntimeId, brokerBindingId, rollbackArtifactId | `strategy.live_deployed` |
| live | degraded | `strategy.mark_degraded` | Admin, Risk Officer, System Operator | No | No | alertId or incidentId | `strategy.degraded` |
| live | retired | `strategy.retire_live` | Admin, Risk Officer | Yes | Yes | postmortemRequired=true, retirementReason | `strategy.retired` |
| degraded | live | `strategy.restore_live` | Admin, Risk Officer, System Operator | Yes | Yes | mitigationId, riskOfficerMemo | `strategy.restored_live` |
| degraded | retired | `strategy.retire_degraded` | Admin, Risk Officer | Yes | Yes | incidentId, retirementReason | `strategy.retired` |
| paper | retired | `strategy.retire_paper` | Admin, Research Lead, Risk Officer | Yes | Yes | retirementReason | `strategy.retired` |

### Persona status

```ts
type PersonaStatus =
  | 'draft'
  | 'sandbox'
  | 'active'
  | 'probation'
  | 'restricted'
  | 'suspended'
  | 'retired'
  | 'archived';
```

### CapitalPool status

```ts
type CapitalPoolStatus =
  | 'draft'
  | 'active'
  | 'frozen'
  | 'rebalancing'
  | 'restricted'
  | 'retired';
```

### Other canonical statuses

| Entity | Canonical status enum | Terminal statuses | Removed alias |
|---|---|---|---|
| RankingFormula | draft, testing, approved, active, deprecated, retired | retired | none |
| QuarterlyRebalance | draft, metrics_freezing, metrics_frozen, ranking_calculated, simulation_ready, under_review, approved, scheduled, applied, rolled_back, cancelled | applied, rolled_back, cancelled | none |
| EvolutionProgram | draft, active, paused, under_review, completed, retired | completed, retired | none |
| Experiment | draft, queued, running, completed, failed, invalidated, attached_to_review, archived | archived | none |
| ReviewRequest | draft, submitted, validator_running, in_review, changes_requested, approved, rejected, cancelled | approved, rejected, cancelled | none |
| Deployment | draft, submitted, approved, scheduled, deploying, deployed, failed, rolling_back, rolled_back, retired | deployed, rolled_back, retired | none |
| Tool | draft, testing, active, restricted, deprecated, blocked, retired | retired | none |
| MCPServer | draft, connected, healthy, degraded, disabled, retired | retired | none |
| Skill | draft, sandboxed, validated, approved, active, deprecated, blocked, retired | retired | deprecating |
| MemoryItem | proposed, approved, rejected, edited, merged, quarantined, sensitive, deleted | rejected, deleted | isolated |
| Insight | raw, triaged, classified, linked, converted_to_strategy, converted_to_research_task, converted_to_training_example, dismissed, archived | dismissed, archived | none |
| Job | queued, running, waiting_for_approval, completed, failed, cancelled, retrying | completed, failed, cancelled | none |

---

## 5. Permission Truth Tables

### 5.1 Management roles

```ts
type ManagementRole =
  | 'admin'
  | 'research_lead'
  | 'risk_officer'
  | 'capital_manager'
  | 'strategy_manager'
  | 'system_operator'
  | 'reviewer'
  | 'capability_admin';
```

### 5.2 Strategy actions

| Action id | Allowed roles | Requires approval | High risk | Notes |
|---|---|---:|---:|---|
| `strategy.create` | admin, research_lead, strategy_manager | No | No | Creates discovered strategy. |
| `strategy.edit_spec` | admin, research_lead, strategy_manager | No | No | Disabled after approved unless unlock approved. |
| `strategy.lock_spec` | admin, research_lead, strategy_manager | No | No | Creates immutable spec version. |
| `strategy.assign_persona` | admin, research_lead, strategy_manager | No | No | Persona must be active or probation. |
| `strategy.run_experiment` | admin, research_lead, strategy_manager | No | No | Creates async job. |
| `strategy.submit_review` | admin, research_lead, strategy_manager | No | No | Creates ReviewRequest. |
| `strategy.approve_review` | admin, reviewer, risk_officer | Yes | No | Moves replicated to approved. |
| `strategy.promote_paper` | admin, research_lead, risk_officer | Yes | Yes | Creates paper deployment. |
| `strategy.request_live_promotion` | admin, research_lead, risk_officer | Yes | Yes | Creates live promotion request. |
| `strategy.deploy_live` | admin, risk_officer, system_operator | Yes | Yes | Requires approved live promotion. |
| `strategy.pause_live` | admin, risk_officer, system_operator | Yes | Yes | Updates deploymentStatus to paused. |
| `strategy.resume_live` | admin, risk_officer, system_operator | Yes | Yes | Updates deploymentStatus to running. |
| `strategy.rollback_live` | admin, risk_officer, system_operator | Yes | Yes | Requires rollbackArtifactId. |
| `strategy.emergency_kill` | admin, risk_officer, system_operator | No pre-approval | Yes | Mandatory memo and postmortem. |
| `strategy.retire` | admin, research_lead, risk_officer | Yes | Yes | Requires retirementReason. |
| `strategy.archive` | admin, strategy_manager | No | No | Only retired strategy. |

### 5.3 Persona actions

| Action id | Allowed roles | Requires approval | High risk | Notes |
|---|---|---:|---:|---|
| `persona.create` | admin, research_lead, ai_trainer | No | No | Creates draft persona. |
| `persona.clone` | admin, research_lead, ai_trainer | No | No | Creates draft persona from existing version. |
| `persona.edit_identity` | admin, research_lead, ai_trainer | No | No | Role, style, risk appetite. |
| `persona.update_route_policy` | admin, research_lead, risk_officer | Yes | Yes | Publishes new policy version. |
| `persona.grant_tool` | admin, capability_admin, risk_officer | Yes | Yes | Tool must be active. |
| `persona.revoke_tool` | admin, capability_admin, risk_officer | Yes | Yes | Immediate effect. |
| `persona.grant_mcp_tool` | admin, capability_admin, risk_officer | Yes | Yes | MCP server must be healthy. |
| `persona.revoke_mcp_tool` | admin, capability_admin, risk_officer | Yes | Yes | Immediate effect. |
| `persona.grant_skill` | admin, capability_admin, research_lead | Yes | Yes | Skill must be active. |
| `persona.revoke_skill` | admin, capability_admin, research_lead | Yes | Yes | Immediate effect. |
| `persona.activate` | admin, research_lead | Yes | Yes | Sandbox evaluation required. |
| `persona.restrict` | admin, risk_officer | Yes | Yes | May disable permissions. |
| `persona.suspend` | admin, risk_officer | Yes | Yes | Stops new tasks. |
| `persona.retire` | admin, research_lead | Yes | Yes | Requires retirement memo. |

### 5.4 Capital / ranking / rebalance actions

| Action id | Allowed roles | Requires approval | High risk | Notes |
|---|---|---:|---:|---|
| `capital_pool.create` | admin, capital_manager | No | No | Creates draft pool. |
| `capital_pool.edit_mandate` | admin, capital_manager, risk_officer | Yes | Yes | Affects allowed allocation. |
| `capital_pool.set_risk_budget` | admin, capital_manager, risk_officer | Yes | Yes | Requires risk memo. |
| `capital_pool.bind_persona` | admin, capital_manager, risk_officer | Yes | Yes | Requires persona status active/probation. |
| `capital_pool.bind_strategy` | admin, capital_manager, risk_officer | Yes | Yes | Requires strategy approved/paper/live. |
| `ranking_formula.create` | admin, capital_manager, risk_officer | No | No | Creates draft formula. |
| `ranking_formula.edit` | admin, capital_manager, risk_officer | No | No | Only draft/testing. |
| `ranking_formula.test` | admin, capital_manager, risk_officer | No | No | Creates formula backtest job. |
| `ranking_formula.approve` | admin, risk_officer, reviewer | Yes | Yes | Moves testing to approved. |
| `ranking_formula.activate` | admin, capital_manager, risk_officer | Yes | Yes | Affects future ranking. |
| `ranking_formula.rollback` | admin, capital_manager, risk_officer | Yes | Yes | Restores prior active version. |
| `rebalance.freeze_metrics` | admin, capital_manager | No | No | Starts metric freeze. |
| `rebalance.calculate_ranking` | admin, capital_manager | No | No | Creates job. |
| `rebalance.apply_override` | admin, capital_manager, risk_officer | Yes | Yes | Requires override reason. |
| `rebalance.approve` | admin, risk_officer, capital_manager | Yes | Yes | Requires reviewer and approver. |
| `rebalance.apply` | admin, capital_manager, system_operator | Yes | Yes | Applies allocation. |
| `rebalance.rollback` | admin, capital_manager, risk_officer | Yes | Yes | Restores previous allocation. |

### 5.5 Capability actions

| Action id | Allowed roles | Requires approval | High risk | Notes |
|---|---|---:|---:|---|
| `tool.register` | admin, capability_admin | No | No | Creates draft tool. |
| `tool.edit_schema` | admin, capability_admin | No | No | Draft/testing only. |
| `tool.classify_risk` | admin, capability_admin, risk_officer | Yes | Yes | Sets sideEffectLevel. |
| `tool.disable` | admin, capability_admin, risk_officer | Yes | Yes | Immediate effect. |
| `mcp_server.add` | admin, capability_admin | Yes | Yes | Requires credential scope. |
| `mcp_server.rotate_secret` | admin, capability_admin | Yes | Yes | Secret never shown in UI. |
| `mcp_server.disable` | admin, capability_admin, risk_officer | Yes | Yes | Stops calls. |
| `mcp_tool.grant_persona` | admin, capability_admin, risk_officer | Yes | Yes | Requires parameter restrictions. |
| `skill.create_draft` | admin, capability_admin, ai_trainer | No | No | Draft only. |
| `skill.run_sandbox` | admin, capability_admin, ai_trainer | No | No | Creates sandbox job. |
| `skill.approve` | admin, capability_admin, risk_officer | Yes | Yes | Moves approved/active. |
| `skill.deprecate` | admin, capability_admin | Yes | Yes | Requires replacement note. |

---

## 6. High-Risk Actions / Confirmation Token

### 6.1 High-risk action catalog

| Entity | Action id | Memo required | Confirm phrase | Token TTL | Allowed roles | Approval mode |
|---|---|---:|---|---:|---|---|
| Strategy | `strategy.promote_paper` | Yes | `PROMOTE PAPER {strategyId}` | 300s | admin, research_lead, risk_officer | approval_required |
| Strategy | `strategy.deploy_live` | Yes | `DEPLOY LIVE {strategyId}` | 300s | admin, risk_officer, system_operator | approval_required |
| Strategy | `strategy.pause_live` | Yes | `PAUSE LIVE {strategyId}` | 300s | admin, risk_officer, system_operator | approval_required |
| Strategy | `strategy.resume_live` | Yes | `RESUME LIVE {strategyId}` | 300s | admin, risk_officer, system_operator | approval_required |
| Strategy | `strategy.rollback_live` | Yes | `ROLLBACK LIVE {strategyId}` | 300s | admin, risk_officer, system_operator | approval_required |
| Strategy | `strategy.emergency_kill` | Yes | `KILL {strategyId}` | 120s | admin, risk_officer, system_operator | emergency_no_preapproval |
| Strategy | `strategy.retire` | Yes | `RETIRE {strategyId}` | 300s | admin, research_lead, risk_officer | approval_required |
| CapitalPool | `capital_pool.edit_mandate` | Yes | `UPDATE MANDATE {poolId}` | 300s | admin, capital_manager, risk_officer | approval_required |
| CapitalPool | `capital_pool.set_risk_budget` | Yes | `SET RISK {poolId}` | 300s | admin, capital_manager, risk_officer | approval_required |
| CapitalPool | `capital_pool.freeze` | Yes | `FREEZE {poolId}` | 300s | admin, capital_manager, risk_officer | approval_required |
| QuarterlyRebalance | `rebalance.apply_override` | Yes | `OVERRIDE {rebalanceId}` | 300s | admin, capital_manager, risk_officer | approval_required |
| QuarterlyRebalance | `rebalance.apply` | Yes | `APPLY REBALANCE {rebalanceId}` | 300s | admin, capital_manager, system_operator | approval_required |
| QuarterlyRebalance | `rebalance.rollback` | Yes | `ROLLBACK REBALANCE {rebalanceId}` | 300s | admin, capital_manager, risk_officer | approval_required |
| RankingFormula | `ranking_formula.activate` | Yes | `ACTIVATE FORMULA {formulaId}` | 300s | admin, capital_manager, risk_officer | approval_required |
| RankingFormula | `ranking_formula.rollback` | Yes | `ROLLBACK FORMULA {formulaId}` | 300s | admin, capital_manager, risk_officer | approval_required |
| Persona | `persona.update_route_policy` | Yes | `PUBLISH POLICY {personaId}` | 300s | admin, research_lead, risk_officer | approval_required |
| Persona | `persona.activate` | Yes | `ACTIVATE PERSONA {personaId}` | 300s | admin, research_lead | approval_required |
| Persona | `persona.restrict` | Yes | `RESTRICT PERSONA {personaId}` | 300s | admin, risk_officer | approval_required |
| Persona | `persona.suspend` | Yes | `SUSPEND PERSONA {personaId}` | 300s | admin, risk_officer | approval_required |
| Runtime | `runtime.restart` | Yes | `RESTART {runtimeId}` | 180s | admin, system_operator | approval_required |
| Runtime | `runtime.stop` | Yes | `STOP {runtimeId}` | 180s | admin, system_operator, risk_officer | approval_required |
| Runtime | `runtime.drain` | Yes | `DRAIN {runtimeId}` | 180s | admin, system_operator | approval_required |
| MCPServer | `mcp_server.disable` | Yes | `DISABLE MCP {serverId}` | 300s | admin, capability_admin, risk_officer | approval_required |
| MCPServer | `mcp_server.rotate_secret` | Yes | `ROTATE MCP SECRET {serverId}` | 300s | admin, capability_admin | approval_required |
| MCPTool | `mcp_tool.grant_persona` | Yes | `GRANT MCP {toolId}` | 300s | admin, capability_admin, risk_officer | approval_required |
| Tool | `tool.disable` | Yes | `DISABLE TOOL {toolId}` | 300s | admin, capability_admin, risk_officer | approval_required |
| Skill | `skill.approve` | Yes | `APPROVE SKILL {skillId}` | 300s | admin, capability_admin, risk_officer | approval_required |
| Skill | `skill.deprecate` | Yes | `DEPRECATE SKILL {skillId}` | 300s | admin, capability_admin | approval_required |
| MemoryItem | `memory.delete` | Yes | `DELETE MEMORY {memoryId}` | 300s | admin, ai_trainer, risk_officer | approval_required |

### 6.2 Confirmation token API

```http
POST /bff/command-confirmations
Content-Type: application/json
Accept-Language: zh-TW | en-US
```

Request:

```json
{
  "actionId": "strategy.rollback_live",
  "entityType": "strategy",
  "entityId": "alpha_042",
  "payloadHash": "sha256:7f9a...",
  "tradingEnvironment": "live",
  "platformEnvironment": "production"
}
```

Response:

```json
{
  "confirmToken": "ctok_01HX...",
  "expiresAt": "2026-05-05T12:05:00.000Z",
  "ttlSeconds": 300,
  "requiredPhrase": "ROLLBACK LIVE alpha_042",
  "requiresMemo": true,
  "auditEventPreview": "strategy.rollback_live.requested"
}
```

Token rules:

| Rule | Requirement |
|---|---|
| Single use | Token is invalid after one command attempt. |
| User-bound | Token only valid for requester user id. |
| Role-bound | Token invalid if role changes before command submission. |
| Entity-bound | Token only valid for entityType + entityId. |
| Action-bound | Token only valid for actionId. |
| Payload-bound | Token invalid if payloadHash changes. |
| Environment-bound | Token only valid for platformEnvironment + tradingEnvironment. |
| Expiry | Default 300 seconds; emergency action 120 seconds; runtime action 180 seconds. |
| Refresh | UI must request a new token after expiry. |

Command request must include:

```json
{
  "confirmToken": "ctok_01HX...",
  "typedPhrase": "ROLLBACK LIVE alpha_042",
  "memo": "Rollback because slippage breach exceeded live risk threshold.",
  "payload": {
    "rollbackArtifactId": "artifact_v11"
  }
}
```

### 6.3 Emergency Kill spec（修正 G86）

Emergency Kill target enum:

```ts
type EmergencyKillTarget =
  | 'live_strategy'
  | 'runtime'
  | 'broker_connection'
  | 'mcp_server'
  | 'tool'
  | 'skill';
```

Entry points:

| Entry point | Target | Location | Required UI path |
|---|---|---|---|
| Live Strategy Detail | live_strategy | `/management/strategies/:strategyId` → Paper/Live Execution tab | Danger Zone → Emergency Kill |
| Runtime Monitor | runtime | `/management/runtimes/:runtimeId` | Runtime Actions → Emergency Kill Runtime |
| Incident Detail | live_strategy, runtime, broker_connection | `/management/incidents/:incidentId` | Emergency Actions panel |
| MCP Server Detail | mcp_server | `/management/mcp/:serverId` | Danger Zone → Disable Immediately |
| Tool Detail | tool | `/management/tools/:toolId` | Danger Zone → Disable Immediately |
| Skill Detail | skill | `/management/skills/:skillId` | Danger Zone → Block Immediately |

Execution SLA:

| Step | Max time | Requirement |
|---|---:|---|
| Open modal | 1s | UI must not wait for audit history. |
| Fetch confirm token | 2s | If token fetch fails, command disabled. |
| User typed phrase and memo | User-controlled | Memo required. |
| Submit kill command | 2s | BFF returns accepted job id or failure. |
| Create incident / postmortem task | 5s | Automatic after accepted command. |

Emergency Kill does not require pre-approval, but it always creates:

```text
incident.updated
audit.created
postmortem.required
training_feedback.suggested
```

---

## 7. Environment Model / Action Gating

```ts
type PlatformEnvironment = 'local' | 'dev' | 'staging' | 'production';
type TradingEnvironment = 'research' | 'paper' | 'live';
```

| Platform env | Trading env | Live external side effects | Paper deployment | Research jobs | High-risk commands |
|---|---|---:|---:|---:|---:|
| local | research | No | No | Yes, mock only | No |
| dev | research | No | No | Yes, mock or dev worker | No |
| staging | research | No | No | Yes, staging worker | Confirmed mock only |
| staging | paper | No | Yes, staging paper only | Yes | Confirmed mock only |
| production | research | No | No | Yes | Yes if entity allows |
| production | paper | No | Yes | Yes | Yes if entity allows |
| production | live | Yes | Yes | Yes | Yes with high-risk confirmation |

---

## 8. availableActions Contract

`availableActions` is always `ActionDescriptor[]`. It is never `string[]`.

```ts
interface ActionDescriptor {
  id: string;
  labelKey: string;
  entityType: EntityType;
  actionType: 'query' | 'command' | 'job_command' | 'approval_command' | 'navigation';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  disabledReasonKey?: string;
  disabledReasonParams?: Record<string, string | number | boolean>;
  requiresApproval: boolean;
  requiresConfirmation: boolean;
  requiresMemo: boolean;
  allowedRoles: ManagementRole[];
  requiredEntityStatuses: string[];
  requiredPlatformEnvironments: PlatformEnvironment[];
  requiredTradingEnvironments: TradingEnvironment[];
  blockers: ActionBlocker[];
  commandEndpoint?: string;
  confirmEndpoint?: string;
}
```

---

## 9. Capital Pool Mandate Schema

```ts
interface CapitalPoolMandate {
  mandateId: string;
  poolId: string;
  displayName: string;
  description: string;
  baseCurrency: 'USD' | 'TWD' | 'EUR' | 'JPY';
  allowedMarkets: Array<'US_EQUITY' | 'TW_EQUITY' | 'FX' | 'CRYPTO' | 'FUTURES' | 'ETF'>;
  allowedStrategyTypes: Array<'mean_reversion' | 'trend_following' | 'stat_arb' | 'factor' | 'macro' | 'execution' | 'risk_overlay'>;
  allowedPersonaIds: string[];
  maxGrossExposurePct: number;
  maxNetExposurePct: number;
  maxSingleStrategyAllocationPct: number;
  maxSinglePersonaAllocationPct: number;
  minCashReservePct: number;
  maxDrawdownPct: number;
  warningDrawdownPct: number;
  maxLeverage: number;
  maxTurnoverDailyPct: number;
  maxConcentrationByAssetPct: number;
  maxCorrelationToExistingLive: number;
  deployModesAllowed: Array<'research' | 'paper' | 'live'>;
  emergencyRules: {
    autoFreezeOnDrawdownPct: number;
    autoIncidentOnRiskBreach: boolean;
    requireRiskOfficerForUnfreeze: boolean;
  };
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
  status: 'draft' | 'active' | 'deprecated';
}
```

Validation rules:

| Field | Rule |
|---|---|
| `maxGrossExposurePct` | 0–300 |
| `maxNetExposurePct` | 0–200 |
| `maxSingleStrategyAllocationPct` | 0–100 |
| `maxSinglePersonaAllocationPct` | 0–100 |
| `minCashReservePct` | 0–100 |
| `maxDrawdownPct` | 0–100 and greater than warningDrawdownPct |
| `warningDrawdownPct` | 0–100 and less than maxDrawdownPct |
| `maxLeverage` | 0–10 |
| `maxCorrelationToExistingLive` | 0–1 |

---

## 10. Ranking Formula / Metric Matrix

### 10.1 Ranking scopes

```ts
type RankingScope =
  | 'persona'
  | 'strategy'
  | 'alpha_family'
  | 'capital_pool'
  | 'paper_strategy'
  | 'live_strategy'
  | 'research_productivity'
  | 'risk_adjusted';
```

### 10.2 Scope to metric matrix

| Metric | persona | strategy | alpha_family | capital_pool | paper_strategy | live_strategy | research_productivity | risk_adjusted |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| quarterly_return | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| annualized_return | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| sharpe | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| sortino | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| calmar | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| max_drawdown | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| volatility | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| turnover | Yes | Yes | Yes | No | Yes | Yes | No | Yes |
| hit_rate | Yes | Yes | Yes | No | Yes | Yes | No | Yes |
| profit_factor | Yes | Yes | Yes | No | Yes | Yes | No | Yes |
| tail_risk | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| slippage | Yes | Yes | Yes | No | Yes | Yes | No | Yes |
| capacity | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| stability | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| live_paper_gap | No | Yes | Yes | No | No | Yes | No | Yes |
| risk_violation_count | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| drawdown_recovery_days | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| research_productivity | Yes | No | No | No | No | No | Yes | No |
| experiment_success_rate | Yes | No | No | No | No | No | Yes | No |
| human_override_penalty | Yes | Yes | No | No | Yes | Yes | No | Yes |
| policy_violation_penalty | Yes | No | No | No | No | No | No | Yes |

### 10.3 Formula schema

```ts
interface RankingFormula {
  id: string;
  name: string;
  scope: RankingScope;
  version: number;
  status: 'draft' | 'testing' | 'approved' | 'active' | 'deprecated' | 'retired';
  window: {
    period: 'quarter' | 'half_year' | 'year' | 'rolling_90d' | 'rolling_180d' | 'rolling_365d';
    startDate?: string;
    endDate?: string;
  };
  normalization: 'z_score' | 'min_max' | 'rank_percentile' | 'none';
  outlierHandling: 'winsorize_1_99' | 'winsorize_5_95' | 'clip_3sigma' | 'none';
  metrics: RankingMetricWeight[];
  caps: {
    minScore?: number;
    maxScore?: number;
    minAllocationPct?: number;
    maxAllocationPct?: number;
  };
  createdBy: string;
  approvedBy?: string;
  activeFrom?: string;
}

interface RankingMetricWeight {
  metric: string;
  weight: number;
  direction: 'higher_is_better' | 'lower_is_better';
  transform: 'identity' | 'log' | 'sqrt' | 'clip' | 'binary';
  penaltyMode: 'none' | 'linear' | 'step' | 'hard_block';
  hardBlockThreshold?: number;
}
```

Weight validation:

```text
For metrics where penaltyMode = none, sum(abs(weight)) must be 1.0 ± 0.0001.
For penalty metrics, weight must be negative.
For reward metrics, weight must be positive.
A formula cannot become active unless status = approved.
```

---

## 11. Quarterly Rebalance Workflow

### 11.1 Required reviewer / approver fields

```ts
interface QuarterlyRebalance {
  id: string;
  quarter: string;
  capitalPoolId: string;
  formulaId: string;
  formulaVersion: number;
  status: QuarterlyRebalanceStatus;
  reviewers: RebalanceReviewer[];
  approvers: RebalanceApprover[];
  metricFreeze: MetricFreeze;
  rankingResultId?: string;
  simulationId?: string;
  overrides: AllocationOverride[];
  scheduledEffectiveAt?: string;
  appliedAt?: string;
  rollbackOf?: string;
}

interface RebalanceReviewer {
  userId: string;
  role: 'capital_manager' | 'risk_officer' | 'reviewer';
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  memo?: string;
  decidedAt?: string;
}

interface RebalanceApprover {
  userId: string;
  role: 'capital_manager' | 'risk_officer' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  memo?: string;
  decidedAt?: string;
}
```

### 11.2 Step table

| Step | Status after step | Primary role | Secondary role | Required UI component | Required BFF action | Can reject | Audit event |
|---|---|---|---|---|---|---:|---|
| Create event | draft | capital_manager | admin | RebalanceCreateForm | `POST /bff/rebalances` | No | `rebalance.created` |
| Freeze metrics | metrics_frozen | capital_manager | risk_officer | MetricFreezePanel | `rebalance.freeze_metrics` | No | `rebalance.metrics_frozen` |
| Calculate ranking | ranking_calculated | capital_manager | admin | RankingResultViewer | `rebalance.calculate_ranking` | No | `rebalance.ranking_calculated` |
| Run simulation | simulation_ready | capital_manager | risk_officer | AllocationSimulationPanel | `rebalance.run_simulation` | No | `rebalance.simulation_ready` |
| Apply override | simulation_ready | capital_manager | risk_officer | OverrideManager | `rebalance.apply_override` | Yes | `rebalance.override_applied` |
| Submit review | under_review | capital_manager | admin | RebalanceReviewSubmitter | `rebalance.submit_review` | No | `rebalance.submitted` |
| Risk review | under_review | risk_officer | reviewer | ApprovalPanel | `rebalance.review_decide` | Yes | `rebalance.review_decided` |
| Final approval | approved | capital_manager, risk_officer | admin | ApprovalPanel | `rebalance.approve` | Yes | `rebalance.approved` |
| Schedule | scheduled | capital_manager | system_operator | ScheduleEffectiveDate | `rebalance.schedule` | No | `rebalance.scheduled` |
| Apply | applied | capital_manager, system_operator | risk_officer | HighRiskConfirmationModal | `rebalance.apply` | No | `rebalance.applied` |
| Rollback | rolled_back | capital_manager, risk_officer | admin | HighRiskConfirmationModal | `rebalance.rollback` | No | `rebalance.rolled_back` |

---

## 12. Evolution Steering Entity Schemas

```ts
interface EvolutionConstraint {
  id: string;
  programId: string;
  type: 'hard' | 'soft';
  field: 'max_drawdown' | 'turnover' | 'capacity' | 'correlation' | 'market' | 'asset_liquidity' | 'holding_period' | 'leverage';
  operator: '<=' | '>=' | '=' | 'in' | 'not_in';
  value: number | string | string[];
  penaltyWeight?: number;
  status: 'active' | 'disabled';
}

interface EvolutionAlert {
  id: string;
  programId: string;
  runId?: string;
  severity: 'info' | 'warning' | 'high' | 'critical';
  type: 'fitness_plateau' | 'constraint_breach' | 'compute_budget_breach' | 'candidate_risk' | 'data_quality';
  messageKey: string;
  createdAt: string;
  status: 'new' | 'acknowledged' | 'resolved';
}

interface EvolutionApproval {
  id: string;
  programId: string;
  candidateId?: string;
  type: 'program_activate' | 'fitness_formula_change' | 'candidate_promote' | 'budget_increase' | 'constraint_change';
  requestedBy: string;
  reviewers: string[];
  status: 'submitted' | 'in_review' | 'approved' | 'rejected' | 'changes_requested';
  memo?: string;
}
```

---

## 13. Management Page Tab Corrections

Strategy Detail has exactly 13 tabs:

```text
Overview
Spec & Parameters
Data & Features
Costs & Slippage
Experiments
Performance
Paper / Live Execution
Risk & Alerts
Incidents
Artifacts
Evolution
Governance
Lineage & Audit
```

Persona Detail has exactly 12 tabs:

```text
Overview
Identity & Role
Private Workspace
Route Policy
Tools / MCP / Skills
Capital Binding
Strategy Ownership
Performance & Ranking
Activity Monitor
Training & Memory
Evaluations
Version History & Audit
```

Capital Pool Detail has exactly 10 tabs:

```text
Overview
Mandate
Persona Binding
Strategy Binding
Risk Budget
Current Exposure
Performance
Ranking Inputs
Rebalance History
Overrides & Audit
```

---

## 14. Canonical Routes

Canonical Risk Center route:

```text
/management/risk
```

Deprecated redirect:

```text
/management/risk-center → /management/risk
```

---

## 15. Agora Handoff Schema

```ts
type AgoraHandoffType =
  | 'strategy_idea'
  | 'research_task'
  | 'training_example'
  | 'committee_memo'
  | 'skill_draft'
  | 'mcp_tool_request'
  | 'incident_note'
  | 'signal_feedback';
```

Every Agora handoff must include source route, source session, source messages, creator, priority, target entity, title, summary, payload, recommended management action, and status.

---

## 16. Signal Feedback Write Contract

UI confidence scale is integer 1–5. BFF stores both raw value and normalized value.

```http
POST /bff/agora/signals/{signalId}/feedback
```

`disagree` requires reason when confidence >= 4. `flag_suspicious` always requires reason. Edits within 30 seconds update the same feedback record.

---

## 17. Agora KPI / Daily Brief Formulas

| KPI | Formula | Source | Refresh |
|---|---|---|---|
| `watchlistMoveCount` | count watchlist assets where `abs(return1dPct) >= user.watchlistMoveThresholdPct` | `/bff/agora/watchlist` | 60s |
| `openRiskAlerts` | count risk alerts where status in new, acknowledged, assigned, investigating | `/bff/alerts` | realtime |
| `signalReviewQueue` | count signals where reviewStatus = pending_trader_review | `/bff/agora/signals` | realtime |
| `paperLiveDivergenceCount` | count strategies where `abs(paperReturnWindow - liveReturnWindow) >= divergenceThresholdPct` | `/bff/strategies` | 5m |
| `personaBriefCount` | count persona daily notes generated in last 24h | `/bff/agora/daily` | 5m |
| `researchQuestionCount` | count research tasks status in new, triaged | `/bff/research/tasks` | realtime |
| `incidentNeedsTraderInput` | count incidents where requiredInputRole includes trader | `/bff/incidents` | realtime |

Default thresholds:

| Threshold | Value |
|---|---:|
| `watchlistMoveThresholdPct` | 2.0 |
| `divergenceThresholdPct` | 5.0 |
| `dailyBriefLookbackHours` | 24 |

---

## 18. Committee Evidence Pack

```ts
interface CommitteeEvidencePack {
  id: string;
  sessionId: string;
  targetEntityType: 'strategy' | 'signal' | 'incident' | 'research_note' | 'artifact';
  targetEntityId: string;
  uploadedFiles: EvidenceFile[];
  linkedEntities: LinkedEntity[];
  notes: string;
  createdBy: string;
  createdAt: string;
}

interface EvidenceFile {
  id: string;
  fileName: string;
  mimeType: 'application/pdf' | 'text/markdown' | 'text/plain' | 'text/csv' | 'image/png' | 'image/jpeg';
  sizeBytes: number;
  storageUrl: string;
  extractedTextStatus: 'not_started' | 'running' | 'completed' | 'failed';
}
```

Upload constraints:

| Constraint | Value |
|---|---:|
| Max files per evidence pack | 12 |
| Max file size | 20 MB |
| Max total size | 100 MB |
| Allowed MIME types | PDF, Markdown, Plain text, CSV, PNG, JPEG |
| Required metadata | source, title, uploadedBy, createdAt |

Endpoint:

```http
POST /bff/agora/committee/{sessionId}/evidence-pack
POST /bff/agora/committee/{sessionId}/evidence-pack/files
```

---

## 19. Full Gap Resolution Register

| Gap | Severity | Title | Patch target |
|---|---|---|---|
| G01 | H | Strategy 8 狀態與 Persona/CapitalPool 狀態未在 Part 1 全部展開 | §4 Canonical Status / State Machines |
| G02 | H | Role 清單與 Action 權限矩陣（Permission Truth Table）完全缺漏 | §5 Permission Truth Tables |
| G03 | H | High-Risk Action 未列舉完整集合與 confirm token 規格 | §6 High-Risk Actions / Confirmation Token |
| G04 | H | EnvironmentIndicator 未定義環境枚舉與切換規則 | §7 Environment Model / Action Gating |
| G05 | H | BFF availableActions 計算規則未定義 | §8 availableActions Contract |
| G06 | M | LanguageSwitcher 與 Persona 回應語言耦合規則模糊 | §19 Medium / Low Gap Resolution Register |
| G07 | M | Notification Center 訊息分類與來源未列舉 | §19 Medium / Low Gap Resolution Register |
| G08 | M | Right Drawer 內容類型只列舉部分 | §19 Medium / Low Gap Resolution Register |
| G09 | M | Global Search 範圍與 ranking 規則未列 | §19 Medium / Low Gap Resolution Register |
| G10 | M | Locked Decisions 與 Build Assumptions 未版本化 | §19 Medium / Low Gap Resolution Register |
| G11 | L | Visual Direction 描述與設計 token 對應缺 | §19 Medium / Low Gap Resolution Register |
| G12 | L | i18n QA Checklist 未列驗收工具 | §19 Medium / Low Gap Resolution Register |
| G13 | H | Process inventory 列 16 個 process 但 Part 3 只展開 22 頁，對應關係未明 | §3 Process-to-Surface Mapping |
| G14 | H | Strategy §6.3 列 8 狀態，§6.5 列 actions 但未列 transition 觸發者 | §4 Canonical Status / State Machines |
| G15 | H | Persona §11.3 狀態 active/suspended/archived，但 transition 規則缺 | §4 Canonical Status / State Machines |
| G16 | H | Capital Pool §14.3 狀態 4 個，§14.5 mandate 欄位 6 個但無 schema type | §9 Capital Pool Mandate Schema |
| G17 | H | Ranking §15 6 個 scope 與 §15.6 metric library 互不對應 | §10 Ranking Formula / Metric Matrix |
| G18 | H | Quarterly Rebalance §16 工作流 6 步但未列 reviewer / approver 角色 | §11 Quarterly Rebalance Workflow |
| G19 | H | Evolution Program §17 Constraints / Alerts / Approvals 三 tab 未列欄位 | §12 Evolution Steering Entity Schemas |
| G20 | M | §10.6 Incident States 列 5 狀態，但 mitigation / training feedback 子流程缺 | §19 Medium / Low Gap Resolution Register |
| G21 | M | §13.4 Training Update States 與 Memory 流程連結缺 | §19 Medium / Low Gap Resolution Register |
| G22 | M | §18 Tool / MCP / Skill 三套 lifecycle 共用 §18.3–§18.5，欄位重疊但差異未定義 | §19 Medium / Low Gap Resolution Register |
| G23 | M | §19 Insight States 4 個，但 lineage（§19.5）僅列要求未列欄位 | §19 Medium / Low Gap Resolution Register |
| G24 | M | §20.2 Job Types 列 7 種，但每種 input/output payload 未列 | §19 Medium / Low Gap Resolution Register |
| G25 | M | §4.4「所有長任務必須 job 化」缺判定門檻 | §19 Medium / Low Gap Resolution Register |
| G26 | M | §4.7 Agora handoff 必要欄位列「context / target / payload」未含 SLA | §19 Medium / Low Gap Resolution Register |
| G27 | L | §4.5 audit 必欄列 5 項，但 retention period 未說 | §19 Medium / Low Gap Resolution Register |
| G28 | H | Strategy Detail 列 11 tabs（§Tab — Overview … Audit），但 §6.5 Phase 1 規劃為 13 tabs | §13 Management Page Tab Corrections |
| G29 | H | Persona Detail Tabs 列 4，未涵蓋 Persona Lab / Memory Snapshot | §13 Management Page Tab Corrections |
| G30 | H | Capital Pool Detail Tabs 規格僅 §6.x list，未列「Performance」「Ranking Inputs」tab schema | §13 Management Page Tab Corrections |
| G31 | H | Ranking Formula Detail §5.143 Formula Fields 僅列「name / scope / weights / window」未定 weights schema | §10 Ranking Formula / Metric Matrix |
| G32 | H | Rebalance Detail §5.213 Detail Workflow Steps 6 步，但每步 UI 元件未指定 | §11 Quarterly Rebalance Workflow |
| G33 | H | Risk Center §Routes 列 `/management/risk` 但 §5.556 寫 `/management/risk-center` | §14 Canonical Routes |
| G34 | M | Command Center §4.121 Goal/Layout 列 6 cards，但 KPI list 未含實際指標 | §19 Medium / Low Gap Resolution Register |
| G35 | M | Strategies List §Table Columns 列 8 欄，缺 sort / filter 規格 | §19 Medium / Low Gap Resolution Register |
| G36 | M | Strategy Tab — Experiments §4.509 列 columns，未說明「Run experiment」action input schema | §19 Medium / Low Gap Resolution Register |
| G37 | M | Strategy Tab — Risk & Alerts 與 Risk Center 內容重疊但沒定義同步來源 | §19 Medium / Low Gap Resolution Register |
| G38 | M | Strategy Tab — Governance 與 Governance Review 頁的 review request 是同一物件嗎？未定 | §19 Medium / Low Gap Resolution Register |
| G39 | M | Capabilities List §4.943–4982（Tools/MCP/Skills 通用 list）column 與 detail 欄位不對應 | §19 Medium / Low Gap Resolution Register |
| G40 | M | Tool Detail §5.690 Server Columns，把 Tool 與 MCP server 混寫 | §19 Medium / Low Gap Resolution Register |
| G41 | M | Skill Detail §5.785 Detail Tabs 4 個，但 sandbox tab 規格只一行 | §19 Medium / Low Gap Resolution Register |
| G42 | M | Lineage Page §5.865 Goal 寫「show lineage」未說明 graph 規模上限與 pan/zoom | §19 Medium / Low Gap Resolution Register |
| G43 | M | Audit §5.936 Filters / Columns 6 欄，缺 retention 與 export 行為 | §19 Medium / Low Gap Resolution Register |
| G44 | M | Settings §5.976 Sections 列 i18n / theme / api，缺 Realtime SSE channel test 工具 | §19 Medium / Low Gap Resolution Register |
| G45 | L | Empty State Examples §6.008 缺對應頁面 ID | §19 Medium / Low Gap Resolution Register |
| G46 | L | Loading / Error State §6.028 範例只給通用版 | §19 Medium / Low Gap Resolution Register |
| G47 | L | Acceptance Criteria 在每頁尾段風格不一致 | §19 Medium / Low Gap Resolution Register |
| G48 | H | Process 7–22 各列「主要流程 / 操作 / 捕捉資料 / 送回 Console 產物」，但 handoff payload schema 缺 | §15 Agora Handoff Schema |
| G49 | H | §9.6 Signal Review captured signals 列 5 種，但 BFF 寫入 endpoint 與 throttling 未說 | §16 Signal Feedback Write Contract |
| G50 | M | §11.4 Persona Ask Modes 列 5 種，但每 mode 的 system prompt scope 未定 | §19 Medium / Low Gap Resolution Register |
| G51 | M | §12.4 Committee Templates 列 4 種，每種 evidence pack schema 缺 | §19 Medium / Low Gap Resolution Register |
| G52 | M | §15 Insight Inbox 缺 「attach to strategy」action 規格 | §19 Medium / Low Gap Resolution Register |
| G53 | M | §18 Trainer Studio 缺 evaluation suite 詳細欄位 | §19 Medium / Low Gap Resolution Register |
| G54 | L | §3.2 Agora 不可做的事情列 8 條，與 §24.1/§24.2 部分重複 | §19 Medium / Low Gap Resolution Register |
| G55 | L | §4.1 Analyst 等 5 角色描述缺 default route | §19 Medium / Low Gap Resolution Register |
| G56 | H | Daily Brief §8.116 Main Components 列 5，缺 KPI 計算公式 | §17 Agora KPI / Daily Brief Formulas |
| G57 | H | Signal Review §8.265 Captured Signals 含「user marked confidence」但 scale 未定（1-5？1-10？） | §16 Signal Feedback Write Contract |
| G58 | H | Committee Room §Routes 含 list + detail，但 detail 之 evidence pack upload 規格缺 | §18 Committee Evidence Pack |
| G59 | M | Notebook §8.378 Note Types 4 種，但 markdown extension（math / chart）未指定 | §19 Medium / Low Gap Resolution Register |
| G60 | M | Persona Lab §Routes / Layout 缺「sandbox 結束如何 commit 改動回 Persona」流程 | §19 Medium / Low Gap Resolution Register |
| G61 | M | Memory Review §9.166 Memory Types 列 5 種，但 quarantined → active 流程缺 reviewer 規格 | §19 Medium / Low Gap Resolution Register |
| G62 | M | Trainer Studio §9.253 Draft Status 列 4 種，但 publish 前 evaluation gate 規則缺 | §19 Medium / Low Gap Resolution Register |
| G63 | M | Skill Coaching §9.390 Evaluation Suites 與 Trainer Studio Evaluation Suites 是否同一物件未定 | §19 Medium / Low Gap Resolution Register |
| G64 | L | Agora Channels §9.464 Channel Types 4 個，連結到 Console ChannelDetail 之欄位不全 | §19 Medium / Low Gap Resolution Register |
| G65 | L | Handoff §9.520 Handoff Types 列 7 種與 Part 4 §22.2 列 6 種不一致 | §19 Medium / Low Gap Resolution Register |
| G66 | H | §3.6 Command Response Envelope 含 `confirmToken`，但 §2.5 confirm flow endpoint 缺 | §6 High-Risk Actions / Confirmation Token |
| G67 | H | §6.x Strategy Spec 列 23 欄，但 `availableActions` 結構與 §3.5 list envelope 不一致 | §8 availableActions Contract |
| G68 | H | §6.7 Quarterly Rebalance schema 缺 `reviewer[]` / `approver[]` 欄 | §11 Quarterly Rebalance Workflow |
| G69 | M | §7.3 Agora Session / Message schema 缺 attachment / inline-citation 欄位 | §19 Medium / Low Gap Resolution Register |
| G70 | M | §8 BFF Endpoint list 缺以下： | §19 Medium / Low Gap Resolution Register |
| G71 | M | §10 i18n header 規範了 BFF locale，但 `Accept-Language` fallback 鏈未定義 | §19 Medium / Low Gap Resolution Register |
| G72 | M | Realtime SSE channel 名稱與 payload 列表缺 | §19 Medium / Low Gap Resolution Register |
| G73 | M | Job payload §6.11 含 `progress` 但更新節流率與 chunk 大小未定 | §19 Medium / Low Gap Resolution Register |
| G74 | M | §3.7 Error Format 列 3 欄，缺 i18nKey / 多語錯誤訊息對應 | §19 Medium / Low Gap Resolution Register |
| G75 | L | §3.8 日期時間格式僅指 ISO 8601，未定 timezone 顯示策略 | §19 Medium / Low Gap Resolution Register |
| G76 | L | §3.9 Money 格式僅列 BigDecimal string，未定顯示精度 | §19 Medium / Low Gap Resolution Register |
| G77 | L | §6.10 Review Request schema 缺 cc / observer 角色欄位 | §19 Medium / Low Gap Resolution Register |
| G78 | H | §17.x 18 個 state machine 中，與 Part 2 / Part 6 對應的狀態值有 5 處不一致 | §4 Canonical Status / State Machines |
| G79 | M | §8.3 HighRiskConfirmationModal 列 props 6 個，未定 memo 字數限制 | §19 Medium / Low Gap Resolution Register |
| G80 | M | §11.3 IncidentTimeline 欄位 4，未含 attachment（log file）規格 | §19 Medium / Low Gap Resolution Register |
| G81 | L | §6.x StatusBadge 顏色映射僅敘述 4 級，無 token 對照 | §19 Medium / Low Gap Resolution Register |
| G82 | L | §13.1 FormulaBuilder 操作描述 5 條，缺 keyboard shortcut spec | §19 Medium / Low Gap Resolution Register |
| G83 | L | §15.x Agora components 與 Console components 命名重複（如 `MessageAnnotationBar`） | §19 Medium / Low Gap Resolution Register |
| G84 | L | §11.5 EventStreamPanel 缺 retain count | §19 Medium / Low Gap Resolution Register |
| G85 | L | §16 Forms / Editors 三個 component 未列驗證策略 | §19 Medium / Low Gap Resolution Register |
| G86 | H | §QA Checklist 要求「Emergency Kill 必須可在 10 秒內觸發」，但 entry point 與 target 未列 | §6 High-Risk Actions / Confirmation Token |
| G87 | M | §7.x Mock data section 各列 5–8 筆 mock，但與 Part 6 schema 欄位不完全對齊 | §19 Medium / Low Gap Resolution Register |
| G88 | L | §8 Demo Scenarios A–F 與 page acceptance criteria 對應缺 | §19 Medium / Low Gap Resolution Register |
| G89 | L | §2.x Phase 1–6 順序與 Part 3 / Part 5 章節編號不對應 | §19 Medium / Low Gap Resolution Register |
| G90 | L | §3 Lovable Master Prompt 含 system prompt 全文但 token budget 未列 | §19 Medium / Low Gap Resolution Register |
| G91 | L | §6 Required Routes 列 36 routes，但未標 dynamic param 規範 | §19 Medium / Low Gap Resolution Register |
| G92 | L | §7.x Mock 命名 (mock-strategy-1) 與 Part 6 範例 id 命名不一致 | §19 Medium / Low Gap Resolution Register |

---

## 20. Acceptance Criteria

| Area | Required acceptance condition |
|---|---|
| Status enums | Strategy, Persona, CapitalPool, Skill, Memory status values match this document. |
| Permission | Every management action can be answered by role lookup. |
| High-risk | Every high-risk action opens HighRiskConfirmationModal and obtains confirmation token. |
| availableActions | BFF returns `ActionDescriptor[]`; no page expects string array. |
| Environment | UI and BFF enforce the platform/trading environment gating table. |
| Ranking | Formula builder validates metric scope. |
| Rebalance | Rebalance detail includes reviewers and approvers. |
| Evolution | Constraints, alerts, approvals use typed schemas. |
| Risk route | `/management/risk` is canonical; `/management/risk-center` redirects only. |
| Agora handoff | All handoffs follow the canonical schema. |
| Signal feedback | Confidence is 1–5 and endpoint behavior is enforced. |
| Daily brief | KPI values are calculated using explicit formulas. |
| Committee evidence | Upload constraints and schema are enforced. |

---

## 21. Required action for existing Parts 1–8

1. Insert canonical status tables into Parts 1, 2, 6, and 7.
2. Replace every `availableActions: string[]` example with `ActionDescriptor[]`.
3. Remove Strategy mock statuses `under_review` and `paused`; move them to `reviewStatus` and `deploymentStatus`.
4. Remove Skill status `deprecating`; use `deprecated`.
5. Replace Memory status `isolated` with `quarantined`.
6. Replace `/management/risk-center` with `/management/risk`.
7. Add `/bff/command-confirmations`.
8. Add `/bff/agora/signals/{signalId}/feedback`.
9. Add SSE catalog in Part 6.
10. Update Part 8 mock data so every mock entity has `availableActions: ActionDescriptor[]`.

— EOF
