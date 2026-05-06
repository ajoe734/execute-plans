# Spec Gap Audit D — Critical Blockers Brief

- 來源：`spec-gap-2026-05-06-D.md`
- 目的：抽出 5 條最阻塞 Pack D 實作的 High 條目，給規劃團隊一頁式 brief。
- 命名：`spec-gap-2026-05-06-D-blockers`，與主檔同日序。

---

## B1. D05 — 10+ 狀態機缺 timeoutMs / failureState

**為什麼阻塞**：所有 async transition（Job、Deployment、Handoff、EvolutionRun、Incident、CapitalPool、Skill scan、Memory review、Artifact promote、RoutePolicy activate、Alert ack）UI 都需要 SLA 倒數與失敗態歸位邏輯。沒這兩欄，實作端只能讓 transition 永遠 pending，無法寫測試也無法驗收。

**最小可接受規範**：每個 async transition 必補三欄。

```ts
type AsyncTransition = {
  from: State;
  to: State;
  trigger: TriggerId;
  timeoutMs: number;            // 必填
  failureState: State;          // 必填
  failureReasonCode: ReasonCode;// 必填，受控 enum
};
```

**草案數值**（建議起點，可再調）：
- Deployment execute：timeoutMs 600_000，failureState `failed`
- Skill security_scan：timeoutMs 180_000，failureState `scan_failed`
- Memory approve：timeoutMs 86_400_000，failureState `auto_rejected`
- Handoff respond：timeoutMs 由 SLA tier 決定（已在 v4 §Handoff）

---

## B2. D12 — Role × Capability bundle 對應未明確

**為什麼阻塞**：`PERMISSION_MATRIX` 每列填了 `capability`，但沒有 role → capabilities 的對應表。當外部 IdP 回傳的是 capability list（非 role），UI 無法反推 role-based 顯示（例如 sidebar 群組可見性）。同時雙來源（`/bff/me.roles` 與 `/bff/me.capabilities`）若不一致，UI 行為未定。

**最小可接受規範**：

```ts
const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  admin: ["*"],
  research_lead: ["memory.*", "insight.*", "experiment.create", ...],
  // ...
};
```

並明訂：
- capability 命名 `namespace.verb`，全 lowercase。
- 衝突時 capabilities 為 source of truth，roles 僅作 UI 群組 hint。
- `*` wildcard 規則。

---

## B3. D22 — List endpoint 是否回 totalCount 未定

**為什麼阻塞**：cursor pagination 預設無 totalCount，但 UI 多處要顯示「X of Y」、「共 234 筆」、進度條。沒有規範會出現各 list 自己決定要不要回，前端只能寫雙路徑 fallback。

**最小可接受規範**：

```ts
type PaginatedResponse<T> = {
  items: T[];
  cursor: { next?: string; prev?: string };
  estimatedTotal?: number;     // 可能為近似值
  totalCountExact?: boolean;   // true 時 estimatedTotal 為精確值
};
```

並明訂：哪些 list endpoint 必須回 exact、哪些可回 estimated、哪些可不回（例如無限 feed）。

---

## B4. D26 — SSE channel 事件 payload schema 未列

**為什麼阻塞**：規範列了 channel 與「會推什麼類型事件」，但沒給每個事件的 payload schema。client store reducer 只能型別 `any`，無法寫 type-safe handler，也無法產生 OpenAPI / AsyncAPI 文件給後端對焊。

**最小可接受規範**：每個 channel 給 discriminated union。

```ts
// channel: "strategy"
type StrategyEvent =
  | { type: "strategy.review.updated"; strategyId: string; reviewStatus: StrategyReviewStatus; at: string }
  | { type: "strategy.deployment.changed"; strategyId: string; deploymentStatus: StrategyDeploymentStatus; at: string }
  | { type: "strategy.lifecycle.changed"; strategyId: string; lifecycleStatus: StrategyLifecycleStatus; at: string };
```

每個 channel 在規範附 schema 區塊；版本化（`schemaVersion`）以便升級。

---

## B5. D59（→ D51）— `/bff/me` session DTO 欄位未列

**為什麼阻塞**：UI 啟動就需要 currentUser、roles、capabilities、tenantId、featureFlags、env、locale、tz、serverTime。沒有統一 DTO，實作端只能拼湊多個 endpoint 或硬塞 mock。Tenant scope、env switcher、permission lookup、cooldown 倒數全部依賴此 DTO。

**最小可接受規範**：

```ts
type MeResponse = {
  user: { id: string; displayName: string; email: string; avatarUrl?: string };
  tenant: { id: string; name: string; tz: string; locale: string };
  roles: Role[];
  capabilities: Capability[];
  env: "dev" | "staging" | "prod";
  featureFlags: Record<string, boolean>;
  serverTime: string;          // ISO，作為 cooldown ground truth
  sessionExpiresAt: string;
};
```

並明訂 cache TTL（建議 30s in-memory），refresh 觸發點，401 後 retry 策略（單次 silent refresh，失敗導向 login）。

---

## 建議排序

規劃團隊若資源有限，建議優先序：D59/D51 → D26 → D05 → D12 → D22。
理由：session DTO 是所有頁面的入口；SSE schema 與狀態機 timeout 直接影響型別與測試可寫性；permission bundle 與 totalCount 可稍後但不可遺漏。
