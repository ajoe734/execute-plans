# Plan: BFF Contract Patch 2026-05-07-C Follow-up Questions

選項 B：先回 planner，等 disposition，spec 一次到位、不留小債。

## 產出

**1. `/mnt/documents/Pantheon_BFF_Contract_Spec_2026-05-07-C_Followup_Questions.md`**

結構：

- **Header** — 對 base 2026-05-07 + patch 2026-05-07-B 的 follow-up；列出 8 個待裁示項，請 planner 以 Accept / Modify / Reject + rationale 回應。
- **§C.P0 — 規範內部矛盾（3 條，blocker）**
  - C.1 `ActionCommandResponse.status` 與 `ErrorCode` 雙軌定義 `requires_confirm_token` / `requires_approval`：建議改成「失敗一律走 `BffErrorEnvelope` + `CONFIRM_TOKEN_REQUIRED` / `TWO_MAN_REQUIRED`」，刪除 success-path 的 `requires_*` status。附 before/after TS snippet。
  - C.2 §7.6 two-man-sign request 把 `idempotencyKey` 放 body：違反 §5.2 / Pack D D23 既定的 `Idempotency-Key` HTTP header 慣例。建議移到 header；body 只留 business payload。
  - C.3 §3.2 `CommandResponse.data?: T` 改為 optional：與 v4 envelope `data: T` (required) 衝突，會破壞所有 BFF client narrow type。請確認意圖；若是為了 error case 不帶 data，建議改成 discriminated union (`{ ok: true; data: T } | { ok: false; error: BffErrorPayload }`)。
- **§C.P1 — 缺漏（3 條）**
  - C.4 SSE catalog (§8.3) 缺 `approval` 與 `ask` channel：`ApprovalRequest.stages[]` 多階段 stage 變化、`AskPersonas` streaming response 都沒對應 channel。提議補表格列：channel name / payload shape / replay policy / auth scope。
  - C.5 Action table (§5.3) 與 `src/lib/v3/availableActions.ts` / `src/lib/v4/actionDescriptor.ts` 來源衝突未明示。請宣告 spec table = canonical，前端 TS 必須對齊；並列出對齊機制（codegen 或 lint）。
  - C.6 §4.3 EntityCreate 缺 `McpToolCreateInput`：§2.2 已加 `McpToolDTO`、§5.3 列了 MCP Tool grant/revoke actions，但 create payload 只有 `ToolCreateInput`。請補或明示「MCP Tool 不支援獨立 create，只能透過 McpServer discover」。
- **§C.P2 — 一致性（2 條）**
  - C.7 `EvidenceKind` 擴增到 15 種（§2.2 加了 `journal`/`postmortem`/`signal`）：請與 Pack D Permission Contract (`Pantheon_Pack_D_Permission_Contract.md`) 交叉驗證，確認 RBAC capability 涵蓋這些新 evidence kind，避免 UI 顯示但 RBAC 拒絕。
  - C.8 §6.3 `PATCH /bff/agora/journal/{id}` body 格式未指定：planner 把 JSON Patch vs Merge 歸 P2 deferred，但既然 endpoint 已經出現 PATCH，建議至少先鎖 default = **JSON Merge Patch (RFC 7396)**，正式選型後再升級。
- **§C.Disposition Template** — 給 planner 填的格子：`Item / Decision (Accept|Modify|Reject) / Rationale / Spec section to update`。
- **§C.Cross-ref**
  - Pack D D17–D32（BFF API + Permission contract）
  - `src/lib/v4/errorEnvelope.ts`、`src/lib/bff/types.ts`、`src/lib/v3/availableActions.ts`
  - 既有 `Pantheon_BFF_Contract_Spec_2026-05-07-B.md` §3.2 / §5.2 / §6.3 / §7.6 / §8.3

**2. `.lovable/feedback/2026-05-07-C/INDEX.md`**

- Artifact path / scope / 8 items 一覽 / 等 planner disposition / blocker for patch apply。

## 不做

- 不修改 Spec B 檔案、不改任何 `src/` 程式碼。
- 不更新 memory（等 planner 回覆後再一次更新）。
