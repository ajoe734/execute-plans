# Pantheon Current Spec — Consolidated 2026-05-10

> **Scope**：把 v4 + Pack D（含 2026-05-10 backport）+ v5 升級層 + 2026-05-07 Final BFF Contract 摘要為單檔可讀總覽。
> **不取代** 各 normative 檔；衝突時以原 normative 檔為準。
> **Audit pair**：`.lovable/audits/fe-spec-status-2026-05-10.md`

---

## 1. Source-of-truth Tree

```
.lovable/spec/
├── current/                     ← 本快照（2026-05-10）
├── v5/                          ← upgrade layer (IA / Loop / Sentinel / HIQ)
│   ├── Pantheon_v5_INDEX.md
│   ├── Pantheon_v5_Closed_Loop_Supervisor_OS_SA_2026-05-06.md
│   └── Pantheon_v5_Closed_Loop_Supervisor_OS_SD_2026-05-06.md
├── v4/                          ← normative core
│   ├── CHANGELOG.md
│   ├── Pantheon_Frontend_Build_Spec_v4_INDEX.md
│   └── pack-d/
│       ├── Pantheon_Pack_D_BFF_API_Contract.md            ← D21 26-code (2026-05-10)
│       ├── Pantheon_Pack_D_DomainRules_Contract.md
│       ├── Pantheon_Pack_D_Permission_Contract.md         ← D-EvidenceKind (2026-05-10)
│       ├── Pantheon_Pack_D_SSE_Event_Contract.md          ← Approval/Ask + EvidenceKind (2026-05-10)
│       ├── Pantheon_Pack_D_Session_Auth_Tenant_Contract.md
│       ├── Pantheon_Pack_D_StateMachine_Contract.md
│       └── Pantheon_Pack_D_UI_Tokens_A11y_QA.md
├── v3/                          ← legacy shim (DEPRECATED)
└── v2/                          ← historical (DO NOT consult)

.lovable/feedback/2026-05-07-final/
├── Pantheon_BFF_Contract_Spec_2026-05-07_Final.md
├── Pantheon_BFF_OpenAPI_3_1.yaml                          ← ActionCommandStatus named (2026-05-10)
├── Pantheon_BFF_AsyncAPI_SSE.md                           ← §9.0 EvidenceKind (2026-05-10)
├── Pantheon_BFF_DTO_Catalog.md
└── Pantheon_BFF_Backend_Handoff.md
```

**Conflict order**：v5 IA > v4 + Pack D > 2026-05-07 Final BFF > v3 > v2.

---

## 2. Entity & State Machine（normative summary）

詳見 `Pantheon_Pack_D_StateMachine_Contract.md`。本節僅列關鍵不變式。

### 2.1 Strategy 三軸

```ts
lifecycleStatus  : "draft" | "ready" | "active" | "degraded" | "retired" | "archived"
reviewStatus     : "none" | "submitted" | "approved" | "changes_requested" | "rejected"
deploymentStatus : "none" | "paper" | "live" | "rolling_back" | "rolled_back"
```

**禁止**：把 `under_review` / `paused` 當作 lifecycle status。

### 2.2 Persona / CapitalPool / Skill / Memory / Deployment / Job / Incident

每 entity 一份白名單 transition table；missing transition → `ILLEGAL_TRANSITION`。

### 2.3 v5 Loop / Sentinel / Intervention 升級層

```ts
LoopRun.status         : "queued" | "running" | "completed" | "failed" | "cancelled"
LoopRun.loopType       : "research" | "execution" | "optimization"
SentinelFinding.status : "open" | "acknowledged" | "mitigating" | "resolved" | "dismissed"
Intervention.tier      : "advisory" | "guarded" | "blocking"
Intervention.decision  : "accepted" | "modified" | "declined"
```

---

## 3. BFF Contract（transport binding）

Source：`Pantheon_BFF_Contract_Spec_2026-05-07_Final.md` + `Pantheon_BFF_OpenAPI_3_1.yaml`。

### 3.1 ActionCommandStatus（named, 2026-05-10）

```yaml
ActionCommandStatus:
  enum: [accepted, queued, completed]
```

Success-only。Missing precondition（confirm token / approval / two-man）一律 non-2xx `BffErrorEnvelope`，不返 `requires_*` 假成功。

