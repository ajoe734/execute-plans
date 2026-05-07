# Pantheon Pack D-B — Permission / Capability / ActionDescriptor Contract

**版本**：Pack-D-2026-05-06 / Sub-pack D-B
**對應 Audit D**：D09–D16（8 條）
**狀態**：Canonical
**重要**：`capabilities` 為 source of truth；`roles` 僅作 UI grouping / default bundle hint。

---

## D09 — Strategy Action Catalog

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

每 action 必須帶：`entity, action, capability, allowedRoles, requiresApproval, requiresConfirmToken, requiresTwoMan, riskLevel, disabledReasonCode?`。

---

## D10 — Persona Action Catalog

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

## D11 — Channel / Watchlist / Notebook Catalog

**Channel**：
```text
channel.view / channel.create / channel.edit / channel.test_send
channel.enable / channel.disable / channel.subscribe / channel.archive
```

**Watchlist**：
```text
watchlist.view / watchlist.create / watchlist.edit
watchlist.add_item / watchlist.remove_item
watchlist.share / watchlist.archive / watchlist.convert_signal
```

**Notebook**：
```text
notebook.view / notebook.create_note / notebook.edit_note
notebook.convert_to_insight / notebook.create_research_task
notebook.archive / notebook.export
```

---

## D12 — Role × Capability Bundle（Blocker）

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

**規則**：
1. `/bff/me.capabilities` 為最終權限來源。
2. `/bff/me.roles` 僅作 UI group / default bundle fallback。
3. wildcard 支援 `namespace.*`。
4. capability lowercase dot.case。

---

## D13 — DisabledReasonCode Enum

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

i18n key：`actions.disabled.<reasonCode>`。

---

## D14 — requiresEnv 文案

```text
en-US: actions.disabled.WRONG_ENVIRONMENT =
  "This action requires {{requiredEnv}} environment. Current environment: {{currentEnv}}."
zh-TW: 此操作需要 {{requiredEnv}} 環境。目前環境：{{currentEnv}}。
```

---

## D15 — Cooldown Ground Truth

1. `/bff/me.serverTime` 初始化 clock offset。
2. ActionDescriptor 可回 `cooldownEndsAt`（server ISO）。
3. UI 只用 `serverTime + offset` 計算倒數。
4. **client local clock 不得作 cooldown 判定依據**。

---

## D16 — Capability namespace

```text
✅ strategy.promote_live
❌ Strategy.PromoteLive
```

lowercase dot.case；大小寫敏感。

---

## 落地階段建議

- Batch II：D13 enum 落 `src/lib/v4/`；D14 i18n key；D16 lint rule
- Batch III：D09–D11 ActionDescriptor 表整併；D12 ROLE_CAPABILITIES bundle 落程式碼
- Batch IV：D15 serverTime offset hook（可先 mock `/bff/me.serverTime`）
