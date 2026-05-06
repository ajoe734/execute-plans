
# Pack C 接收、歸檔與落地計畫

## A. 文件歸檔（read-only 階段先確認、build mode 執行）

將 `/tmp/v4/` 10 份檔案歸檔到專案：

```
.lovable/spec/v4/
  Pantheon_Frontend_Build_Spec_FULL_v4_zh-TW.md
  Pantheon_Frontend_Build_Spec_FULL_v4_en-US.md
  Pantheon_Frontend_Build_Spec_v4_INDEX.md
.lovable/feedback/2026-05-05-C/
  Pantheon_Frontend_Build_Spec_SA_SD_Gap_Remediation_2026-05-05-C_All_zh-TW.md
  Pantheon_Frontend_Build_Spec_SA_SD_Gap_Remediation_2026-05-05-C_All_en-US.md
  Pantheon_Frontend_Build_Spec_SA_SD_Gap_Remediation_2026-05-05-C_Disposition.csv
  Lovable_Immediate_Remediation_Prompt_2026-05-05-C_All_zh-TW.md
  Lovable_Immediate_Remediation_Prompt_2026-05-05-C_All_en-US.md
.lovable/audits/
  spec-gap-2026-05-05-C.md  (規劃團隊版本，與我們 audit 同名，存為 *-planner.md 避免覆蓋)
  spec-gap-2026-05-05-C-summary.csv → *-planner.csv
```

並更新：
- `.lovable/spec/INDEX.md`：把 v4 列為最高優先級，調整衝突解決順序為 **v4 → v3 → v2 → v1**。
- `.lovable/audits/INDEX.md`：把 audit C 標記為 `RESOLVED_BY_PACK_C (v4 / 2026-05-05-C)`。

## B. 規劃團隊回應內容檢視結論

Pack C 78 條 **全數有具體 SA/SD 級回應**，沒有未答項。每條都給了 schema、表格或裁定（如 single-tenant、SSE-only、bulk = future work）。我提的 11 大區塊全被覆蓋。

## C. Pack C ↔ 目前 v3 實作的「規範性不一致」清單

Pack C 明確聲明「優先於 v3」，因此以下不一致必須以 Pack C 為準、回頭修我們的 v3 程式碼：

| # | 位置 | v3 現況 | Pack C 規範 | 必要動作 |
|---|---|---|---|---|
| 1 | `src/lib/v3/status.ts` `StrategyReviewStatus` | 9 值 (draft/submitted/validator_running/in_review/changes_requested/approved/rejected/cancelled/none) | 4 值 `none\|pending\|changes_requested\|approved` (C008) | 收斂 enum、增加 mapping helper、改所有引用點 |
| 2 | `src/lib/v3/status.ts` `StrategyDeploymentStatus` | 8 值 (not_deployed/scheduled/deploying/running/paused/rolling_back/failed/stopped) | 5 值 `none\|paper_running\|live_running\|stopped\|rollback_required` (C008) | 收斂 enum + paper/live 拆分 |
| 3 | Strategy 三軸合法組合 | 無白名單 | C008 提供 8×N 白名單 + `validateStrategyTriple()` | 新增 `strategyInvariants.ts` + 在 mutations 驗證 |
| 4 | `src/lib/stateMachines/*` | 只有 happy path | C006 規定 `TransitionDescriptor` (timeoutMs, onFailure, onCancel, retryable) + 8 機器預設 | 改 `Transition` 型別、補 transient/failure 狀態 |
| 5 | `ActionDescriptor` (`src/lib/v3/availableActions.ts`) | 缺 group/order/disabledReasonCode/cooldownSec/ttlSec/idempotencyKeyRequired | C014–C015 完整 schema | 擴 schema + 全站 button 渲染順序 |
| 6 | High-risk catalog (`src/lib/v3/highRiskActions.ts`) | 5 條，無 cooldown/memo.minLen/refType | C020–C023 19 條 + memo schema (`HighRiskMemo`) | 重寫 catalog；補 confirm-token revoke endpoint |
| 7 | BFF list endpoints (`src/lib/bff/*`) | offset 風格 | C024–C026 cursor + filter[]/sort | 改 mock BFF + hooks |
| 8 | Error envelope | `BffError` 只有 code/i18nKey | C027 加 `retryable/userActionable/correlationId` | 擴 type + toast 邏輯 |
| 9 | SSE (`src/lib/bff/realtime.ts`) | 無 Last-Event-Id / heartbeat / resync | C029 完整協定 | 重寫 reconnect loop |
| 10 | Handoff (`src/lib/v3/agoraHandoff.ts`) | 無 SLA escalation / reject DTO / attachment 限制 | C033–C036 | 補 7 種 SLA 表 + `HandoffRejectDTO` + attachment validator |
| 11 | Capital mandate | 無 breach monitor | C038 `MandateMonitor` 預設值 | 新增 monitor + Risk Center alert hook |
| 12 | Ranking metrics | 無 unit/direction/normalization | C039 `RankingMetricDefinition` | 擴 metric library |
| 13 | Rebalance | 無 quorum/rollback | C040–C041 7 step 表 | 擴 workflow 定義 |
| 14 | Evolution constraints | 無 min/max validator + dry-run | C043 + `dry-run` endpoint | 補 validator + mock endpoint |
| 15 | Strategy `lifecycleStatus` `degraded` 與 v3 §13 Persona `degraded → restricted` | v3 直接用 degraded | C001 規定 Persona `degraded` 為 invalid → `restricted` | Persona type bridge 加 mapping |
| 16 | i18n locales | 已是 zh-TW/en-US | C047 ICU pattern + format token table | 新增 `formatTokens.ts` |
| 17 | Design tokens | 無 dark/density | C050–C051 token + theme/density preference | 擴 tailwind config + ThemeProvider |
| 18 | A11y / Security / Performance | 無對應章節 | C056/C063/C064 baseline | 新增 `src/lib/v4/a11y.ts`, `security.ts`, `perf-budget.ts` + `PlatformShell` 套用 |
| 19 | E2E scenarios | 只有單頁測 | C059 10 happy + 5 incident | 新增 `src/test/e2e-scenarios.test.ts`（mock-driven）|
| 20 | Mock seed scale | 較少 | C060 明定每 entity 數量 | 擴 `src/mocks/seed.ts` |
| 21 | Signal confidence | 1–5 無 reason 規則 | C075 表 | 擴 SignalFeedback validator + UI |
| 22 | DailyBrief tz/null | 無一致規則 | C077 | 改 KPI render |
| 23 | CommandCenter bucket colors | 自訂 | C078 token mapping | 改 token map |

