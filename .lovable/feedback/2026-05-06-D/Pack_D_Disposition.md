# Pack D Disposition — Audit D 63 條 second-order gaps 規劃團隊正式回覆

**文件類型**：Planner Disposition / 規劃團隊回覆  
**版本**：Pack-D-Disposition-2026-05-06-A  
**對應 Audit**：`.lovable/audits/spec-gap-2026-05-06-D.md`、`spec-gap-2026-05-06-D-summary.csv`、`spec-gap-2026-05-06-D-blockers.md`  
**範圍**：Pack C / v4 落地後發現的 63 條 second-order gaps  
**目的**：給 Lovable / 前端實作端明確裁示，避免繼續以「合理猜測」填補 spec 缺口。  
**結論**：63 條全部接受為有效缺口；本 disposition 將其收斂為 Pack D canonical decisions。可進入 Pack D spec addendum + BFF contract 落地。

---

## 0. 核心裁示

Pack D 的定位不是新增更多 UI 頁面，而是補齊 **frontend operating contract**：

```text
Pack D = State machine + Permission + BFF API + SSE + Session/Auth + UI token + QA/perf 的 canonical contract 補強包
```

Pack D 與 v5 / Pack E 的關係：

```text
v5 / Pack E = Closed-loop Supervisor OS 的 IA + loop view-model + Sentinel + HIQ
v4 / Pack C = 既有 normative type / status / permission matrix / API envelope
Pack D = 補 v4/v5 都需要但仍未定義的 runtime contract
```

### 0.1 實作原則

1. **不得再由實作端自由猜測 contract。**
2. **v4 normative domain type 仍是 source of truth。**
3. **v5 loop / Sentinel / HIQ 可使用 view-model enum，但不得覆蓋 v4 domain enum。**
4. **所有 write/action endpoint 必須有 input DTO、validation、permission、audit、idempotency、realtime event。**
5. **所有 high-risk / live-impact action 必須走 approval / confirm token / two-man 或 emergency policy。**
6. **所有 realtime event 必須 type-safe，不能再用 `payload: unknown` 作最終契約。**
7. **mock 可先落地，但 mock 必須標示 `v0-mock`，並保留替換成 real BFF 的 interface。**

---

## 1. Pack D 落地分包

建議將 63 條分為 8 個 implementation packs：

| Pack | 範圍 | 對應 ID |
|---|---|---|
| D-A | State Machine / Async Transition / Invariants | D01–D08b |
| D-B | Permission / Capability / ActionDescriptor | D09–D16 |
| D-C | BFF API Contract / Error / Pagination / Filtering | D17–D25 |
| D-D | SSE / Realtime Event Contract | D26–D29 |
| D-E | Domain Rules：Handoff / Mandate / Ranking / Rebalance / Evolution / Approval / Token / Skill / Audit | D30–D38、D60 |
| D-F | Design Tokens / UI / A11y / Format / Glossary | D39–D50、D62、D63 |
| D-G | Session / Auth / Tenant / i18n / Time | D51–D59 |
| D-H | QA / Fixtures / E2E | D61 |

---

## 2. Critical Blockers 決策

Audit D 原先標出的 5 條 blockers：D05、D12、D22、D26、D59/D51。以下為最高優先裁示。

| ID | 裁示 |
|---|---|
| D05 | 每個 async transition 必須有 `timeoutMs`、`failureState`、`failureReasonCode`。v0 default 可先用本文件 §4.5。 |
| D12 | capabilities 是 source of truth；roles 只作 UI grouping / default bundle hint。新增 `ROLE_CAPABILITIES`。 |
| D22 | list endpoint 回 `items + cursor + estimatedTotal + totalCountExact`。registry 類列表必須 exact。feed 類可 estimated。 |
| D26 | SSE 必須有 typed envelope + channel discriminated union。mock 可先復用既有 realtime bus，但 payload schema 必須固定。 |
| D51/D59 | `/bff/me` 必須成為 frontend 啟動 session DTO，含 user、tenant、roles、capabilities、env、featureFlags、serverTime、sessionExpiresAt、locale、tz。 |

---

# 3. D01–D08b — State Machine / Lifecycle / Invariant

## D01 — Strategy 三軸狀態白名單未交叉定義

**Disposition**：接受。補 canonical 3-axis whitelist。  
**Severity**：High。  
**Implementation**：Pack D-A。

Strategy 必須同時使用三軸：

```ts
type StrategyTriple = {
  lifecycleStatus: StrategyLifecycleStatus;
  reviewStatus: StrategyReviewStatus;
  deploymentStatus: StrategyDeploymentStatus;
};
```

Canonical allowed matrix：

| lifecycleStatus | allowed reviewStatus | allowed deploymentStatus | 說明 |
|---|---|---|---|
| discovered | none | none | 初始候選，尚無 review/deployment |
| scaffolded | none, changes_requested | none | 已有 spec，可重修 |
| replicated | none, pending, changes_requested | none | 已有 evidence，可送審 |
| approved | approved | none | 已核准，尚未部署 |
| paper | approved | paper_running, stopped, rollback_required | paper execution |
| live | approved | live_running, rollback_required | live 必須 review approved |
| degraded | approved | live_running, stopped, rollback_required | live/paper 異常狀態 |
| retired | none, approved | none, stopped | 不允許 running deployment |

規則：

