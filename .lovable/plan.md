## 你說得對 — 這是 UI 誤導

Pack D StateMachine Contract 明定 persona 只能走 `retired`（terminal、可審計），**沒有物理刪除**。但 UI 在兩個地方放了「刪除」按鈕，按了之後呼叫 `deleteEntity('persona', ...)`，BE 沒有對應端點，所以才會出現你看到的「Accepted 但實際刪不掉」。

這是 FE 的鍋，不是 BE 鎖死——是按鈕本來就不該存在。

## 修法（純 UI / 文案，不動 business logic）

### 1. `src/management/pages/PersonaDetail.tsx`
- 移除 `<Trash2 /> 刪除` 按鈕與 `AlertDialog`、`deleteOpen`、`deleting`、`deleteEntity` import
- 既有的「Suspend」按鈕旁新增 **「Retire（封存）」** 按鈕：
  - 走 `HighRiskConfirm` → `runPersonaAction(p.id, 'retire', { memo, confirmToken })`
  - 文案說明：「封存後 persona 進入 retired 終態，保留審計軌跡 7 年；不可物理刪除。若要替換請使用 Fork from Retired。」

### 2. `src/management/pages/PersonaFleet*`（Registry 列表）
- 找列表 row action 的「刪除」icon → 換成「Retire」
- 同樣走 `runPersonaAction(id, 'retire', ...)` + HighRiskConfirm
- 加狀態 filter：預設隱藏 `retired` / `deprecated`，提供 toggle「顯示已封存」

### 3. `src/management/components/write/createEntity.ts`
- `deleteEntity('persona', ...)` 改 throw 明確錯誤：「Persona 不支援刪除，請改用 retire。」避免其他地方誤用
- 其他 entity（strategy/capital_pool…）若 spec 同樣只能 retire，下一輪再一起收

### 4. i18n
- 新增 `persona.ops.retire` / `persona.ops.retireConfirm` / `registry.filter.showRetired`
- 移除 `registry.delete.title` / `registry.delete.desc` 的 persona 使用

### 5. Agent 工具（management-agent/index.ts）
- 移除（或不註冊）任何 `delete_persona` 工具引用
- 新增 `retire_persona`（`needsApproval: true`）→ `POST /bff/actions/persona/{id}/retire`
- System prompt 加一句：「Persona 為審計實體，僅能 retire，不能 delete。」

### 6. 文檔
- `.lovable/audits/persona-no-delete-2026-05-28.md` 一頁說明：spec 鎖、UI 修正、retire vs fork 流程

## 不做的事
- 不嘗試打通物理刪除（違反 D02 + audit immutability，會破壞 evidence chain）
- 不動 BE / 不發 migration
- 不改其他 entity 的 delete UI（本輪只收 persona；其餘下一輪盤點）

## 驗收
1. PersonaDetail 沒有紅色刪除按鈕，改為 Retire
2. Fleet 列表 row action 同步
3. 點 Retire → HighRiskConfirm → BFF `POST /bff/actions/persona/{id}/retire` → 列表 refresh 後該 persona 從預設視圖消失（toggle 後可見、state=retired）
4. Agent 在 confirm/agent 模式下被要求「刪除 persona X」會回覆「persona 僅能 retire」並提工具 `retire_persona`

要我進入 build 模式按這個計畫做嗎？