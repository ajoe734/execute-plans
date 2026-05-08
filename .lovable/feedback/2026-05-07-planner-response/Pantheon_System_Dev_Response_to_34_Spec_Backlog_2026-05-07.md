# Pantheon — 規劃團隊對系統開發團隊回覆：待補規範 34 條總裁示

**文件類型**：Planner Response / System Development Team Handoff  
**日期**：2026-05-07  
**對象**：Lovable 前端團隊、BFF 團隊、Pathreon / Pantheon 後端系統開發團隊  
**來源**：`.lovable/plan.md`「規劃團隊待補規範清單」  
**範圍**：A 3 + B 5 + C 4 + D 4 + E 20；其中 C/D 兩組有 2 條重疊。  
**結論**：34 條全數接受，但不應全部繼續標 OPEN。經本回覆裁示後，合約層可收斂為 P0/P1/P2/P3 四組落地工作。  
**狀態**：APPROVED FOR CONTRACT CONSOLIDATION — implementation pending.

---

## 0. Executive Summary

系統開發團隊指出目前仍有 34 條「規劃團隊待補規範」，並標明 FE 端已完成 transitional / v0-mock / fallback 實作，需要 canonical spec / BFF contract 後才能移除 mock 標籤、收斂 single source of truth。

規劃團隊回覆如下：

```text
這 34 條不是新的產品方向問題，而是 contract finalization / backport / canonicalization 問題。
其中 P0/P1 必須先完成，否則前端 mock → real BFF 無法安全切換。
C/D 重疊項必須合併處理，不得在 smoke/audit 中重複標 OPEN。
E 組 second-order gaps 多數可進入 P3，不阻塞 BFF P0/P1 handoff。
```

本文件將 34 條裁示為：

```text
P0 — 必須立刻補進 H 版 BFF / Pack D canonical spec
P1 — 必須在 backend P0 review 前補齊
P2 — 高風險動作 / SLA / rollback / two-man 的 contract closure
P3 — UI / QA / semantic polish，不阻塞 BFF live 接線
```

---

## 1. Status Vocabulary

後續 smoke / audit / plan 請使用以下狀態，避免「規格已定但實作未接」被誤標 OPEN。

| Status | 意義 |
|---|---|
| `RESOLVED_BY_CONTRACT` | 規劃已裁示，contract 已定，可進 OpenAPI/AsyncAPI/DTO/Handoff。 |
| `SPEC_BACKPORT_REQUIRED` | 裁示已定，但需回灌 Pack D / v4 canonical spec。 |
| `IMPLEMENTATION_PENDING` | contract 已定，後端或前端尚未落地。 |
| `V0_MOCK_ALLOWED` | 前端可維持 mock，但必須標示 source=v0-mock / provisional。 |
| `PLANNING_OPEN` | 尚無規劃裁示；本文件後原則上不應再出現於 A/B/C/D。 |

---

# 2. A 組 — BFF Contract H 版最高優先 3 條

## A1. OpenAPI `components.schemas.ActionCommandStatus` 抽 named enum

### Decision

**ACCEPTED — SPEC_BACKPORT_REQUIRED.**

OpenAPI 必須新增 named schema：

```yaml
components:
  schemas:
    ActionCommandStatus:
      type: string
      enum:
        - accepted
        - queued
        - completed
```

所有 response 內聯 enum：

```yaml
enum: ["accepted", "queued", "completed"]
```

必須改為：

```yaml
$ref: '#/components/schemas/ActionCommandStatus'
```

### Rationale

1. 方便 codegen。
2. 避免 OpenAPI 多處 enum 漂移。
3. 對應 C.1 final decision：success status 不得包含 `requires_*`。

### Development Action

- BFF spec team：更新 `Pantheon_BFF_OpenAPI_3_1.yaml`。
- FE team：重跑 codegen 後移除手寫 `ACTION_COMMAND_STATUSES`，或保留為 generated output。
- Audit status：`RESOLVED_BY_CONTRACT — implementation pending`.

---

## A2. Pack D D21 ErrorCode master 補 3 條

### Decision

**ACCEPTED — SPEC_BACKPORT_REQUIRED.**

Pack D D21 ErrorCode master 必須補：

```text
RESOURCE_NOT_FOUND
APPROVAL_REQUIRED
CONFIRM_TOKEN_REVOKED
```

若目前 BFF DTO 已是 26 條，Pack D canonical 需同步至 26 條，避免「FE superset / spec subset」。

### Canonical ErrorCode master

```text
VALIDATION_FAILED
AUTH_REQUIRED
TOKEN_EXPIRED
REFRESH_FAILED
PERMISSION_DENIED
CAPABILITY_MISSING
TENANT_SCOPE_MISMATCH
FEATURE_DISABLED
STATE_CONFLICT
ILLEGAL_TRANSITION
CONFIRM_TOKEN_REQUIRED
CONFIRM_TOKEN_REVOKED
CONFIRM_TOKEN_REUSED
CONFIRM_TOKEN_EXPIRED
CONFIRM_TOKEN_BINDING_MISMATCH
TWO_MAN_REQUIRED
APPROVAL_REQUIRED
COOLDOWN_ACTIVE
CURSOR_EXPIRED
CURSOR_INVALID
RATE_LIMITED
IDEMPOTENCY_CONFLICT
BACKEND_UNAVAILABLE
SSE_REPLAY_UNAVAILABLE
RESOURCE_NOT_FOUND
UNKNOWN_ERROR
```

