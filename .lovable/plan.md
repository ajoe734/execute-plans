
# Pack F 實作計畫

Pack F Disposition 已完整看過。Pack F = **Write Intent + IA Boundary + QA Semantics** 修正包。本份計畫嚴格依 disposition §6 切分，並對齊既有檔案結構（`src/lib/v5/overlay.ts` 已存在 action overlay，但 disposition 要求另立 entity-write overlay；兩者不混用）。

---

## F0 — 落 disposition 檔案

新增：
- `.lovable/feedback/2026-05-06-F/Pack_F_Disposition.md`（從 user-uploads 複製）
- `.lovable/feedback/2026-05-06-F/Pack_F_Disposition.csv`（取自 §8）

更新：
- `.lovable/audits/INDEX.md` — Audit F 狀態改 `RESOLVED by Pack F (disposition received)`
- `.lovable/spec/INDEX.md` — 加 Pack F feedback 路徑
- `mem://index.md` Core — 改寫 Audit F 段，標記 disposition 已收到、Pack F implementation in progress
- `mem://audits/open-gaps` — Audit F 4 條移到 RESOLVED 區

---

## F1 — Write-Intent 基礎建設

新增：
- `src/lib/writeIntents/types.ts` — `CreatableEntity`、`BaseCreateInput`、9 個 Per-entity `*CreateInput`、`CreateIntentResult<T>`、`EntityUpdateInput<T>`、`CreateBehavior` discriminated union（依 §2.4 / §2.5 / §2.6 / §2.8）
- `src/lib/writeIntents/createDefaults.ts` — 各 entity 預設值（state=draft、risk default、shadow mode 等）
- `src/lib/writeIntents/validation.ts` — pure validator（回 `{ ok, errors }`），覆蓋 §2.5 各條 validation 規則
- `src/lib/bff/writeOverlay.ts` — entity-level overlay（與 `src/lib/v5/overlay.ts` action overlay **分檔**，避免 v5 memory 規則衝突）：
  - `MockWriteOverlay`：`created/updated/deleted` per `CreatableEntity`
  - TTL 30 分鐘、refresh 清空
  - export `mergeOverlay(seed, kind)` 給 list loaders
  - 每次 mutate emit `audit` event + realtime data event（透過既有 `src/lib/bff/realtime.ts`）
- `src/lib/writeIntents/__tests__/validation.test.ts` + `writeOverlay.test.ts`

新增 UI：
- `src/management/components/write/EntityCreateDrawer.tsx` — 統一 drawer，依 `CreatableEntity` render 對應欄位（switch render，內部組件分檔），submit → validation → overlay → toast → realtime emit

---

## F2 — ObjectListPage + 9 個 list 接 createBehavior

調整：
- `src/management/pages/ObjectListPage.tsx`
  - 新增 `createBehavior?: CreateBehavior` prop
  - Render 規則依 §2.8（undefined / drawer / redirect / disabled）
  - 順手把 `Button` ref 鏈修正（解 F02 forwardRef warning，§3.2）
  - Loader 走 `mergeOverlay(loader, kind)`
- `src/management/pages/Lists.tsx` — 9 個 list 各自宣告 `createBehavior`：

| List | Behavior |
|---|---|
| Personas | drawer:`persona` |
| Strategies | drawer:`strategy` |
| Capital Pools | drawer:`capitalPool` |
| Research | drawer:`researchExperiment` |
| Artifacts | drawer:`artifact` |
| Ranking Formulas | redirect → Formula Studio（intent=`create`） |
| Rebalances | redirect → Optimization loop（intent=`create`） |
| Deployments | drawer:`deployment` |
| Evolution | drawer:`evolutionProgram` |

驗收依 §2.9：no-op 全消、create 成功 list 立即可見、toast、audit、realtime、validation error 顯示、高風險 create 不直接 live。

---

## F3 — IA Boundary（registry vs loop view）

依 §4.2 / §4.3 / §4.4：

- `src/App.tsx` 路由保持 `/management/personas` = `PersonasList`（已是現況），確認 `PersonaHealthMatrix` **不被掛在** `/management/personas`。檢查並（若有）移除任何 v5 PersonaHealthMatrix 對 `/management/personas` 的 hijack。
- 把 `PersonaHealthMatrix` 整合進 `/management/loops/execution` 的 `?focus=personas` query view（在 `ExecutionLoopPage` 加 query-driven panel switch）。
- `src/platform/components/SideNav.tsx` 與 i18n locales：
  - Multi-Persona System 群組下 label 改成 `Persona Registry` / `Persona 列表`
  - Execution Loop 群組新增 `Persona Trading Health` → `/management/loops/execution?focus=personas`
  - 同步 strategies / deployments 採 registry-vs-loop 命名
  - 若同 route 出現在兩個 nav group，加 `dedupeKey` 或差異化 label

---

## F4 — Console clean

- 把 `ObjectListPage` / `CapitalPoolsList` 中傳給 Radix `asChild` / Tooltip / Slot 的 wrapper 包 `React.forwardRef`
- 跑 `bunx vitest run` + 手動進 `/management/capital`、`/management/strategies`、`/management/personas` 確認 console 無 `Function components cannot be given refs` warning

---

## F5 — Smoke report taxonomy

新增：
- `/mnt/documents/PackF_Smoke_Report_2026-05-06.md`，採用 §5.3 五級標籤（read-path-clean / write-path-clean / loop-action-clean / console-warning-clean / full-regression-clean）
- 跑 §5.4 11 條 checklist
- 不再單獨使用無限定語的 `regression-clean`

---

## 不會做的事

- 不改 `src/lib/v5/overlay.ts`（v5 action overlay 與 entity write overlay 分檔，避免破壞既有 18 個 v5 test）
- 不寫真正後端 CRUD contract（v0 mock only）
- 不刪 v5 PersonaHealthMatrix 元件本身，只搬 IA 入口
- 不重發 Pack E smoke report

---

## 技術備註

- Test：新增 validation / overlay / drawer 單元測試；既有 v5 18 tests + v4 tests 應保持綠燈
- Overlay 命名衝突防範：`src/lib/bff/writeOverlay.ts`（entity）與 `src/lib/v5/overlay.ts`（v5 action）為不同概念，import 路徑差異即可區分
- audit event：透過既有 `src/lib/bff/persistence.ts` / `realtime.ts` 機制，不新建 audit pipeline
- i18n：所有新 label 必走 i18n key，`scripts/check-i18n.ts` 須通過

預估 1 個 build loop 內完成。
