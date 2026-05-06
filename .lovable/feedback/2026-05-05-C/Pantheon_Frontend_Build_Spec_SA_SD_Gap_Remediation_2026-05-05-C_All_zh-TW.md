# Pantheon Frontend Build Spec — SA/SD Gap Remediation Pack C

**版本**：2026-05-05-C  
**範圍**：回應 `spec-gap-2026-05-05-C.md` 的 78 條 deeper gaps。  
**狀態**：Normative addendum。Pack C 的定義優先於 v3、Pack A、Pack B；若有衝突，以本文件為準。  
**交付目的**：讓 Lovable / 前端 / BFF 不再靠推測補規格，直接依本文件修正。

## 0. 覆蓋總覽

| Severity | Count | Resolution |
|---|---:|---|
| High | 14 | 本文件全部給出可落碼定義 |
| Medium | 38 | 本文件全部給出欄位、流程或 UI 規則 |
| Low | 26 | 本文件全部給出一致性或 future-work 裁定 |
| Total | 78 | C001–C078 全部 resolved |

---

## 1. Spec Governance 與 Legacy → v3 轉換（C001–C005）

### C001 — Legacy → v3 Mapping Table

BFF 必須在 type bridge 中套用以下轉換，不允許頁面自行判讀 legacy 欄位。

| Entity | Legacy field/value | v3 field/value | Conversion rule | Deprecation |
| --- | --- | --- | --- | --- |
| Strategy | state | lifecycleStatus | Map legacy state into lifecycleStatus. `under_review` becomes `reviewStatus=pending` and lifecycle remains previous stable lifecycle; `paused` becomes `deploymentStatus=stopped`. | 2026-06-30 |
| Strategy | reviewState | reviewStatus | If reviewState exists, it overrides inferred reviewStatus. | 2026-06-30 |
| Strategy | deploymentState | deploymentStatus | If deploymentState exists, it overrides inferred deploymentStatus. | 2026-06-30 |
| Persona | state | status | `degraded` is invalid; map to `restricted` and emit migrationWarning. | 2026-06-30 |
| CapitalPool | state | status | Direct map: draft/active/frozen/retired. | 2026-06-30 |
| Skill | deprecating | deprecated | All intermediate deprecating values must be collapsed into deprecated. | 2026-06-30 |
| Memory | isolated | quarantined | Rename isolated to quarantined. | 2026-06-30 |
| availableActions | string[] | ActionDescriptor[] | Each string must be expanded through action catalog. | 2026-06-30 |

### C002 — Dual-write 與 apiVersion

所有 BFF response envelope 必須包含：

```ts
type BffApiVersion = 'v3';
interface BffEnvelope<T> {
  apiVersion: BffApiVersion;
  data: T;
  legacyFields?: Record<string, unknown>; // 僅在 migration window 內允許
  migrationWarnings?: string[];
}
```

規則：

- 2026-06-30 前 BFF 可 dual-write legacyFields，但前端不得使用 legacyFields 驅動畫面。
- 2026-07-01 起 BFF 必須移除 legacyFields。
- 若 v3 欄位缺漏，前端不得 fallback 到 legacy；必須顯示 schema error 並記錄 audit diagnostic。

### C003 — Tab Migration Table

所有已刪除、合併、搬移的 tab 必須列入 migration table。

| Surface | Old tab | New tab | Rule |
| --- | --- | --- | --- |
| StrategyDetail | Performance | Performance | unchanged |
| StrategyDetail | Costs | Costs | new canonical tab; source = costBreakdown DTO |
| StrategyDetail | Calendar | Calendar | new canonical tab; source = exchangeCalendar DTO |
| StrategyDetail | Governance | Governance | merged review history + approvals |
| PersonaDetail | Memory Snapshot | Training & Memory | merged-into |
| PersonaDetail | Persona Lab | Persona Lab | new canonical tab |
| CapitalPoolDetail | Ranking Inputs | Ranking Inputs | new canonical tab |
| CapitalPoolDetail | Performance | Performance | new canonical tab |

### C004 — Reverse Index

Disposition CSV 必須新增 `v3_section` 與 `resolved_gap_ids` 欄位，格式：

```csv
v3_section,resolved_gap_ids,owner,last_reviewed_at
§4 State Machines,"C006,C007,C008,C009,C010,C011,C012",SA,2026-05-05
```

### C005 — INDEX anchors

INDEX 必須列所有 Part 10 / Pack C H2 anchor：`section_id`, `title`, `one_line_description`, `resolved_gaps`。

---

## 2. 狀態機完整性（C006–C012）

### C006 — Transition Failure / Timeout / Cancellation

每個 transition 必須由 BFF 回傳 `TransitionDescriptor`：

```ts
type TransitionFailureMode = 'rollback_to_source'|'stay_in_transient'|'move_to_failed'|'manual_recovery_required';
interface TransitionDescriptor {
  id: string;
  entityType: string;
  from: string;
  to: string;
  transientState?: string;
  timeoutMs: number;
  onFailure: TransitionFailureMode;
  failureState?: string;
  onCancel: 'rollback_to_source'|'stay_in_transient'|'move_to_cancelled';
  retryable: boolean;
}
```

預設 timeout：

| Machine | Default timeoutMs | onFailure | failureState |
| --- | --- | --- | --- |
| Strategy lifecycle | 300000 | rollback_to_source | none |
| Deployment | 600000 | manual_recovery_required | failed |
| Quarterly Rebalance | 900000 | stay_in_transient | under_review |
| Experiment | 1800000 | move_to_failed | failed |
| Evolution Run | 3600000 | move_to_failed | failed |
| Skill Sandbox | 600000 | move_to_failed | sandbox_failed |
| MCP Discovery | 300000 | move_to_failed | degraded |
| Review | 300000 | stay_in_transient | in_review |

### C007 — Admin Force Transition

新增 high-risk command：

```ts
interface ForceTransitionRequest {
  entityType: EntityType;
  entityId: string;
  targetState: string;
  reasonCode: 'stuck_transient'|'incident_recovery'|'migration_fix'|'data_repair'|'emergency_override';
  memo: string; // min 40 chars
  confirmTokenId: string;
  expectedVersion: number;
}
```

