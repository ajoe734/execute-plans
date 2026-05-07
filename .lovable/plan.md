# BFF Contract v1 — Freeze & Commit Plan

## Goal
把驗證通過的 4 份 BFF handoff 檔案落入 repo、標記為 FROZEN，並把 3 個 nice-to-have 登記到 H 版 follow-up backlog。

## Actions

### 1. Commit handoff bundle to repo
Copy 4 uploaded files into `.lovable/feedback/2026-05-07-final/`：
- `Pantheon_BFF_OpenAPI_3_1.yaml`
- `Pantheon_BFF_AsyncAPI_SSE.md`
- `Pantheon_BFF_DTO_Catalog.md`
- `Pantheon_BFF_Backend_Handoff.md`

並同步鏡像到 `/mnt/documents/` 方便下載。

### 2. Update `.lovable/feedback/2026-05-07-final/INDEX.md`
- Status: `CANDIDATE FINAL` → **`FROZEN — v1 BFF Contract`**
- 列出 4 份 handoff 檔案 + 結構驗證結果（94 paths / 102 schemas / 28 SSE channels / C.1–C.8 全綠）
- 附「H 版 follow-up」section 指向新建 backlog 檔

### 3. Create `.lovable/feedback/2026-05-07-final/H_VERSION_BACKLOG.md`
登記 3 條非阻塞 follow-up：
1. `X-BFF-Api-Version` global header（OpenAPI servers / parameters）
2. Pack D D21 ErrorCode master 補 `RESOURCE_NOT_FOUND`
3. OpenAPI 抽出 named `ActionCommandStatus` schema 對齊 DTO Catalog

### 4. Update `mem://index.md` Core
把 BFF handoff source 從 single Final.md 改為 4-file bundle，狀態改 `FROZEN v1`。

## Out of scope
- 任何 `src/` code 改動（留 Pack D Batch V）
- Pack D 7 份 canonical contract 修改（留 H 版）
- 真實 BFF client 實作

## Acceptance
- 4 份檔案在 repo `.lovable/feedback/2026-05-07-final/` 可見
- INDEX 標 FROZEN
- H_VERSION_BACKLOG.md 存在且列 3 項
- memory index Core 更新
