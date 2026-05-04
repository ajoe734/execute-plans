## 現況盤點

跑了一輪 i18n 與規格對照，目前狀況如下：

**i18n 字典本身**
- `en-US` 與 `zh-TW` 各 323 keys，左右對齊（沒有單側缺漏）。
- 但程式中使用的 key 有 12 個在兩邊都不存在（會 fallback 顯示 key 字串）：
  - `agree`, `disagree`, `flag`（SignalDetail 動作）
  - `alert`, `audit`, `data`, `job`（realtime 事件 toast）
  - `al_500`（疑似錯字 key）
  - `alert.acknowledge`, `approval.approve`, `approval.reject`, `strategy.promote_live`（mutation toast）

**真正的問題：硬編碼英文字串**
共約 22 個頁面含 ≥3 個硬編碼英文字串，前 10 大：
```
Operations.tsx           33  Lists.tsx              22
StrategyDetail.tsx       31  PersonaDetail.tsx      21
RiskCenter.tsx           28  RebalanceDetail.tsx    20
McpDetail.tsx            19  SkillDetail.tsx        16
DeploymentDetail.tsx     16  CapitalPoolDetail.tsx  16
```
原因：Phase 13–15 為了趕功能，table headers / tab labels / section titles / toast / placeholder 大量寫死英文，沒回頭走 i18n。在 zh-TW 模式下這些就直接漏出英文，使用者看到的「中文沒出來」就是這個。

**規格對齊缺口（除 i18n 以外）**
依 spec Part 2/3/4/5 與目前實作對照，仍缺：

1. **Strategy lifecycle 完整 8 狀態** (`draft → review → approved → paper → ramp → live → degraded → retired`) — 目前 stateMachines 有定義但 UI 動作菜單未呈現所有合法 transition。
2. **Rebalance 4 階段工作流** (`propose → simulate → review → apply`) — RebalanceDetail 只有 propose/apply。
3. **Approval Stages 多階段審批** — GovernanceReview 只有單一決策面板，spec 要求顯示「Stage 1: Risk → Stage 2: Capital → Stage 3: Admin」進度。
4. **AuditTimeline 共用元件** — spec §3.9 要求獨立元件，目前各頁自繪。
5. **EntityHeader 共用元件** — spec §3.1 要求 ID/labelKey/risk/state/owner/env 一條 header，目前 PageHeader 不含 entity metadata。
6. **PermissionAwareButton** — spec §3.6 要求 disabled 時顯示「需要 X 角色」tooltip，目前只是 hide。
7. **Daily Trading Cockpit 缺 Persona Voices 區塊** (Part 4 §8.1)。
8. **Memory Review / Skill Coaching / Trainer Studio** 仍是 placeholder-ish（功能淺）。
9. **Right Drawer 欄位** — spec §4.5 要求 metadata + lineage + recent activity + actions 四區，目前只有 actions。

---

## Phase 16 計畫

### 16.1 i18n 全面收斂（最高優先，使用者直接體感）

a. **補 12 個缺漏 key** 到 `en-US.ts` / `zh-TW.ts`：
   - `signal.decision.{agree,disagree,flag}`（已存在於 spec 結構，補對應 key）
   - `realtime.event.{data,job,alert,audit}`
   - `mutations.{alertAcknowledged,approvalApproved,approvalRejected,strategyPromoteLive}`
   - 修正 `al_500` 錯字。

b. **掃 22 個頁面，把硬編碼英文字串改成 t() 呼叫**：
   - 新增字典分群：`table.*`（共用 column header：Status/Owner/Updated/Risk/Type…）、`section.*`（Timeline/Rationale/Change Summary/Approval Stages/Suggested Action…）、`toast.*`（共用 toast 訊息）。
   - 估計新增 ~120 個 key，雙語對齊。
   - 優先順序：Operations → StrategyDetail → RiskCenter → 其餘 detail 頁。

c. **加 i18n lint script**（`scripts/check-i18n.ts`）：
   - 列出 `t("...")` 中 key 但字典缺漏。
   - 列出 `.tsx` 中 `>[A-Z][a-zA-Z ]{3,}<` 的硬編碼字串候選。
   - 寫進 README，未來新頁面 PR 前可手動跑。

### 16.2 共用元件補件（spec §3）

- `EntityHeader.tsx`：吃 `BaseObject`，渲染 ID + labelKey + StatusBadge + RiskBadge + owner + env + actions。所有 `*Detail.tsx` 改用。
- `AuditTimeline.tsx`：吃 `AuditEvent[]`，統一樣式（actor avatar + action + target + ts + memo）。Incident/Governance/Strategy 詳情換掉。
- `PermissionAwareButton.tsx`：包 Button，無權限時 disabled + Tooltip 顯示「需要角色：X」。

### 16.3 Workflow 補完整

- **Strategy actions menu**：`StrategyDetail` 動作改用 `nextStates(strategyMachine, currentState)` 動態產生（含 ramp / degraded transitions）。
- **Rebalance 4 階段**：`RebalanceDetail` 補 `simulate` 與 `review` 階段 UI（progress stepper + 各階段的 evidence 區塊）。
- **Approval Stages**：`GovernanceReview` 加 stepper（Risk → Capital → Admin），每階段顯示 approver、決策、時間。

### 16.4 規格落差小補

- **Daily Cockpit**：補 Persona Voices 區塊（最近 24h Persona 對市場的關鍵語錄）。
- **Right Drawer**：補 metadata、lineage（用現有 LineageGraph）、recent activity 三區，不只 actions。
- **Memory Review / Skill Coaching**：補 spec Part 4 §8.11/§8.12 的核心欄位（Memory diff viewer、Skill rubric 評分），不一定全做但至少資料展示。

---

## 技術細節

- 不引入新依賴。
- 字典變大但 i18next 仍可接受（單一文件 ~600 lines → ~750）。
- `EntityHeader` 取代各 detail 頁的 header 區塊；改動 14 個 detail 頁，採批次 line_replace。
- 保留現有 `PageHeader`（list 頁仍用），新元件只給 detail 頁。
- 不動 routing、不動 BFF mutations、不動 state machine 定義（只動消費端）。

---

## 交付順序

**16.1 i18n（先做完，立即見效）** → 16.2 共用元件 → 16.3 workflow → 16.4 落差補件。

預期完成後，zh-TW 介面英文殘留 < 5%，spec 對齊度由 ~85% 提升至 ~92%。

要我直接開始 16.1 嗎？或想先聚焦特定頁面（例如使用者目前在的 `/agora/channels` 也是英文，可以納入 16.1 第一批）。
