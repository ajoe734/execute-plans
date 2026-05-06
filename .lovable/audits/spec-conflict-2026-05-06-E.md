# Spec Conflict Audit — 2026-05-06-E (RESOLVED 2026-05-06)

**範圍**：v5 SA + SD（Pantheon Closed-Loop Supervisor OS）vs. 既有 v4 normative / Pack D OPEN gaps / SD 內部一致性。
**結論**：19 條 RESOLVED — 由規劃團隊 2026-05-06 disposition 全數處置（28/28）。E0 已落地於 `src/lib/v5/` + `src/lib/bff/v5.ts`。

> Disposition 來源：`.lovable/feedback/2026-05-06-E/Pack_E_Disposition.csv` / `.lovable/feedback/2026-05-06-E/Pack_E_Planner_Response_2026-05-06.md`

## 嚴重度說明

- **Blocker**：不解則 E0 無法產出可信 type / mock。
- **High**：影響 E1–E6 任一 phase 的 acceptance。
- **Medium**：影響後期 polish / IA stabilization。

---

## A. v5 ↔ v4 normative 衝突

### E01 [Blocker] v5 enum 是否覆蓋 v4 status enum — **RESOLVED (Q2)**
- **處置**：v5 enum 為 view-model 專用；domain state 一律對應 v4 normative type，不取代。
- **落地**：`src/lib/v5/enums.ts` 註明 view-model only。

### E02 [Blocker] v5 BFF facade 路徑未定 — **RESOLVED (Q3)**
- **處置**：`src/lib/bff/v5.ts`，掛 `bff.v5.*`；`src/lib/v5/` 只放 types/selectors/adapters/health/remediation/events。
- **落地**：`src/lib/bff/v5.ts` + `src/lib/bff/client.ts` 已掛 `bff.v5`。

---

## B. v5 ↔ Pack D OPEN blockers

### E03 [Blocker] LoopRun stage timeout — **RESOLVED (Q12, transitional)**
- **處置**：`timeoutPolicy=v0-mock`；UI-only blocked/failed，`source=mockTimeoutPolicy`。Pack D D05 settles 後替換。
- **落地**：`src/lib/v5/timeoutPolicy.ts`。

### E04 [Blocker] RemediationAction role gate — **RESOLVED (Q13/Q20, transitional)**
- **處置**：`requiredRoles` 用既有 role 字串 + `usePermissions()`；保留 `requiredCapabilities?` 預留欄位。
- **落地**：`RemediationAction.requiredCapabilities?` 已預留。

### E05 [Blocker] ControlRoomSummary 需 MeDto — **RESOLVED (Q14, transitional)**
- **處置**：不依賴 `/bff/me`；用最小 `V5SessionContext`（tenantId="demo", env/locale 取自 platform store）。
- **落地**：`bff.v5.session.get()` 與 `controlRoom.get()`。

### E06 [Blocker] v5 typed event vs SSE schema — **RESOLVED (Q15/Q19, transitional)**
- **處置**：envelope `{id, schemaVersion:1, channel, type, occurredAt, correlationId, payload}`；channel `v5.{loop|sentinel|intervention|execution|optimization}.*`；transport 復用 `src/lib/bff/realtime.ts`。
- **落地**：`src/lib/v5/events.ts`。

### E07 [High] LoopRuns totalCount — **RESOLVED (Q16)**
- **處置**：`V5ListResponse<T> = {items, totalCount, totalCountExact:true}`；adapter 隔離。
- **落地**：`src/lib/v5/list.ts`。

---

## C. v5 ↔ 既有 IA / Command Center

### E08 [High] Command Center 過渡期 nav — **RESOLVED (Q17/Q23)**
- **處置**：E1 將 Command Center 掛 Legacy/Advanced；E2 acceptance 後 `/management` index 預設 control-room；E7 處置 redirect 或藏 legacy。
- **落地時點**：E1。

### E09 [Medium] Personas 雙入口 — **RESOLVED (Q18/Q26)**
- **處置**：E1 用 `dedupeKey="personas"` 避免 sidebar 雙重 active；E7 收斂。
- **落地時點**：E1。

---

## D. SD 內部不一致

