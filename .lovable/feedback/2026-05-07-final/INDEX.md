# 2026-05-07 BFF Contract — Final (B+C merged)

- File: `Pantheon_BFF_Contract_Spec_2026-05-07_Final.md` (this directory)
- Mirror: `/mnt/documents/Pantheon_BFF_Contract_Spec_2026-05-07_Final.md`
- Status: **CANDIDATE FINAL** — pending reviewer (ChatGPT) re-confirm

## C.1–C.8 Coverage Check (verified in Final)
- C.1 ✅ `ActionCommandStatus = "accepted" | "queued" | "completed"`；`requires_*` 移除 success status，全走 `BffErrorEnvelope` (428 / 409)
- C.2 ✅ `Idempotency-Key` HTTP header；body 不再含 `idempotencyKey`
- C.3 ✅ `CommandResponse<T>.data` required（無 payload 用 `CommandResponse<null>`）
- C.4 ✅ SSE 補 `approval` / `ask` channel + replay/resync/scope
- C.5 ✅ BFF action table = canonical；v4 ActionDescriptor = frontend；v3 = legacy
- C.6 ✅ `POST /bff/mcp-servers/{id}/import-tools`；McpTool 不獨立 create
- C.7 ✅ EvidenceKind → Capability map + `RedactedEvidenceRef`
- C.8 ✅ `PATCH /bff/agora/journal/{id}` 鎖 `application/merge-patch+json` (RFC 7396)
- Agora 路由 ✅ 全部 `/bff/agora/...`
- HIQ canonical ✅ `/bff/v5/interventions`

## Wording Fix Applied
- Disposition 表格 C.1 rationale 原句「asynchronous accepted command 可回 `requires_approval` 作 accepted outcome」**已刪除**，改為「success 一律 `accepted`/`queued` 並附 `approvalId`/`jobId`，preconditions missing 一律 non-2xx `BffErrorEnvelope`」。Final 正文 §2 已自始正確（line 38–48），無需改動。

## Out-of-Scope（不阻塞 Final 定案，留下一輪）
- API versioning header `X-BFF-Api-Version`（reviewer 提出）：Final 未明寫，建議 D 輪併入 Pack D BFF API Contract 統一處理。
- Pack D D21 補 `APPROVAL_REQUIRED`；SSE Contract 補 `approval`/`ask`；Permission Contract 補 EvidenceKind map — 已記於 plan「後續」。
- OpenAPI / AsyncAPI 產出 — 留 H 版。