```text
1. live / paper / degraded 必須 reviewStatus = approved。
2. rejected / changes_requested 不得進入 paper/live。
3. retired 不得有 running deployment。
4. rollback_required 不等於 retired；它是 deployment recovery 狀態。
5. legacy `state` 僅可由 adapter 映射，不得作為新 UI 判斷 source of truth。
```

---

## D02 — Persona retired 是否可 reactivate 未定義

**Disposition**：`retired` 為終態，不允許 reactivate。  
**Severity**：High。  
**Implementation**：Pack D-A。

Canonical rule：

```text
Persona retired → archive only。
不得 retired → active。
```

若需要恢復類似 Persona，應使用：

```text
fork_persona_from_retired
```

此 action 會產生新 Persona draft/shadow，並保留 lineage：

```ts
type PersonaForkRequest = {
  sourcePersonaId: string;
  newName: string;
  reasonCode: "retired_replacement" | "incident_recovery" | "research_variant";
  memo: string;
};
```

Audit：

```text
reasonCode required
memo min 40 chars
lineage sourcePersonaId required
```

---

## D03 — CapitalPool frozen 狀態未列入狀態機

**Disposition**：`frozen` 是 CapitalPool state，不是單純 flag；另保留 FreezeRecord 作原因與時間窗。  
**Severity**：High。  
**Implementation**：Pack D-A / D-E。

Canonical state：

```ts
type CapitalPoolStatus =
  | "draft"
  | "active"
  | "frozen"
  | "rebalancing"
  | "restricted"
  | "retired";
```

FreezeRecord：

```ts
type CapitalPoolFreeze = {
  id: string;
  poolId: string;
  reasonCode: "risk_breach" | "incident" | "manual_override" | "policy_violation" | "liquidity_event";
  memo: string;
  frozenBy: string;
  frozenAt: string;
  expiresAt?: string;
  active: boolean;
};
```

Transitions：

```text
draft → active
active → frozen
frozen → active
active → rebalancing
rebalancing → active
active → restricted
restricted → active
active/restricted/frozen → retired
```

---

## D04 — Incident 與 Deployment rollback 雙寫順序未定義

**Disposition**：採 Saga sequence + idempotency。Incident 是觸發與治理來源；Deployment rollback 是執行命令。  
**Severity**：High。  
**Implementation**：Pack D-A / D-E / D-C。

Sequence：

```text
1. Incident opened or escalated.
2. Sentinel / human creates RemediationAction(type=rollback_deployment).
3. BFF creates rollback command with idempotencyKey and correlationId.
4. Deployment status → rollback_required or rolling_back.
5. Execution service runs rollback.
6. On success:
   - Deployment status → rolled_back
   - Incident status → mitigated or postmortem_required
   - Audit writes deployment.rollback.success and incident.mitigation.linked
7. On failure:
   - Deployment status → rollback_required
   - Incident status → mitigation_in_progress
   - failureReasonCode required
```

Idempotency：

```text
idempotencyKey = rollback:{incidentId}:{deploymentId}:{targetVersion}
```

---

## D05 — 10+ 狀態機缺 timeoutMs / failureState

**Disposition**：所有 async transition 必須使用 `AsyncTransitionDescriptor`。  
**Severity**：High / Blocker。  
**Implementation**：Pack D-A。

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
  | "UNKNOWN";

type AsyncTransitionDescriptor = {
  entityType: string;
  from: string;
  to: string;
  trigger: string;
  timeoutMs: number;
  failureState: string;
  failureReasonCode?: FailureReasonCode;
  retryable: boolean;
  maxRetries?: number;
};
```

Default v0 values：

| Transition 類型 | timeoutMs | failureState | retryable |
|---|---:|---|---|
| deployment.execute | 600000 | failed | true |
| deployment.rollback | 600000 | rollback_required | true |
| job.run | 1800000 | failed | true |
| skill.security_scan | 180000 | scan_failed | true |
| memory.review | 86400000 | auto_rejected | false |
| artifact.promote | 300000 | promote_failed | true |
| route_policy.activate | 120000 | activation_failed | true |
| alert.acknowledge | 30000 | open | true |
| incident.mitigation | 900000 | mitigation_failed | true |
| handoff.respond | SLA tier | escalated | false |
| evolution.run | 3600000 | failed | true |
| rebalance.apply | 900000 | apply_failed | true |

---

## D06 — EvolutionRun pause 期間是否消耗 quota

**Disposition**：預設 pause 期間不消耗 compute quota，但消耗 wall-clock SLA。  
**Severity**：Medium。  
**Implementation**：Pack D-A / D-E。

```ts
type EvolutionQuotaPolicy = {
  quotaClock: "compute_only" | "wall_clock";
  pauseConsumesComputeQuota: boolean; // default false
  pauseConsumesSla: boolean;          // default true
};
```

Default：

```text
pauseConsumesComputeQuota = false
pauseConsumesSla = true
```

---

## D07 — Triple-Axis 不變式觸發 transition 未列舉

**Disposition**：補 `validateOn`，違反時預設 reject，不 auto-correct。  
**Severity**：Medium。  
**Implementation**：Pack D-A。

```ts
type InvariantValidationTrigger =
  | "entity_create"
  | "entity_update"
  | "review_decision"
  | "deployment_start"
  | "deployment_complete"
  | "rollback"
  | "retire"
  | "realtime_ingest"
  | "legacy_adapter";