### 3.2 ErrorCode master（26, 2026-05-10）

```text
VALIDATION_FAILED  AUTH_REQUIRED  TOKEN_EXPIRED  REFRESH_FAILED
PERMISSION_DENIED  CAPABILITY_MISSING  TENANT_SCOPE_MISMATCH  FEATURE_DISABLED
STATE_CONFLICT  ILLEGAL_TRANSITION
CONFIRM_TOKEN_REQUIRED  CONFIRM_TOKEN_EXPIRED  CONFIRM_TOKEN_REUSED
CONFIRM_TOKEN_BINDING_MISMATCH  CONFIRM_TOKEN_REVOKED
TWO_MAN_REQUIRED  APPROVAL_REQUIRED  COOLDOWN_ACTIVE
CURSOR_EXPIRED  CURSOR_INVALID  RATE_LIMITED  IDEMPOTENCY_CONFLICT
BACKEND_UNAVAILABLE  SSE_REPLAY_UNAVAILABLE
RESOURCE_NOT_FOUND  UNKNOWN_ERROR
```

i18n key：`errors.<ErrorCode>`。FE artifact：`src/lib/v4/errorCodes.ts`（26/26 翻齊 en/zh）。

### 3.3 Cursor / Filter / Sort / Rate Limit

見 Pack D D17–D19、D25。Cursor TTL 15min；429 必含 `Retry-After`。

### 3.4 Headers

```
X-BFF-Api-Version: 2026-05-07          # client + server，mismatch 顯示 banner
Idempotency-Key:    <uuid>             # 所有非 GET
Last-Event-Id:      <sse cursor>       # SSE reconnect
```

---

## 4. SSE / AsyncAPI Contract

Source：`Pantheon_BFF_AsyncAPI_SSE.md`（含 2026-05-10 §9.0 EvidenceKind backport）+ Pack D D26-D29。

### 4.1 Envelope（required）

```ts
type SseEventEnvelope<T> = {
  schemaVersion: 1;
  id: string;
  channel: SseChannelKind;
  type: string;
  occurredAt: string;
  correlationId: string;            // REQUIRED（mock 端 ensureCorrelationId 補值）
  causationId?: string;
  payload: T;
};
```

### 4.2 Canonical channels

```
strategy   persona   capital   deployment   job   risk
approval   ask
loop       sentinel  intervention
signal     insight   journal   postmortem
channel    audit     system
```

### 4.3 ApprovalEvent / AskEvent

```ts
type ApprovalEvent =
  | { type: "approval.created" | "approval.stage.changed"
    | "approval.decided" | "approval.sla.escalated"; ... };

type AskEvent =
  | { type: "ask.session.started" | "ask.message.delta" | "ask.tool.called"
    | "ask.message.completed" | "ask.session.completed" | "ask.session.failed"; ... };
```

詳細 payload 見 AsyncAPI §6 / §8.4 與 Pack D D26。

### 4.4 EvidenceKind canonical 19 + legacy alias 3

詳見 §5.4 Capability map。

### 4.5 Reconnect / replay

`replayWindowSec=86400`、`replayMaxEvents=10000`、過期 → `resync_required` event；resync endpoint 見 Pack D D29。

---

## 5. Permission / Capability Contract

Source：`Pantheon_Pack_D_Permission_Contract.md`。

### 5.1 Roles（12-role canonical, 2026-05-08）

```
admin  research_lead  strategy_manager  risk_officer  capital_manager
system_operator  reviewer  capability_admin  governance_lead
sentinel_operator  intervention_owner  observer
```

### 5.2 Capabilities

`capabilities` 為 source of truth；`roles` 僅 UI grouping。Wildcard `namespace.*` / `*` 支援。Lowercase dot.case。

### 5.3 ActionDescriptor required fields

```
entity, action, capability, allowedRoles,
requiresApproval, requiresConfirmToken, requiresTwoMan,
riskLevel, ttlSec?, cooldownSec?, idempotencyKeyRequired?,
disabledReasonCode?
```

### 5.4 EvidenceKind → Capability map（2026-05-10 backport）

