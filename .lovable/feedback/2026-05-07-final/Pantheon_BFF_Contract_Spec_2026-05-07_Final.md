# Pantheon BFF Contract Spec — 2026-05-07 Final (B + C merged)

**版本**：2026-05-07 Final
**狀態**：Backend handoff ready — apply C disposition overrides on top of B patch
**基準文件**（按 conflict 順序，後者覆蓋前者）：

1. `Pantheon_BFF_Contract_Spec_2026-05-07.md` — base
2. `Pantheon_BFF_Contract_Spec_2026-05-07-B.md` — P0+P1 patch
3. `Pantheon_BFF_Contract_Spec_2026-05-07-C_Planner_Disposition.md` — 本文件 §2–§9 之 8 條 override（**最高優先**）

> 後端實作時：以 B patch 為主骨架，逐節對照本文件 §2–§9 的 override，發現衝突一律以本文件為準。
> 此檔不重寫 B 全文，只列 C disposition 必須蓋掉的差異 + 驗收 checklist。

---

## 1. C Disposition 摘要

| Item | Decision | Override 章節 |
|---|---|---|
| C.1 | Modify | §2 ActionCommandStatus / Precondition 一律走 BffErrorEnvelope |
| C.2 | Accept | §3 Idempotency-Key 移到 HTTP header |
| C.3 | Modify | §4 CommandResponse<T>.data 必填 |
| C.4 | Accept | §5 SSE 補 approval / ask channel |
| C.5 | Accept | §6 BFF action table = canonical |
| C.6 | Modify | §7 MCP Tool 不獨立 create，改 import |
| C.7 | Accept | §8 EvidenceKind → Capability map + Redacted ref |
| C.8 | Accept | §9 PATCH journal = JSON Merge Patch (RFC 7396) |

---

## 2. C.1 — ActionCommandStatus / Precondition Failure

**Override B §3.4 + §5.2。**

### 2.1 Canonical success status

```ts
type ActionCommandStatus = "accepted" | "queued" | "completed";
```

不得在 success status 內出現：`requires_confirm_token` / `requires_approval` / `requires_two_man`。

### 2.2 Precondition failures = non-2xx BffErrorEnvelope

| 情境 | HTTP | ErrorCode |
|---|---|---|
| 缺 confirm token | 428 Precondition Required | `CONFIRM_TOKEN_REQUIRED` |
| 缺 approval | 409 Conflict | `APPROVAL_REQUIRED` |
| 缺 two-man | 409 Conflict | `TWO_MAN_REQUIRED` |

`APPROVAL_REQUIRED` 為 **新增** ErrorCode，需登入 Pack D D21 ErrorCode master（見 §10 後續工作）。

### 2.3 範例

缺 confirm token：
```json
{ "error": {
  "code": "CONFIRM_TOKEN_REQUIRED",
  "i18nKey": "errors.CONFIRM_TOKEN_REQUIRED",
  "retryable": false, "userActionable": true,
  "correlationId": "corr_123",
  "details": { "kind": "confirm_token", "reason": "missing",
    "actionId": "strategy.promote_live", "entityType": "strategy", "entityId": "stg_001" }
}}
```

成功被 accepted 並建立 approval：
```json
{ "ok": true,
  "data": { "entityType": "strategy", "entityId": "stg_001",
    "actionId": "strategy.submit_review", "status": "accepted", "approvalId": "ap_001" },
  "auditEventId": "aud_001", "correlationId": "corr_126",
  "idempotencyKey": "idem_abc", "replayed": false, "lockVersion": 12 }
```

---

## 3. C.2 — Idempotency-Key 移到 HTTP Header

**Override B §5.2 / §7.6 與所有 write/action endpoint。**

### 3.1 Canonical rule

```
所有 write / action endpoint MUST 透過 HTTP `Idempotency-Key` header 傳入冪等鍵。
業務 request body MUST NOT 含 idempotencyKey 欄位。
```

### 3.2 受影響 request type（移除 body 欄位）

- `ActionCommandRequest`
- `InterventionDecisionRequest`
- `ExecuteRemediationRequest`
- `ConfirmTokenRequest`
- `TwoManSignRequest`
- `AuditExportRequest`（async export 場景）
- 所有 Bulk decision request