```

Rules：

```text
1. 新資料違反 invariant → reject。
2. legacy adapter 可 map 舊值，但必須加 migrationWarning。
3. UI 不得自行 auto-correct domain state。
```

---

## D08 — Job cancel 後 retry 規則

**Disposition**：cancelled 是 terminal；retry 必須建立新 jobId，保留 parentJobId / retryOf。  
**Severity**：Medium。  
**Implementation**：Pack D-A / D-C。

```ts
type JobRetryRequest = {
  sourceJobId: string;
  idempotencyKey: string;
  reasonCode: "operator_retry" | "transient_failure" | "dependency_restored";
  memo?: string;
};

type Job = {
  id: string;
  retryOf?: string;
  parentJobId?: string;
  attempt: number;
  maxAttempts: number;
};
```

Default：

```text
maxAttempts = 3
cancelled job 不可恢復 running
retry creates new job
audit chain required
```

---

## D08b — quarantine 期間是否影響 RAG 檢索

**Disposition**：quarantined memory 預設排除於 RAG retrieval。  
**Severity**：Low。  
**Implementation**：Pack D-A / D-E。

```ts
type MemoryRetrievalPolicy = {
  quarantinedVisibleToRag: false;
  allowedOverrideRoles: ["admin", "risk_officer", "research_lead"];
  overrideRequiresAudit: true;
};
```

---

# 4. D09–D16 — Permission / Capability / ActionDescriptor

## D09 — Strategy entity 缺核心 action 列

**Disposition**：補 Strategy action catalog。  
**Severity**：High。  
**Implementation**：Pack D-B。

Canonical actions：

```text
strategy.view
strategy.create
strategy.edit_spec
strategy.run_replication
strategy.submit_review
strategy.approve_review
strategy.request_changes
strategy.promote_paper
strategy.promote_live
strategy.rollback_to_paper
strategy.mark_degraded
strategy.replace
strategy.retire
strategy.archive
strategy.run_parameter_sweep
strategy.attach_artifact
strategy.start_evolution
strategy.manage_watchers
```

每個 action 必須有：

```ts
entity, action, capability, allowedRoles, requiresApproval, requiresConfirmToken, requiresTwoMan, riskLevel, disabledReasonCode?
```

---

## D10 — Persona entity 缺核心 action 列

**Disposition**：補 Persona action catalog。  
**Severity**：High。  
**Implementation**：Pack D-B。

Canonical actions：

```text
persona.view
persona.create
persona.edit_identity
persona.create_sandbox
persona.activate
persona.switch_to_shadow
persona.pause_routing
persona.restrict
persona.suspend
persona.restore
persona.retire
persona.archive
persona.assign_skill
persona.revoke_skill
persona.update_memory
persona.start_evaluation
persona.fork_from_retired
```

---

## D11 — Channel / Watchlist / Notebook 未列入 entity

**Disposition**：補三個 entity 的 RBAC。  
**Severity**：High。  
**Implementation**：Pack D-B。

Channel actions：

```text
channel.view
channel.create
channel.edit
channel.test_send
channel.enable
channel.disable
channel.subscribe
channel.archive
```

Watchlist actions：

```text
watchlist.view
watchlist.create
watchlist.edit
watchlist.add_item
watchlist.remove_item
watchlist.share
watchlist.archive
watchlist.convert_signal
```

Notebook actions：

```text
notebook.view
notebook.create_note
notebook.edit_note
notebook.convert_to_insight
notebook.create_research_task
notebook.archive
notebook.export
```

---

## D12 — Role × Capability bundle 對應未明確

**Disposition**：capabilities 為 source of truth；roles 是 default bundle / UI grouping hint。  
**Severity**：High / Blocker。  
**Implementation**：Pack D-B / D-G。

```ts
type Capability = `${string}.${string}` | `${string}.*` | "*";

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  admin: ["*"],
  research_lead: [
    "strategy.create", "strategy.edit_spec", "strategy.run_replication",
    "experiment.*", "artifact.*", "insight.*", "memory.review",
    "evolution.*", "ranking.read"
  ],
  strategy_manager: [
    "strategy.*", "deployment.plan", "deployment.read",
    "ranking.read", "rebalance.read"
  ],
  risk_officer: [
    "risk.*", "incident.*", "deployment.rollback",
    "capital.risk", "approval.review", "policy.review"
  ],
  capital_manager: [
    "capital.*", "rebalance.*", "ranking.publish", "allocation.*"
  ],
  system_operator: [
    "runtime.*", "job.*", "deployment.execute", "deployment.pause",
    "deployment.resume", "deployment.rollback"
  ],
  reviewer: [
    "approval.review", "strategy.approve_review", "memory.review",
    "artifact.promote"
  ],
  capability_admin: [
    "tool.*", "mcp.*", "skill.*", "channel.*", "policy.route"
  ]
};
```

Rules：

```text
1. `/bff/me.capabilities` 是最終權限來源。
2. `/bff/me.roles` 只作 UI group / default bundle fallback。
3. wildcard 支援 namespace.*。
4. capability 必須 lowercase dot.case。
```

---

## D13 — disabledReasonCode 未列舉 enum

**Disposition**：補固定 enum。  
**Severity**：High。  
**Implementation**：Pack D-B.

```ts
type DisabledReasonCode =
  | "INSUFFICIENT_CAPABILITY"
  | "INSUFFICIENT_ROLE"
  | "INVALID_STATE"
  | "WRONG_ENVIRONMENT"
  | "APPROVAL_REQUIRED"
  | "CONFIRM_TOKEN_REQUIRED"
  | "TWO_MAN_REQUIRED"
  | "COOLDOWN_ACTIVE"
  | "BLOCKED_BY_INCIDENT"
  | "BLOCKED_BY_POLICY"
  | "STALE_VERSION"
  | "TENANT_SCOPE_MISMATCH"
  | "FEATURE_FLAG_DISABLED"
  | "RATE_LIMITED"
  | "UNKNOWN";