### Development Action

- Pack D-C BFF API Contract：更新 D21。
- BFF OpenAPI：更新 `ErrorCode` enum。
- FE：移除 `errorCodes.ts` 的 `H2 superset` 或 `temporary superset` 註解。
- Audit status：`RESOLVED_BY_CONTRACT — spec backport required`.

---

## A3. SSE Contract 補 channel + Permission Contract 補 capability map

### Decision

**ACCEPTED — SPEC_BACKPORT_REQUIRED.**

Pack D-D SSE Contract 必須補：

```text
approval
ask
```

Pack D-B Permission Contract 必須補：

```text
EvidenceKind → Capability map
RedactedEvidenceRef behavior
```

### approval channel

```ts
type ApprovalEvent =
  | {
      type: "approval.created";
      approvalId: string;
      kind: string;
      subject: string;
      riskLevel: string;
      at: string;
    }
  | {
      type: "approval.stage.changed";
      approvalId: string;
      stageName: string;
      state: "pending" | "approved" | "rejected" | "skipped";
      decidedBy?: string;
      at: string;
    }
  | {
      type: "approval.decided";
      approvalId: string;
      decision: "approved" | "rejected" | "changes_requested";
      decidedBy: string;
      at: string;
    }
  | {
      type: "approval.sla.escalated";
      approvalId: string;
      stageName: string;
      escalateTo: string;
      at: string;
    };
```

### ask channel

```ts
type AskEvent =
  | { type: "ask.session.started"; sessionId: string; personaIds: string[]; at: string }
  | { type: "ask.message.delta"; sessionId: string; messageId: string; personaId?: string; delta: string; seq: number; at: string }
  | { type: "ask.tool.called"; sessionId: string; toolName: string; callId: string; at: string }
  | { type: "ask.message.completed"; sessionId: string; messageId: string; at: string }
  | { type: "ask.session.completed"; sessionId: string; summary?: string; at: string }
  | { type: "ask.session.failed"; sessionId: string; errorCode: string; at: string };
```

### EvidenceKind → Capability map

| EvidenceKind | Required capability |
|---|---|
| alert | `risk.alert.read` |
| incident | `risk.incident.read` |
| job | `job.read` |
| audit | `audit.read` |
| metric | `metric.read` |
| strategy | `strategy.view` |
| persona | `persona.view` |
| deployment | `deployment.read` |
| runtime | `runtime.read` |
| policy | `policy.read` |
| approval | `approval.read` |
| artifact | `artifact.read` |
| signal | `agora.signal.read` |
| journal | `agora.journal.read` |
| postmortem | `postmortem.read` |

### RedactedEvidenceRef

```ts
type RedactedEvidenceRef = {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: "INSUFFICIENT_CAPABILITY";
  requiredCapability: Capability;
};
```

### Development Action

- AsyncAPI/SSE spec：補 channels。
- Permission contract：補 capability map。
- FE：移除 `dto.ts` transitional map 註解。
- Audit status：`RESOLVED_BY_CONTRACT — spec backport required`.

---

# 3. B 組 — Pack D 5 大 Critical Blockers

## B1. D05 — AsyncTransitionDescriptor timeout / failureState / failureReasonCode

### Decision

**ACCEPTED — RESOLVED_BY_CONTRACT.**

D05 不再只是一個 frontend timeout helper，而是所有 async command 的 BFF response contract。

### Canonical DTO

```ts
type FailureReasonCode =
  | "TIMEOUT"
  | "VALIDATION_FAILED"
  | "PERMISSION_DENIED"
  | "BACKEND_UNAVAILABLE"
  | "EXECUTION_FAILED"
  | "ROLLBACK_FAILED"
  | "SLA_BREACH"
  | "IDEMPOTENCY_CONFLICT"
  | "SCAN_FAILED"
  | "APPROVAL_EXPIRED"
  | "UNKNOWN";

type AsyncTransitionDescriptor = {
  id: string;
  entityType:
    | "job"
    | "deployment"
    | "handoff"
    | "evolutionRun"
    | "skillScan"
    | "rebalance"
    | "artifact"
    | "memoryReview"
    | "routePolicy"
    | "incident"
    | "approval"
    | "rollbackSaga";
  entityId: string;
  actionId: string;
  from: string;
  to: string;
  trigger: string;
  startedAt: string;
  timeoutMs: number;
  warnAfterMs?: number;
  failureState: string;
  failureReasonCode?: FailureReasonCode;
  retryable: boolean;
  maxRetries?: number;
  retryOf?: string;
  correlationId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled";
};
```

