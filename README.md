# Pantheon Frontend (Lovable)

Pantheon 是一個雙產品（**Management Console** + **Agora Workbench**）的內部營運與研究操作介面，
完全以 mock BFF + mock realtime 在前端跑通，可在 spec 鎖定後接到真實後端。

> 規格唯一真實來源：`.lovable/spec/Pantheon_Frontend_Build_Spec_FULL_*.md`（zh-TW / en-US）。

---

## 快速開始

```bash
bun install
bun run dev          # Vite 開發伺服器
bunx vitest run      # 執行所有單元測試
bun scripts/check-i18n.ts   # 檢查 i18n 字典與硬編碼字串
```

---

## 應用結構

| 路徑 | 內容 |
|------|------|
| `src/platform/` | 跨產品共用的 Shell：TopBar、SideNav、Drawers、HighRiskConfirm、EntityHeader、StatusBadge、LifecycleStepper、AuditTimeline、PermissionAwareButton、QAChecklist… |
| `src/management/` | Management Console（Strategy/Persona/Capital Pool/Rebalance/Approvals/Runtimes/Risk/Incidents/Capabilities…） |
| `src/agora/` | Agora Workbench（DailyBrief/Signals/Notebook/AskPersonas/Committee/DecisionJournal/AlertTriage/InsightInbox/Trainer/MemoryReview/SkillCoaching） |
| `src/lib/bff/` | Mock BFF：`client.ts`（讀）、`mutations.ts`（寫＋稽核）、`realtime.ts`（事件匯流排）、`types.ts` |
| `src/lib/stateMachines/` | 18 個實體狀態機（Spec Part 7 §17） |
| `src/lib/permissions.ts` | RBAC 權限矩陣 + `filterActions` |
| `src/lib/handoff.ts` | Agora → Management 的工作交接 store |
| `src/i18n/` | i18next 字典（zh-TW / en-US，536 keys 雙語對齊） |
| `src/mocks/seed.ts` | 全部 mock 資料 |

---

## 設計原則

1. **Mock-first**：所有資料、寫入、即時事件都走 `lib/bff/*`，不接真後端。
   想替換成真 API 時，只需在 `client.ts` / `mutations.ts` / `realtime.ts` 換 transport。
2. **狀態機驅動 UI**：所有可執行動作由 `nextTransitions(machine, state)` 產生，
   再經 `filterActions(role, …)` 過濾，避免 UI 與後端流程脫鉤。
3. **高風險動作三道閘門**：
   - `PermissionAwareButton`：無權時 disabled + tooltip 顯示「需要 X 角色」。
   - `HighRiskConfirm`：對 `uiPattern: "high_risk_modal" | "rollback_modal" | "destructive_modal"` 的轉場彈出確認框。
   - `auditEvents`：所有寫入透過 `mutations.runAction()` 自動寫稽核 + 廣播 realtime 事件。
4. **Agora 安全邊界**：Agora 永遠不直接 deploy/rollback/動資金，
   只能透過 `useHandoff().openHandoff(...)` 推入 Management 工作佇列（Spec §21 / §22 W16）。
5. **i18n 強制對齊**：兩語系 key 數量必須相等；新加 key 後請執行 `bun scripts/check-i18n.ts`。

---

## 共用元件速查

| 元件 | 用途 | Spec |
|------|------|------|
| `EntityHeader` | 詳情頁統一標頭：ID + 名稱 + Status/Risk badge + owner + env | §3.1 |
| `LifecycleStepper` | 依狀態機渲染進度條（含 branch states） | §3.4 / Part 7 §17 |
| `ApprovalStagesStepper` | 審批多階段 stepper | §3.5 |
| `PermissionAwareButton` | 角色權限感知按鈕 | §3.6 |
| `AuditTimeline` | 統一稽核事件時間軸 | §3.9 |
| `HighRiskConfirm` | 高風險動作確認框（含 memo 欄位） | §3.7 |
| `RightDrawer` | Inspector：metadata / lineage / next transitions / actions | §4.5 |
| `HandoffDrawer` | Agora → Management 交接 | Part 5 §21 |
| `JobProgressDrawer` | 背景 job 監控 | §3.10 |

---

## 測試

```bash
bunx vitest run
```

覆蓋（30 tests, 6 files）：

- `lib/permissions.test.ts` — RBAC 矩陣、filterActions
- `lib/handoff.test.ts` — handoff store 與 targetRouteFor 路由表
- `lib/stateMachines/stateMachines.test.ts` — 核心 transition 規則
- `lib/stateMachines/coverage.test.ts` — 18 機器結構不變式 + rebalance 9 階段路徑
- `lib/bff/mutations.test.ts` — 寫入 + 稽核 + realtime 廣播
- `test/example.test.ts` — sanity

新增測試請放在被測檔案旁，命名 `*.test.ts(x)`。

---

## i18n 工作流

1. **新增字串**：先在 `src/i18n/locales/en-US.ts` 與 `zh-TW.ts` 新增同 key。
2. **使用**：`const t = useT(); t("section.key")`。
3. **驗證**：`bun scripts/check-i18n.ts`
   - `Missing in dictionaries` 必須為 0。
   - `Only in en-US` / `Only in zh-TW` 必須為 0。
   - `Hard-coded English candidates` 為候選清單，並非全部都需翻譯（HTML attribute、shadcn 內部、placeholder 圖示等可忽略）。

---

## QA Checklist

`/platform/qa` 路由提供 Spec Part 8 §10–§14 的可勾選清單（state 持久化於 `localStorage`）。
驗收新功能後，在對應條目打勾，作為里程碑出貨依據。

---

## 開發守則

- **不要**在元件裡寫硬編碼 hex/rgb/text-white 等顏色，請用 `index.css` / `tailwind.config.ts` 的 semantic tokens（`bg-background`、`text-foreground`、`border-border`、`bg-status-success` …）。
- **不要**直接 `fetch()` 真實 API；所有讀寫一律走 `lib/bff/*`。
- **不要**繞過 `mutations.runAction()` 直接改 `seed.ts`（會缺稽核 + realtime）。
- 加新狀態機 transition 時，務必補上 `risk` / `requiresApproval` / `uiPattern`，
  UI 才會自動渲染正確的 confirm 模式。

---

## 相關文件

- `.lovable/spec/INDEX.md` — Spec 8 個 Part 索引
- `.lovable/plan.md` — Phase 16 實作落差盤點與後續計畫