```

i18n key：

```text
actions.disabled.<reasonCode>
```

---

## D14 — requiresEnv 不符時的提示文案

**Disposition**：補標準文案與 i18n key。  
**Severity**：Medium。  
**Implementation**：Pack D-B / D-F.

```text
actions.disabled.WRONG_ENVIRONMENT =
"This action requires {{requiredEnv}} environment. Current environment: {{currentEnv}}."
```

zh-TW：

```text
此操作需要 {{requiredEnv}} 環境。目前環境：{{currentEnv}}。
```

---

## D15 — cooldown 倒數 ground truth

**Disposition**：serverTime 為唯一 ground truth。  
**Severity**：Medium。  
**Implementation**：Pack D-B / D-G.

Rules：

```text
1. `/bff/me.serverTime` 初始化 clock offset。
2. ActionDescriptor 可回 `cooldownEndsAt`。
3. UI 只用 server offset 計算倒數。
4. client local clock 不得作為 cooldown 判定依據。
```

---

## D16 — capability namespace 大小寫敏感未定

**Disposition**：固定 lowercase dot.case；大小寫敏感。  
**Severity**：Low。  
**Implementation**：Pack D-B.

```text
valid: strategy.promote_live
invalid: Strategy.PromoteLive
```

---

# 5. D17–D25 — BFF API Contract

## D17 — cursor 失效 fallback

**Disposition**：新增 cursor error codes 與 fallback。  
**Severity**：High。  
**Implementation**：Pack D-C.

```ts
type CursorErrorCode = "CURSOR_EXPIRED" | "CURSOR_INVALID";
```

Fallback：

```text
1. 顯示 toast：列表游標已失效，已重新載入。
2. 保留 filter/sort。
3. 清空 cursor，重新抓第一頁。
4. 若使用者正在 multi-select，清除 selection 並提示。
```

Cursor TTL default：

```text
15 minutes
```

---

## D18 — filter operator grammar

**Disposition**：採 bracket grammar。  
**Severity**：High。  
**Implementation**：Pack D-C.

```text
filter[field][op]=value
```

Allowed ops：

```text
eq, ne, in, nin, gt, gte, lt, lte, contains, startsWith, between, exists
```

Example：

```text
/bff/strategies?filter[risk][in]=high,critical&filter[updatedAt][gte]=2026-05-01T00:00:00Z
```

---

## D19 — sort 多欄與 null 排序

**Disposition**：採 comma multi-sort；null default last。  
**Severity**：High。  
**Implementation**：Pack D-C.

```text
sort=field,-updatedAt,name
```

Rules：

```text
1. 無 prefix = asc。
2. `-` prefix = desc。
3. null 預設 last。
4. 若需 override：sort=field:asc:nullsFirst。
```

---

## D20 — error envelope details schema

**Disposition**：`details` 必須 discriminated union。  
**Severity**：High。  
**Implementation**：Pack D-C.

```ts
type ErrorDetails =
  | { kind: "validation"; fields: Record<string, string[]> }
  | { kind: "state_conflict"; expectedVersion?: number; actualVersion?: number }
  | { kind: "permission"; missingCapabilities: string[] }
  | { kind: "cursor"; cursorError: "CURSOR_EXPIRED" | "CURSOR_INVALID" }
  | { kind: "rate_limit"; retryAfterSec: number }
  | { kind: "transition"; from: string; action: string; allowedActions: string[] }
  | { kind: "idempotency"; idempotencyKey: string; replayed: boolean };
```

---

## D21 — 平台 error code master list

**Disposition**：建立 `ErrorCode` master enum。  
**Severity**：High。  
**Implementation**：Pack D-C.

Core list：

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
CONFIRM_TOKEN_EXPIRED
CONFIRM_TOKEN_REUSED
CONFIRM_TOKEN_BINDING_MISMATCH
TWO_MAN_REQUIRED
COOLDOWN_ACTIVE
CURSOR_EXPIRED
CURSOR_INVALID
RATE_LIMITED
IDEMPOTENCY_CONFLICT
BACKEND_UNAVAILABLE
SSE_REPLAY_UNAVAILABLE
UNKNOWN_ERROR
```

i18n：

```text
errors.<ErrorCode>
```

---

## D22 — list 是否回 totalCount

**Disposition**：採統一 list envelope。  
**Severity**：High / Blocker。  
**Implementation**：Pack D-C.

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

Rules：

| List 類型 | totalCountExact |
|---|---|
| entity registry lists | true |
| governance queue | true |
| loop runs | true in mock; backend may exact |
| audit feed | false / estimated |
| realtime event feed | false / optional |
| infinite notification feed | false / optional |

---