### Required BFF endpoints

```http
GET  /bff/transition-policies
GET  /bff/transitions/active
GET  /bff/transitions/{id}
POST /bff/transitions/{id}/retry
POST /bff/transitions/{id}/cancel
```

### Required policy defaults

| Action ID | Entity | timeoutMs | warnAfterMs | failureState | retryable | maxRetries |
|---|---|---:|---:|---|---:|---:|
| deployment.execute | deployment | 600000 | 300000 | failed | true | 2 |
| deployment.rollback | deployment | 600000 | 300000 | rollback_required | true | 2 |
| rollback.saga | rollbackSaga | 900000 | 300000 | failed | true | 1 |
| job.run | job | 1800000 | 300000 | failed | true | 3 |
| job.retry | job | 1800000 | 300000 | failed | true | 3 |
| handoff.respond | handoff | 86400000 | 3600000 | escalated | false | 0 |
| handoff.reopen | handoff | 30000 | 15000 | closed | true | 1 |
| evolution.run | evolutionRun | 3600000 | 900000 | failed | true | 1 |
| skill.security_scan | skillScan | 180000 | 60000 | scan_failed | true | 1 |
| rebalance.apply | rebalance | 900000 | 300000 | apply_failed | true | 1 |
| artifact.promote | artifact | 300000 | 120000 | promote_failed | true | 1 |
| route_policy.activate | routePolicy | 120000 | 60000 | activation_failed | true | 1 |
| incident.mitigation | incident | 900000 | 300000 | mitigation_failed | true | 1 |
| memory.review | memoryReview | 86400000 | 3600000 | auto_rejected | false | 0 |
| approval.stage | approval | 86400000 | 3600000 | escalated | false | 0 |

### Required SSE channel

```text
transition
```

Event types:

```text
transition.started
transition.warning
transition.succeeded
transition.failed
transition.timed_out
```

### Development Action

- BFF: implement transition policy endpoints.
- FE: remove `v0-mock` label from `timeoutPolicy.ts` only after endpoint exists.
- Audit status：`RESOLVED_BY_CONTRACT — implementation pending`.

---

## B2. D12 — Role × Capability bundle

### Decision

**ACCEPTED — RESOLVED_BY_CONTRACT.**

Capabilities are source of truth. Roles are UI grouping and default bundle hints.

### Capability rules

```text
- lowercase dot.case
- case-sensitive
- wildcard namespace.* allowed
- "*" allowed only for platform_admin / admin equivalent
```

### Canonical role capability bundle

```ts
type Capability = `${string}.${string}` | `${string}.*` | "*";

type Role =
  | "platform_admin"
  | "portfolio_manager"
  | "research_lead"
  | "ops"
  | "viewer"
  | "admin"
  | "risk_officer"
  | "capital_manager"
  | "strategy_manager"
  | "system_operator"
  | "reviewer"
  | "capability_admin";

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  platform_admin: ["*"],
  admin: ["*"],

  portfolio_manager: [
    "capital.*",
    "rebalance.*",
    "ranking.read",
    "ranking.publish",
    "approval.read",
    "metric.read"
  ],

  research_lead: [
    "strategy.view",
    "strategy.create",
    "strategy.edit_spec",
    "strategy.run_replication",
    "experiment.*",
    "artifact.*",
    "agora.signal.read",
    "agora.journal.read",
    "evolution.*",
    "ranking.read"
  ],

  ops: [
    "runtime.*",
    "job.*",
    "deployment.read",
    "deployment.execute",
    "deployment.rollback",
    "incident.mitigate",
    "audit.read"
  ],

  viewer: [
    "strategy.view",
    "persona.view",
    "deployment.read",
    "risk.alert.read",
    "metric.read"
  ],

  risk_officer: [
    "risk.*",
    "risk.alert.read",
    "risk.incident.read",
    "incident.*",
    "approval.read",
    "approval.two_man.sign",
    "deployment.rollback",
    "policy.read",
    "policy.review",
    "audit.read"
  ],

  capital_manager: [
    "capital.*",
    "rebalance.*",
    "allocation.*",
    "approval.read",
    "approval.two_man.sign",
    "metric.read"
  ],

  strategy_manager: [
    "strategy.*",
    "deployment.read",
    "deployment.request",
    "ranking.read",
    "rebalance.read",
    "artifact.read"
  ],

  system_operator: [
    "runtime.*",
    "job.*",
    "deployment.execute",
    "deployment.pause",
    "deployment.resume",
    "deployment.rollback",
    "mcp.*",
    "tool.*"
  ],

  reviewer: [
    "approval.read",
    "approval.review",
    "approval.two_man.sign",
    "strategy.approve_review",
    "artifact.promote",
    "memory.review"
  ],

  capability_admin: [
    "tool.*",
    "mcp.*",
    "skill.*",
    "channel.*",
    "policy.route",
    "capability.*"
  ]
};
```

### Conflict rule

