# Pantheon Frontend (`execute-plans`)

Pantheon 是一個雙產品（**Management Console** + **Agora Workbench**）的內部營運與研究操作介面。
目前支援 mock 與 Pantheon BFF live 模式；`VITE_BFF_FALLBACK=auto` 是 dev/hybrid fallback，
`VITE_BFF_FALLBACK=strict` 是 real integration 模式，不會靜默退回 mock。

> 規格唯一真實來源：`.lovable/spec/Pantheon_Frontend_Build_Spec_FULL_*.md`（zh-TW / en-US）。

---

## 快速開始

```bash
npm install
npm run dev          # Vite 開發伺服器
npm run test         # 執行所有單元測試
npm run build        # production build
npm run lint         # lint
```

## Pantheon Dev FE / BFF 串接

這個 repo 是 Pantheon 目前的前端系統，不是舊的
`front-ai-trading-system` 專案。Dev frontend 不再以 Lovable publish 狀態作為
host 或驗收來源；請從 Pantheon dev 環境服務 `execute-plans` build。

### Branch / deploy policy

`main` 是這個 repo 作為 Lovable 專案時留下的歷史整合線。現在 dev frontend
改由 Pantheon-owned dev 環境部署後，日常開發規範如下：

- `dev`：日常 frontend integration branch，也是 Pantheon dev FE deployment
  的來源。
- feature / repair / Codex task branches：PR target 預設為 `dev`。
- `main`：只在明確 promotion、stable cut 或一次性 repo bootstrap 時使用。
- 不再用 Lovable publish 狀態判斷 dev 是否完成；必須以 `execute-plans`
  commit、Pantheon dev FE deployment、direct browser/BFF integration gate 為準。

宣稱「已 publish 到 dev」前，至少要能指出：

- `execute-plans` commit 已在 `dev`。
- `Pantheon FE-BFF Integration Gate` 已對該 commit 通過。
- `Pantheon Dev FE Deploy` 已在 VM self-hosted runner 對該 commit 通過。
- dev FE host 的 `/deployment.json` 回報同一個 commit。
- direct browser/BFF probe 已通過 deployed `execute-plans` frontend +
  Pantheon dev BFF。

目前 dev FE / BFF 目標：

- FE: `https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io`
- BFF: `https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io`

Dev FE 是這台 Pantheon dev VM 上的 Caddy static site：

- Caddy root: `/var/www/pantheon-dev-fe`
- release store: `/var/www/pantheon-dev-fe-releases`
- deploy script: `scripts/deploy-dev-vm.sh`
- deploy workflow: `.github/workflows/pantheon-dev-fe-deploy.yml`
- runbook: `docs/deployment/pantheon-dev-fe-vm.md`

部署流程是 gate-first：`dev` push 先跑 `Pantheon FE-BFF Integration Gate`，
成功後 `Pantheon Dev FE Deploy` 的 `workflow_run` 才會在 VM self-hosted
runner（labels: `pantheon-dev-vm`, `execute-plans-deploy`）部署同一個 SHA。
已落後目前 `dev` head 的 gate 結果會被略過。手動部署可用
workflow_dispatch 指定 ref，但只接受已通過 integration gate 的目前 `dev`
head。

常用 env 範本：

- `.env.example`：預設 mock，本地無後端時使用。
- `.env.dev.example`：shared dev BFF，`live + auto` fallback。
- `.env.development.example`：lupin dev BFF，`live + auto` fallback。
- `.env.staging-live.example`：staging-live BFF，`live + strict`，驗證時不得靜默 mock。

Pantheon dev frontend build 請設定：

```env
VITE_BFF_MODE=live
VITE_BFF_BASE_URL=https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io
VITE_BFF_FALLBACK=strict
VITE_BFF_REAL_WRITES=false
VITE_BFF_ALLOW_DEV_STUB_WRITES=false
```

Pantheon dev deployments are safe-by-default. An operator may explicitly set
the workflow-dispatch `real_writes` input to exercise the governed Human Review
submit/decision/read-back flow. That opt-in also enables the dev-only
stub-write gate, which requires `/bff/me` to report `dev` or `test` and rejects
any production environment marker.

