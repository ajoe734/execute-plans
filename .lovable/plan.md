## 背景

依先前對照 `.lovable/spec/` 的盤點，目前完成度：表面 ~70%、規格對齊 ~25–30%。本計畫把缺口拆成 Phase 10–15，優先補基礎與高價值缺漏，再補長尾。每個 phase 約 1 個工作批次可收斂。

---

## Phase 10 — Foundation Realignment（基礎修正）

對應 spec：Part 1（Master Blueprint）、Part 6（BFF 契約）、Part 7（Component System）。

範圍：
- i18n 預設 locale 改為 `zh-TW`；補齊既有頁面缺漏的 key（目標覆蓋 ≥ 80%）。
- Routing 校正成 spec 命名：
  - `/management/research` → `/management/experiments`
  - 補上 `/management/command-center`、`/management/risk-center`、`/agora/committee` 等 placeholder route。
  - 重設首頁：`/management` → Command Center；`Overview` 變子頁。
- DTO 補欄位（`src/lib/bff/types.ts`）：
  - `BaseObject` 新增 `availableActions: string[]`、`labelKey: string`。
  - 在 `mock/seed.ts` 注入對應資料；client 不變。
- RBAC hook：新增 `usePermissions()`，依 `role` 過濾 `availableActions`，並在 list/detail action button 套用。

不變更：UI 視覺、現有 Phase 1–9 已完成的元件骨架。

---

## Phase 11 — Shell 補件（Right Drawer / Notifications / Jobs / Lineage）

對應 spec：Part 1 §Shell、Part 7 §Shared Components。

範圍：
- `RightDrawer / Inspector`：可由任何 list row 開啟，顯示 metadata、lineage、最近活動、actions。
- `NotificationCenter`：TopBar Bell → Sheet，列出 alerts / approvals / jobs，分頁 tabs。
- `JobProgressDrawer`：底部固定 drawer，顯示 running jobs 與進度（接 `useMockRealtime`）。
- `LineageGraph`：簡易 DAG（用 SVG 或 dagre-lite），用於 Strategy/Artifact/Deployment 詳情頁。
- TopBar `Bell` 真正打開 NotificationCenter（目前是空 button）。

---

## Phase 12 — HighRiskConfirm 補欄位 + State Machines

對應 spec：Part 7 §HighRiskConfirm（12 欄位）、§State Machines（18 種）。

範圍：
- `HighRiskConfirm` 補：Operation、Target、CurrentState、NewState、RiskImpact、Affected Scope、Rollback Plan、Approver、Justification（textarea）、Dual-Confirm（live env）、Audit Note、Cooldown timer。改成結構化 props。
- `src/lib/stateMachine.ts` 拆分為 `stateMachines/` 目錄，補齊 18 種：strategy、persona、capitalPool、rebalance、deployment、experiment、artifact、evolution、tool、mcpServer、mcpTool、skill、channel、incident、approval、alert、runtime、job。每種定義 states / transitions / guards / risk。
- 在 detail 頁面 action menu 改用 `nextStates(machine, currentState)` 動態產生。

---

## Phase 13 — Management 缺漏頁面 ✅

對應 spec：Part 2 / Part 3。

完成範圍：
- **Command Center**（`/management/command-center`，亦為 `/management` index）：6 KPI 卡（Live Risk / Open Incidents / Pending Approvals / Running Jobs / Runtime Health / Capital Util）+ Lifecycle bottlenecks 桶 + 待辦審批清單 + Capital exposure bar + Alerts/Incidents 列 + Persona activity + Agora 移交收件匣 + Recent state transitions + Running jobs。
- **Risk Center**（`/management/risk-center`）：6 KPI + Breach matrix（Domain × Severity）+ 6 個分頁（Capital/Strategy/Persona/Runtime/Capability/Incidents），每個分頁可下鑽至物件詳情。
- **Incident Detail**（`/management/incidents/:id`）：Summary card + 5 個分頁（Timeline / Affected scope / Root cause / Postmortem / Audit）+ HighRiskConfirm 包裝的 Close（高嚴重需 Postmortem ≥20 字）與 Pause Affected。
- **Governance Review**（`/management/governance/:id`）：3 欄佈局（Summary / Evidence + Validator / Decision Panel）+ 底部 Audit timeline + 5 種決策（Approve / Reject / Request Changes / Escalate / Freeze）皆走 HighRiskConfirm，risk=critical 額外要求輸入 token。
- IncidentsPage 列點擊改為跳轉至 IncidentDetail（保留 sheet 為快速預覽 fallback 已移除）。