```text
If roles and capabilities conflict, capabilities win.
If role says allowed but capability missing, action disabled with CAPABILITY_MISSING.
```

### Development Action

- BFF: `/bff/me.capabilities` must return actual capabilities.
- FE: `usePermissions()` should evaluate capabilities first, roles second as fallback.
- Audit status：`RESOLVED_BY_CONTRACT — implementation pending`.

---

## B3. D22 — list endpoint totalCount classification

### Decision

**ACCEPTED — RESOLVED_BY_CONTRACT.**

Use `ListResponse<T>` everywhere.

```ts
type ListResponse<T> = {
  items: T[];
  cursor: {
    next?: string;
    prev?: string;
  };
  pageSize: number;
  estimatedTotal?: number;
  totalCountExact: boolean;
};
```

### totalCount classification

| Endpoint class | Examples | totalCountExact |
|---|---|---:|
| Entity registry | strategies, personas, capital-pools, deployments, tools, skills | true |
| Governance queue | approvals, interventions | true |
| v5 loops | loop-runs | true preferred |
| Sentinel findings | findings | true preferred |
| Audit feed | audit | false allowed |
| Realtime notification feed | event log / recent events | false or absent |
| Infinite stream | SSE replay window | absent |

### Development Action

- OpenAPI: ensure every list endpoint uses `ListResponse<T>`.
- FE: `V5ListResponse` adapter reads canonical table, not hardcoded true.
- Audit status：`RESOLVED_BY_CONTRACT — implementation pending`.

---

## B4. D26 — SSE payload schema

### Decision

**ACCEPTED — RESOLVED_BY_CONTRACT.**

Every SSE channel must use typed discriminated union.

### Envelope

```ts
type SseEventEnvelope<TPayload> = {
  schemaVersion: 1;
  id: string;
  channel: SseChannelKind;
  type: string;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
};
```

### Required channels

```text
strategy
persona
deployment
job
risk
approval
ask
artifact
runtime
mcp
skill
channel
tool
ranking
rebalance
evolution
research
signal
inbox
journal
postmortem
loop
sentinel
intervention
rollback
handoff
confirm_token
cooldown
transition
audit
system
```

### Timing

```text
heartbeatSec = 15
staleAfterSec = 30
timeoutSec = 45
replayWindowSec = 86400
replayMaxEvents = 10000
```

### Development Action

- AsyncAPI: list every channel and event payload.
- FE: remove `payload: unknown` fallback only after channel unions are generated.
- Audit status：`RESOLVED_BY_CONTRACT — implementation pending`.

---

## B5. D51/D59 — `/bff/me` session DTO

### Decision

**ACCEPTED — RESOLVED_BY_CONTRACT.**

`/bff/me` is the single startup/session DTO.

```ts
type MeResponse = {
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
  };
  tenant: {
    id: string;
    name: string;
    tz: string;
    locale: string;
    baseCurrency?: string;
  };
  roles: Role[];
  capabilities: Capability[];
  env: "dev" | "staging" | "prod";
  featureFlags: Record<string, boolean>;
  serverTime: string;
  sessionExpiresAt: string;
  permissionsVersion: string;
  counters?: {
    pendingInterventionsCount?: number;
    unreadAuditCount?: number;
    openFindingsCount?: number;
  };
};
```

### Cache / refresh

```text
in-memory TTL = 30s
visibilitychange if >30s → refresh
403 / permission change event → force refresh
401 → silent refresh once → retry original once → fail logout
```

### Development Action

- Backend: implement `/bff/me`.
- FE: replace minimal `V5SessionContext` adapter with `MeResponse`.
- Audit status：`RESOLVED_BY_CONTRACT — implementation pending`.

---

# 4. C / D 組 — 重疊項合併裁示

## C1 / D36. Confirm token vs cooldown

### Decision

**MERGED — RESOLVED_BY_CONTRACT.**

Cooldown has priority.

```text
1. cooldown active 時，BFF MUST NOT issue confirm token.
2. token issued 後若 action 進入 cooldown，redeem MUST fail with COOLDOWN_ACTIVE.
3. confirm token TTL 不延長 cooldown.
4. serverTime 是唯一倒數 ground truth.
```

### Required endpoints

```http
GET    /bff/actions/{entityType}/{entityId}/{actionId}/cooldown
POST   /bff/confirm-tokens
GET    /bff/confirm-tokens/{tokenId}
POST   /bff/confirm-tokens/{tokenId}/redeem
DELETE /bff/confirm-tokens/{tokenId}
```

### Required SSE channels

```text
confirm_token
cooldown
```

### Audit status

```text
G-C2 and D36 must be treated as one item:
CONFIRM_TOKEN_COOLDOWN_SEMANTICS.
Status: RESOLVED_BY_CONTRACT — implementation pending.
```

---

## C2 / D35. Two-man distinct approval

### Decision

**MERGED — RESOLVED_BY_CONTRACT.**

Canonical rules:

```text
1. requester cannot sign as approver.
2. two-man requires two distinct userId.
3. high-risk production action families may require distinct role family.
4. BFF decides completeness; frontend only renders status.
```

