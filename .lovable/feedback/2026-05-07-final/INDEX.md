# 2026-05-07 BFF Contract — FROZEN v1

**Status**: ✅ **FROZEN — v1 BFF Contract**（backend handoff bundle complete）

## Handoff Bundle（4 份 canonical files）
| File | Purpose |
|---|---|
| `Pantheon_BFF_Contract_Spec_2026-05-07_Final.md` | B+C merged narrative spec（最高優先） |
| `Pantheon_BFF_OpenAPI_3_1.yaml` | REST contract（94 paths / 102 schemas） |
| `Pantheon_BFF_AsyncAPI_SSE.md` | SSE / Realtime contract（28 channels） |
| `Pantheon_BFF_DTO_Catalog.md` | DTO 集中型別目錄 |
| `Pantheon_BFF_Backend_Handoff.md` | 後端實作分階段 + acceptance + open questions |

Mirror：`/mnt/documents/Pantheon_BFF_*`

## 結構驗證結果（C.1–C.8 全綠）
- C.1 ✅ `ActionCommandResponseData.status` enum = `accepted | queued | completed`；`ErrorCode` 含 `APPROVAL_REQUIRED` / `CONFIRM_TOKEN_REQUIRED` / `TWO_MAN_REQUIRED`；每個寫入 endpoint 都有 409 / 428 回應。
- C.2 ✅ Write/action endpoint 全部用 `IdempotencyKey` header parameter；spec 內 `idempotencyKey` 5 處皆為合法用途（error details / response field / ActionDescriptor flag），無 request body 殘留。
- C.3 ✅ `CommandResponse.required = [ok, data, correlationId]`，`data: {}` 允許 null。
- C.4 ✅ SSE catalog 含 `approval` / `ask` 兩 channel；`ask.message.delta` 有 `seq`，最終 transcript 走 REST。
- C.5 ✅ Backend Handoff §3.5 明確寫「BFF action table canonical, v3 availableActions legacy only」。
- C.6 ✅ `POST /bff/mcp-servers/{id}/import-tools` 存在；DTO Catalog §12 `McpToolImportRequest/Response`；§11 標 `McpToolCreateInput` 為 future-only。
- C.7 ✅ DTO Catalog §17 + AsyncAPI §9 均含 15 項 EvidenceKind→Capability map + `RedactedEvidenceRef`。
- C.8 ✅ `PATCH /bff/agora/journal/{id}` requestBody 鎖 `application/merge-patch+json`。

## C.1 wording fix（已套用）
Disposition 表格原「asynchronous accepted command 可回 `requires_approval` 作 accepted outcome」**已刪除**，改為「success 一律 `accepted`/`queued` 並附 `approvalId`/`jobId`，preconditions missing 一律 non-2xx `BffErrorEnvelope`」。

## H 版 follow-up（不阻塞 v1）
見 `H_VERSION_BACKLOG.md`：
1. `X-BFF-Api-Version` global header
2. Pack D D21 補 `RESOURCE_NOT_FOUND`
3. OpenAPI 抽出 named `ActionCommandStatus` schema

## 文件鏈
```
2026-05-07-B/INDEX.md   → P0+P1 patch（superseded）
2026-05-07-C/INDEX.md   → follow-up + planner disposition（RESOLVED）
2026-05-07-final/       ← 本目錄（FROZEN v1）
```