### 3.3 範例：two-man-sign

```http
POST /bff/v5/interventions/{id}/two-man-sign
Idempotency-Key: idem_...
X-Correlation-Id: corr_...
```

```ts
type TwoManSignRequest = {
  decision: "approve" | "reject";
  memo: string;
  confirmTokenId?: string;
  expectedVersion: number;
};
type TwoManSignResponse = CommandResponse<{
  interventionId: string;
  decision: "approve" | "reject";
  signatureId: string;
  approvalId?: string;
  completed: boolean;
}>;
```

---

## 4. C.3 — CommandResponse<T>.data 必填

**Override B §3.2。**

```ts
type CommandResponse<T> = {
  ok: true;
  data: T;                  // 必填；無 payload 用 CommandResponse<null>
  auditEventId?: string;
  correlationId: string;
  idempotencyKey?: string;
  replayed?: boolean;
  lockVersion?: number;
  message?: string;
};
```

錯誤一律 non-2xx `BffErrorEnvelope = { error: BffErrorPayload }`，**不**使用 `{ ok: false, error: ... }`。

唯一例外：`BulkActionResponse.results[]` 仍保留 per-item `ok / data? / error?`。

```ts
type BulkActionResponse<T> = {
  ok: boolean; partial: boolean;
  summary: { requested: number; succeeded: number; failed: number };
  results: Array<{ id: string; ok: boolean; data?: T; error?: BffErrorPayload }>;
};
```

---

## 5. C.4 — SSE 補 approval / ask channel

**Override B §8.3 SSE catalog。**

### 5.1 approval channel

```ts
type ApprovalEvent =
  | { type: "approval.created"; approvalId: string; kind: string;
      subject: string; riskLevel: string; at: string }
  | { type: "approval.stage.changed"; approvalId: string; stageName: string;
      state: "pending" | "approved" | "rejected" | "skipped";
      decidedBy?: string; at: string }
  | { type: "approval.decided"; approvalId: string;
      decision: "approved" | "rejected" | "changes_requested";
      decidedBy: string; at: string }
  | { type: "approval.sla.escalated"; approvalId: string;
      stageName: string; escalateTo: string; at: string };
```

| Field | Value |
|---|---|
| channel | `approval` |
| envelope | `SseEventEnvelope<ApprovalEvent>` |
| replay | 24h |
| resync | `/bff/approvals`、`/bff/v5/interventions` |
| auth scope | `approval.read` 或對應 linked entity capability |

### 5.2 ask channel

```ts
type AskEvent =
  | { type: "ask.session.started"; sessionId: string; personaIds: string[]; at: string }
  | { type: "ask.message.delta"; sessionId: string; messageId: string;
      personaId?: string; delta: string; seq: number; at: string }
  | { type: "ask.tool.called"; sessionId: string; toolName: string; callId: string; at: string }
  | { type: "ask.message.completed"; sessionId: string; messageId: string; at: string }
  | { type: "ask.session.completed"; sessionId: string; summary?: string; at: string }
  | { type: "ask.session.failed"; sessionId: string; errorCode: string; at: string };
```

| Field | Value |
|---|---|
| channel | `ask` |
| replay | best-effort within 24h；最終 transcript 走 REST |
| resync | `/bff/agora/ask/sessions/{id}` |
| auth scope | `agora.ask` / `persona.consult` |

### 5.3 Planner B4 control channels

Planner Response §B4 extends the final SSE catalog with five control
channels already present in the frontend runtime channel list.

| Channel | Envelope | Replay | Resync | Auth scope |
|---|---|---|---|---|
| `confirm_token` | `SseEventEnvelope<ConfirmTokenEvent>` | 24h | `/bff/confirm-tokens`, `/bff/confirm-tokens/{tokenId}` | `*` |
| `cooldown` | `SseEventEnvelope<CooldownEvent>` | 24h | affected entity action descriptor endpoint | `*` |
| `transition` | `SseEventEnvelope<TransitionEvent>` | 24h | affected entity detail/list endpoint | `*` |
| `rollback` | `SseEventEnvelope<RollbackEvent>` | 24h | `/bff/deployments`, `/bff/incidents` | `deployment.rollback` |
| `handoff` | `SseEventEnvelope<HandoffEvent>` | 24h | approval-linked handoff detail endpoint | `approval.read` |