授權：`admin` only；若 target 是 deployment/runtime/capital，必須加 `risk_officer` two-man approval。

### C008 — Strategy 三軸狀態白名單與不變式

Canonical fields：

```ts
type StrategyLifecycleStatus = 'discovered'|'scaffolded'|'replicated'|'approved'|'paper'|'live'|'degraded'|'retired';
type StrategyReviewStatus = 'none'|'pending'|'changes_requested'|'approved';
type StrategyDeploymentStatus = 'none'|'paper_running'|'live_running'|'stopped'|'rollback_required';
```

合法組合：

| lifecycleStatus | Allowed reviewStatus | Allowed deploymentStatus | Invariant |
| --- | --- | --- | --- |
| discovered | none | none | No review or deployment exists. |
| scaffolded | none, changes_requested | none | Spec may be revised after changes request. |
| replicated | none, pending, changes_requested | none | Review may be pending after evidence exists. |
| approved | approved | none | Approved but not yet deployed. |
| paper | approved | paper_running, stopped, rollback_required | Paper deployment only. |
| live | approved | live_running, rollback_required | Live requires approved review. |
| degraded | approved | live_running, rollback_required, stopped | Only live/paper entities can degrade. |
| retired | none, approved | none, stopped | No running deployment allowed. |

JSON schema invariant：

```ts
function validateStrategyTriple(s: StrategyDTO): boolean {
  return STRATEGY_TRIPLE_WHITELIST.some(row =>
    row.lifecycleStatus === s.lifecycleStatus &&
    row.reviewStatus.includes(s.reviewStatus) &&
    row.deploymentStatus.includes(s.deploymentStatus)
  );
}
```

### C009 — Terminal State Retention

| Entity terminal state | retentionDays | searchVisible | auditMutable | purgeAllowed |
| --- | --- | --- | --- | --- |
| strategy.retired | 2555 | yes | no | admin_after_retention |
| persona.retired | 2555 | yes | no | admin_after_retention |
| artifact.deprecated | 2555 | yes | no | no_if_deployed |
| skill.deprecated | 1095 | yes | no | admin_after_retention |
| memory.deleted | 365 | no | no | yes_after_retention |
| incident.closed | 2555 | yes | no | no |
| job.completed | 365 | yes | no | yes_after_retention |

### C010 — Optimistic Locking

所有 mutation 必須帶：

```http
If-Match: <entity.version>
Idempotency-Key: <ULID>
X-Request-Id: <ULID>
```

409 envelope：

```ts
{ code:'STATE_CONFLICT', i18nKey:'errors.stateConflict', retryable:false, details:{ expectedVersion, actualVersion } }
```

### C011 — Branching Return Paths

| Machine | Branch state | Next reachable states | Limit |
| --- | --- | --- | --- |
| Review | changes_requested | pending, approved | max 3 cycles before escalation |
| Review | rejected | none; create new review request | terminal for that request |
| Experiment | failed | queued via retry, archived | max 2 retries |
| Deployment | failed | scheduled, rolled_back, cancelled | requires incident if live |
| Incident | mitigated | resolved, investigating | must attach mitigation note |
| Rebalance | changes_requested | simulation_ready, ranking_calculated | reviewer chooses rollback step |

### C012 — LifecycleStepper Render Hints

| Machine | renderHint | UI component |
| --- | --- | --- |
| Strategy | linear | LifecycleStepper horizontal |
| Review | branchy | WorkflowStepper with branch badges |
| Rebalance | linear | WizardStepper vertical on detail page |
| Evolution | branchy | Run timeline + candidate cards |
| Deployment | linear | DeploymentStepper |
| Incident | branchy | IncidentTimeline |
| Memory | linear | StatusBadge + audit timeline |
| Skill | linear | SandboxApprovalStepper |

---

## 3. Permission Matrix 與 ActionDescriptor（C013–C018）

### C013 — 完整 role × entity × action matrix

以下為本次補齊的 11 類 entity 權限表。`approval=Y` 表示 action 必須至少走 approval 或 high-risk confirmation；若同時在 high-risk catalog，必須使用 confirm token。