### 與規劃團隊的待澄清項（次要，不阻擋落地）

- C019 token TTL 預設 120s、critical 60s——我們現有 `confirmTokens` 預設多少需確認後對齊。
- C040 Rebalance step 名稱（Pack C 用 `metric_freeze/ranking_calculation/...`）與我們 `src/lib/v3/rebalanceWorkflow.ts` 既有 step id 需 1:1 mapping，若不一致以 Pack C 為準並補 alias。
- C002 `apiVersion: 'v3'`（Pack C 仍稱 v3）但文件叫 v4——確認是否升 `apiVersion: 'v4'` 或維持字面 `'v3'`。**建議實作：維持 Pack C 字面 `'v3'`。**

## D. 新建 v4 normative 層

```
src/lib/v4/
  index.ts
  legacyMapping.ts          # C001
  envelope.ts               # C002 BffEnvelope
  tabMigration.ts           # C003
  transitions.ts            # C006/C007 TransitionDescriptor + force
  strategyInvariants.ts     # C008 三軸白名單
  retention.ts              # C009
  optimisticLock.ts         # C010
  branching.ts              # C011
  renderHints.ts            # C012
  permissionsMatrix.ts      # C013 11 entity × action
  actionDescriptor.ts       # C014–C015 (取代 v3 版)
  emergencyOverride.ts      # C016
  confirmToken.ts           # C019 + revoke
  highRiskCatalog.ts        # C020–C023 19 條
  pagination.ts             # C024–C026
  errorEnvelope.ts          # C027
  idempotency.ts            # C028
  sseProtocol.ts            # C029 + channel catalog
  handoffSla.ts             # C033–C037
  mandateMonitor.ts         # C038
  rankingMetric.ts          # C039
  rebalanceQuorum.ts        # C040–C041
  fxPolicy.ts               # C042
  evolutionLimits.ts        # C043
  experimentGate.ts         # C044
  reproducibility.ts        # C045
  i18nFormat.ts             # C046–C049
  designTokens.ts           # C050–C051 (CSS var 註冊)
  componentSpecs.ts         # C052–C055
  a11y.ts                   # C056–C058
  security.ts               # C064–C065
  perfBudget.ts             # C063
  glossary.ts               # C067
  ownerMap.ts               # C070
  strategyTabs.ts           # C071
  personaLab.ts             # C072
  rankingInputs.ts          # C073
  rebalanceUiPatterns.ts    # C074
  signalConfidence.ts       # C075
  committeeTemplates.ts     # C076
  dailyBriefKpi.ts          # C077
  lifecycleBucketColors.ts  # C078
```

`src/lib/v4/index.ts` re-export 全部，並在 README 標註 **v4 > v3** 衝突解決規則。`src/lib/v3/` 保留但內部標 `@deprecated`，凡 Pack C 收斂的型別都加 `// superseded by v4`。

## E. 落地分批（已完成全部 6 階段）

1. ✅ 歸檔 + INDEX 升 v4 + 建 v4 骨架
2. ✅ Pack C-H1（C001/C002/C006/C008/C010/C013/C014/C015/C019/C020/C024/C025/C027/C028/C029）
3. ✅ Pack C-H2（C033/C034/C038/C056/C059/C064）
4. ✅ Pack C-M（38 條）—— `src/lib/v4/h2-m-wiring.test.ts`
5. ✅ Pack C-L（26 條）—— `src/lib/v4/l-wiring.test.ts`
6. ✅ 驗收：vitest **175/175** 全綠（13 test files）；E2E `src/test/e2e-scenarios.test.ts` 10 happy + 5 incident；mock seed 達 C060 標（Strategy 24 / Persona 12 / CapitalPool 6 / RankingFormula 6 / Rebalance 4 / Evolution 6 / Experiment 24 / Job 30 / Alert 20 / Incident 10 / Tool 12 / MCPServer 6 / Skill 12）；a11y axe smoke `src/test/a11y-axe-smoke.test.tsx`；ranking `recalculate` 以 zod 驗 mock envelope（在 E2E happy 4/10）。

## F. 不做（與 Pack C 一致）

- Bulk mutation UI（C031 future）
- WebSocket（C032 future）
- 多 tenant 切換（C018 future）
- zh-HK/zh-CN 區隔（C048 future）
- 視覺回歸（C066 future）

## 確認事項

請確認：
1. 接受 Pack C **完全覆蓋** v3 的型別收斂（特別是 Strategy review/deployment 9→4、8→5）。
2. 接受新增 `src/lib/v4/` 目錄，v3 進入 deprecated 維護模式。
3. 同意按 6 階段分批落地（每階段一個 user message 觸發）。
