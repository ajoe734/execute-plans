# Pantheon v3 實作計畫

## 階段 0：索引與紀錄（< 5 分鐘）
1. 更新 `.lovable/spec/INDEX.md` 增加 v2 / v3 區段，指向 `.lovable/spec/v2/` 與 `.lovable/spec/v3/`
2. 更新 `.lovable/audits/INDEX.md` 加入：
   - `2026-05-05-A` Pack A 已 RESOLVED 28 H
   - `2026-05-05-B` Pack B 已 RESOLVED 64 M/L
3. 更新 `mem://index.md` 將 spec 指向 v3 為最新權威來源（Parts 1–8 + Part 9/10 addendum）

## 階段 1：Pack A — 28 條 High 嚴重度（v3 Part 9）

### 1A. 型別與狀態正規化（基礎，先做）
- `src/lib/stateMachines/`：依 v3 §4 統一 18 個 state machine
  - Strategy 拆 `lifecycleStatus` (8) + `reviewStatus` + `deploymentStatus`
  - 移除 `under_review` / `paused` 作為 lifecycle status 的誤用
  - Persona / CapitalPool / Skill / Memory enum 對齊
  - `quarantined` (取代 isolated)、`deprecated` (取代 deprecating)
- `src/lib/bff/types.ts`：
  - `availableActions: ActionDescriptor[]`（移除 string[]）
  - 新增 `ConfirmTokenRequest/Response`
  - Rebalance 加 `reviewer[]` / `approver[]`
  - Evolution 加 Constraints / Alerts / Approvals schema
  - CapitalPool mandate JSON schema
- 對應 G01, G05, G14, G15, G16, G18, G19, G67, G68, G78

### 1B. 權限與高風險動作
- `src/lib/permissions.ts`：以 v3 §5 Role × Entity × Action truth table 重寫，移除自訂硬編碼
- `src/lib/bff/mutations.ts`：
  - HIGH_RISK_ACTIONS 全集對齊 v3 §6
  - 新增 `POST /bff/commands/confirm-token` mock endpoint
  - confirm token flow（request → token → execute）
- `src/platform/components/HighRiskConfirm.tsx`：對齊新 token 流程
- 對應 G02, G03, G04, G66, G86

### 1C. 路由與頁面結構
- 統一 `/management/risk` 為 canonical，`/management/risk-center` 改 redirect
- `StrategyDetail`：補齊 13 tabs（加 Costs / Calendar）
- `PersonaDetail`：補齊 Persona Lab / Memory tab spec
- `CapitalPoolDetail`：補 Performance / Ranking Inputs tab schema
- `RankingFormulaDetail`：weight tree schema（FormulaBuilder）
- `RebalanceDetail`：6 step UI 元件指定
- 對應 G28, G29, G30, G31, G32, G33, G13, G17

### 1D. Agora 與信號
- `src/lib/handoff.ts`：依 v3 §13 補各 handoff type payload schema
- `SignalReview` confidence scale 1–5 強制
- `CommitteeRoom` evidence pack upload schema
- `DailyBrief` KPI 計算公式
- 對應 G48, G49, G56, G57, G58

### 1E. Mock data 對齊
- `src/mocks/seed.ts`：所有 mock 100% 符合 v3 canonical DTO

## 階段 2：Pack B — 64 條 M/L（v3 Part 10）

依 v3 §1–§45 章節順序逐項實作。分批 commit：

- **批次 B1** §1–§7：i18n、Notification、RightDrawer、GlobalSearch、ADR、Design token、i18n QA  
  G06, G07, G08, G09, G10, G11, G12, G74, G81
- **批次 B2** §8–§14：Incident、Memory、Tool/MCP/Skill、Insight lineage、Job payload、Handoff、Audit  
  G20, G21, G22, G23, G24, G25, G26, G27, G39, G40, G43, G52, G61, G65, G73, G80
- **批次 B3** §15–§22：Console pages（Command Center KPI、Strategies sort/filter、Experiment、Risk/Review SoT、Skill sandbox、Lineage graph、SSE、Empty/Loading/Error templates）  
  G34, G35, G36, G37, G38, G41, G42, G44, G45, G46, G47, G72
- **批次 B4** §23–§31：Agora（Persona Ask Modes、Committee evidence、Trainer suite、Notebook、Persona Lab commit、Channel detail、Agora 禁止表）  
  G50, G51, G53, G54, G55, G59, G60, G62, G63, G64
- **批次 B5** §32–§45：BFF/Realtime/Format/Components（Session attachment、缺漏 endpoints、Accept-Language、日期金額、Review observer、HighRisk memo limit、FormulaBuilder shortcuts、Component namespacing、EventStream retain、Form validation、Mock alignment、Demo scenario mapping、Prompt budget、Route param schema）  
  G69, G70, G71, G75, G76, G77, G79, G82, G83, G84, G85, G87, G88, G89, G90, G91, G92

## 階段 3：驗證
- 跑 `vitest`（覆蓋 stateMachines、permissions、mutations、handoff、scenarios）
- 跑 `scripts/check-i18n.ts`、`scripts/list-hardcoded.ts`
- 視覺巡檢：Management Console 22 頁 + Agora 12 頁
- 對 `.lovable/feedback/2026-05-05-A/` 與 `.lovable/feedback/2026-05-05-B/` Disposition.csv 逐筆勾稽

## 工作量預估
- 階段 0：1 step
- 階段 1（Pack A）：6–8 step（每 step 一群檔案）
- 階段 2（Pack B）：5 個批次 × 1–2 step
- 階段 3：1–2 step
- **總計約 15–20 step**

## 不做的事
- 不引入 v3 未定義的 enum
- 不在前端做 RBAC 推理（必須由 BFF availableActions 驅動）
- 不允許 Agora 直接執行 live deploy / capital rebalance / production MCP grant / skill approval
- 不覆蓋 `.lovable/spec/` 既有文件，只新增 v3 索引引用