| Entity | Action | Allowed roles | Approval | Capability |
| --- | --- | --- | --- | --- |
| tool | register_tool | admin, capability_admin | Y | tool.write |
| tool | edit_tool_schema | admin, capability_admin | Y | tool.write |
| tool | classify_tool_risk | admin, risk_officer, capability_admin | Y | tool.risk |
| tool | test_tool | admin, capability_admin, system_operator | N | tool.test |
| tool | grant_tool_to_persona | admin, capability_admin | Y | tool.permission |
| tool | revoke_tool_from_persona | admin, capability_admin, risk_officer | Y | tool.permission |
| tool | disable_tool | admin, risk_officer, capability_admin | Y | tool.lifecycle |
| tool | retire_tool | admin, capability_admin | Y | tool.lifecycle |
| tool | view_tool_calls | admin, research_lead, risk_officer, capital_manager, strategy_manager, system_operator, reviewer, capability_admin | N | tool.read |
| mcp | add_mcp_server | admin, capability_admin | Y | mcp.write |
| mcp | edit_mcp_connection | admin, capability_admin | Y | mcp.write |
| mcp | rotate_mcp_secret | admin, capability_admin | Y | mcp.secret |
| mcp | discover_mcp_tools | admin, capability_admin, system_operator | N | mcp.discover |
| mcp | import_mcp_schema | admin, capability_admin | Y | mcp.schema |
| mcp | grant_mcp_tool | admin, capability_admin | Y | mcp.permission |
| mcp | revoke_mcp_tool | admin, capability_admin, risk_officer | Y | mcp.permission |
| mcp | disable_mcp_server | admin, risk_officer, capability_admin | Y | mcp.lifecycle |
| mcp | view_mcp_calls | admin, research_lead, risk_officer, capital_manager, strategy_manager, system_operator, reviewer, capability_admin | N | mcp.read |
| skill | create_skill | admin, capability_admin | N | skill.write |
| skill | import_skill | admin, capability_admin | Y | skill.write |
| skill | run_skill_sandbox | admin, capability_admin, research_lead | N | skill.test |
| skill | security_scan_skill | admin, capability_admin | N | skill.scan |
| skill | approve_skill | admin, capability_admin, risk_officer | Y | skill.approve |
| skill | assign_skill_to_persona | admin, capability_admin | Y | skill.permission |
| skill | revoke_skill_from_persona | admin, capability_admin, risk_officer | Y | skill.permission |
| skill | rollback_skill_version | admin, capability_admin | Y | skill.lifecycle |
| skill | deprecate_skill | admin, capability_admin | Y | skill.lifecycle |
| memory | approve_memory | admin, research_lead, reviewer | N | memory.review |
| memory | reject_memory | admin, research_lead, reviewer | N | memory.review |
| memory | edit_memory | admin, research_lead | Y | memory.write |
| memory | merge_memory | admin, research_lead | Y | memory.write |
| memory | move_memory_scope | admin, research_lead | Y | memory.scope |
| memory | quarantine_memory | admin, research_lead, risk_officer | Y | memory.lifecycle |
| memory | restore_memory | admin, research_lead, reviewer | Y | memory.lifecycle |
| memory | mark_memory_sensitive | admin, risk_officer, research_lead | Y | memory.sensitive |
| memory | delete_memory | admin, risk_officer | Y | memory.delete |
| insight | triage_insight | admin, research_lead, reviewer, strategy_manager | N | insight.write |
| insight | convert_insight_to_strategy | admin, research_lead, strategy_manager | N | strategy.create |
| insight | attach_insight_to_strategy | admin, research_lead, strategy_manager, reviewer | N | insight.link |
| insight | create_research_task_from_insight | admin, research_lead, strategy_manager | N | experiment.create |
| insight | archive_insight | admin, research_lead, reviewer | N | insight.lifecycle |
| insight | reject_insight | admin, research_lead, reviewer | N | insight.lifecycle |
| artifact | register_artifact | admin, research_lead, strategy_manager | N | artifact.write |
| artifact | promote_artifact | admin, research_lead, reviewer | Y | artifact.promote |
| artifact | deprecate_artifact | admin, research_lead, risk_officer | Y | artifact.lifecycle |
| artifact | set_rollback_target | admin, risk_officer, strategy_manager | Y | deployment.rollback |
| artifact | attach_artifact_to_review | admin, research_lead, reviewer | N | review.write |
| artifact | download_artifact | admin, research_lead, risk_officer, capital_manager, strategy_manager, system_operator, reviewer, capability_admin | N | artifact.read |
| job | view_job | admin, research_lead, risk_officer, capital_manager, strategy_manager, system_operator, reviewer, capability_admin | N | job.read |
| job | cancel_job | admin, system_operator, research_lead | Y | job.control |
| job | retry_job | admin, system_operator, research_lead | N | job.control |
| job | clone_job | admin, system_operator, research_lead, strategy_manager | N | job.create |
| job | attach_job_result | admin, research_lead, reviewer | N | job.link |
| job | create_incident_from_job | admin, system_operator, risk_officer | N | incident.create |
| incident | create_incident | admin, risk_officer, system_operator, research_lead | N | incident.create |
| incident | assign_incident | admin, risk_officer, system_operator | N | incident.assign |
| incident | add_timeline_event | admin, risk_officer, system_operator, research_lead, reviewer | N | incident.write |
| incident | mitigate_incident | admin, risk_officer, system_operator | Y | incident.mitigate |
| incident | escalate_incident | admin, risk_officer, system_operator | N | incident.escalate |
| incident | close_incident | admin, risk_officer | Y | incident.close |
| incident | trigger_incident_rollback | admin, risk_officer, system_operator | Y | deployment.rollback |
| deployment | plan_deployment | admin, strategy_manager, system_operator | Y | deployment.plan |
| deployment | approve_deployment | admin, risk_officer, reviewer | Y | deployment.approve |
| deployment | execute_deployment | admin, system_operator | Y | deployment.execute |
| deployment | pause_deployment | admin, system_operator, risk_officer | Y | deployment.pause |
| deployment | resume_deployment | admin, system_operator, risk_officer | Y | deployment.resume |
| deployment | rollback_deployment | admin, risk_officer, system_operator | Y | deployment.rollback |
| deployment | retire_deployment | admin, risk_officer, strategy_manager | Y | deployment.retire |
| deployment | emergency_kill | admin, risk_officer, system_operator | Y | deployment.kill |
| runtime | view_runtime | admin, research_lead, risk_officer, capital_manager, strategy_manager, system_operator, reviewer, capability_admin | N | runtime.read |
| runtime | restart_runtime | admin, system_operator | Y | runtime.restart |
| runtime | drain_runtime | admin, system_operator, risk_officer | Y | runtime.drain |
| runtime | move_strategy_runtime | admin, system_operator, risk_officer | Y | runtime.move |
| runtime | disable_new_deployments | admin, system_operator, risk_officer | Y | runtime.disable |
| runtime | open_runtime_logs | admin, system_operator, risk_officer | N | runtime.logs |
| route_policy | create_route_policy | admin, capability_admin, research_lead | Y | policy.write |
| route_policy | edit_route_policy | admin, capability_admin, research_lead | Y | policy.write |
| route_policy | submit_route_policy_review | admin, capability_admin, research_lead | N | policy.review |
| route_policy | activate_route_policy | admin, capability_admin, risk_officer | Y | policy.activate |
| route_policy | rollback_route_policy | admin, capability_admin, risk_officer | Y | policy.rollback |
| evolution_program | create_evolution_program | admin, research_lead, strategy_manager | N | evolution.write |
| evolution_program | edit_evolution_direction | admin, research_lead, strategy_manager | Y | evolution.write |
| evolution_program | set_fitness_formula | admin, research_lead, strategy_manager | Y | evolution.formula |
| evolution_program | start_evolution_run | admin, research_lead, system_operator | N | evolution.run |
| evolution_program | pause_evolution_run | admin, research_lead, system_operator | N | evolution.run |
| evolution_program | stop_evolution_run | admin, research_lead, system_operator, risk_officer | Y | evolution.run |
| evolution_program | promote_evolution_candidate | admin, research_lead, strategy_manager, reviewer | Y | evolution.promote |
| evolution_program | retire_evolution_program | admin, research_lead | Y | evolution.lifecycle |