### Required role family model

```ts
type RoleFamily =
  | "risk"
  | "ops"
  | "capital"
  | "research"
  | "strategy"
  | "admin"
  | "reviewer"
  | "capability";
```

### Required endpoints

```http
GET  /bff/two-man/policy?actionId={actionId}&entityType={entityType}&entityId={entityId}
POST /bff/v5/interventions/{id}/two-man-sign
POST /bff/approvals/{id}/two-man-sign
```

### Audit status

```text
G-C4 and D35 must be treated as one item:
TWO_MAN_DISTINCT_POLICY.
Status: RESOLVED_BY_CONTRACT — implementation pending.
```

---

## C3. PATCH journal failure rollback

### Decision

**ACCEPTED — RESOLVED_BY_CONTRACT.**

`PATCH /bff/agora/journal/{id}` uses JSON Merge Patch and is atomic.

```http
PATCH /bff/agora/journal/{id}
Content-Type: application/merge-patch+json
Idempotency-Key: idem_...
```

### Atomicity rule

```text
If any field validation fails, no fields are applied.
BFF returns 400 VALIDATION_FAILED with field-level ErrorDetails.
No partial journal state is persisted.
```

### Audit rule

On success:

```text
audit action = agora.journal.update
before / after diff required
correlationId required
```

On validation failure:

```text
audit action = agora.journal.update.rejected
outcome = rejected
attemptedPatchHash required
before / after diff not required
```

### Validation

```text
title: if present, 1–160 chars
body: if present, max 20000 chars
tags: if present, lowercase dot.case or slug
visibility: must be allowed by capability
```

### Audit status

```text
G-C5 = RESOLVED_BY_CONTRACT — implementation pending.
```

---

## C4. Bulk action partial-failure UI / response

### Decision

**ACCEPTED — RESOLVED_BY_CONTRACT.**

Bulk actions use `BulkActionResponse<T>`.

```ts
type BulkActionResponse<T> = {
  ok: boolean;
  partial: boolean;
  summary: {
    requested: number;
    succeeded: number;
    failed: number;
  };
  results: Array<{
    id: string;
    ok: boolean;
    data?: T;
    error?: BffErrorPayload;
  }>;
};
```

### UI behavior

| Outcome | Toast | Drawer | Selection |
|---|---|---|---|
| all succeeded | success toast | optional summary drawer | clear selection |
| partial success | warning toast with counts | required result drawer | keep failed selected |
| all failed | error toast | required failure drawer | keep selection |
| cursor expired during bulk | warning toast | show refetch warning | clear selection |

### Audit

```text
bulk.<action>.started
bulk.<action>.completed
bulk.<action>.partial
bulk.<action>.failed
```

Each successful item also writes item-level audit.

### Development Action

- BFF: return `BulkActionResponse<T>` for all batch endpoints.
- FE: implement standard BulkResultDrawer.
- Audit status：`G-C6 = RESOLVED_BY_CONTRACT — implementation pending`.

---

# 5. D 組獨立項

## D04. Incident ↔ Deployment rollback Saga

### Decision

**RESOLVED_BY_CONTRACT.**

Rollback is a BFF-orchestrated saga. Frontend must not manually dual-write incident and deployment.

### Required endpoints

```http
POST /bff/incidents/{incidentId}/rollback-deployment:dry-run
POST /bff/incidents/{incidentId}/rollback-deployment
GET  /bff/rollback-sagas/{sagaId}
POST /bff/rollback-sagas/{sagaId}/cancel
```

### Required DTOs

```ts
type RollbackSagaStatus =
  | "requested"
  | "accepted"
  | "approval_required"
  | "confirm_token_required"
  | "queued"
  | "rolling_back"
  | "compensating"
  | "succeeded"
  | "failed"
  | "cancelled";

type RollbackSagaDTO = {
  id: string;
  incidentId: string;
  deploymentId: string;
  targetVersion?: string;
  status: RollbackSagaStatus;
  currentStep:
    | "validate"
    | "approval"
    | "confirm_token"
    | "queue_execution"
    | "rolling_back"
    | "verify"
    | "link_incident"
    | "postmortem"
    | "done";
  reasonCode: string;
  requestedBy: string;
  requestedAt: string;
  updatedAt: string;
  timeout: AsyncTransitionDescriptor;
  correlationId: string;
  auditEventIds: string[];
  jobId?: string;
  approvalId?: string;
  failureReasonCode?: FailureReasonCode;
};
```

### Required SSE channel

```text
rollback
```

Events:

```text
rollback.saga.created
rollback.saga.step_changed
rollback.saga.completed
rollback.saga.failed
```

### Audit status

```text
D04 = RESOLVED_BY_CONTRACT — implementation pending.
```

---

## D30. Handoff Reopen SLA

### Decision

**RESOLVED_BY_CONTRACT.**

Default:

```text
Reopen does not reset SLA.
Reopen adds new SlaSegment.
SLA reset requires approval + audit reason.
```