### 5.4 完整 SSE channel catalog

```
strategy, persona, capital, deployment, job, risk, approval, audit,
artifact, runtime, mcp, skill, channel, tool, ranking, rebalance,
evolution, research, signal, inbox, journal, postmortem, ask, loop,
sentinel, intervention, confirm_token, cooldown, transition, rollback,
handoff, system
```

---

## 6. C.5 — BFF Action Table 為 Canonical

**Override B §5.3。**

### 6.1 Source-of-truth 順序

1. **BFF Contract Action Table** — backend-facing canonical（action id / endpoint / risk / approval / confirm-token / two-man / cooldown / idempotency）。
2. **`src/lib/v4/actionDescriptor.ts` `ActionDescriptor`** — frontend runtime DTO target；BFF 必須 emit 與此型別相容的 `ActionDescriptor[]`。
3. **`src/lib/v3/availableActions.ts`** — back-compat only，**禁止**新增 canonical action。
4. **legacy `availableActions: string[]`** — deprecated。

### 6.2 規範文字（須加入 B §5.3）

> The action table in this BFF contract is canonical for backend implementation.
> BFF MUST emit `ActionDescriptor[]` compatible with v4 `ActionDescriptor`.
> v3 `availableActions.ts` remains a compatibility adapter and MUST NOT introduce new canonical actions.
> Any new action ID must be added to the BFF contract first, then mapped to v4 `ActionDescriptor`.

### 6.3 對齊機制（三階段）

```
Phase 1: 手動 table + TypeScript test fixture
Phase 2: 從 BFF action catalog (JSON/YAML) codegen 出 frontend descriptor fixtures
Phase 3: CI lint 禁止 UI 出現 BFF catalog 未列的 action id
```

### 6.4 必備 frontend contract test（placeholder）

```ts
describe("BFF action catalog alignment", () => {
  it("every BFF action id maps to a v4 ActionDescriptor id", () => {});
  it("no UI action id is missing from BFF action catalog", () => {});
});
```

---

## 7. C.6 — MCP Tool 不獨立 Create

**Override B §2.2 / §4.3 / §5.3。**

### 7.1 Canonical rule

> MCP Tool 在 v1 不支援獨立 create UI；由 MCP Server schema discovery / import 產生。

### 7.2 Endpoints

```http
POST /bff/mcp-servers/{id}/import-tools
POST /bff/mcp-tools/{id}/grant
POST /bff/mcp-tools/{id}/revoke
POST /bff/mcp-tools/{id}/disable
POST /bff/mcp-tools/{id}/test
```

### 7.3 Import DTO

```ts
type McpToolImportRequest = {
  schemaUrl?: string;
  schemaJson?: unknown;
  memo?: string;
};
type McpToolImportResponse = CommandResponse<{
  serverId: string;
  imported: McpToolDTO[];
  skipped: Array<{ name: string; reason: string }>;
}>;
```

### 7.4 Future（非 v1 canonical）

```ts
type McpToolCreateInput = {
  serverId: string; name: string; description?: string;
  inputSchema: unknown; outputSchema?: unknown;
  scope: "read" | "write" | "destructive";
  envGrants: Array<"research" | "paper" | "live">;
  memo?: string;
};
```

標註：**status: future / not v1 canonical**。

---

## 8. C.7 — EvidenceKind → Capability Map

**Override B §2.2 + 補 §15。**

### 8.1 Capability map

| EvidenceKind | Required capability |
|---|---|
| alert | `risk.alert.read` |
| incident | `risk.incident.read` |
| job | `job.read` |
| audit | `audit.read` |
| metric | `metric.read` |
| strategy | `strategy.view` |
| persona | `persona.view` |
| deployment | `deployment.read` |
| runtime | `runtime.read` |
| policy | `policy.read` |
| approval | `approval.read` |
| artifact | `artifact.read` |
| signal | `agora.signal.read` |
| journal | `agora.journal.read` |
| postmortem | `postmortem.read` |

