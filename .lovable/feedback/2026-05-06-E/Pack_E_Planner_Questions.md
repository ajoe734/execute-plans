# Pack E — 規劃團隊待回覆問題清單

**日期**：2026-05-06
**對象**：Pantheon 規劃團隊
**用途**：Lovable 在進入 Pack E 落地（v5 Closed-Loop Supervisor OS 的 E0 types + mock）前，需請規劃團隊逐條回覆。回覆完成後，請將表格另存為 `.lovable/feedback/2026-05-06-E/Pack_E_Disposition.csv`，Lovable 即可啟動 E0。

**來源整合**：
1. v5 SA §19 Open Questions（10 條）
2. v5 SD §27 Open Design Decisions（6 條）
3. Lovable 審視 v5 SA + SD 後的衝突與疑問（19 條，見 `.lovable/audits/spec-conflict-2026-05-06-E.md`）

去重合併後共 **28 條**，分三優先級。

---

## 第一優先：gating Phase E0（不解則 v5 type / mock 無法寫）

> 共 11 條。這 11 條必須先有結論，否則 `src/lib/v5/types.ts` 一寫就要返工。

### Q1 — 產品命名
**來源**：SA §19 Q1
**問題**：產品全文用 **Pantheon** 還是 **Pathreon**？SA 與 SD 通篇用 Pantheon，但 SA 開頭備註提到 Pathreon。
**影響**：i18n key、navTitle、頁面 H1、文件全部命名。
**建議預設**：Pantheon。

### Q2 — v5 enum 與 v4 normative 關係
**來源**：衝突 E01
**問題**：SD §7.1 自定 `LoopStatus` / `HealthStatus` / `InterventionSeverity` / `AutonomyMode` / `RemediationMode`。是否：
- (a) re-export v4 既有 enum（同概念用同 type）
- (b) v5 enum 為 view-model 專用，**不對外暴露為 BFF DTO 欄位**
- (c) v5 自成一套，可與 v4 並行

**影響**：PersonaCard、StrategyDetail 顯示一致性；`src/lib/v5/types.ts` 結構。
**建議預設**：(b)。

### Q3 — v5 BFF facade 路徑
**來源**：衝突 E02 / SD §27 row 5
**問題**：`bff.v5.*` 應掛在哪？
- (a) `src/lib/bff/v5.ts`，於 `src/lib/bff/client.ts` 掛 `bff.v5 = …`（與既有 `bff.strategies` 等同層）
- (b) `src/lib/v5/bff.ts`，獨立模組

**建議預設**：(a)。
**理由**：與既有 BFF 慣例一致，避免 import 路徑分裂。

### Q4 — PersonaExecutionHealth.mode canonical 值
**來源**：衝突 E10（SD 內部矛盾）
**問題**：
- SD §7.4 定義：`live | paper | shadow | paused`
- SD §15.6 又出現：`health.mode = suspended`
- 既有 seed 用：`active | paper | retired`

請定 canonical enum，並提供 seed → v5 對照表。
**建議預設**：canonical = `live | paper | shadow | suspended`；seed adapter `active → live`、`retired → suspended`。

### Q5 — SentinelFinding.status canonical 值
**來源**：衝突 E11（SA vs SD 不一致）
**問題**：
- SA：`open | accepted | dismissed | executing | resolved | superseded`
- SD §7.9：`open | acknowledged | action_pending | mitigating | resolved | dismissed`

哪個是 canonical？另一份是否需要 supersede 註記？
**建議預設**：採 SD 版（更貼近 UI 狀態機），SA 加 addendum 說明 `accepted → acknowledged`、`executing → mitigating`、`superseded` 取消。

### Q6 — RemediationAction 欄位名 mode vs automationLevel
**來源**：衝突 E12
**問題**：SD 用 `mode: RemediationMode`、SA 用 `automationLevel`，三個值相同（advisory / guarded_automation / emergency_override）。請定 canonical 欄位名。
**建議預設**：採 `mode`，SA 加 alias 註記。

### Q7 — InterventionItem 欄位增刪
**來源**：衝突 E13
**問題**：SD §7.10 相對 SA：
- **移除**：`modifyAllowed`、`evidenceRefs`、`recommendation`
- **新增**：`requiredRoles`、`linkedApprovalId` / `linkedFindingId` / `linkedIncidentId`