## D23 — 部分成功 envelope

**Disposition**：Bulk actions 採 partial success envelope。  
**Severity**：Medium。  
**Implementation**：Pack D-C.

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

HTTP：

```text
207 Multi-Status preferred
200 accepted if proxy does not support 207, but envelope.partial must be true
```

---

## D24 — attachment multipart 規格

**Disposition**：補 upload contract。  
**Severity**：Medium。  
**Implementation**：Pack D-C.

```ts
type AttachmentPolicy = {
  maxSizeMb: number;
  allowedMimeTypes: string[];
  scanRequired: boolean;
};
```

Default：

| Type | Max | Mime |
|---|---:|---|
| image | 10MB | image/png, image/jpeg, image/webp |
| document | 25MB | application/pdf, text/plain, text/csv |
| artifact metadata upload | 100MB | application/json, text/csv |
| model/container artifact | pre-signed upload only | backend-specific |

Scan status：

```text
pending_scan → clean → rejected
```

---

## D25 — X-RateLimit header

**Disposition**：加入標準 headers。  
**Severity**：Medium。  
**Implementation**：Pack D-C.

Headers：

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
Retry-After
X-RateLimit-Scope
```

UI 行為：

```text
remaining < 10% 時可顯示 warning
429 時顯示 retryAfter countdown
```

---

# 6. D26–D29 — SSE / Realtime

## D26 — channel event payload schema

**Disposition**：所有 SSE event 必須 discriminated union。  
**Severity**：High / Blocker。  
**Implementation**：Pack D-D.

Envelope：

```ts
type SseEventEnvelope<T> = {
  id: string;
  schemaVersion: 1;
  channel: string;
  type: string;
  occurredAt: string;
  correlationId: string;
  payload: T;
};
```

Example：

```ts
type StrategyEvent =
  | { type: "strategy.lifecycle.changed"; strategyId: string; lifecycleStatus: string; at: string }
  | { type: "strategy.review.updated"; strategyId: string; reviewStatus: string; at: string }
  | { type: "strategy.deployment.changed"; strategyId: string; deploymentStatus: string; at: string };
```

---

## D27 — Last-Event-Id 過期視窗

**Disposition**：replayWindowSec = 86400。  
**Severity**：Medium。  
**Implementation**：Pack D-D.

Defaults：

```text
replayWindowSec = 86400
replayMaxEvents = 10000
```

If expired：

```text
emit resync_required
client refetches affected endpoints
```

---

## D28 — heartbeat 間隔與 timeout

**Disposition**：heartbeat 15s；timeout 45s。  
**Severity**：Medium。  
**Implementation**：Pack D-D.

```text
heartbeatSec = 15
staleAfterSec = 30
timeoutSec = 45
reconnectBackoffMs = [1000, 2000, 5000, 10000, 30000]
```

---

## D29 — resync_required client 行為

**Disposition**：每 channel 必須有 resync endpoint。  
**Severity**：Medium。  
**Implementation**：Pack D-D.

Examples：

| Channel | resync endpoint |
|---|---|
| strategy.* | `/bff/strategies/{id}` or `/bff/strategies` |
| persona.* | `/bff/personas/{id}` or `/bff/v5/execution/persona-health` |
| deployment.* | `/bff/deployments/{id}` |
| risk.* | `/bff/alerts`, `/bff/incidents` |
| loop.* | `/bff/v5/loop-runs` |
| sentinel.* | `/bff/v5/sentinel/findings` |
| intervention.* | `/bff/v5/interventions` |
| audit.* | `/bff/audit` |

---

# 7. D30–D38 / D60 — Domain Rules

## D30 — Handoff reopen 後 SLA 是否重置

**Disposition**：預設不重置；新增 SLA segment。  
**Severity**：High。  
**Implementation**：Pack D-E.

```text
slaResetOnReopen = false
```

Reopen 會建立：

```ts
type SlaSegment = {
  openedAt: string;
  closedAt?: string;
  reasonCode: string;
  actor: string;
};
```

若需重置 SLA，必須：

```text
requiresApproval = true
audit reason required
```

---

## D31 — CapitalPool breach 公式

**Disposition**：補 canonical breach formulas。  
**Severity**：High。  
**Implementation**：Pack D-E.

```ts
utilizationPct = utilized / allocated
riskBudgetUsagePct = abs(currentDrawdownPct) / riskBudgetPct
concentrationPct = max(positionExposureUsd) / allocated
```

Breach defaults：

```text
utilizationPct > 0.90 → high
utilizationPct > 0.98 → critical
riskBudgetUsagePct > 1.00 → high
riskBudgetUsagePct > 1.25 → critical
concentrationPct > policy.maxConcentrationPct → high
```

Window：

```text
utilization: current
drawdown/riskBudget: rolling 30d
latency/slippage: rolling 24h
```

---

## D32 — metric canonical id

**Disposition**：建立 metric registry。  
**Severity**：High。  
**Implementation**：Pack D-E.

Canonical IDs：

```text
pnl_24h_pct
pnl_7d_pct
pnl_30d_pct
sharpe
max_drawdown_pct
live_paper_divergence_pct
slippage_p95_bps
latency_p95_ms
fill_rate_pct
order_reject_rate_pct
capital_utilization_pct
risk_budget_usage_pct
persona_decision_quality_score
sentinel_confidence
```

Metric schema：

```ts
type MetricDef = {
  id: string;
  labelKey: string;
  unit: "pct" | "bps" | "ms" | "usd" | "score" | "count";
  higherIsBetter: boolean;
  precision: number;
};
```

---

## D33 — quorum 未達續延規則

**Disposition**：quorum 可自動續延一次；第二次未達 escalates。  
**Severity**：Medium。  
**Implementation**：Pack D-E.

```ts
type QuorumExtensionPolicy = {
  maxExtensions: 1;
  extensionHours: 24;
  escalateTo: "committee" | "risk_officer" | "admin";
};
```

---

## D34 — fitness formula metric 缺值策略

**Disposition**：required metric 缺值 fail；optional metric 缺值 penalty。  
**Severity**：Medium。  
**Implementation**：Pack D-E.

```ts
type MissingMetricPolicy =
  | { mode: "fail_run" }
  | { mode: "penalty"; penaltyScore: number }
  | { mode: "impute"; value: number };