Staging-live:

```env
VITE_BFF_MODE=live
VITE_BFF_BASE_URL=https://pantheon-staging-bff.34.81.225.122.sslip.io
VITE_BFF_FALLBACK=strict
VITE_BFF_REAL_WRITES=false
```

Staging-live 與自動 dev 部署都維持 `VITE_BFF_REAL_WRITES=false`。只有 operator
明確啟用的 dev workflow dispatch 才會將 writes 送入 BFF 治理命令與 Human
Review；資金或 runtime 的直接變更仍由後端 policy 阻擋。

Auth/session access is explicit:

- Browser cookie session：live fetch 使用 `credentials: "include"`。
- Optional dev bearer token：`sessionStorage` 優先，其次 `localStorage`，key 為
  `pantheon.bff.bearerToken` 或 legacy `pantheon_operator_token`。
- Optional dev fallback：`VITE_BFF_DEV_BEARER_TOKEN` 會編入公開 bundle，
  因此只能留空或使用 dev-only viewer identity（例如
  `pantheon-dev-browser:viewer`）。operator/admin、MFA 與
  `assistant.kernel.*` capability 必須來自互動式 cookie／sessionStorage
  session，不能放進任何 `VITE_*` build variable。
- Optional tenant id：`pantheon.bff.tenantId` 或 legacy `pantheon_tenant_id`。

Management AI SA/SD dispatch is BFF-owned. The frontend calls
`POST /bff/assistant/dev-docs/generate` and lets the supervisor drain the dev
bridge inbox. `Supervisor` is not a dispatchable reviewer identity; frontend
SA/SD packets should use real worker names such as `Codex` and `Claude`.

Route-by-route live/fallback behavior:

- `GET /health`
  - live：TopBar 每 30 秒 probe 一次並更新 `LiveBffBanner` / realtime diagnostics。
  - auto fallback：transport/network/5xx 退回 `{ status: "mock" }` 並顯示 fallback。
  - strict：transport failure 會以 typed BFF error 浮出。
- `GET /bff/me`
  - live：透過 `fetchMe()` 打真 BFF，支援 cookie 或 optional bearer token。
  - auto fallback：transport/network/5xx 退回 `mockMe()`，但 banner 會標示 fallback。
  - strict / real：不再 catch-all 靜默 mock；4xx 與 transport failure 會讓 session hook 暴露 error。
- `POST /bff/auth/refresh`
  - live：`refreshSession()` 打真 BFF，成功後更新 session cache。
  - auto fallback：退回 mock session 並更新 cache。
  - strict：失敗會浮出 error，不會刷新成 mock。
- `POST /bff/logout`
  - live：`logoutSession()` 打真 BFF，成功後清 session cache。
  - auto fallback：清本地 session cache 並回 `{ ok: true }`。
  - strict：失敗會浮出 error。
- `GET /bff/v5/interventions?status=pending`
  - live：v5 intervention list 會嘗試讀 BFF 並轉成現有 UI model。
  - auto fallback：退回 seed-derived intervention list。
  - strict：失敗浮出 error。
- `POST /bff/actions/{entityType}/{entityId}/{actionId}` and selected v5 remediation writes
  - live writes only when `VITE_BFF_REAL_WRITES=true`。
  - default false：保留 mock mutation + overlay + audit/realtime behavior。
  - strict only affects transport once writes are explicitly enabled.

其餘 execute-plans 既有 mock-spec routes 先留在 mock fallback，避免 UI 呼叫尚未交付的
route family 時整站失效。

---

## 應用結構