請確認：是否 supersede SA 版？被移除的三欄是否真的不需要？或應補回？
**建議預設**：以 SD 為準；`recommendation` 改名為 SD 已有的 `recommendedDecision`；`evidenceRefs` 透過 `linkedFindingId.evidence` 取得；`modifyAllowed` 由 `requiredRoles` 推導。

### Q8 — Persona / Strategy Health Score 公式
**來源**：衝突 E14 / SD §20.2
**問題**：SD §20.2 只給文字描述，未給：
- 各 input 的權重（PnL / drawdown / executionQuality / policyViolations / sentinel verdict 各佔比）
- 閾值切點（healthy ≥ ?, watch ≥ ?, degraded ≥ ?, critical < ?）

由實作端自訂、或請規劃團隊給預設值？
**建議預設**：請規劃補預設權重；mock 標 `formula version: v0-mock`，未來可替換。

### Q9 — Sentinel mock 派生規則
**來源**：衝突 E15 / SD §8.2
**問題**：SD 說 SentinelFinding 從 alerts / incidents 派生，但下列欄位無派生規則：
- `confidence`（0..1）
- `blastRadius.{strategies, personas, capitalPools, deployments, runtimes}`
- `recommendedActions[]`（type / mode / requiresHumanApproval）

請給派生 mapping 範例，否則只能純文案 mock。

### Q10 — v5 mock action 對既有 seed 的副作用
**來源**：衝突 E16 / SD §15.6 / §21.2
**問題**：執行 `pause_persona_routing` / `switch_persona_to_shadow` 等 mock action 時：
- (a) 真的更新 seed 的 persona（其他既有頁面如 PersonaDetail 會看到變化）
- (b) 只更動 v5 derived layer 的暫存 state（既有頁面無感）

**建議預設**：(b)。
**理由**：避免 mock action 污染 seed，回滾困難。

### Q11 — HIQ 是否取代既有 /management/approvals
**來源**：SA §19 Q6
**問題**：v5 Human Intervention Queue (`/management/interventions`) 是否吸收既有 `/management/approvals`？
- (a) 取代：approvals route 改 redirect 到 interventions
- (b) 共存：interventions 為統一入口、approvals 為 drill-down 詳情頁
- (c) 並列：兩者長期分開

**建議預設**：(b)。

---

## 第二優先：gating Phase E1–E6

> 共 11 條。允許 E0 完成、E1 routing 進場前再回。

### Q12 — LoopStage timeout / failureState
**來源**：衝突 E03 / Pack D D05
**問題**：SD §7.2 假設 `stage.timeoutMs`，但 Pack D D05 狀態機 timeout / failureState 未定。等 Pack D 回應，或 v5 自行 stub？
**建議預設**：等 Pack D D05；過渡期 v5 mock 用固定 SLA（如 watch=15min, blocked=60min）。

### Q13 — RemediationAction.requiredRoles 對應 capability
**來源**：衝突 E04 / Pack D D12
**問題**：SD §7.8 假設 role gate，但 Pack D D12 Role × Capability bundle 未定。
**建議預設**：等 Pack D D12；過渡期用既有 `usePermissions()` 4 種 role hard-code。

### Q14 — ControlRoomSummary 引用 MeDto
**來源**：衝突 E05 / Pack D D59 / D51
**問題**：SD §7.11 + §12 假設可取 currentUser / tenant / featureFlags，但 `/bff/me` DTO 未定。
**建議預設**：等 Pack D D59；過渡期 ControlRoomSummary 不引 user，僅引 tenantId。

### Q15 — v5 typed event envelope
**來源**：衝突 E06 / Pack D D26
**問題**：SD §9 列 13+ 種 v5 typed event；Pack D D26 SSE channel payload schema 未列。
**建議預設**：等 Pack D D26；過渡期 v5 events 復用 `src/lib/bff/realtime.ts` mock bus，topic prefix `v5.`。

### Q16 — LoopRuns / Findings 列表 totalCount
**來源**：衝突 E07 / Pack D D22
**問題**：SD §13 列表需 pagination，但 Pack D D22 totalCount 行為未定。
**建議預設**：等 Pack D D22；過渡期 mock 給 deterministic count。

### Q17 — Command Center 過渡期 nav 位置
**來源**：衝突 E08 / SD §27 row 1
**問題**：SD §27 第一條決議 Control Room 與 Command Center「coexist first」，但 §6 nav 已把 Command Center 從一級 group 移除 → 過渡期 route 在但無入口。
**建議預設**：Phase E1 將 `/management/command-center` 暫時掛在 Legacy / Advanced group。

