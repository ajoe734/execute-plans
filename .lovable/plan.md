
# Plan: 套用 2026-05-07-C Planner Disposition + 合併產出 B+C Final Spec

Planner 已 APPROVED 全部 8 條 follow-up（C.1/C.3 Modify、其餘 Accept / Accept-with-clarification）。本輪：spec/docs only，不動 `src/`。

## 產出

### 1. `/mnt/documents/Pantheon_BFF_Contract_Spec_2026-05-07-C_Planner_Disposition.md`
直接落 user 上傳的 disposition 全文到 documents（artifact 鏡射），方便後續引用。

### 2. `/mnt/documents/Pantheon_BFF_Contract_Spec_2026-05-07_Final.md`（B+C merged）
以 base 2026-05-07 + B patch 為底，套用 C disposition 的 8 點修正後的「可交給後端的 final 版」：

- **C.1 §3/§5** — `ActionCommandStatus = "accepted" | "queued" | "completed"`；移除 `requires_*` success status；`CONFIRM_TOKEN_REQUIRED` 走 428 / `APPROVAL_REQUIRED` 與 `TWO_MAN_REQUIRED` 走 409，全部用 `BffErrorEnvelope`。新增 `APPROVAL_REQUIRED` 進 ErrorCode master（Pack D D21 補登）。
- **C.2 §5.2 + 全 write/action** — body `idempotencyKey` 全部移除，改 `Idempotency-Key` HTTP header；列出受影響 7 個 request type（ActionCommand / InterventionDecision / ExecuteRemediation / ConfirmToken / TwoManSign / AuditExport / Bulk decision）。
- **C.3 §3.2** — `CommandResponse<T>.data: T` 必填，無 payload 用 `CommandResponse<null>`；錯誤一律 non-2xx `BffErrorEnvelope`；`BulkActionResponse.results[]` 是唯一例外（per-item ok）。
- **C.4 §8.3** — SSE catalog 補 `approval` / `ask` 兩 channel：完整 event union（`approval.created/stage.changed/decided/sla.escalated`、`ask.session.started/message.delta/tool.called/message.completed/session.completed/session.failed`）+ replay / resync endpoint / auth scope。
- **C.5 §5.3** — 明示「BFF action table = canonical；v4 `ActionDescriptor` = frontend DTO target；v3 `availableActions` = back-compat only」+ 三階段對齊機制（manual → codegen → CI lint）+ 留下 frontend contract test 的 placeholder。
- **C.6 §2/§4.3** — MCP Tool 不獨立 create；新增 `POST /bff/mcp-servers/{id}/import-tools` + `McpToolImportRequest/Response`；列出 grant / revoke / disable / test 4 endpoints；`McpToolCreateInput` 標 future / not v1。
- **C.7 §2.2 + §15** — 新增 `EvidenceKind → Capability` 對照表（15 條）+ `RedactedEvidenceRef` DTO + 「return redacted refs, do not silently omit」規則。
- **C.8 §6.3** — `PATCH /bff/agora/journal/{id}` body 鎖 `application/merge-patch+json` (RFC 7396)；定義 `JournalEntryMergePatch` shape + validation + audit `before/after diff` 要求；保留 future `application/json-patch+json` upgrade path。

### 3. `.lovable/feedback/2026-05-07-C/INDEX.md`（更新）
- 狀態：`BLOCKER` → `RESOLVED`。
- 加 disposition artifact 路徑、Final spec artifact 路徑。
- 解除「B patch blocked」標記，註記「B+C merged final 已產出，可交後端 P0 review」。

### 4. `.lovable/feedback/2026-05-07-B/INDEX.md`（更新）
- 加一行：「Superseded by `2026-05-07_Final.md` (B+C merged, applies C disposition)」。
- 列出 C disposition 改動的 8 個 §（避免後端誤抓 B 單版）。

### 5. `mem://index.md` Core 補一行
> BFF Contract: 後端 handoff source = `2026-05-07_Final.md` (B+C merged, C disposition applied)；C 8 條 follow-up RESOLVED；Idempotency-Key = HTTP header；`CommandResponse<T>.data` required；`requires_*` 走 BffErrorEnvelope (428/409)；MCP Tool 不獨立 create。

## 不做

- 不動 `src/` 任何檔案（需要時下一輪 Pack D Batch V 再實作 ErrorCode 補 `APPROVAL_REQUIRED` / SSE channel runtime / EvidenceKind capability map）。
- 不改 Pack D canonical 檔（待 H 版 Pack 升級時一起更新 Permission Contract、SSE Contract、ErrorCode master）。
- 不做 OpenAPI / AsyncAPI 產出（planner §12 列為下一批 H 版工作）。

## 後續（不在本 plan）

- Pack D refresh：把 C disposition 的 `APPROVAL_REQUIRED`、`approval`/`ask` SSE channel、EvidenceKind capability map 灌回 Pack D D21 / SSE Contract / Permission Contract。
- `src/lib/v4/errorCodes.ts` 補 `APPROVAL_REQUIRED`（一行 enum + i18n key）。
- BFF code 端：runAction / overlay / writeOverlay 改成 header-based idempotency（目前是函式參數，不是 HTTP，所以非 blocker）。