### C014–C015 — ActionDescriptor Schema

```ts
type ActionGroup = 'primary'|'secondary'|'destructive';
type DisabledReasonCode =
  | 'missing_role' | 'invalid_state' | 'wrong_environment' | 'approval_required'
  | 'confirm_token_required' | 'two_man_required' | 'cooldown_active'
  | 'blocked_by_incident' | 'blocked_by_policy' | 'stale_version';

interface ActionDescriptor {
  id: string;
  entityType: EntityType;
  labelKey: string;
  group: ActionGroup;
  order: number;
  enabled: boolean;
  disabledReasonCode?: DisabledReasonCode;
  disabledReasonI18nKey?: `actions.${string}.${string}.disabled.${DisabledReasonCode}`;
  riskLevel: 'none'|'low'|'medium'|'high'|'critical';
  requiresApproval: boolean;
  requiresConfirmToken: boolean;
  requiresTwoMan: boolean;
  requiresEnv?: 'research'|'paper'|'live';
  ttlSec?: number;
  cooldownSec?: number;
  idempotencyKeyRequired: boolean;
}
```

排序：`group` 順序為 primary → secondary → destructive；同 group 依 `order` 升冪；destructive 一律靠右或 dropdown 最底部。

### C016 — Emergency Override

```ts
interface EmergencyOverrideGrant {
  overrideId: string;
  incidentId: string;
  grantedBy: 'admin';
  approvers: Array<{ role:'risk_officer'|'system_operator', userId:string }>;
  scope: { entityType: EntityType; entityId: string; actions: string[] };
  justification: string; // min 80 chars
  expiresAt: string; // max now + 4h
  auditEventId: string;
}
```

Trigger conditions：`incident.severity in ['high','critical']` 或 `runtime.status='degraded'`。不得用於 routine rebalance / normal promotion。

### C017 — Role Lattice

`admin` 不自動繼承所有 domain role 的 business approval；admin 可操作 technical override，但資金與 live deployment 仍需 risk_officer two-man。Domain hierarchy：

```text
admin: platform control, not sufficient alone for capital/live approval
research_lead > strategy_manager for research actions
risk_officer independent; required for risk/live/capital destructive actions
capital_manager independent; required for allocation/rebalance actions
capability_admin independent; required for tools/MCP/skills
system_operator independent; required for runtime/deployment execution
reviewer independent; can decide assigned reviews only
```

### C018 — Tenant Scope

v4 前端與 BFF 明確為 `singleTenant=true`。所有 DTO 可保留 `tenantId?: string`，但 UI 不提供 tenant switcher。Multi-tenant 是 future work，不得在目前 UI 顯示跨 tenant 欄位。

---

## 4. High-Risk Action 與 Confirm Token（C019–C023）

### C019 — Confirm Token API

```http
POST /bff/commands/confirm-token
POST /bff/commands/confirm-token/:tokenId/revoke
```

```ts
interface ConfirmTokenRequest {
  entityType: EntityType;
  entityId: string;
  actionId: string;
  expectedVersion: number;
  memo: string;
  idempotencyKey: string;
}
interface ConfirmTokenDTO {
  tokenId: string;
  expiresAt: string; // now + 120s default
  boundTo: { entityType:string; entityId:string; actionId:string; expectedVersion:number; idempotencyKey:string; userId:string; role:string };
  used: false;
}
```

Rules：

- Token TTL = 120 秒，critical action 可降為 60 秒。
- Token single-use；reuse 回 `409 CONFIRM_TOKEN_REUSED`。
- Token 與 `Idempotency-Key` 綁定；command request 的 key 必須與 token request 相同。
- Token 可撤銷；撤銷後使用回 `410 CONFIRM_TOKEN_REVOKED`。
- Token 不可跨 entity/action/version/user/role 使用。

### C020–C023 — High-risk catalog with two-man and cooldown

| Entity | Action | requiresApproval | twoMan | confirmTTL | cooldownSec | memo.minLen | memo.requireRef |
| --- | --- | --- | --- | --- | --- | --- | --- |
| strategy | promote_live | Y | Y | 120 | 300 | 80 | review_or_change |
| strategy | retire_strategy | Y | Y | 120 | 300 | 60 | change |
| deployment | rollback_deployment | Y | Y | 120 | 300 | 80 | incident_or_change |
| deployment | emergency_kill | Y | Y | 60 | 600 | 100 | incident |
| deployment | pause_deployment | Y | N | 120 | 120 | 50 | incident_or_change |
| deployment | resume_deployment | Y | Y | 120 | 120 | 50 | incident_or_change |
| capital | apply_rebalance | Y | Y | 120 | 900 | 100 | rebalance |
| capital | allocation_override | Y | Y | 120 | 900 | 100 | rebalance_or_change |
| ranking | activate_formula | Y | Y | 120 | 600 | 80 | change |
| persona | activate_route_policy | Y | Y | 120 | 300 | 80 | change |
| persona | rollback_route_policy | Y | Y | 120 | 300 | 80 | incident_or_change |
| mcp | grant_mcp_tool | Y | Y | 120 | 300 | 80 | change |
| mcp | production_grant | Y | Y | 120 | 600 | 100 | change |
| skill | approve_skill | Y | Y | 120 | 300 | 80 | change |
| skill | assign_skill_to_persona | Y | N | 120 | 120 | 60 | change |
| tool | disable_tool | Y | N | 120 | 120 | 50 | incident_or_change |
| runtime | restart_runtime | Y | N | 120 | 300 | 60 | incident_or_change |
| runtime | drain_runtime | Y | Y | 120 | 300 | 80 | incident_or_change |
| state_machine | force_transition | Y | Y | 60 | 600 | 120 | incident_or_migration |

Memo schema：

```ts
interface HighRiskMemo {
  text: string; // minLen from catalog; maxLen 2000
  format: 'text'|'markdown';
  referenceType: 'incident'|'change'|'review'|'rebalance'|'migration'|'none';
  referenceId?: string;
}
```

---

## 5. BFF API Contract（C024–C032）