| Kind | Capability | | Kind | Capability |
|---|---|---|---|---|
| alert | risk.alert.read | | artifact | artifact.read |
| incident | risk.incident.read | | signal | agora.signal.read |
| job | job.read | | journal | agora.journal.read |
| audit | audit.read | | postmortem | postmortem.read |
| metric | metric.read | | loop_run | loop.read |
| strategy | strategy.view | | sentinel_finding | sentinel.read |
| persona | persona.view | | intervention | intervention.read |
| deployment | deployment.read | | ask_session | agora.ask |
| runtime | runtime.read | | (legacy) snapshot | artifact.read |
| policy | policy.read | | (legacy) rebalance | rebalance.read |
| approval | approval.read | | (legacy) experiment | research.read |

缺 capability 時返 `RedactedEvidenceRef`。

### 5.5 DisabledReasonCode 15-enum

見 Pack D D13；i18n key `actions.disabled.<code>`。

---

## 6. v5 Upgrade Layer（IA / Loop / Sentinel / HIQ）

Source：`Pantheon_v5_Closed_Loop_Supervisor_OS_SA_2026-05-06.md` + SD。

### 6.1 IA changes（vs v4）

新增 management surfaces：
- `/management/v5/control-room`
- `/management/v5/research-loop` `/execution-loop` `/optimization-loop`
- `/management/v5/sentinel`
- `/management/v5/interventions`
- `/management/v5/persona-health`
- LoopRunDrawer（cross-loop）

### 6.2 Closed-loop OS（Pack E E0–E6 LANDED）

Loop = Research → Execution → Optimization；每個 LoopRun 有 stage timeline + evidence pack；Sentinel finding → Intervention → decided。

### 6.3 Persona Health

PersonaHealthMatrix sparkline + remediation pipeline；driven by `bff/v5/execution/persona-health`。

---

## 7. Resolved spec gaps（歷史摘要）

| Pack | 條目 | 狀態 |
|---|---:|---|
| A 2026-05-05-A | 92 | RESOLVED |
| B 2026-05-05-B | 23 | RESOLVED |
| C 2026-05-05-C | 78 | RESOLVED |
| D 2026-05-06-D | 32 | RESOLVED |
| E 2026-05-06-E | 28 | RESOLVED |
| F 2026-05-06-F | 24 | RESOLVED |
| G spec-conflict | 8 | RESOLVED (G01/G05/G06/G07/G09/G12/G13/G14) |
| Planner 2026-05-07 Response | 34 wire-ups | LANDED |
| Planner Stage 2 Audit 2026-05-08 | 4 wire-ups | LANDED |
| FE_Blueprint_Gap addendum 2026-05-09 | A/B/C/D | A=BE-pending；B=本次 backport LANDED；C=LANDED；D=LANDED |
| H 版 backlog (H1/H2/H3) | 3 | FE CLOSED |

合計 ≥ 233 條 spec gap 全 RESOLVED。

---

## 8. Remaining work（after 2026-05-10）

### A. Backend implementation pending（FE no-op）

見 `.lovable/audits/bff-live-probe-2026-05-09.md`。Backend lupin team 須實作 P0 endpoints（session bootstrap / openapi.json / canonical action / decide / entity registries）。

### B. Spec backport（**已由本次 2026-05-10 收掉**）

- [x] B1 OpenAPI ActionCommandStatus named
- [x] B2 Pack D D21 26 ErrorCode
- [x] B3.1 SSE correlationId required
- [x] B3.2 approval / ask first-class channel
- [x] B3.3 ApprovalEvent 4 subtypes
- [x] B3.4 AskEvent 6 subtypes
- [x] B3.5 EvidenceKind 19 + legacy 3
- [x] B3.6 EvidenceKind capability map

### C. FE tail（已 LANDED 2026-05-09）

C1+C2 deprecation lint、C3 v5 axe smoke、C4 G05 tooltip、C5 walkthrough 全完成。

### D. Optional product enhancement

D1–D4 LANDED；剩餘可深化：cross-region drill-down、saved view、stage detail evidence drawer 拓展。

---

## 9. 維護規則

- 任何新 backport：先改 normative spec，再更新本 snapshot 的 §1 + 對應章節 + §7 表。
- 不在本檔做 normative 決策；只做摘要與索引。
- 更新後同步 `mem://reference/current-spec` 條目。
