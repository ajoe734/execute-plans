# 前端 vs 設計藍圖：完整待辦盤點 (2026-05-08)

對照來源：v4 + Pack D + v5 SA/SD + 2026-05-07 Planner Response (34 條) + 2026-05-08 Stage 2 Audit + spec-conflict-G。

整體覆蓋率 — **規格層 233/233 已收斂，FE 實作 ~95% 完成**。以下分類整理「真正還沒落地」的部分。

---

## A. 必修 (Blocker — 立即影響 CI/品質)

### A1. 測試模式回歸 (新發現)
切換 dev BFF URL 後 `.env` 設 `VITE_BFF_MODE=live`，導致 vitest 也跑 live mode，4 條 envelope 測試（`RESOURCE_NOT_FOUND` / `CONFIRM_TOKEN_REQUIRED 428` / `APPROVAL_REQUIRED` / `CommandResponse.data 502`）失敗 — 全部變成 `UNKNOWN_ERROR/500/502`。
- 修法：在 `vitest.config.ts` 或 `src/test/setup.ts` 強制 `import.meta.env.VITE_BFF_MODE = "mock"`，或於 `client.ts` 中 `if (import.meta.env.MODE === 'test')` 視為 mock。
- 結果：357 → 361 全綠。

---

## B. 規格 backport 等待 (FE 已就緒，BE/Planner 工作)

| ID | 等待 | FE 狀態 |
|---|---|---|
| A1 | OpenAPI YAML 加 `ActionCommandStatus` schema | `FE_READY_OPENAPI_BACKPORT_PENDING` |
| A2 | Pack D D21 markdown 補齊 26 ErrorCode | `FE_READY_PACKD_BACKPORT_PENDING` |
| A3 | AsyncAPI 把 `correlationId` 標 required | `FE_READY_ASYNCAPI_BACKPORT_PENDING`（FE 用 `ensureCorrelationId()` 補值） |

不動 FE，只在 backport 落地後改 disposition 標記。

---

## C. spec-conflict-G impl-pending (8 條剩餘)

`.lovable/audits/spec-gap-2026-05-06-G-summary.csv` 14 條中，前回收斂 6 條；剩 8 條「impl-fixable」：

| ID | 主題 | 工作 |
|---|---|---|
| G01 | `CreateIntentResult` 缺 async transition 欄位 | D05 已落地 → 把 `asyncTransitionPolicy` 接到 `EntityCreateDrawer` 的成功 toast |
| G05 | overlay TTL (30 min) 與 audit append (永久) 不對稱 | 決策：audit 也走 overlay 30 min，或在 audit 顯示「mock-only」標 |
| G06 | `ENTITY_TO_LIVE_KIND` 寫死，未綁 `SSE_CHANNELS` | D26 已落地 → 從 `src/lib/bff-v1/sse/channels.ts` 導出 mapping |
| G07 | loops focus enum 對稱性 | 補 `LoopFocus` enum per loop（research/execution/optimization）|
| G09 | Drawer 缺 `If-Match`/expectedVersion | 接 `optimisticLock.ts`；create 場景無 expectedVersion，只需 idempotency-key（已有），update 場景補 |
| G12 | overlay GC 只在 add/list 觸發 | 加 `setInterval` 每 60s GC |
| G13 | audit unshift 不算 prevHash | mock 補 `prevHash` placeholder 欄位 |
| G14 | `withOverlay` prepend 跳過排序 | merge 後依 list sort 重排 |

預估 ~6-8 檔，全是純 FE。

---

## D. v5 Phase E1–E8 落地檢查

E0 (types+mock) 已落；route 層 E1 (control-room/loops/sentinel/interventions) 已掛。需確認：

- **E2 Control Room**：頁面是否真的 render `ControlRoomSummary` 7 區塊（Loop health, Sentinel feed, HIQ queue, Mandate, Capital, Recent decisions, Run cadence）？目前 `ControlRoomPage` 行為待 audit。
- **E3/E4 Execution/Optimization Loop**：`LoopRun` timeline + stage detail drawer 是否完整？
- **E5 Sentinel Findings**：列表/篩選/acknowledge/mitigate 動作是否 wire 到 `bff.v5.sentinel.*`？
- **E6 HIQ**：`InterventionItem` 詳情 + `recommendedDecision` accept/modify/decline 三按鈕是否齊？
- **E7 IA stabilization**：side nav grouping、breadcrumb i18n（已有 `routeLabels.ts` 單一來源）、empty/skeleton 一致性。
- **E8 QA/a11y/polish**：axe smoke 已存在；需擴及 v5 五個新頁面。

建議先跑 `bunx vitest run src/lib/v5` + 手動逛 5 個頁面，列出仍是 stub 的區塊。

---

## E. Planner Response 34 條 — 補 wire-up 而非新增

幾個 canonical 模組已落 `src/lib/v4/`，但**未實際接到 UI/呼叫端**：

| 模組 | 落地檔 | 待 wire-up |
|---|---|---|
| `cooldownPriority.ts` | ✅ | `EntityCreateDrawer` confirm button 套用 cooldown > confirm-token 順序 |
| `twoManPolicy.ts` | ✅ | `HighRiskConfirm` 流程加 distinct-user 檢查 |
| `forceTransitionPolicy.ts` | ✅ | break-glass UI（admin only）尚無入口 |
| `mandateBreachDefaults.ts` | ✅ | Capital pool detail 套用 cadence + auto-actions hint |
| `reviewerQuorum.ts` | ✅ | Approvals queue 顯示 quorum 進度條 |
| `memoPolicy.ts` | ✅ | Decision Journal / Approval memo 欄位驗證 minLength |
| `uiBudgets.ts` | ✅ | DataTable density toggle / LineageGraph node-limit warning |
| `RollbackSagaDrawer/Stepper` | ✅ 掛 PlatformShell | 需要 IncidentDetail 提供「View Rollback Saga」按鈕呼 `openRollbackSaga()` |

---

## F. 雜項清理（可延後）

- `src/lib/v3/` 仍存在，已被 v4 superseded — 加 deprecation header 或保留為 legacy shim，文件化即可。
- `src/lib/v5/timeoutPolicy.ts` 已被 `v4/asyncTransitionPolicy.ts` superseded，CHANGELOG 已標 deprecated；可加 ESLint `no-restricted-imports`。
- `.env.example` 同時保留 mock + live 範例；`.env` 目前 live；測試覆蓋見 A1。

---

## 建議執行順序

1. **A1 修測試** (5 min)
2. **C 八條 G impl-fixable** (1-2 hr，整批)
3. **D v5 phase 巡檢**：先列 stub，再分批落地（E2/E5/E6 較重）
4. **E wire-up**：每個 canonical 模組找一個 UI 入口接上
5. **B 由 BE/Planner 接手**

---

## Out of Scope（不做）

- 修改 backend OpenAPI / AsyncAPI / Pack D markdown（B 組）
- 改 design token / route slug / business logic
- 重寫 v3/v4 已 frozen 的 DTO
