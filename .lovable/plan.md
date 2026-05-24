# 一次收乾淨 BFF Backend Gap Delta 2026-05-24

## 背景
- 2026-05-24 第二輪 live probe 已寫入 `.lovable/audits/bff-backend-gap-2026-05-24-delta.md`（7142 bytes，在 sandbox 內已存在）
- GitHub 上看不到 = Lovable→GitHub 同步落後或檔案沒被 git 追蹤，不是沒寫
- `mem://index.md` 還只記 2026-05-23 baseline，沒指到新的 delta 檔
- `.lovable/audits/INDEX.md` 也沒登錄 BFF backend gap 系列

## 一次做完的事

### 1. 驗證 git 真的有追蹤檔案
- `git ls-files .lovable/audits/bff-backend-gap-2026-05-24-delta.md`
- `git status .lovable/audits/`
- 若未追蹤 → 確認沒被 `.gitignore` 擋；Lovable build mode 寫檔預設會自動 commit/push，回報結果

### 2. 更新 `mem://index.md`
把 Core 區最後一行從：
```
BFF Backend Gap 2026-05-23 — ...：~87 條 canonical path 中後端已實作 4 條；P0/P1 共 76 條缺漏 + CORS + `/openapi.json` 500
```
改為涵蓋 2026-05-24 delta 的最新狀態：
- 2026-05-24 live probe：~62/87 已實作，剩 26 條缺漏（1 P0 + 24 §8/§9 mgmt + 1 confirm-token GET）
- 新增 1 條 schema 偏差（error envelope 多包 `detail`，缺 `meta.correlationId`）
- CORS 仍全 broken；`/openapi.json` 已修好
- 指向 `.lovable/audits/bff-backend-gap-2026-05-24-delta.md` 為最新 SoT

### 3. 更新 `.lovable/audits/INDEX.md`
在表格底下新增一節「BFF Backend Live Probe 系列」，列出兩份：
- `bff-backend-gap-2026-05-23.md`（baseline）
- `bff-backend-gap-2026-05-24-delta.md`（latest，SUPERSEDES baseline 的數字）

### 4. 清理 `.lovable/plan.md`
目前 plan.md 還是「Pack BE-Gap-Delta-v2」的暫存計畫描述，已執行完。改寫成一行 done note 或清空，避免下次誤導。

### 5. 回報
告訴你：
- 檔案 git 追蹤狀態
- 三個 markdown 異動點各別 diff 摘要
- 如果 GitHub 仍沒看到，給你具體排查步驟（branch / GitHub 連線 / 重整）

## 不動的東西
- FE 程式碼（`src/`）0 改動
- 已 LANDED 的 spec backport、Pack D contracts、bff-v1 不動
- 後端要做的 26 條缺漏 + CORS 修法，沿用 delta 文件裡的清單，不重複貼

## 預估
4 個檔案異動 + 2 個 git 檢查 command，一個 turn 內收掉。