```

Default：

```text
required metric → fail_run
optional metric → penalty(-0.1)
```

---

## D35 — Two-Man 兩人是否可同 role

**Disposition**：必須 distinct user；高風險可要求 distinct role family。  
**Severity**：Medium。  
**Implementation**：Pack D-E / D-B.

Default：

```text
1. requester 不可作為 approver。
2. two-man 必須 two distinct userId。
3. live deployment / capital apply / emergency override 需 risk_officer + non-risk executor/capital role。
```

---

## D36 — confirm token TTL 與 cooldown 衝突

**Disposition**：cooldown 優先。  
**Severity**：Medium。  
**Implementation**：Pack D-E.

Rules：

```text
1. cooldown active 時，不可 issue confirm token。
2. token issued 後若 action 進入 cooldown，redeem 失敗：COOLDOWN_ACTIVE。
3. confirm token TTL 不延長 cooldown。
```

---

## D37 — audit reason 最大長度

**Disposition**：max 2000 chars；server reject，不 silent truncate。  
**Severity**：Low。  
**Implementation**：Pack D-E.

```text
min length for high-risk memo = 40
max length = 2000
UI display truncates after 240 chars with expand
server validation rejects > 2000
```

---

## D38 — Skill rollback 與 deprecate 同時操作

**Disposition**：互斥。  
**Severity**：Low。  
**Implementation**：Pack D-E.

Rules：

```text
1. deprecate_in_progress 時 rollback disabled。
2. rollback_in_progress 時 deprecate disabled。
3. 若 active skill 被 incident block，優先 rollback，再 deprecate。
```

---

## D60 — audit event correlationId chain

**Disposition**：所有 user action / system action / Sentinel action 都必須帶 correlation chain。  
**Severity**：Medium。  
**Implementation**：Pack D-E / D-D.

```ts
type CorrelationFields = {
  correlationId: string;
  causationId?: string;
  parentCorrelationId?: string;
  traceId?: string;
};
```

Rules：

```text
1. user click creates correlationId.
2. BFF commands, audit events, SSE events reuse same correlationId.
3. child events set causationId = triggering event id.
4. loop run / Sentinel finding / intervention item must expose correlationId.
```

---

# 8. D39–D50 / D62 / D63 — Design Tokens / UI / A11y / Format

## D39 — spacing / typography scale

**Disposition**：採 4pt spacing + fixed type scale。  
**Severity**：High。  
**Implementation**：Pack D-F.

Spacing：

```text
0=0
1=4px
2=8px
3=12px
4=16px
5=20px
6=24px
8=32px
10=40px
12=48px
16=64px
```

Typography：

```text
xs 12/16
sm 14/20
base 16/24
lg 18/28
xl 20/28
2xl 24/32
3xl 30/36
mono-xs 11/16
```

---

## D40 — risk severity color token

**Disposition**：五階固定 token，含 dark mode。  
**Severity**：High。  
**Implementation**：Pack D-F.

```text
risk.info      hsl(210, 80%, 50%)
risk.low       hsl(145, 60%, 42%)
risk.medium    hsl(38, 90%, 50%)
risk.high      hsl(25, 90%, 52%)
risk.critical  hsl(0, 72%, 52%)
```

Dark mode 使用相同 hue，調整 lightness +8–12%。

---

## D41 — Toast 規格

**Disposition**：補 toast standard。  
**Severity**：Medium。  
**Implementation**：Pack D-F.

```text
position: top-right desktop, bottom-center mobile
duration: success 4s, info 5s, warning 7s, error 8s
critical/emergency: sticky until dismissed
max stack: 5
duplicates: collapse by dedupeKey
```

---

## D42 — Form validation 觸發時機

**Disposition**：onBlur + touched onChange + submit full validation。  
**Severity**：Medium。  
**Implementation**：Pack D-F.

Rules：

```text
1. 初次輸入不即時報錯，避免噪音。
2. field touched 後 onChange validation。
3. onSubmit 全欄位 validation。
4. high-risk memo 顯示剩餘字數與 min length。
```

---

## D43 — Skeleton threshold

**Disposition**：200ms threshold。  
**Severity**：Medium。  
**Implementation**：Pack D-F.

```text
show skeleton if loading > 200ms
minimum skeleton display = 300ms
if loading > 2s show "Still loading" helper
if loading > 10s show retry affordance
```

---

## D44 — Empty state 必含元素

**Disposition**：標準 empty state 4 元素。  
**Severity**：Medium。  
**Implementation**：Pack D-F.

```text
icon
title
description
primary CTA or reason why no CTA
```

If read-only disabled：

```text
CTA disabled + tooltip
```

---

## D45 — Confirm dialog 與 confirm token flow

**Disposition**：標準流程如下。  
**Severity**：Medium。  
**Implementation**：Pack D-F / D-E.

```text
1. User clicks high-risk action.
2. Dialog opens with impact, blast radius, rollback info.
3. User enters memo.
4. UI requests confirm token.
5. User confirms exact phrase if required.
6. UI redeems token with idempotencyKey.
7. BFF executes action.
8. Audit + realtime event emitted.
```

---

## D46 — Reduced motion

**Disposition**：遵守 prefers-reduced-motion。  
**Severity**：Medium。  
**Implementation**：Pack D-F.

```text
remove: spinners, animated gradients, auto-scrolling marquees, pulse loops
keep: opacity transition <=100ms, focus ring, progress value changes without motion
```

---

## D47 — Focus ring token

**Disposition**：補 focus ring token。  
**Severity**：Medium。  
**Implementation**：Pack D-F.

```text
focus.ring.color = hsl(210, 90%, 55%)
focus.ring.width = 2px
focus.ring.offset = 2px
focus.ring.radius = inherit
```

---

## D48 — number / date / currency format token

**Disposition**：使用 Intl tokens。  
**Severity**：Low。  
**Implementation**：Pack D-F.

```ts
type FormatTokens = {
  dateShort: Intl.DateTimeFormatOptions;
  dateTime: Intl.DateTimeFormatOptions;
  relativeTime: true;
  numberCompact: Intl.NumberFormatOptions;
  percent: Intl.NumberFormatOptions;
  currency: Intl.NumberFormatOptions;
};
```

---

## D49 — glossary key 命名規則

**Disposition**：dot.case namespace。  
**Severity**：Low。  
**Implementation**：Pack D-F.

Examples：

```text
nav.controlRoom
v5.loop.execution.title
actions.strategy.promote_live.label
errors.PERMISSION_DENIED
```

---

## D50 — bucket color 五階配色

**Disposition**：與 risk severity 對齊，但圖表用 chart bucket token。  
**Severity**：Low。  
**Implementation**：Pack D-F.

```text
bucket.1 hsl(210, 70%, 55%)
bucket.2 hsl(145, 55%, 45%)
bucket.3 hsl(38, 88%, 52%)
bucket.4 hsl(25, 88%, 52%)
bucket.5 hsl(0, 70%, 52%)
```

---

## D62 — axe-core rule subset

**Disposition**：CI 不允許 serious / critical violations。  
**Severity**：Low。  
**Implementation**：Pack D-F / D-H.

```text
violations[impact=critical] = fail
violations[impact=serious] = fail
moderate = warn unless in allowlist
allowlist requires owner + expiry
```

---

## D63 — Perf budget

**Disposition**：補 page-class performance budget。  
**Severity**：Low。  
**Implementation**：Pack D-F.

| Page class | LCP | TTI | Notes |
|---|---:|---:|---|
| Control Room | 2.5s | 3.0s | above fold summary |
| Entity List | 2.0s | 2.5s | first 50 rows |
| Detail Page | 2.8s | 3.5s | first tab |
| Heavy Studio | 3.5s | 4.5s | charts allowed lazy |
| Sentinel / HIQ | 2.5s | 3.0s | findings visible |

---

# 9. D51–D59 — Session / Auth / Tenant / i18n / Time

## D51 — `/bff/me` DTO

**Disposition**：補 `MeResponse`。  
**Severity**：High / Blocker。  
**Implementation**：Pack D-G.

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
};
```