> 命名遵循 Pack D D16 `lowercase dot.case`、case-sensitive。

### 8.2 RedactedEvidenceRef

```ts
type RedactedEvidenceRef = {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: "INSUFFICIENT_CAPABILITY";
  requiredCapability: Capability;
};
```

UI 文案：`evidence.redacted.insufficientCapability`。

### 8.3 Backend 行為

```
偏好：return redacted evidence refs（不要靜默省略）。
若必須過濾，回 envelope 同時帶 redactedCount。
```

---

## 9. C.8 — PATCH `/bff/agora/journal/{id}` 鎖定 JSON Merge Patch

**Override B §6.3。**

### 9.1 Canonical request

```http
PATCH /bff/agora/journal/{id}
Content-Type: application/merge-patch+json
Idempotency-Key: idem_...
```

```ts
type JournalEntryMergePatch = Partial<{
  title: string;
  body: string;
  tags: string[];
  linkedStrategyIds: string[];
  linkedPersonaIds: string[];
  visibility: "private" | "team" | "tenant";
}>;
```

Response：`CommandResponse<DecisionJournalEntryDTO>`

### 9.2 Validation

```
title:      若有，1–160 chars
body:       若有，max 20000 chars
tags:       若有，每個 tag = lowercase dot.case 或 slug
visibility: 必須符合 user capability
```

### 9.3 Audit

```
action  = agora.journal.update
target  = journalId
required: before/after diff、correlationId
```

### 9.4 Future upgrade path

如後端需要精確 list mutation，未來可加：

```http
PATCH /bff/agora/journal/{id}
Content-Type: application/json-patch+json
```

但 default 保持 merge patch (RFC 7396)。

---

## 10. 驗收 Checklist（後端 P0 review 用）

- [ ] B patch 全 7 處 `idempotencyKey` body 欄位已移除，全部改 header。
- [ ] B patch 中 `ActionCommandResponse.status` 已剝離 `requires_*`，且 `CommandResponse<T>.data` 為 required。
- [ ] B patch SSE catalog 已加入 `approval` / `ask` 兩 channel + replay/resync/scope。
- [ ] B patch §5.3 action table 標示「canonical」段落已加入。
- [ ] B patch MCP Tool 章節已替換為 import semantics + 4 endpoints + future flag。
- [ ] B patch §2.2 EvidenceRef 章節已附 capability map + `RedactedEvidenceRef`。
- [ ] B patch §6.3 PATCH journal 已鎖 `application/merge-patch+json` + body type + audit diff 要求。
- [ ] ErrorCode master 補上 `APPROVAL_REQUIRED`（Pack D D21 同步更新待 H 版）。

---

## 11. 後續工作（不在本檔範圍）

- **Pack D refresh (H 版)**：把以下灌回 canonical
  - D21 ErrorCode master 補 `APPROVAL_REQUIRED`
  - SSE Contract 補 `approval` / `ask` channel
  - Permission Contract 補 EvidenceKind capability map
- **Frontend code（下一輪 Pack D Batch V）**：
  - `src/lib/v4/errorCodes.ts` 補 `APPROVAL_REQUIRED` enum + i18n key
  - `src/lib/bff/runAction.ts` / `writeOverlay.ts` 維持函式參數冪等鍵；改 HTTP header 在 v1 BFF client 落地時做。
- **Backend handoff artifacts (H 版預告)**：
  - `Pantheon_BFF_OpenAPI_3_1.yaml`
  - `Pantheon_BFF_AsyncAPI_SSE.md`

---

## 12. 文件鏈

```
.lovable/feedback/2026-05-07-B/INDEX.md
  → Pantheon_BFF_Contract_Spec_2026-05-07-B.md
.lovable/feedback/2026-05-07-C/INDEX.md
  → Pantheon_BFF_Contract_Spec_2026-05-07-C_Followup_Questions.md
  → Pantheon_BFF_Contract_Spec_2026-05-07-C_Planner_Disposition.md
  → Pantheon_BFF_Contract_Spec_2026-05-07_Final.md   ← 本檔
```
