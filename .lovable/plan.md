## 目標

完成上一輪盤點中的「FE 端可推進」第 2、3 項：
1. 清掉 `src/lib/v5/types.ts` 唯一的 TODO hook 文字
2. 推進 Batch VII migration — 把 v5 頁面（最新、最 spec-aligned）的 BFF 入口統一到 `@/lib/bff-v1`，砍掉 `@/lib/bff/v5` 的直接引用。

## 範圍判定

審計後的事實：
- 0 個檔案還在直接 import 老路 (`@/lib/bff/client` / `@/lib/bff/runAction` / `@/lib/useLiveList`) — Batch VII soft 層已收尾。
- 剩下的 81 個 `bff.*` call sites（management/agora/studios）並非「legacy」殘留，而是在用已正名的 mock seed accessor（`bff-v1/seed.ts`），這要等 typed v1 surface 對每個 entity 補齊才能逐一替換 — **不在本輪範圍**。
- 真正可立即收斂的是 **v5 surface**：5 個頁面直接 `import { bff } from "@/lib/bff-v1"` 然後呼叫 `bff.v5.*`（v5 façade 來自 `src/lib/bff/v5.ts`）。把它再透過 `bff-v1` re-export 一次，所有 v5 頁面就只需經 `@/lib/bff-v1` 一個 entrypoint。

## 變更計畫

### Step 1 — TODO 收尾（10 min）

`src/lib/v5/types.ts` L18 註解 `capabilities preserved as TODO hook` → 改為明確 disposition 註記：「Q13 — role-based gating canonical；capability-based gating 待 Permission Contract backport（A2）後接入 `EVIDENCE_CAPABILITY_MAP`，無 FE 行動」。同時 grep 一遍 src/，確認沒有其他遺漏 TODO。

### Step 2 — v5 façade 收斂到 bff-v1（30 min）

A. 在 `src/lib/bff-v1/index.ts` 加入：
```ts
export { v5 } from "./v5";
```
B. 新增 `src/lib/bff-v1/v5.ts`，re-export `src/lib/bff/v5.ts` 的 `v5` namespace（不改實作，只搬入口）。

C. 修改 5 個 v5 頁面 + LoopRunDrawer + V5Pages（共 ~6 檔），把：
```ts
import { bff } from "@/lib/bff-v1";
... bff.v5.controlRoom.get();
```
改為：
```ts
import { bffV1 } from "@/lib/bff-v1";
... bffV1.v5.controlRoom.get();
```
（或保留 `bff.v5.*` 直到 typed surface 對每個方法補齊；偏好 `bffV1.v5.*` 以維持 `@/lib/bff-v1` 單一入口慣例。）

D. 更新 `.lovable/audits/batch-vii-migration.md` 加 `## VII-c — v5 surface consolidation (2026-05-09)` 段，註明 5 v5 surface 完成、剩 management/agora/studios 待 typed surface 擴張後再分批。

### Step 3 — 驗證

- `bunx vitest run` 必須維持 **366/366 green**。
- 確認 v5 五頁在 mock 模式下渲染正常（不開 browser，靠既有 axe + 單元測試覆蓋）。

## 不做（明確 out of scope）

- 不重寫 `bff.v5.*` 實作（FROZEN，只搬位置）
- 不動 management/agora/studios 的 ~76 sites — 等 typed v1 surface 對每個 entity 補齊（`bffV1.lists.list("strategies")` 等）後再分批，本輪不啟動。
- 不動規格 markdown / DTO / route slug。
- 不切換 `VITE_BFF_MODE=live`（後端 39/43 endpoint 未上線）。

## 驗收

- 0 個 v5 頁面還用 `bff.v5.` 直接路徑（全走 `bffV1.v5.`）
- v5/types.ts 0 個 TODO 字串
- 366/366 tests green
- audit 更新到 batch-vii-migration.md