| 路徑 | 內容 |
|------|------|
| `src/platform/` | 跨產品共用的 Shell：TopBar、SideNav、Drawers、HighRiskConfirm、EntityHeader、StatusBadge、LifecycleStepper、AuditTimeline、PermissionAwareButton、QAChecklist… |
| `src/management/` | Management Console（Strategy/Persona/Capital Pool/Rebalance/Approvals/Runtimes/Risk/Incidents/Capabilities…） |
| `src/agora/` | Agora Workbench（DailyBrief/Signals/Notebook/AskPersonas/Committee/DecisionJournal/AlertTriage/InsightInbox/Trainer/MemoryReview/SkillCoaching） |
| `src/lib/bff-v1/` | Pantheon BFF v1 live/mock transport：`client.ts`、`liveTransport.ts`、`paths.ts`、`lists.ts`、`writes.ts`、`me.ts` |
| `src/lib/bff/` | Legacy mock seed support：`mutations.ts`（寫＋稽核）、`realtime.ts`（事件匯流排）、`types.ts`、v5 UI facade |
| `src/lib/stateMachines/` | 18 個實體狀態機（Spec Part 7 §17） |
| `src/lib/permissions.ts` | RBAC 權限矩陣 + `filterActions` |
| `src/lib/handoff.ts` | Agora → Management 的工作交接 store |
| `src/i18n/` | i18next 字典（zh-TW / en-US，536 keys 雙語對齊） |
| `src/mocks/seed.ts` | 全部 mock 資料 |

---

## 設計原則

1. **BFF boundary only**：所有資料、寫入、即時事件都走 `lib/bff-v1/*` 或 legacy
   `lib/bff/*` facade。不要在頁面元件直接 `fetch()` 真實 API。
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
npm run test
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
- **不要**直接 `fetch()` 真實 API；所有讀寫一律走 `lib/bff-v1/*` 或 legacy `lib/bff/*` facade。
- **不要**繞過 `mutations.runAction()` 直接改 `seed.ts`（會缺稽核 + realtime）。
- 加新狀態機 transition 時，務必補上 `risk` / `requiresApproval` / `uiPattern`，
  UI 才會自動渲染正確的 confirm 模式。

---

## 整合測試（Pantheon FE × BFF Integration Gate）

對應 `docs/testing/Pantheon_FE_BE_Integration_Test_Blueprint_2026-05-10.md`。
測試 runner 用獨立的 env（**不**寫在 `.env.example`，避免污染 Vite runtime）：

```bash
cp .env.integration.example .env.integration   # 本地測試
export $(grep -v '^#' .env.integration | xargs)
```

常用指令：

```bash
npm run test:contract        # vitest contract-drift
npm run probe:bff:routes     # 匿名 BFF route probe，輸出 .lovable/audits/
npm run probe:bff:auth       # 需 PANTHEON_BFF_SMOKE_BEARER_TOKEN
npm run probe:bff:writes     # live dry-run write probe；預設跳過 create 類 valid writes
npm run validate:mgmt-live:deep # RBAC token matrix / operator race / long SSE reconnect
npm run probe:browser        # hosted bundle BFF probe
npm run e2e                  # Playwright 全套
npm run gate:integration     # 全部串起來
```

CI workflow: `.github/workflows/pantheon-integration-gate.yml`（PR、`dev`/`main`
push、`workflow_dispatch`；需設定 repo secret `PANTHEON_BFF_SMOKE_BEARER_TOKEN`；
完整 RBAC / two-man race 證據需再設定 `PANTHEON_BFF_RBAC_TOKENS_JSON` 或各角色 token
secret，以及 `PANTHEON_BFF_OPERATOR_A_TOKEN` / `PANTHEON_BFF_OPERATOR_B_TOKEN`；
`PANTHEON_OLD_BFF_URL` 應對齊歷史 BFF URL `https://pantheon-dev-bff.35.236.178.81.sslip.io`）。
證據輸出在 `.lovable/audits/`，Sprint A baseline 在 `.lovable/audits/baseline/`。

## 相關文件

- `.lovable/spec/INDEX.md` — Spec 8 個 Part 索引
- `.lovable/plan.md` — Phase 16 實作落差盤點與後續計畫
- `docs/testing/Pantheon_FE_BE_Integration_Test_Blueprint_2026-05-10.md` — 整合測試藍圖（F01–F18）
- `docs/testing/Release_Gate_Checklist_2026-05-10.md` — Release gate Gate 0–7