### Required endpoints

```http
GET  /bff/handoffs
GET  /bff/handoffs/{id}
POST /bff/handoffs/{id}/reopen
POST /bff/handoffs/{id}/respond
POST /bff/handoffs/{id}/escalate
```

### Required DTOs

```ts
type HandoffStatus =
  | "open"
  | "responded"
  | "reopened"
  | "escalated"
  | "closed"
  | "expired";

type SlaSegment = {
  id: string;
  openedAt: string;
  closedAt?: string;
  reasonCode:
    | "initial"
    | "reopen_missing_info"
    | "reopen_rejected_response"
    | "reopen_incident_update"
    | "manual_reset_approved";
  actor: string;
  note?: string;
  resetSla: boolean;
  dueAt: string;
};
```

### Audit status

```text
D30 = RESOLVED_BY_CONTRACT — implementation pending.
```

---

# 6. E 組 — 20 條 second-order gaps 裁示

E 組不應阻塞 BFF P0/P1 handoff。除 E1/E5/E6/E8 與前面條目重疊外，其餘進 P3。

## E1. 狀態機 error/timeout/cancellation fallback transition

**Disposition**：併入 B1 / D05 propagation。  
**Status**：`RESOLVED_BY_CONTRACT — implementation pending`.

---

## E2. Admin override / force-transition 路徑與授權者

**Disposition**：接受，P2。

### Canonical rule

```text
Admin override is not a normal action. It is a break-glass action.
```

### Required endpoint

```http
POST /bff/admin/force-transition
Idempotency-Key: force-transition:{entityType}:{entityId}:{targetState}
```

### Request

```ts
type ForceTransitionRequest = {
  entityType: string;
  entityId: string;
  fromState: string;
  toState: string;
  justification: string;       // min 80 chars
  approverIds: string[];       // at least 2 for production/live-impact
  expiresAt?: string;
  incidentId?: string;
  expectedVersion: number;
};
```

### Rules

```text
requires platform_admin + risk_officer approval
requires audit
requires postmortem if live-impacting
disabled in prod unless featureFlag.breakGlass=true
```

---

## E3. 同 entity 兩 actor concurrent dispatch 衝突解決

**Disposition**：接受，P1。

### Canonical rule

```text
All write/action endpoints must use expectedVersion or lockVersion.
BFF rejects stale version with 409 STATE_CONFLICT.
```

### Error

```json
{
  "error": {
    "code": "STATE_CONFLICT",
    "details": {
      "kind": "state_conflict",
      "expectedVersion": 12,
      "actualVersion": 13
    }
  }
}
```

### FE behavior

```text
show conflict toast
refetch entity
show compare/diff if available
do not auto-retry destructive action
```

---

## E4. Memo 下限字數 / incident id / markdown / mention

**Disposition**：接受，P2。

### Memo policy

| Action class | memo requirement |
|---|---|
| low-risk | optional |
| medium-risk | optional unless policy requires |
| high-risk | required, min 40 chars |
| critical / emergency | required, min 80 chars + incidentId or findingId recommended |
| break-glass | required, min 80 chars + approval/postmortem |

Allowed format:

```text
plain text + markdown-lite
mentions allowed: @user, @role:risk_officer
links allowed only to internal evidence refs
```

Max length:

```text
2000 chars
```

---

## E5. 高風險動作 cooldown 連發限制

**Disposition**：併入 C1/D36 Confirm token vs cooldown。  
**Status**：`RESOLVED_BY_CONTRACT — implementation pending`.

---

## E6. SSE last-event-id replay window / heartbeat / backoff

**Disposition**：已由 Pack D / B4 confirmed。  
**Status**：`RESOLVED_BY_CONTRACT`.

Canonical:

```text
Last-Event-Id supported
replayWindowSec = 86400
replayMaxEvents = 10000
heartbeatSec = 15
staleAfterSec = 30
timeoutSec = 45
backoff = [1000, 2000, 5000, 10000, 30000]
```

---

## E7. `X-Request-Id` FE 產生 + response 回寫

**Disposition**：接受，P1。

### Canonical rule

```text
FE may generate X-Request-Id.
BFF must echo X-Request-Id in response header.
BFF must create or propagate X-Correlation-Id.
```

Headers:

```http
X-Request-Id: req_...
X-Correlation-Id: corr_...
```

Response:

```http
X-Request-Id: req_...
X-Correlation-Id: corr_...
```

If FE omits:

```text
BFF generates both.
```

---

## E8. Bulk endpoint 是否存在 + partial-failure 形狀

**Disposition**：併入 C4 Bulk action partial-failure。  
**Status**：`RESOLVED_BY_CONTRACT — implementation pending`.

---

## E9. Handoff 是否多輪對話

**Disposition**：接受，P2。

### Canonical rule

```text
Handoff is multi-turn by default.
Each message is immutable and auditable.
```

### Required endpoints

```http
GET  /bff/handoffs/{id}/messages
POST /bff/handoffs/{id}/messages
```