### C024–C026 — Pagination / filtering / sorting

List APIs 必須採 cursor-based pagination：

```ts
interface ListRequest {
  cursor?: string;
  pageSize?: number; // default 50, max 200
  sort?: string; // e.g. "updatedAt,-riskLevel"
  filter?: Record<string, string|string[]>;
}
interface ListResponse<T> {
  data: T[];
  pageInfo: { nextCursor?: string; hasNextPage: boolean; pageSize: number };
}
```

Query style：

```http
GET /bff/strategies?pageSize=50&cursor=abc&sort=updatedAt,-riskLevel&filter[lifecycleStatus]=live&filter[riskLevel]=high
```

### C027 — Error Envelope

```ts
interface BffErrorEnvelope {
  error: {
    code: string;
    i18nKey: string;
    message: string; // developer-readable fallback
    retryable: boolean;
    userActionable: boolean;
    correlationId: string;
    cause?: string;
    details?: Record<string, unknown>;
  };
}
```

### C028 — Idempotency

All POST/PATCH/DELETE command endpoints require:

```http
Idempotency-Key: <ULID>
X-Request-Id: <ULID>
If-Match: <entity.version>
```

Server replay window = 24h. Same key + same payload returns cached result; same key + different payload returns `409 IDEMPOTENCY_PAYLOAD_MISMATCH`.

### C029 — SSE Reconnection Protocol

```ts
interface SseEnvelope<T> {
  id: string; // monotonically sortable ULID
  channel: string;
  type: string;
  occurredAt: string;
  payload: T;
}
```

Rules：

- Heartbeat every 15s: `event: heartbeat`.
- Replay window: 24h or last 10,000 events per user, whichever smaller.
- Client reconnect uses `Last-Event-Id`.
- Backoff: 1s, 2s, 5s, 10s, 30s max + jitter.
- If replay unavailable, server sends `event: resync_required`; frontend must refetch visible queries.

### C030–C032 — Request ID / bulk / WebSocket

- Frontend generates `X-Request-Id` ULID for every request; BFF echoes it.
- Bulk operations are **future work**. Current UI must not show select-all bulk mutation buttons.
- Realtime v1 is SSE only. WebSocket is future work for collaborative cursor / bidirectional streaming.

### SSE Channel Catalog

| Channel | Events | Consumers |
| --- | --- | --- |
| job.* | job.started/progress/completed/failed | Management + Agora job drawers |
| strategy.* | strategy.created/updated/state_changed | Management strategy pages |
| persona.* | persona.updated/policy_changed/evaluation_completed | Management persona pages |
| capital.* | capital_pool.updated/breach_created | Capital pages |
| ranking.* | ranking.recalculated/published | Ranking pages |
| rebalance.* | rebalance.step_changed/approved/applied/rolled_back | Rebalance pages |
| evolution.* | evolution.run_progress/candidate_created | Evolution pages |
| experiment.* | experiment.started/completed/failed | Experiment registry |
| review.* | review.submitted/validator_completed/decision_changed | Governance pages |
| deployment.* | deployment.started/completed/failed/rolled_back | Deployment pages |
| runtime.* | runtime.heartbeat/runtime.degraded/runtime.recovered | Runtime monitor |
| risk.* | risk.alert_created/risk.alert_updated | Risk center |
| incident.* | incident.created/updated/escalated/closed | Incident center |
| tool_call.* | tool_call.completed/tool_call.failed | Tool calls |
| mcp_call.* | mcp_call.completed/mcp_call.failed | MCP calls |
| skill.* | skill.sandbox_completed/skill.approved | Skill pages |
| handoff.* | handoff.created/claimed/rejected/resolved/escalated | Agora + Management |
| session.* | session.message_created/session.closed | Agora sessions |
| notification.* | notification.created/read | Notification center |

---

## 6. Agora ↔ Management Handoff（C033–C037）

### C033–C034 — SLA start and escalation

| Handoff type | slaStartAt | initial SLA | primary owner | secondary | escalation action |
| --- | --- | --- | --- | --- | --- |
| strategy_idea | created | 86400 | research_lead | admin | notify + Command Center pin |
| research_task | created | 43200 | research_lead | strategy_manager | notify |
| signal_feedback | created | 21600 | strategy_manager | research_lead | notify + strategy alert badge |
| training_feedback | created | 604800 | research_lead | admin | notify trainer + persona owner |
| committee_memo | created | 43200 | reviewer | research_lead | attach to governance queue |
| skill_draft | created | 604800 | capability_admin | admin | notify + skill draft badge |
| incident_note | created | 3600 | risk_officer | system_operator | create incident escalation |

Escalation rules：

- At 80% SLA: warning notification to primary owner.
- At 100% SLA: escalate to secondary and notify Agora originator.
- SLA does not reset on escalation; new dueAt = original dueAt + 50% initial SLA.
- Rejected handoff stops SLA and returns structured rejection to Agora.

### C035 — Reject DTO

```ts
interface HandoffRejectDTO {
  handoffId: string;
  reasonCode: 'insufficient_context'|'duplicate'|'out_of_scope'|'needs_attachment'|'invalid_target'|'policy_blocked';
  message: string;
  requiresAttachments?: Array<'chart'|'signal_snapshot'|'experiment_result'|'trade_log'|'market_note'>;
  returnedTo: string;
  returnedAt: string;
}
```

### C036–C037 — Attachments / threading

Attachment constraints：max 25MB per file, max 10 files per handoff, allowed MIME: png, jpg, webp, pdf, csv, json, txt, md, parquet metadata pointer only. BFF must virus-scan and redact secrets. v1 handoff is single-shot; threading is future work.

---

## 7. Capital / Ranking / Rebalance（C038–C042）

### C038 — Mandate Breach Monitor

```ts
interface MandateMonitor {
  intervalSec: number; // default 300
  onBreach: {
    notifyRoles: Array<'risk_officer'|'capital_manager'|'system_operator'>;
    createAlert: boolean;
    autoAction: 'none'|'freeze_new_allocations'|'require_review'|'freeze_pool';
    severityByBreachPct: Array<{ thresholdPct:number; severity:'low'|'medium'|'high'|'critical' }>;
  };
}
```

