# Pantheon Pack D-E — Domain Rules Contract

**版本**：Pack-D-2026-05-06 / Sub-pack D-E
**對應 Audit D**：D30–D38, D60（10 條）
**狀態**：Canonical
**重要**：D30 / D31 / D35 / D36 屬 §11.3「不應由前端自由實作」；前端可先 v0-mock，但必須標 provisional 並待 BFF spec / 風控確認。

---

## D30 — Handoff Reopen SLA

```text
slaResetOnReopen = false
```

```ts
type SlaSegment = {
  openedAt: string;
  closedAt?: string;
  reasonCode: string;
  actor: string;
};
```

若需重置 SLA：`requiresApproval = true` + audit reason。

---

## D31 — CapitalPool Breach Formula

```ts
utilizationPct       = utilized / allocated
riskBudgetUsagePct   = abs(currentDrawdownPct) / riskBudgetPct
concentrationPct     = max(positionExposureUsd) / allocated
```

**Breach 門檻**：
```text
utilizationPct      > 0.90 → high
utilizationPct      > 0.98 → critical
riskBudgetUsagePct  > 1.00 → high
riskBudgetUsagePct  > 1.25 → critical
concentrationPct    > policy.maxConcentrationPct → high
```

**Window**：
```text
utilization        : current
drawdown/riskBudget: rolling 30d
latency/slippage   : rolling 24h
```

---

## D32 — Metric Registry

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

## D33 — Quorum Extension

```ts
type QuorumExtensionPolicy = {
  maxExtensions: 1;
  extensionHours: 24;
  escalateTo: "committee" | "risk_officer" | "admin";
};
```

第二次未達 → escalate。

---

## D34 — Missing Metric Policy

```ts
type MissingMetricPolicy =
  | { mode: "fail_run" }
  | { mode: "penalty"; penaltyScore: number }
  | { mode: "impute"; value: number };
```

Default：required → `fail_run`；optional → `penalty(-0.1)`。

---

## D35 — Two-Man Distinct

1. requester 不可作為 approver。
2. two-man 必 two distinct userId。
3. live deployment / capital apply / emergency override：需 `risk_officer` + non-risk executor / capital role。

---

## D36 — Confirm Token vs Cooldown

1. cooldown active 時，不可 issue confirm token。
2. token issued 後若 action 進入 cooldown，redeem 失敗 → `COOLDOWN_ACTIVE`。
3. confirm token TTL 不延長 cooldown。

---

## D37 — Audit Reason Length

```text
high-risk memo min length = 40
max length = 2000
UI display 240 chars 後折疊
server reject > 2000（不 silent truncate）
```

---

## D38 — Skill Rollback / Deprecate 互斥

1. `deprecate_in_progress` → rollback disabled。
2. `rollback_in_progress` → deprecate disabled。
3. 若 active skill 被 incident block，rollback 優先。

---

## D60 — Audit / Realtime correlationId Chain

```ts
type CorrelationFields = {
  correlationId: string;
  causationId?: string;
  parentCorrelationId?: string;
  traceId?: string;
};
```

1. user click 建 `correlationId`。
2. BFF commands / audit events / SSE events reuse 同 correlationId。
3. child events `causationId = triggering event id`。
4. loop run / Sentinel finding / intervention 必曝光 correlationId。

---

## 落地階段建議

- Batch II（可獨立）：D32 metric registry / D37 audit reason length validation
- Batch IV（provisional v0-mock）：D31 breach formula / D33 quorum / D34 missing metric / D60 correlationId chain（client 端先 generate uuid）
- §11.3 列管：D30 / D35 / D36 須等 BFF / 風控 spec