### Q18 — Personas 雙入口
**來源**：衝突 E09 / SD §6.2
**問題**：SD §6 將 Personas 同時掛 Execution Loop 與 Multi-Persona System，§6.2 自承重複，E1 接受、E7 才整理。確認可接受？
**建議預設**：可接受；E1 nav 加 `dedupeKey` 避免 sidebar active state 雙重高亮。

### Q19 — Realtime bus 復用
**來源**：衝突 E17 / SD §9
**問題**：v5 typed events 是否復用 `src/lib/bff/realtime.ts` mock SSE bus？v5 channel topic prefix 規範？
**建議預設**：復用；topic prefix `v5.loop.` / `v5.sentinel.` / `v5.intervention.`。

### Q20 — Permission 模型
**來源**：衝突 E18
**問題**：v5 page 用既有 `usePermissions()` 還是新建 v5 capability list？
**建議預設**：沿用 `usePermissions()`，待 Pack D D12 再對齊。

### Q21 — /management/alpha-factory route 來源
**來源**：衝突 E19 / SD §6
**問題**：SD §6 nav 列 `/management/alpha-factory` 但既有 App.tsx 無此 route。
**選項**：(a) 新建 stub 頁；(b) 是某既有頁面的 rename（請指明）；(c) 暫時不加。
**建議預設**：(c) Phase E1 暫不加，等專屬 spec。

### Q22 — Event 模型整體確認
**來源**：SD §27 row 6
**問題**：v5 採「typed event + 既有 data refresh」並行？
**建議預設**：是。

---

## 第三優先：gating Phase E7–E8 / polish

> 共 6 條。允許 E2/E5 acceptance 後再回。

### Q23 — Control Room 取代 Command Center 時點
**來源**：SD §27 row 1
**問題**：何時將 `/management/command-center` redirect 到 `/management/control-room`？
**建議預設**：E2 acceptance 通過後。

### Q24 — Sentinel action 執行模式
**來源**：SD §27 row 2
**問題**：採 guarded mock（low/mid 直接執行）+ HighRiskConfirm（emergency 需確認）？
**建議預設**：是。

### Q25 — Persona health scoring 標籤
**來源**：SD §27 row 3
**問題**：mock formula 是否標 `mock formula v0`，並提供 replaceable 介面？
**建議預設**：是。

### Q26 — E1 nav 重複允許
**來源**：SD §27 row 4
**問題**：E1 階段允許 nav 重複（Personas 兩處）、E7 清理？
**建議預設**：是。

### Q27 — LoopRun 是否需要持久化
**來源**：SA §19 衍生
**問題**：LoopRun 永遠是衍生 view-model（每次從 seed/jobs/approvals 即時派生），還是需要持久化（DB / localStorage）？
**影響**：mock action 改變 LoopRun 狀態後，刷新頁面是否保留。
**建議預設**：純衍生；mock action 結果存於 in-memory 短期 cache（30 分鐘 TTL）。

### Q28 — Sentinel evidence 儲存
**來源**：SA §19 衍生
**問題**：SentinelFinding.evidence 直接引用既有 alert / incident / job id（`EvidenceRef`）即可，不另外建 evidence table？
**建議預設**：是。

---

## 回覆格式建議

請整理為 csv 後存放：

```
.lovable/feedback/2026-05-06-E/Pack_E_Disposition.csv
```

欄位：

```csv
id,answer,addendum_to,notes
Q1,Pantheon,—,SA §1 採 Pantheon
Q2,b,SD §7.1,view-model 專用 enum 限本層
Q3,a,SD §27 row 5,
Q4,"live|paper|shadow|suspended",SD §7.4 §15.6,seed adapter active→live retired→suspended
...
```

收到 disposition.csv 後，Lovable 即啟動 Phase E0（v5 types + mock BFF）。

---

## 統計

| 優先級 | 條數 | 阻塞 phase |
|---|---|---|
| 第一（E0 gating） | 11 | E0 |
| 第二（E1–E6 gating） | 11 | E1–E6 |
| 第三（E7–E8 gating） | 6 | E7–E8 |
| **合計** | **28** | — |

其中 5 條（Q12–Q16）依賴 Pack D 5 條 blockers（D05/D12/D22/D26/D59）；若 Pack D 短期內無回應，請以「過渡期建議」批准 v5 stub，避免互相阻塞。