Default：interval 300s；breach > 5% medium, > 15% high, > 25% critical; critical autoAction = freeze_new_allocations。

### C039 — Ranking Metric Metadata

```ts
interface RankingMetricDefinition {
  id: string;
  labelKey: string;
  unit: 'percent'|'ratio'|'currency'|'days'|'count'|'score';
  direction: 'higher_better'|'lower_better';
  normalization: 'z_score'|'min_max'|'none'|'winsorized_z';
  defaultWeight: number;
  allowedScopes: Array<'persona'|'strategy'|'alpha_family'|'capital_pool'|'paper'|'live'>;
}
```

### C040–C041 — Rebalance rollback and quorum

| Step | Can rollback to | UI pattern | Quorum |
| --- | --- | --- | --- |
| metric_freeze | draft | wizard + snapshot table | capital_manager x1 |
| ranking_calculation | metric_freeze | score table + breakdown | capital_manager x1 |
| allocation_simulation | ranking_calculation, metric_freeze | side-by-side allocation diff | capital_manager x1 |
| constraint_check | allocation_simulation | breach panel | risk_officer x1 |
| review | constraint_check, allocation_simulation | approval panel | risk_officer x1 + capital_manager x1 |
| scheduled | review | deployment calendar | capital_manager x1 |
| applied | scheduled | post-apply monitor | rollback requires risk_officer + capital_manager |

### C042 — Currency / FX

Platform base currency = USD. CapitalPool may define `displayCurrency`. BFF must return pre-converted `baseAmount` and `displayAmount`; frontend never performs FX conversion.

---

## 8. Evolution / Experiment（C043–C045）

### C043 — Evolution constraints validation

```ts
interface EvolutionRunLimits {
  populationSize: { min: 4, max: 500, step: 1 };
  maxGenerations: { min: 1, max: 200, step: 1 };
  maxComputeUsd: { min: 10, max: 50000, step: 10 };
  maxWallClockHours: { min: 1, max: 168, step: 1 };
  maxConcurrentRuns: { min: 1, max: 20, step: 1 };
}
```

BFF endpoint：`POST /bff/evolution/programs/:id/actions/dry-run` returns `{ valid, warnings[], projectedCost, projectedRuntime }`.

### C044 — Experiment promote gating

```ts
interface ExperimentPromoteGate {
  minSampleSize: number; // default 252 daily bars or BFF-specified
  minOosDurationDays: number; // default 90
  maxPValue: number; // default 0.10
  minSharpe: number; // default 0.8
  maxDrawdownPct: number; // strategy-specific
  requiresDataLeakagePass: true;
  requiresReproducibilityHash: true;
}
```

### C045 — Reproducibility

Every EvolutionRun and Experiment must store：`seed`, `dataSnapshotId`, `codeCommit`, `configHash`, `dockerImageDigest?`, `createdAt`.

---

## 9. i18n / Locale / Format（C046–C049）

- UGC is stored as-is. No auto detection is required for storage. Search may index original text only in v1.
- Persona response language follows session setting, then user preference, then UI locale.
- Supported locales remain `zh-TW` and `en-US`; zh-HK/zh-CN are future work.
- All pluralization must use ICU MessageFormat.

Format tokens：

| Token | zh-TW | en-US | Fallback |
| --- | --- | --- | --- |
| datetime.short | yyyy/MM/dd HH:mm | MMM d, yyyy HH:mm | ISO string |
| datetime.date | yyyy/MM/dd | MMM d, yyyy | ISO date |
| number.decimal | 1,234.56 | 1,234.56 | raw |
| percent | 12.34% | 12.34% | raw |
| money.usd | US$1,234.56 | $1,234.56 | USD 1234.56 |
| money.base | {{currency}} {{amount}} | {{currency}} {{amount}} | raw |

---

## 10. UI Components / Design Tokens / Accessibility（C050–C058）

### C050–C051 — Theme and density tokens

```css
:root {
  --bg: #ffffff; --fg: #111827; --surface: #f9fafb;
  --status-live: #16a34a; --status-paper: #d97706; --risk-high: #dc2626;
  --row-height-comfortable: 44px; --row-height-compact: 32px;
}
[data-theme='dark'] {
  --bg: #0b1120; --fg: #e5e7eb; --surface: #111827;
  --status-live: #22c55e; --status-paper: #f59e0b; --risk-high: #f87171;
}
```

User preferences: `theme: system|light|dark`; `density: comfortable|compact`.

### C052–C055 — Component specs

Skeletons：`<TableSkeleton rows=10 columns=6>`, `<CardGridSkeleton cards=6>`, `<ChartSkeleton type='line|bar|heatmap'>`, `<DrawerSkeleton sections=4>`.

LineageGraph：max visible nodes = 200; if >200, collapse by entity type; layout = dagre LR; pan/zoom enabled; minimap optional.

RightDrawer: max stack depth = 2; ESC closes topmost; route changes close all non-pinned drawers.

CommandPalette ranking: exact match 100, prefix 80, recently viewed +15, pinned +20, current product scope +10, archived -30.

### C056 — Accessibility baseline

Target: WCAG 2.1 AA.

Requirements：

- All interactive elements keyboard reachable.
- PermissionAwareButton disabled reason must be available by tooltip and `aria-describedby`.
- Modal focus trap mandatory.
- DataTable requires keyboard row navigation.
- Color is never the only status signal; StatusBadge includes text + icon.
- Risk high/critical colors must pass contrast 4.5:1.
- Charts must provide table fallback or accessible summary.

### C057–C058 — Shortcuts and reduced motion

Shortcuts：`?` help, `g s` strategies, `g p` personas, `g c` capital, `g j` jobs, `g a` Agora daily, `/` search, `Esc` close drawer/modal, `⌘K/Ctrl+K` command palette.

If `prefers-reduced-motion`, disable non-essential transitions; keep only opacity changes under 150ms.

---

## 11. Testing / Acceptance / Security（C059–C066）

### C059 — End-to-End Scenarios

Happy paths：

