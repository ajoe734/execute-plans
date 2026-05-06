# Spec Conflict Audit — 2026-05-06-E

**範圍**：v5 SA + SD（Pantheon Closed-Loop Supervisor OS）vs. 既有 v4 normative / Pack D OPEN gaps / SD 內部一致性。
**結論**：19 條 OPEN，須由規劃團隊回應後始能進入 Pack E 落地（E0 types + mock）。

## 嚴重度說明

- **Blocker**：不解則 E0 無法產出可信 type / mock。
- **High**：影響 E1–E6 任一 phase 的 acceptance。
- **Medium**：影響後期 polish / IA stabilization。

---

## A. v5 ↔ v4 normative 衝突

### E01 [Blocker] v5 enum 是否覆蓋 v4 status enum
- **衝突**：SD §7.1 自定 `LoopStatus` / `HealthStatus` / `InterventionSeverity` / `AutonomyMode` / `RemediationMode`；v4 已有 `StrategyReviewStatus`(4) / `StrategyDeploymentStatus`(5) / `ActionDescriptor`。
- **影響**：若 v5 type 與 v4 同名概念雙來源，將出現 PersonaCard 與 StrategyDetail 顯示不一致。
- **建議**：v5 type re-export v4 enum，或在 SD 明訂「v5 enum 為 view-model 專用，不對外暴露為 BFF DTO 欄位」。
- **對應**：SD §7.1 / v4 `src/lib/v4/types.ts`

### E02 [Blocker] v5 BFF facade 路徑未定
- **衝突**：SD §3.2 / §27 都列為 Open Decision；現行慣例是 `src/lib/bff/*`。
- **建議**：採 `src/lib/bff/v5.ts` 並在 `src/lib/bff/client.ts` 掛 `bff.v5 = …`，不在 `src/lib/v5/` 自建 client。
- **對應**：SD §27 row 5

---

## B. v5 ↔ Pack D OPEN blockers

### E03 [Blocker] LoopRun.nextAutomaticAction / stage timeout 缺基礎
- **衝突**：SD §7.2/§7.3 假設 `stage.timeoutMs`、`nextAction`，但 Pack D **D05** 狀態機 timeout/failureState 未定。
- **建議**：等 Pack D D05 回應後，v5 stage 共用同一套 timeout enum。

### E04 [Blocker] RemediationAction.requiresHumanApproval 對應 role gate 未定
- **衝突**：SD §7.8；Pack D **D12** Role × Capability bundle 未定。
- **建議**：等 D12，v5 `requiredRoles` 直接引用 capability id。

### E05 [Blocker] ControlRoomSummary 需 currentUser / featureFlags
- **衝突**：SD §7.11 + §12 假設可取 currentUser 與 tenant；Pack D **D59 / D51** `/bff/me` DTO 未定。
- **建議**：等 D59，`bff.v5.controlRoom.get()` 回傳結構引用 `MeDto`。

### E06 [Blocker] v5 typed event payload 未對齊 SSE channel
- **衝突**：SD §9 列 13+ 種 `loop.run.*` / `sentinel.finding.*` / `intervention.*` event；Pack D **D26** SSE channel payload schema 未列。
- **建議**：等 D26，v5 event 共用 envelope；否則 mock realtime 將與後續真實 SSE 不相容。

### E07 [High] LoopRuns / Findings 列表 totalCount 未定
- **衝突**：SD §13 列表需 pagination；Pack D **D22** totalCount 行為未定。
- **建議**：等 D22；mock 先 deterministic count。

---

## C. v5 ↔ 既有 IA / Command Center

### E08 [High] Control Room 與 Command Center 過渡期 nav 失蹤
- **衝突**：SD §27 第一條決議「coexist first」，但 §6 nav 已把 Command Center 從一級 group 移除。
- **建議**：Phase E1 將 Command Center 暫時掛 Legacy group，避免「route 在但無入口」。