### DTO

```ts
type HandoffMessageDTO = {
  id: string;
  handoffId: string;
  senderType: "human" | "persona" | "sentinel" | "system";
  senderId: string;
  body: string;
  evidenceRefs?: EvidenceRef[];
  createdAt: string;
  correlationId: string;
};
```

---

## E10. Mandate breach 偵測週期 + 自動動作 + 通知對象

**Disposition**：接受，P2。

### Canonical defaults

```text
capital utilization: evaluate every 5 min
drawdown/risk budget: evaluate every 15 min
latency/slippage: evaluate every 5 min
policy breach: evaluate event-driven + 15 min sweep
```

### Auto actions

| Breach | Auto action |
|---|---|
| high | create alert + Sentinel finding |
| critical | create incident + HIQ intervention |
| live-impacting | require risk_officer notification |
| capital breach critical | freeze rebalance / allocation proposal until approval |

---

## E11. Reviewer / Approver quorum

**Disposition**：接受，P2.

### Defaults

| Risk | Quorum |
|---|---|
| low | 1 reviewer |
| medium | 1 reviewer |
| high | 2 reviewers, distinct user |
| critical | 2 reviewers + distinct role family |
| live capital impact | risk + capital |
| live deployment | risk + ops/strategy |

Quorum extension:

```text
maxExtensions = 1
extensionHours = 24
second miss → escalate
```

---

## E12. Random seed / data snapshot / code commit 鎖定機制

**Disposition**：接受，P3.

### Reproducibility lock

```ts
type ReproducibilityLock = {
  randomSeed: string;
  dataSnapshotId: string;
  codeCommitSha: string;
  artifactHash?: string;
  environmentId?: string;
  lockedAt: string;
  lockedBy: string;
};
```

Required for:

```text
research experiment
evolution run
ranking backtest
formula backtest
paper/live comparison
```

---

## E13. i18n ICU plural/select + Accept-Language fallback

**Disposition**：接受，P3.

### Canonical

```text
ICU MessageFormat allowed for plural/select.
No string concatenation for pluralized UI.
Accept-Language priority:
  user preference
  tenant default
  browser language
  zh-TW
  en-US
```

---

## E14. DataTable density + skeleton per table/card/chart/drawer

**Disposition**：接受，P3.

### Density

```text
comfortable: row height 48
compact: row height 36
dense: row height 32
```

### Skeleton threshold

```text
show skeleton if loading > 200ms
minimum skeleton display = 300ms
>2s show "Still loading"
>10s show retry affordance
```

---

## E15. LineageGraph node limit / layout / >500 nodes budget

**Disposition**：接受，P3.

### Canonical

```text
<=100 nodes: client layout
101–500 nodes: virtualized + lazy edge labels
>500 nodes: server-side layout / clustered summary required
```

Perf budget:

```text
initial render < 3.5s
interaction latency < 150ms
```

---

## E16. 多 drawer 同時開 + 巢狀 + ESC 關閉順序

**Disposition**：接受，P3.

### Canonical

```text
Only topmost overlay handles ESC.
Nested drawer allowed only for evidence/detail preview.
Destructive confirm dialog always topmost modal.
Closing parent closes children.
Focus returns to trigger.
```

---

## E17. 全域捷徑表

**Disposition**：接受，P3.

### Default shortcuts

| Shortcut | Action |
|---|---|
| `?` | open shortcut help |
| `g c` | Control Room |
| `g s` | Strategy Registry |
| `g p` | Persona Registry |
| `g e` | Execution Loop |
| `g o` | Optimization Loop |
| `g i` | Interventions |
| `/` | command palette / search |
| `Esc` | close topmost overlay |

All shortcuts must be disabled while text input is focused.

---

## E18. `prefers-reduced-motion`

**Disposition**：接受，P3.

### Canonical

```text
Remove:
  looping pulse
  animated gradients
  auto-scroll marquees
  long transform animations

Keep:
  focus ring
  opacity <=100ms
  instant progress state change
```

---

## E19. Audit timeline editable/delete

**Disposition**：reject edit/delete. Audit timeline immutable.

### Canonical

```text
Audit events are append-only.
No edit.
No delete.
Correction must be appended as audit.correction.added.
Redaction allowed only for security/legal with redacted placeholder.
```

---

## E20. Spec semver + changelog

**Disposition**：接受，P3.

### Versioning

```text
MAJOR: breaking DTO / endpoint / state machine change
MINOR: additive endpoint / field / event
PATCH: wording / examples / i18n / non-breaking clarification
```

### Changelog format

```md
## 2026-05-07-H
- Added:
- Changed:
- Deprecated:
- Removed:
- Migration:
- Backward compatibility:
```

---

# 7. Updated Priority Plan

## P0 — unblock BFF type-safe handoff

```text
A1 ActionCommandStatus named schema
A2 ErrorCode master 26
A3 approval/ask SSE + EvidenceKind capability map
B4 SSE payload schema
B5 /bff/me DTO
```