1. Agora signal feedback → handoff → Management research task.
2. Strategy replicated → submit review → approved → promote paper.
3. Paper strategy → live promotion request → approval → deployment.
4. Live alert → incident → mitigation → close.
5. Quarterly rebalance → metric freeze → ranking → simulation → approval → apply.
6. Persona route policy edit → approval → active policy.
7. MCP server add → discover tools → grant tool → audit.
8. Skill draft → sandbox → approval → assign persona.
9. Evolution run → candidate → experiment → strategy creation.
10. Artifact build → review attach → promote artifact.

Incident paths：

1. Deployment fails after approval → failed state → incident created.
2. SSE disconnect → replay unavailable → resync required.
3. Confirm token reuse → 409 → action blocked.
4. Optimistic lock conflict → 409 → user reload prompt.
5. Critical runtime alert → emergency override → rollback → audit.

### C060–C062 — Mock and contract tests

Mock minimums：Strategy 24 covering all 8 lifecycle statuses; Persona 12; CapitalPool 6; RankingFormula 6; Rebalance 4; EvolutionProgram 6; Experiment 24; Job 30; Alert 20; Incident 10; Tool 12; MCPServer 6; Skill 12; AgoraSession 12; Signal 20.

All demo scenarios must be Given/When/Then. OpenAPI schema is source of truth for BFF contract tests. Frontend must validate mock fixtures against generated types.

### C063 — Performance Budget

| Metric | Target |
| --- | --- |
| Initial LCP | <= 2.5s on standard desktop |
| TTI | <= 3.5s |
| Route transition p95 | <= 500ms with cached data |
| DataTable render p95 | <= 500ms for 200 rows |
| Filter interaction p95 | <= 300ms |
| SSE event-to-paint p95 | <= 1000ms |
| Drawer open p95 | <= 200ms |
| LineageGraph 200 nodes | <= 1500ms first layout |

### C064–C066 — Security Baseline

- Auth tokens must be httpOnly, Secure, SameSite=Lax/Strict cookies. No auth token in localStorage.
- CSRF token required for mutations.
- CSP baseline: `default-src 'self'; script-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: blob:; frame-ancestors 'none'`.
- Escape all UGC; markdown renderer must sanitize HTML.
- Secrets, API keys, tokens, broker identifiers must be redacted in UI logs.
- Audit log is append-only; admin cannot edit/delete audit events.
- PII fields must be tagged and hidden from unauthorized roles.
- Visual regression is future work; not required for v4 acceptance.

---

## 12. Spec Structure（C067–C070）

### C067 — Glossary

Required glossary terms：Strategy, Alpha, Persona, Capital Pool, Mandate, Risk Budget, Ranking Formula, Quarterly Rebalance, Evolution Program, Experiment, Artifact, Review, Approval, Promotion, Deployment, Runtime, Rollback, Incident, Handoff, Insight, Memory, Training Example, Tool, MCP Server, MCP Tool, Skill, Job, Audit Event, Confirm Token, Idempotency Key, Environment.

### C068 — Mermaid diagrams

v4 spec must include at least：Strategy three-axis diagram, Rebalance workflow, Handoff flow, High-risk confirm flow, Entity relationship overview.

### C069–C070 — Semver and owners

Spec semver：major = breaking DTO/state/action change; minor = new optional field/page; patch = clarification. Each H2 must include owner role, e.g. `> owner: SA | reviewer: Product + Frontend Lead`.

---

## 13. 實作期具體缺口（C071–C078）

### C071 — Strategy Costs / Calendar tabs

Costs schema：

```ts
interface StrategyCostBreakdown {
  commissionBps: number;
  slippageBps: number;
  borrowCostBps?: number;
  financingCostBps?: number;
  exchangeFeesBps?: number;
  taxBps?: number;
  costModelId: string;
  lastUpdatedAt: string;
}
interface StrategyCalendarEvent {
  date: string;
  exchange: string;
  eventType: 'trading_holiday'|'half_day'|'rebalance_date'|'earnings'|'macro_event'|'custom';
  label: string;
  source: 'exchange_calendar'|'custom'|'research_note';
}
```

### C072 — Persona Lab tab

Persona Lab requires sandbox runtime DTO：

```ts
interface PersonaLabRun {
  runId: string;
  personaId: string;
  personaVersion: string;
  scenarioId: string;
  status: 'queued'|'running'|'completed'|'failed';
  score?: number;
  diffs?: Array<{ field:string; before:string; after:string }>;
  commitGate: { requiresEvaluationPass:true; requiresApproval:true; target:'persona_update_request' };
}
```

### C073 — Capital Ranking Inputs tab

```ts
interface RankingInputSnapshot {
  snapshotId: string;
  scope: 'persona'|'strategy'|'capital_pool';
  metricAsOf: string;
  frequency: 'daily'|'weekly'|'monthly'|'quarterly';
  stalenessToleranceHours: number;
  metricRows: Array<{ entityId:string; metricId:string; value:number|null; quality:'ok'|'stale'|'missing' }>;
}
```

### C074 — Rebalance step UI patterns

| Step | UI pattern | Required component |
| --- | --- | --- |
| Metric Freeze | snapshot table + freeze confirmation | MetricFreezePanel |
| Ranking Calculation | score table + score breakdown drawer | RankingResultPanel |
| Allocation Simulation | current vs recommended side-by-side diff | AllocationSimulation |
| Constraint Check | breach checklist + severity table | ConstraintChecker |
| Review / Approval | approval panel + memo editor | ApprovalPanel |
| Apply / Monitor | deployment-style progress + post-apply metrics | RebalanceApplyMonitor |

### C075 — Signal confidence 1–5

| Value | Label zh-TW | Label en-US | Reason required |
| --- | --- | --- | --- |
| 1 | 確定錯誤 | Definitely invalid | Y, min 20 chars |
| 2 | 可能錯誤 | Likely invalid | Y, min 20 chars |
| 3 | 不確定 | Uncertain | N |
| 4 | 可能正確 | Likely valid | Y, min 20 chars |
| 5 | 高度確信正確 | Definitely valid | Y, min 20 chars |

### C076 — Committee evidence templates