### E09 [Medium] Personas 雙入口（Execution Loop + Multi-Persona System）
- **衝突**：SD §6 / §6.2 自承重複，E1 接受、E7 才整理。
- **建議**：E1 nav 加 deduplication tag，避免 sidebar active state 雙重高亮。

---

## D. SD 內部不一致

### E10 [High] PersonaExecutionHealth.mode enum 內部矛盾
- **衝突**：§7.4 列 `live | paper | shadow | paused`；§15.6 又用 `health.mode = suspended`；既有 seed 用 `active | paper | retired`。
- **建議**：SD canonical 為 `live | paper | shadow | suspended`；§7.4 加 `suspended`、§15.6 改 `shadow`/`suspended` 對應；seed adapter 將 `active→live`、`retired→suspended`。

### E11 [High] SentinelFinding.status 與 SA 不一致
- **衝突**：SA = `open | accepted | dismissed | executing | resolved | superseded`；SD §7.9 = `open | acknowledged | action_pending | mitigating | resolved | dismissed`。
- **建議**：以 SD 為 canonical（更貼近 UI 狀態），但需 SA addendum 補註並提供 SA→SD 對照表。

### E12 [Medium] RemediationAction.mode vs SA.automationLevel 欄位名不一致
- **衝突**：SD `mode: RemediationMode` vs SA `automationLevel`。
- **建議**：採 SD `mode`，SA 加 alias 註記。

### E13 [Medium] InterventionItem 欄位增刪未說明
- **衝突**：SD §7.10 移除 SA 的 `modifyAllowed` / `evidenceRefs` / `recommendation`，新增 `requiredRoles` / `linkedApprovalId/FindingId/IncidentId`。
- **建議**：規劃團隊明確 supersede 並補理由。

---

## E. 缺細節 / 不清楚

### E14 [High] Health score 公式無權重數值
- **缺**：SD §20.2 只描述 input；無權重、無閾值（healthy/watch/degraded/critical 切點）。
- **建議**：規劃團隊補預設權重表（mock 可標 `mock formula v0`）。

### E15 [High] Sentinel mock 派生規則
- **缺**：SD §8.2 說從 alerts/incidents 派生，但 confidence / blastRadius / recommendedActions 無派生規則。
- **建議**：補 `derivation map`（如 incident.severity=critical → finding.severity=critical / confidence=0.9）。

### E16 [High] Emergency mock action 對既有 seed 副作用範圍
- **缺**：§15.6 / §21.2 說會 audit + realtime event；未說 `pause_persona_routing` 是否真改 seed.persona（影響 PersonaDetail 看到變化）。
- **建議**：明訂「v5 mock action 只更動 v5 layer 的 derived state，不寫回 seed」。

### E17 [Medium] Realtime bus 復用否
- **缺**：SD §9 未說明是否復用 `src/lib/bff/realtime.ts` mock SSE bus。
- **建議**：復用；新增 v5 channel topic prefix。

### E18 [Medium] Permission 模型
- **缺**：v5 page 用既有 `usePermissions()` 還是新建 v5 capability list？
- **建議**：復用，待 Pack D D12 回應後再對齊。

### E19 [Medium] /management/alpha-factory route 未定義
- **缺**：SD §6 nav 出現 `/management/alpha-factory` 但既有 App.tsx 無此 route。
- **建議**：規劃團隊明確此 route 是新增 stub（Phase E1）或已存在頁面 rename。

---

## 對應 phase gating

| Phase | 必須先解 |
|---|---|
| E0 types + mock | E01, E02, E10, E11, E12, E13, E14, E15 |
| E1 routing + nav | E08, E09, E19 |
| E3 Execution Loop | E03, E10, E16 |
| E5 Sentinel | E06, E15, E16 |
| E6 HIQ | E04, E13 |
| E7 IA stabilization | E08, E09 |

## 統計

- Blocker：6（E01, E02, E03, E04, E05, E06）
- High：7（E07, E08, E10, E11, E14, E15, E16）
- Medium：6（E09, E12, E13, E17, E18, E19）
- 合計：19