## P1 — unblock live BFF wiring

```text
B1 D05 AsyncTransitionDescriptor
B2 D12 ROLE_CAPABILITIES
B3 D22 totalCount classification
E3 optimistic lock / state conflict
E7 X-Request-Id echo
D04 rollback saga
```

## P2 — high-risk / governance correctness

```text
C1/D36 confirm token vs cooldown
C2/D35 two-man distinct
C3 journal patch rollback
C4 bulk partial failure
D30 handoff reopen SLA
E2 admin force-transition
E4 memo policy
E9 handoff multi-turn
E10 mandate breach
E11 quorum
```

## P3 — polish / scale / QA

```text
E12 reproducibility lock
E13 ICU / i18n
E14 table density / skeleton
E15 lineage graph limit
E16 drawer stack
E17 shortcuts
E18 reduced motion
E19 audit immutable correction
E20 spec semver / changelog
```

---

# 8. Required Updates to Existing Artifacts

## 8.1 BFF Final Bundle

Append or update:

```text
Pantheon_BFF_OpenAPI_3_1.yaml
Pantheon_BFF_AsyncAPI_SSE.md
Pantheon_BFF_DTO_Catalog.md
Pantheon_BFF_Backend_Handoff.md
Pantheon_BFF_PackD_BFF_Dependent_Final_Addendum_2026-05-07.md
```

## 8.2 Pack D canonical backport

Update:

```text
.lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md
.lovable/spec/v4/pack-d/Pantheon_Pack_D_SSE_Event_Contract.md
.lovable/spec/v4/pack-d/Pantheon_Pack_D_Permission_Contract.md
.lovable/spec/v4/pack-d/Pantheon_Pack_D_StateMachine_Contract.md
.lovable/spec/v4/pack-d/Pantheon_Pack_D_DomainRules_Contract.md
```

## 8.3 Audit status updates

Update smoke/audit wording:

```text
D04 / D30 / D35 / D36:
  from OPEN (BFF-dependent)
  to RESOLVED_BY_CONTRACT — implementation pending

D05 propagation:
  from partial
  to RESOLVED_BY_CONTRACT — endpoint/UI consumption pending

A/B/C/D:
  no longer planning-open after backport
```

---

# 9. FE 收尾動作

FE 端不需重新規劃，只需在 spec 落地後做以下收尾：

| Spec landed | FE action |
|---|---|
| A1 | regenerate OpenAPI codegen; remove hand-written status enum |
| A2 | remove `ErrorCode superset` comments |
| A3 | remove transitional Evidence map comments |
| B1 | change timeout policy source from `v0-mock` to `spec` |
| B2 | connect `usePermissions()` to `MeResponse.capabilities` |
| B3 | adapt list responses to endpoint-specific totalCountExact |
| B4 | replace `payload: unknown` fallback with generated event unions |
| B5 | replace minimal V5SessionContext with `/bff/me` adapter |
| D04 | wire rollback saga endpoints |
| D30 | wire handoff reopen/respond/escalate endpoints |
| D35 | wire two-man policy/signature endpoints |
| D36 | wire cooldown/confirm-token lifecycle |
| C3 | enforce merge-patch atomic failure UI |
| C4 | implement standard BulkResultDrawer |

---

# 10. What System Development Team Should Do Now

## Step 1 — Contract consolidation

Create / update:

```text
.lovable/spec/bff/2026-05-07-H/
  Pantheon_BFF_OpenAPI_3_1.yaml
  Pantheon_BFF_AsyncAPI_SSE.md
  Pantheon_BFF_DTO_Catalog.md
  Pantheon_BFF_Backend_Handoff.md
  Pantheon_BFF_PackD_BFF_Dependent_Final_Addendum_2026-05-07.md
```

## Step 2 — Pack D backport

Backport A1/A2/A3/B1/B2/B3/B4/B5 into Pack D canonical docs.

## Step 3 — Mark planning gaps resolved

Change smoke/audit text:

```text
Planning/spec OPEN → RESOLVED_BY_CONTRACT
Implementation pending remains.
```

## Step 4 — Backend P0 review

Backend team reviews:

```text
/bff/me
ListResponse / ErrorEnvelope
SSE envelope / channels
ActionCommand / ConfirmToken
RollbackSaga
Handoff
TwoMan
TransitionPolicy
```

## Step 5 — Frontend wiring plan

FE should not remove v0-mock until corresponding real BFF endpoint exists.

---

# 11. Final Decision

This response resolves the 34-item planning backlog at contract level.

```text
Frontend BFF contract is frozen for backend P0/P1 review.
A/B/C/D items are no longer planning-open after this response is applied.
E items are classified; E1/E5/E6/E8 are resolved by existing P0/P1 decisions, remaining E items are P2/P3.
```

The only remaining work is implementation:

```text
backend endpoints pending
OpenAPI/AsyncAPI/codegen pending
frontend real-BFF wiring pending
smoke report status update pending
```

Do not reopen these as planning gaps unless backend rejects a contract decision.
