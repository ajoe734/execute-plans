# Pantheon Pack D-A — State Machine / Lifecycle / Invariant Contract

**版本**：Pack-D-2026-05-06 / Sub-pack D-A
**對應 Audit D**：D01–D08b（9 條）
**疊加層級**：v4 normative + Pack D
**狀態**：Canonical（規劃團隊 disposition 已裁示）
**重要**：本契約**不取代 v4 normative status enum**；v5 view-model enum 不得覆蓋本層。所有 async transition 須以 `AsyncTransitionDescriptor` 為唯一描述方式。

---

## D01 — Strategy 三軸狀態白名單

Strategy 任一時刻必須持有三軸：

```ts
type StrategyTriple = {
  lifecycleStatus: StrategyLifecycleStatus;
  reviewStatus: StrategyReviewStatus;       // v4: 4 值
  deploymentStatus: StrategyDeploymentStatus; // v4: 5 值
};
```

Allowed matrix（canonical）：

| lifecycleStatus | allowed reviewStatus | allowed deploymentStatus | 說明 |
|---|---|---|---|
| discovered | none | none | 初始候選 |
| scaffolded | none, changes_requested | none | 已有 spec |
| replicated | none, pending, changes_requested | none | 已有 evidence |
| approved | approved | none | 已核准未部署 |
| paper | approved | paper_running, stopped, rollback_required | paper exec |
| live | approved | live_running, rollback_required | live 必 reviewStatus=approved |
| degraded | approved | live_running, stopped, rollback_required | live/paper 異常 |
| retired | none, approved | none, stopped | 不可 running |

**規則**：
1. live / paper / degraded ⇒ reviewStatus = approved。
2. rejected / changes_requested 不得進入 paper / live。
3. retired 不得有 running deployment。
4. rollback_required ≠ retired，是 deployment recovery 狀態。
5. legacy `state` 欄位僅可由 adapter 映射，不得作為新 UI 判斷依據。

---

## D02 — Persona retired 為終態

```text
Persona retired → archive only。
不得 retired → active。
```

恢復需 `fork_persona_from_retired`：

```ts
type PersonaForkRequest = {
  sourcePersonaId: string;
  newName: string;
  reasonCode: "retired_replacement" | "incident_recovery" | "research_variant";
  memo: string;  // min 40 chars
};
```

Audit：reasonCode required；memo ≥40；lineage `sourcePersonaId` required。

---

## D03 — CapitalPool frozen 為 state

```ts
type CapitalPoolStatus =
  | "draft" | "active" | "frozen"
  | "rebalancing" | "restricted" | "retired";

type CapitalPoolFreeze = {
  id: string;
  poolId: string;
  reasonCode: "risk_breach" | "incident" | "manual_override"
            | "policy_violation" | "liquidity_event";
  memo: string;
  frozenBy: string;
  frozenAt: string;     // ISO UTC
  expiresAt?: string;
  active: boolean;
};
```

Transitions：

```text
draft → active
active ↔ frozen
active ↔ rebalancing
active ↔ restricted
{active, restricted, frozen} → retired
```

---

## D04 — Incident ↔ Deployment rollback Saga

```text
1. Incident opened or escalated。
2. Sentinel/human → RemediationAction(type=rollback_deployment)。
3. BFF 建 rollback command（idempotencyKey + correlationId）。
4. Deployment status → rollback_required / rolling_back。
5. Execution service 執行 rollback。
6. Success：
   - Deployment → rolled_back
   - Incident → mitigated / postmortem_required
   - Audit: deployment.rollback.success + incident.mitigation.linked
7. Failure：
   - Deployment → rollback_required
   - Incident → mitigation_in_progress
   - failureReasonCode required
```

**idempotencyKey**：`rollback:{incidentId}:{deploymentId}:{targetVersion}`

---

## D05 — AsyncTransitionDescriptor（Blocker）

```ts
type FailureReasonCode =
  | "TIMEOUT" | "VALIDATION_FAILED" | "PERMISSION_DENIED"
  | "BACKEND_UNAVAILABLE" | "EXECUTION_FAILED" | "ROLLBACK_FAILED"
  | "SLA_BREACH" | "IDEMPOTENCY_CONFLICT" | "UNKNOWN";

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

**v0 default 值**：

| Transition | timeoutMs | failureState | retryable |
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

## D06 — EvolutionRun pause quota

```ts
type EvolutionQuotaPolicy = {
  quotaClock: "compute_only" | "wall_clock";
  pauseConsumesComputeQuota: boolean; // default false
  pauseConsumesSla: boolean;          // default true
};
```

---

## D07 — Triple-Axis Invariant validateOn

```ts
type InvariantValidationTrigger =
  | "entity_create" | "entity_update" | "review_decision"
  | "deployment_start" | "deployment_complete" | "rollback"
  | "retire" | "realtime_ingest" | "legacy_adapter";
```

規則：
1. 新資料違反 invariant → reject。
2. legacy adapter 可 map 舊值，加 `migrationWarning`。
3. UI **不得**自行 auto-correct domain state。

---

## D08 — Job cancel & retry

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
  maxAttempts: number;  // default 3
};
```

cancelled = terminal；retry = 新 jobId + audit chain。

---

## D08b — Quarantined memory 預設排除 RAG

```ts
type MemoryRetrievalPolicy = {
  quarantinedVisibleToRag: false;
  allowedOverrideRoles: ["admin", "risk_officer", "research_lead"];
  overrideRequiresAudit: true;
};
```

---

## 落地階段建議

- Batch II（無需 BFF）：D02 Persona fork action UI、D08b RAG 過濾旗標
- Batch III（需 BFF）：D01 三軸 invariant 校驗、D03 FreezeRecord、D04 Saga
- Batch IV（provisional v0-mock）：D05 AsyncTransitionDescriptor + 12 transition default