---

## Phase 14 — Agora 缺漏頁面 + Handoff ✅

對應 spec：Part 4 §8 / §11、Part 5 §21。

完成範圍：
- **Committee Room**（`/agora/committee` 列表 + `/:sessionId` 詳情）：6 種 template、persona 多選、evidence pack、分輪討論（agree/disagree/neutral）、Vote 統計、Memo 生成與儲存、Submit Memo → governance handoff、Follow-ups（research_task / insight / close session）。
- **Signal Detail**（`/agora/signals/:id`）：Header summary + 7 個 Tabs（Explanation/Market/Similar/Persona Opinions/Feedback/Research/Audit）+ 右側動作面板（Agree/Disagree/Flag/Ask Persona/Ask Committee/Handoff to research/Open Strategy）。SignalReview 列表加上「Open Detail」連結。
- **Handoff 機制**：`src/lib/handoff.ts`（zustand store + 8 種 HandoffType + targetRouteFor 對應）+ `HandoffDrawer`（10 欄位：type/source/summary/evidence list/priority/owner/persona/notes，summary 強制 ≥8 字），全域掛載於 PlatformShell。InsightInbox / DecisionJournal / Committee Room / Signal Detail 皆已加上 Handoff 入口；submit 後 toast 含「Open target」可帶 `?from=handoff&handoff={id}` 預填到對應管理頁。

---

## Phase 15 — Persistence、Audit、QA 收斂 ✅

對應 spec：Part 6 §Mutations、Part 8 §QA。

完成項目：
- ✅ `bff/mutations.ts`：`runAction` / `approve` / `reject` / `acknowledgeAlert` / `setIncidentStatus` / `promoteLive` / `rollback` / `pause`，更新 seed 記憶體狀態並 emit `data` realtime event。
- ✅ 自動寫入 `auditEvents`：actor=current role、action、target、ts、memo。
- ✅ Toast-only actions 已替換：Operations (Alerts/Incidents/Approvals)、StrategyDetail、GovernanceReview、IncidentDetail、Persona/CapitalPool/RankingFormula/Rebalance/Deployment/Skill/Mcp/Evolution/Research/ArtifactDetail。
- ✅ `QAChecklist` 重寫成 spec Part 8 §10–§14 全部 71 項，狀態持久化於 `qa-checklist-v2`。
- ✅ Vitest 18 測試 pass：state machine transitions、permission gating、mutation → audit 寫入。

---

## 技術細節（給工程參考）

- 新增檔案規劃：
  - `src/lib/permissions.ts`、`src/lib/stateMachines/{entity}.ts`
  - `src/platform/components/{RightDrawer,NotificationCenter,JobProgressDrawer,LineageGraph}.tsx`
  - `src/management/pages/{CommandCenter,RiskCenter,IncidentDetail,GovernanceReview}.tsx`
  - `src/agora/pages/{CommitteeRoom,SignalDetail}.tsx`
  - `src/lib/bff/mutations.ts`、`src/lib/handoff.ts`
- 既有檔案調整：`App.tsx`（routing）、`store.ts`（i18n default、role permissions cache）、`HighRiskConfirm.tsx`、`TopBar.tsx`（Bell → NotificationCenter）、`seed.ts`（注入 availableActions/labelKey、可變 state）。
- 不引入新重量級依賴；LineageGraph 用 SVG 自繪或 `reactflow` 視 bundle 影響再決定（預設不裝）。

---

## 交付順序建議

10 → 11 → 12 → 13 → 14 → 15。10–12 是底座，沒做完 13–15 會堆技術債。若想先看「畫面進度」可把 13 提前到 11 之後，但 12 必須在 15 之前完成。

完成全部後，預期規格對齊度從 ~30% 提升至 ~85%，剩餘 15% 為視覺 polish 與細部互動。