Cache：

```text
in-memory TTL = 30s
refresh on visibilitychange if older than 30s
force refresh after 403/permission change event
```

---

## D52 — token refresh / 401 retry

**Disposition**：single silent refresh + retry once。  
**Severity**：High。  
**Implementation**：Pack D-G.

```text
1. 401 → attempt silent refresh once.
2. retry original request once.
3. if still 401 → clear session, redirect login.
4. concurrent 401 share one refresh promise.
5. never infinite retry.
```

---

## D53 — tenant scope 優先順序

**Disposition**：明訂 priority。  
**Severity**：High。  
**Implementation**：Pack D-G.

Priority：

```text
1. explicit route tenant param / subdomain, if authorized
2. session selected tenant
3. token default tenant
4. backend default denied if ambiguous
```

BFF must send：

```text
X-Tenant-Id
```

UI 不得自行偽造未授權 tenant scope。

---

## D54 — logout cache invalidate

**Disposition**：logout 清除 session-sensitive cache。  
**Severity**：Medium。  
**Implementation**：Pack D-G.

Invalidate：

```text
query cache
bff in-memory cache
v5ActionOverlay
SSE connection
permission cache
confirm token store
current user/session
```

保留：

```text
non-sensitive UI prefs：theme, locale if user opted
```

---

## D55 — locale user-pref vs tenant-pref

**Disposition**：user preference 優先。  
**Severity**：Medium。  
**Implementation**：Pack D-G.

Priority：

```text
user preference
tenant default
browser language
zh-TW default for current product build
```

---

## D56 — locale fallback chain