### E10 [High] PersonaExecutionHealth.mode — **RESOLVED (Q4)**
- **Canonical**：`live | paper | shadow | suspended`（移除 `paused`）。
- **Mapping**：active/deployed→live, draft/sandbox/review→shadow, retired/paused→suspended。
- **落地**：`src/lib/v5/adapters/persona.ts` `mapStateToMode()`。

### E11 [High] SentinelFinding.status — **RESOLVED (Q5)**
- **Canonical**：SD 版 6 值。SA accepted→acknowledged, executing→mitigating；superseded 不在 E0；以 `supersededByFindingId` 表達。
- **落地**：`src/lib/v5/types.ts` `SentinelFinding` + `enums.ts`。

### E12 [Medium] RemediationAction.mode vs automationLevel — **RESOLVED (Q6)**
- **Canonical**：`mode: advisory | guarded_automation | emergency_override`；`automationLevel` deprecated。
- **落地**：`src/lib/v5/types.ts` `RemediationAction.mode`。

### E13 [Medium] InterventionItem 欄位 — **RESOLVED (Q7)**
- **Canonical**：SD 版 + 復原 `evidenceRefs?`；`recommendation` → `recommendedDecision`；`modifyAllowed` derived。
- **落地**：`src/lib/v5/types.ts` `InterventionItem` + `adapters/intervention.ts deriveModifyAllowed()`。

---

## E. 缺細節 / 不清楚

### E14 [High] Health score 公式 — **RESOLVED (Q8/Q25)**
- **權重**：Persona perf 25 / risk 25 / exec 20 / decision 15 / policy 10 / sentinelPenalty 5；Strategy perf 30 / risk 25 / exec 20 / lifecycle 10 / sentinelIncidentPenalty 15。
- **閾值**：healthy ≥80 / watch 65–79 / degraded 45–64 / critical <45；critical override 強制 critical。
- **落地**：`src/lib/v5/health.ts`，標 `formulaVersion="v0-mock"`。

### E15 [High] Sentinel mock 派生 — **RESOLVED (Q9)**
- **Severity map**：critical 0.88 / high 0.76 / medium 0.62 / low 0.45；每 corroborating evidence +0.04，cap 0.95。
- **Action map**：drawdown/slippage→reduce_allocation+switch_persona_to_shadow+start_evolution_run；runtime/MCP→route_to_backup_runtime+open_incident；capital→freeze_rebalance+request_human_approval；critical incident→pause_persona_routing+emergency_rollback。
- **落地**：`src/lib/v5/sentinel.ts`。

### E16 [High] Emergency action 對 seed 副作用 — **RESOLVED (Q10/Q24)**
- **處置**：v5 mock action 只動 `v5ActionOverlay`（in-memory, 30 min TTL），不寫回 seed；emergency_override 必走 HighRiskConfirm。
- **落地**：`src/lib/v5/overlay.ts` + `bff.v5.remediation.execute()`。

### E17 [Medium] Realtime bus 復用 — **RESOLVED (Q19)**
- **處置**：復用 `src/lib/bff/realtime.ts`；topic prefix `v5.*`。
- **落地**：`src/lib/v5/events.ts`。

### E18 [Medium] Permission 模型 — **RESOLVED (Q20)**
- **處置**：沿用 `usePermissions()`；emergency 走 HighRiskConfirm；`requiredCapabilities?` 為 D12 預留。
- **落地時點**：E5/E6。

### E19 [Medium] /management/alpha-factory route — **RESOLVED (Q21, no-op)**
- **處置**：route 已存在於 main，不需新建/rename。

---

## 對應 phase gating（更新）

| Phase | 狀態 |
|---|---|
| **E0 types + mock** | ✅ DONE — `src/lib/v5/*` + `src/lib/bff/v5.ts` + 18 tests passing |
| E1 routing + nav | unblocked — Q17/Q18/Q21 已答 |
| E3 Execution Loop | unblocked — Q12 v0-mock timeout / Q10 overlay |
| E5 Sentinel | unblocked — Q9 mapping / Q15 envelope |
| E6 HIQ | unblocked — Q11 coexist / Q7 InterventionItem |
| E7 IA stabilization | E2/E5/E6 完成後 |

## 統計

- Blocker：6（全部 RESOLVED）
- High：7（全部 RESOLVED，含 transitional）
- Medium：6（全部 RESOLVED）
- 合計：19 / 19 RESOLVED
