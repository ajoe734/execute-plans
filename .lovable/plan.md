# Pantheon Frontend — 分階段實作計畫

規格書（約 14k 行、8 個 Part、中英雙語）描述兩個前端共用一個 Platform Shell：**Management Console**（`/management`）與 **Agora Workbench**（`/agora`）。考量規模龐大，分成 **9 個階段**逐步建置。每階段都可獨立預覽與審查。先用 Mock BFF + Mock Realtime，最後才接真實後端。

---

## Phase 0 — 基礎建設與設計系統
- 在 `index.css` 建立設計 Token（HSL 變數）：Research 中性藍、Paper 琥珀、Live 綠色＋高風險強調色、風險等級（low/medium/high/critical）、狀態色。
- 設定 i18n（`react-i18next`），預設 en-US，可切換 zh-TW。
- 加入 Zustand 管理全域狀態（環境、語系、使用者/角色、通知）。
- 建立型別化的 **Mock BFF Client**（`src/lib/bff/`），對應 Part 6 的 request/response，回傳 mock 資料並模擬延遲。
- 建立 **Mock Realtime Bus**（EventEmitter）模擬 jobs/alerts/events。
- 資料夾結構：`src/platform/`、`src/management/`、`src/agora/`、`src/mocks/`、`src/lib/bff/`、`src/i18n/`。

## Phase 1 — Platform Shell（共用外殼）
- 全域 Top Bar：Logo、Product Switcher（Management / Agora）、環境指示器（Research / Paper / Live）、全域搜尋、語言切換、BFF 狀態、Realtime 指示燈、待審批數、未處理告警、執行中 Jobs、通知鈴鐺、使用者角色選單。
- Command Palette（⌘K），覆蓋全域搜尋範圍（Strategy、Alpha、Persona、Capital Pool…）。
- Right Drawer / Inspector 共用樣式。
- 高風險確認 Modal 系統（需打字確認；Live 環境更嚴格）。
- Toast 系統、BFF 連線狀態 Banner。
- `/management/*` 與 `/agora/*` 路由群組、共用 Layout、登入守衛 stub、依角色決定導覽。

## Phase 2 — Management Console：物件頁面（Part 3，第一批）
每個受管物件統一模式：列表 → 詳情（Tab：Overview / Performance / Risk / Runtime / Approvals / Audit）→ 動作選單 → Inspector。
- Strategy & Alpha
- Persona 與路由策略
- Capital Pool 與風險預算
- 績效排序公式

## Phase 3 — Management Console：物件頁面（第二批）
- 季度調倉（提案 → 審查 → Apply，含高風險確認）
- Evolution Program / 演化方向
- Research / Experiment
- Knowledge / Artifact / Lineage

## Phase 4 — Management Console：Operations
- Deployment（Paper/Live 升級、Rollback）
- Runtime 監控
- Jobs Queue
- Alerts 與 Incidents（triage、acknowledge、resolve）
- Audit Event Log
- Governance / Approval Inbox（多階段、依角色控管）

## Phase 5 — Management Console：能力管理
- Tools 註冊
- MCP Server 與 MCP Tool（含正式環境權限授予）
- Skills（草稿、審批、發布）
- Channel

## Phase 6 — Agora Workbench（Part 5）
- Daily Brief 首頁
- 市場與 Watchlist 分析
- Strategy Signal Review（自然產生 `signal_feedback`）
- Research Notebook（`research_note` → 策略想法 / 研究任務）
- Ask Personas（單一 + 多 persona 委員會 / 紅隊）
- 決策日誌 Decision Journal
- Alert Triage
- Insight Inbox

## Phase 7 — Agora：AI Trainer Studio
- Memory Review
- Skill Coaching（Skill 草稿）
- Persona Lab
- Evaluation Suites
- Channel 管理
- 自然訓練資料收集 pipeline（寫入 mock BFF：`training_example`、`memory_candidate` 等）

## Phase 8 — State Machine、Mock Realtime、QA（Part 7 & 8）
- 實作 State Machine（XState 或型別化 reducer）：Approval、Deployment、Job、Alert、Incident、Rebalance、Skill 生命週期。
- Mock Realtime stream 推 Jobs/Alerts/Events 即時更新 UI。
- 依 Part 8 鋪設完整 mock 資料。
- 跑 Part 8 QA Checklist：雙語、角色權限、Live 環境更嚴格高風險確認、Agora 不暴露高風險動作、Audit trail 可見、無障礙。

## Phase 9（選配）— 串接真實 BFF
- 將 Mock BFF Client 替換為 Part 6 真實 endpoints。保留 mock 切換開關供開發用。

---

## 技術說明
- **技術棧**：React 18 + Vite + TS + Tailwind + shadcn/ui（既有）。新增：`react-i18next`、`zustand`、`@tanstack/react-query`（既有）、`xstate`（Phase 8）、`cmdk`（命令面板）。
- **暫不接後端**：Lovable Cloud 等到 Phase 9 視需求才加（如果需要登入 / 資料持久化）。
- **風險阻擋**：Agora 在路由與動作層直接禁止高風險操作，不只是隱藏按鈕。
- **雙語**：所有字串走 `t()`，中英對應同一份 key。
- **資訊密度**：Management 以 TanStack Table 為主；Agora 以卡片 / 筆記版型為主。

## 交付節奏
每個階段結束都會有可預覽版本。建議在 Phase 1（Shell）、Phase 4（Console MVP）、Phase 6（Agora MVP）、Phase 8（完整 Mock 系統）這幾個節點 review。

## 開工前需要你確認
1. **目前不需要 Lovable Cloud**（只用 Mock BFF）→ 對嗎？或要從第一天就啟用以支援登入 / 持久化？
2. **預設語系 = en-US**，兩種語系都提供 → OK 嗎？
3. **階段範圍**確認 → 核可後我就從 Phase 0 + Phase 1 一起開始；或你想調整分組？