**Disposition**：補 fallback。  
**Severity**：Medium。  
**Implementation**：Pack D-G.

```text
resolvedLocale
→ language family
→ tenant.locale
→ zh-TW
→ en-US
```

Mapping：

```text
zh-Hant → zh-TW
zh → zh-TW
en → en-US
```

---

## D57 — UI 時區

**Disposition**：user TZ 優先。  
**Severity**：Medium。  
**Implementation**：Pack D-G.

Priority：

```text
user.tz
tenant.tz
browser tz
UTC
```

All audit timestamps store UTC ISO.

---

## D58 — numeric locale 是否綁 i18n locale

**Disposition**：數字格式綁 resolved i18n locale。  
**Severity**：Low。  
**Implementation**：Pack D-G.

Currency：

```text
currency code from entity / tenant baseCurrency
number formatting from resolvedLocale
```

---

## D59 — `/bff/me` 缺 featureFlags/env/capabilities/tenantId

**Disposition**：併入 D51，全部必填。  
**Severity**：High / Blocker。  
**Implementation**：Pack D-G.

Required：

```text
tenant.id
env
featureFlags
capabilities
roles
serverTime
sessionExpiresAt
```

---

# 10. D61 — QA / Fixture

## D61 — E2E scenario 命名與 fixture seed

**Disposition**：補命名規則。  
**Severity**：Low。  
**Implementation**：Pack D-H.

Scenario naming：

```text
e2e.<surface>.<flow>.<expected>
```

Examples：

```text
e2e.controlRoom.load.showsLoopSummary
e2e.execution.personaHealth.opensFinding
e2e.interventions.approve.triggersAudit
e2e.writeIntent.strategyCreate.appearsInList
```

Fixture IDs：

```text
stg_*
per_*
cp_*
rb_*
dp_*
job_*
al_*
inc_*
ap_*
loop_*
find_*
int_*
```

---

# 11. Implementation Guidance for Lovable

## 11.1 立即可執行

Lovable 可以立即做：

```text
D39–D50 UI token / a11y / format
D61–D63 QA/perf metadata
D13–D16 permission enum / i18n
D17–D25 API envelope spec docs
D26–D29 typed mock event docs
D51/D59 mock MeResponse
```

## 11.2 需與 BFF API Spec 一起做

以下應與 BFF API Spec / OpenAPI / AsyncAPI 同步：

```text
D17–D29
D51–D60
F01 create/edit write contracts
```

## 11.3 不應由前端自由實作

以下不可在無 spec addendum 下隨意做 domain behavior：

```text
D04 incident rollback saga
D30 handoff SLA legal behavior
D31 capital breach formula if backend已有風控模型
D35 two-man compliance rule
D36 confirm token / cooldown policy
```

可先用本 disposition v0-mock，但必須標明 provisional。

---

# 12. Suggested Pack D Files to Generate

請 Lovable 建立下列 spec files：

```text
.lovable/feedback/2026-05-06-D/Pack_D_Disposition.md
.lovable/feedback/2026-05-06-D/Pack_D_Disposition.csv
.lovable/spec/v4/pack-d/Pantheon_Pack_D_StateMachine_Contract.md
.lovable/spec/v4/pack-d/Pantheon_Pack_D_Permission_Contract.md
.lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md
.lovable/spec/v4/pack-d/Pantheon_Pack_D_SSE_Event_Contract.md
.lovable/spec/v4/pack-d/Pantheon_Pack_D_Session_Auth_Tenant_Contract.md
.lovable/spec/v4/pack-d/Pantheon_Pack_D_UI_Tokens_A11y_QA.md
```

---

# 13. Lovable Prompt

```md
Implement Pack D disposition as spec addendum only first.

Do not modify UI implementation yet unless explicitly requested.
Do not invent backend internals.
Use this disposition as canonical resolution for Audit D D01–D63.

Tasks:
1. Create Pack D disposition files under `.lovable/feedback/2026-05-06-D/`.
2. Create Pack D spec addendum files under `.lovable/spec/v4/pack-d/`.
3. Update `.lovable/audits/INDEX.md` to mark Audit D as RESOLVED by Pack D disposition once files are created.
4. Update `.lovable/spec/INDEX.md` normative order:
   - v5 for IA / loop view-model / Sentinel / HIQ
   - v4 + Pack D for normative state / permission / BFF / SSE / session / UI contract
5. Do not write `src/` code in this pass.
6. If any item conflicts with current v5 implementation, record it in `spec-conflict-2026-05-06-G.md` rather than patching code.
```

---

# 14. Final Status

| Audit | Status after this disposition |
|---|---|
| D01–D08b | RESOLVED by Pack D-A decisions |
| D09–D16 | RESOLVED by Pack D-B decisions |
| D17–D25 | RESOLVED by Pack D-C decisions |
| D26–D29 | RESOLVED by Pack D-D decisions |
| D30–D38, D60 | RESOLVED by Pack D-E decisions |
| D39–D50, D62, D63 | RESOLVED by Pack D-F decisions |
| D51–D59 | RESOLVED by Pack D-G decisions |
| D61 | RESOLVED by Pack D-H decision |

**Overall**：Audit D 63 條可標記為 `RESOLVED BY PACK D DISPOSITION`，但 implementation 必須分階段進行；涉及 backend 真實契約者需在 BFF API Spec / Backend Handoff 中再次確認。

