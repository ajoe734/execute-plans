# 計畫：補齊 Registry CRUD + Oversight 導引（Option A，遵守 spec）

依 `Pantheon_Management_Lovable_Spec_2026-05-20.md` §2.4 / §3.2–3.3：
- **Advanced Registry**（`/management/personas`, `/strategies`, `/capital`, `/deployments` …）= CRUD 之家
- **Oversight**（`/management/interventions`, `/one-ring`, `/persona-fleet` …）= 只看不改，0 件時要給導引

## 範圍

### A. Registry CRUD 補齊（重點：先把 PersonaDetail 做對，當樣板）

1. **`PersonaDetail.tsx`**
   - `Edit` 按鈕接 `onClick` → 開啟 `EntityCreateDrawer` (`mode="edit"`, `initialData={p}`)；存檔後 refresh。
   - 新增 `Delete` 按鈕（`PermissionAwareButton` + `AlertDialog` 二次確認 + HighRisk memo）→ 呼叫 `bff.personas.archive(id)`，fallback 走 `writeOverlay.softDelete('persona', id)`；成功後 navigate 回 `/management/personas`。
   - 兩顆按鈕都用 `usePermissions().can('persona.edit' / 'persona.archive')` 控管。

2. **`EntityCreateDrawer`**：擴充支援 `mode: "create" | "edit"` 與 `initialData`（目前只有 create）。
   - `createEntity.ts` 加 `updateEntityFromInput()`：persona 走 `bff.personas.update`，其餘走 `writeOverlay.update`。

3. **`ObjectDetailLayout`**：新增 `entityActions?: { onEdit?, onDelete?, entity, id }` slot，內部統一渲染 Edit/Delete（含權限 + 確認），其他 Detail 頁（Strategy/Capital/Deployment/…）只要傳入即可，不必各自重寫。

4. **`ObjectListPage.tsx`**：每列尾端加 `⋯` dropdown（Edit / Duplicate / Delete），事件冒泡擋掉 row click。

5. **其餘 11 個 Registry Detail**（Strategy、CapitalPool、Deployment、Tool、MCP、Skill、Rule、Eval、Dataset、Channel、Webhook 等實際存在者）：本輪只接上 `ObjectDetailLayout.entityActions`，動作走 writeOverlay（BFF 端點等 BE 跟上）。不額外加自訂表單欄位。

### B. Oversight 空狀態導引

6. **`Interventions.tsx`**：list 0 件時用 `EmptyState`，title「目前沒有待處理事項」+ description 解釋「這裡只負責簽核 / 駁回 Persona 與 Strategy 觸發的高風險動作；要新增、修改、刪除實體請去 Advanced Registry」+ CTA「前往 Persona Registry → `/management/personas`」+ 次要連結「Strategy / Capital」。
7. **`Cockpit` 側欄**：Oversight 與 Advanced Registry 兩段各加一行 muted hint 文字（「即時監控」/ 「實體管理 CRUD」），用 i18n key 避免硬編。

### C. 不在本輪範圍

- 不改 `/interventions` 的職責（不會加建立 persona 按鈕）。
- 不動 BFF 合約；BE 缺的 update/archive 端點走 writeOverlay fallback。
- 不改其他 Oversight 頁（One Ring / Persona Fleet / Trading Pulse）— 它們已有自己的空狀態。

## 技術細節

- 既有：`EntityCreateDrawer`、`writeOverlay.add/softDelete`、`PermissionAwareButton`、`HighRiskConfirm`、`EmptyState`、`usePermissions`、`buildEntity` — 全部沿用。
- 新增檔案：`src/management/components/write/updateEntity.ts`、`src/management/components/detail/EntityActionsBar.tsx`。
- 修改檔案：`PersonaDetail.tsx`、`ObjectDetailLayout.tsx`、`ObjectListPage.tsx`、`EntityCreateDrawer.tsx`、`createEntity.ts`、`Interventions.tsx`、`Cockpit` 側欄、`i18n` 字串。
- i18n：補 zh-TW / en，例 `registry.actions.delete`、`registry.actions.deleteConfirm`、`oversight.empty.interventions.title/desc/cta`、`nav.section.oversightHint`、`nav.section.registryHint`。
- 測試：PersonaDetail edit/delete 行為加 1 個 vitest；Interventions 空狀態加 1 個 RTL smoke。

## 驗收

- `/management/personas/:id` 看得到可運作的 Edit + Delete（含權限 disable + 二次確認）。
- `/management/interventions` 0 件時顯示導引卡 + 跳轉 CTA，不再是空白「無資料」。
- 11 個其他 Registry Detail 至少有共用 EntityActionsBar（即使 BE update API 未上，UI 動作會以 overlay 寫入並 toast 提示「將於 BFF 上線後同步」）。
- 366 既有測試保持綠燈；新增 2 個測試通過。