| Committee type | Required evidence |
| --- | --- |
| strategy_review | strategy spec, experiment summary, risk summary, persona rationale |
| live_promotion | paper performance, risk budget, rollback target, deployment plan |
| incident_review | alert timeline, runtime logs, strategy exposure, mitigation actions |
| evolution_candidate | parent strategy, mutation summary, fitness score, OOS result |

### C077 — DailyBrief KPI timezone and null handling

- KPI timezone: `UTC` for storage, exchange-local for tradingDay labels.
- If metric missing: show `—`, add tooltip `Data unavailable`, exclude from aggregate score.
- If denominator zero: show `N/A`, do not show 0%.
- Cross-day futures: tradingDay = exchange session date returned by BFF.

### C078 — Lifecycle bucket colors

| Bucket | Design token |
| --- | --- |
| discovered | --status-neutral |
| scaffolded | --status-info |
| replicated | --status-purple |
| approved | --status-success |
| paper | --status-warning |
| live | --status-live |
| degraded | --risk-high |
| retired | --status-muted |

---

## 14. C001–C078 Disposition Summary

| CID | Severity | Category | Resolution |
| --- | --- | --- | --- |
| C001 | H | Spec governance | Legacy → v3 mapping table |
| C002 | H | Spec governance | Dual-write and apiVersion policy |
| C003 | M | Spec governance | Tab migration table |
| C004 | L | Spec governance | Reverse gap index |
| C005 | L | Spec governance | INDEX section anchors |
| C006 | H | State machines | Failure / timeout / cancellation transitions |
| C007 | H | State machines | Admin force-transition |
| C008 | H | State machines | Strategy three-axis invariants |
| C009 | M | State machines | Terminal retention and purge SLA |
| C010 | M | State machines | Concurrency and optimistic locking |
| C011 | M | State machines | Branching return paths |
| C012 | L | State machines | LifecycleStepper render hints |
| C013 | H | Permissions | Complete role-action matrices |
| C014 | H | ActionDescriptor | disabledReasonI18nKey convention |
| C015 | M | ActionDescriptor | requiresEnv / two-man / ttl / idempotency fields |
| C016 | M | Permissions | Emergency override |
| C017 | L | Permissions | Role lattice |
| C018 | L | Permissions | Single-tenant scope declaration |
| C019 | H | High-risk | Confirm token revoke / reuse / idempotency |
| C020 | H | High-risk | Catalog × approval cross-check |
| C021 | M | High-risk | Memo schema |
| C022 | M | High-risk | Two-man rule on each action |
| C023 | L | High-risk | Cooldown per action |
| C024 | H | BFF | availableActions ordering and grouping |
| C025 | H | BFF | Cursor pagination |
| C026 | M | BFF | Filter and sort query style |
| C027 | M | BFF | Error envelope semantics |
| C028 | M | BFF | Idempotency header |
| C029 | M | Realtime | SSE reconnect protocol |
| C030 | L | BFF | X-Request-Id propagation |
| C031 | L | BFF | Bulk operation policy |
| C032 | L | Realtime | SSE now, WebSocket future |
| C033 | H | Handoff | SLA start point |
| C034 | H | Handoff | Escalation chain |
| C035 | M | Handoff | Reject reply schema |
| C036 | M | Handoff | Attachment constraints |
| C037 | L | Handoff | Threading policy |
| C038 | H | Capital | Mandate breach monitor |
| C039 | M | Ranking | Metric metadata |
| C040 | M | Rebalance | Backward transitions |
| C041 | M | Rebalance | Approval quorum |
| C042 | L | Capital | Currency / FX |
| C043 | M | Evolution | Constraints validation |
| C044 | M | Experiment | Promote gating |
| C045 | L | Evolution | Reproducibility |
| C046 | M | i18n | Mixed-locale UGC |
| C047 | M | i18n | Date / number / currency formats |
| C048 | L | i18n | Region split |
| C049 | L | i18n | Pluralization |
| C050 | M | Design tokens | Dark mode |
| C051 | M | Design tokens | Density |
| C052 | M | Components | Skeleton specs |
| C053 | M | Components | LineageGraph limits |
| C054 | L | Components | RightDrawer stacking |
| C055 | L | Components | CommandPalette ranking |
| C056 | H | Accessibility | WCAG 2.1 AA baseline |
| C057 | M | Accessibility | Keyboard shortcuts |
| C058 | L | Accessibility | Reduced motion |
| C059 | H | Acceptance | Cross-page E2E scenarios |
| C060 | M | Mock | Seed scale |
| C061 | M | Mock | Given/When/Then scenarios |
| C062 | M | Testing | Contract tests |
| C063 | M | Performance | Performance budgets |
| C064 | H | Security | Security baseline |
| C065 | M | Security | Audit immutability |
| C066 | L | Testing | Visual regression future |
| C067 | M | Spec | Glossary |
| C068 | M | Spec | Mermaid diagrams |
| C069 | L | Spec | Spec semver and changelog |
| C070 | L | Spec | Owner per section |
| C071 | M | Strategy | Costs / Calendar tab schema |
| C072 | M | Persona | Persona Lab tab details |
| C073 | M | Capital | Ranking Inputs tab |
| C074 | M | Rebalance | Step UI components |
| C075 | M | Signal | Confidence scale labels |
| C076 | L | Committee | Evidence pack templates |
| C077 | L | DailyBrief | KPI timezone and null handling |
| C078 | L | CommandCenter | Lifecycle bucket colors |

---

## 15. Lovable Immediate Instruction

Implement Pack C before adding net-new UI features. Replace any guessed behavior that conflicts with this file. In particular:

1. Add legacy → v3 mapping and apiVersion behavior.
2. Add failure/timeout/cancel transitions and strategy triple invariant validation.
3. Replace all permission guesses with the Pack C permission matrix.
4. Extend ActionDescriptor and sort/group actions by group/order.
5. Implement confirm token revoke/reuse/idempotency behavior in mock BFF.
6. Apply cursor pagination, unified filters, error envelope, and SSE reconnect protocol.
7. Add handoff SLA/escalation/reject DTO behavior.
8. Add mandate breach monitor mock behavior and rebalance quorum.
9. Add accessibility/security/performance acceptance checks.
10. Update mock seeds to cover required entity counts and states.
