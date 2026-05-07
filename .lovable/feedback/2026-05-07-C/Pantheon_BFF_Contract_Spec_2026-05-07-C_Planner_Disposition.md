# Pantheon BFF Contract Spec 2026-05-07-C — Planner Disposition

**文件類型**：Planner Disposition / Follow-up Questions Response  
**日期**：2026-05-07  
**對應回饋**：`.lovable/feedback/2026-05-07-C/INDEX.md`  
**對應 artifact**：`/mnt/documents/Pantheon_BFF_Contract_Spec_2026-05-07-C_Followup_Questions.md`  
**基準文件**：`Pantheon_BFF_Contract_Spec_2026-05-07.md` + `Pantheon_BFF_Contract_Spec_2026-05-07-B.md`  
**狀態**：APPROVED — apply with modifications below  
**目的**：回覆 Lovable 在審閱 B patch 後提出的 8 個 unresolved items，解除「BLOCKER for applying patch B」狀態。

---

## 0. Executive Decision

Lovable 的 2026-05-07-C follow-up questions 是有效的 contract hygiene review。8 條問題中：

- **C.1 / C.2 / C.3 為 P0 blocker**：必須在 B patch 合併前修正。
- **C.4 / C.5 / C.6 為 P1 gap**：應在同一輪 B/C patch 補齊，否則後端 handoff 會缺路徑或權威來源。
- **C.7 / C.8 為 P2 consistency**：不阻塞 P0 backend review，但應在 spec 中明確裁示，以免後續再開 audit。

總裁示：

```text
Apply Patch B only after incorporating this C disposition.
C.1, C.2, C.3 are mandatory corrections.
C.4, C.5, C.6 are mandatory additions before backend handoff.
C.7, C.8 are accepted as clarifying spec updates.
```

---

## 1. Disposition Summary Table

| Item | Decision | Rationale | Spec section to update |
|---|---|---|---|
| C.1 | **Accept with modification** | `requires_confirm_token` / `requires_approval` / `requires_two_man` 不得作為 success status；一律走 `BffErrorEnvelope` (428 `CONFIRM_TOKEN_REQUIRED` / 409 `APPROVAL_REQUIRED` / 409 `TWO_MAN_REQUIRED`)。若 action 被接受並建立 approval / job / queued command，success response MUST 用 `status="accepted"` 或 `"queued"` 並附 `approvalId` / `jobId`；不得回 `requires_approval` 作 success status。 | §3 Error, §5 Action Command |
| C.2 | **Accept** | `Idempotency-Key` 必須是 HTTP header，不放 business body。 | §5.2 / all write/action examples |
| C.3 | **Modify** | `CommandResponse.data?: T` 不應破壞 narrow type；採 discriminated success union：`CommandResponse<T> = { ok:true; data:T | null; ... }`。錯誤仍是 non-2xx `BffErrorEnvelope`。 | §3.2 |
| C.4 | **Accept** | SSE catalog 必須補 `approval` 與 `ask` channel；Approval stage 與 Ask streaming 都是 frontend-visible realtime flow。 | §8.3 SSE channel catalog |
| C.5 | **Accept** | BFF action table 必須是 canonical；v4 `ActionDescriptor` 是 canonical TS target，v3 `availableActions` 僅 migration/back-compat。 | §5.3 Action table + new canonical note |
| C.6 | **Accept with clarification** | `McpToolDTO` 已存在就必須說明 create semantics。裁示：MCP Tool 不支援獨立 create；由 MCP Server discovery / schema import 產生。 | §2 DTO + §4.3 Create extension |
| C.7 | **Accept** | `EvidenceKind` 擴增後需補 RBAC/capability 對照，否則 UI 可見但權限不明。 | §2 EvidenceRef + §15 Permission |
| C.8 | **Accept** | `PATCH /bff/agora/journal/{id}` body 必須指定格式；採 JSON Merge Patch RFC 7396。 | §6 Agora / Journal |

---

# 2. C.1 — ActionCommandResponse status / ErrorCode 雙軌

## 2.1 Problem

B patch 讓 `ActionCommandResponse.status` 包含：

```ts
"requires_approval" | "requires_confirm_token"
```

同時 ErrorCode 也有：

```text
CONFIRM_TOKEN_REQUIRED
TWO_MAN_REQUIRED
APPROVAL_REQUIRED
```

這會造成 ambiguity：

```text
同一事件到底是 success response 還是 error response？
UI 應該 toast success 還是開 confirm dialog？
後端要回 200 還是 409/428？
```

## 2.2 Decision

**Accept with modification.**

Canonical rule:

```text
If the requested action cannot proceed because a required precondition is missing,
BFF MUST return non-2xx BffErrorEnvelope.

If the action is accepted and creates an approval / job / queued command,
BFF MAY return success CommandResponse with status = "accepted" or "queued".
```

## 2.3 Canonical ActionCommandStatus

Replace B patch status union with:

```ts
type ActionCommandStatus =
  | "accepted"
  | "queued"
  | "completed";
```

Do **not** include:

```text
requires_confirm_token
requires_approval
requires_two_man
```

in success status.

## 2.4 Precondition failures

Missing confirm token:

```http
428 Precondition Required
```

```json
{
  "error": {
    "code": "CONFIRM_TOKEN_REQUIRED",
    "i18nKey": "errors.CONFIRM_TOKEN_REQUIRED",
    "message": "Confirm token is required for this action.",
    "retryable": false,
    "userActionable": true,
    "correlationId": "corr_123",
    "details": {
      "kind": "confirm_token",
      "reason": "missing",
      "actionId": "strategy.promote_live",
      "entityType": "strategy",
      "entityId": "stg_001"
    }
  }
}
```

Missing approval:

```http
409 Conflict
```

```json
{
  "error": {
    "code": "APPROVAL_REQUIRED",
    "i18nKey": "errors.APPROVAL_REQUIRED",
    "message": "Approval is required before this action can be executed.",
    "retryable": false,
    "userActionable": true,
    "correlationId": "corr_124",
    "details": {
      "kind": "transition",
      "from": "approved",
      "action": "promote_live",
      "allowedActions": ["submit_approval"]
    }
  }
}
```

Two-man required:

```http
409 Conflict
```

```json
{
  "error": {
    "code": "TWO_MAN_REQUIRED",
    "i18nKey": "errors.TWO_MAN_REQUIRED",
    "message": "Two-man approval is required.",
    "retryable": false,
    "userActionable": true,
    "correlationId": "corr_125",
    "details": {
      "kind": "permission",
      "missingCapabilities": ["approval.two_man.sign"]
    }
  }
}
```

## 2.5 Successful accepted action

If backend accepts command and creates approval:

```json
{
  "ok": true,
  "data": {
    "entityType": "strategy",
    "entityId": "stg_001",
    "actionId": "strategy.submit_review",
    "status": "accepted",
    "approvalId": "ap_001"
  },
  "auditEventId": "aud_001",
  "correlationId": "corr_126",
  "idempotencyKey": "idem_abc",
  "replayed": false,
  "lockVersion": 12
}
```

## 2.6 Required spec update

Patch B should state:

```text
`requires_*` outcomes are not success statuses. They are precondition failures represented by BffErrorEnvelope.
```

---

# 3. C.2 — idempotencyKey body → header

## 3.1 Problem

C follow-up notes that §7.6 `two-man-sign` request body includes:

```ts
idempotencyKey: string
```

But Pack D and base BFF contract specify:

```http
Idempotency-Key: <key>
```

as HTTP header.

## 3.2 Decision

**Accept. Move idempotencyKey to HTTP header.**

Canonical rule:

```text
All write/action endpoints MUST receive idempotency key via HTTP `Idempotency-Key` header.
Business request body MUST NOT include idempotencyKey.
```

## 3.3 Corrected two-man-sign endpoint

```http
POST /bff/v5/interventions/{id}/two-man-sign
Idempotency-Key: idem_...
X-Correlation-Id: corr_...
```

Body:

```ts
type TwoManSignRequest = {
  decision: "approve" | "reject";
  memo: string;
  confirmTokenId?: string;
  expectedVersion: number;
};
```

Response:

```ts
type TwoManSignResponse = CommandResponse<{
  interventionId: string;
  decision: "approve" | "reject";
  signatureId: string;
  approvalId?: string;
  completed: boolean;
}>;
```

## 3.4 Applies to all endpoints

Remove `idempotencyKey` from these request bodies:

```text
ActionCommandRequest
InterventionDecisionRequest
ExecuteRemediationRequest
ConfirmTokenRequest
TwoManSignRequest
AuditExportRequest, if async export
Bulk decision requests
```

All keep `Idempotency-Key` header.

---

# 4. C.3 — `CommandResponse.data?: T` breaks narrow type

## 4.1 Problem

B patch made:

```ts
type CommandResponse<T> = {
  ok: true;
  data?: T;
}
```

This weakens frontend type narrowing because `ok: true` no longer guarantees `data`.

## 4.2 Decision

**Modify.**

Canonical response:

```ts
type CommandResponse<T> = {
  ok: true;
  data: T;
  auditEventId?: string;
  correlationId: string;
  idempotencyKey?: string;
  replayed?: boolean;
  lockVersion?: number;
  message?: string;
};
```

If no business payload exists, use:

```ts
CommandResponse<null>
```

Example:

```json
{
  "ok": true,
  "data": null,
  "auditEventId": "aud_123",
  "correlationId": "corr_123",
  "idempotencyKey": "idem_123",
  "replayed": false
}
```

## 4.3 Error behavior

Errors remain non-2xx:

```ts
type BffErrorEnvelope = { error: BffErrorPayload };
```

Do not use:

```ts
{ ok: false, error: ... }
```

except inside `BulkActionResponse.results[]`.

## 4.4 Bulk exception

Bulk partial success keeps per-item `ok`:

```ts
type BulkActionResponse<T> = {
  ok: boolean;
  partial: boolean;
  summary: {
    requested: number;
    succeeded: number;
    failed: number;
  };
  results: Array<{
    id: string;
    ok: boolean;
    data?: T;
    error?: BffErrorPayload;
  }>;
};
```

---

# 5. C.4 — SSE catalog missing `approval` and `ask`

## 5.1 Decision

**Accept. Add both channels.**

These are frontend-visible:

1. `ApprovalRequest.stages[]` changes need realtime updates.
2. `AskPersonas` requires streaming response / incremental agent events.

## 5.2 Approval channel

Add channel:

```ts
type ApprovalEvent =
  | {
      type: "approval.created";
      approvalId: string;
      kind: string;
      subject: string;
      riskLevel: string;
      at: string;
    }
  | {
      type: "approval.stage.changed";
      approvalId: string;
      stageName: string;
      state: "pending" | "approved" | "rejected" | "skipped";
      decidedBy?: string;
      at: string;
    }
  | {
      type: "approval.decided";
      approvalId: string;
      decision: "approved" | "rejected" | "changes_requested";
      decidedBy: string;
      at: string;
    }
  | {
      type: "approval.sla.escalated";
      approvalId: string;
      stageName: string;
      escalateTo: string;
      at: string;
    };
```

SSE envelope:

```ts
SseEventEnvelope<ApprovalEvent>
```

Channel metadata:

| Field | Value |
|---|---|
| channel | `approval` |
| replay | 24h |
| resync endpoint | `/bff/approvals` and `/bff/v5/interventions` |
| auth scope | `approval.read` or corresponding linked entity capability |

## 5.3 Ask channel

Add channel:

```ts
type AskEvent =
  | {
      type: "ask.session.started";
      sessionId: string;
      personaIds: string[];
      at: string;
    }
  | {
      type: "ask.message.delta";
      sessionId: string;
      messageId: string;
      personaId?: string;
      delta: string;
      seq: number;
      at: string;
    }
  | {
      type: "ask.tool.called";
      sessionId: string;
      toolName: string;
      callId: string;
      at: string;
    }
  | {
      type: "ask.message.completed";
      sessionId: string;
      messageId: string;
      at: string;
    }
  | {
      type: "ask.session.completed";
      sessionId: string;
      summary?: string;
      at: string;
    }
  | {
      type: "ask.session.failed";
      sessionId: string;
      errorCode: string;
      at: string;
    };
```

Channel metadata:

| Field | Value |
|---|---|
| channel | `ask` |
| replay | best-effort within 24h; final transcript available by REST |
| resync endpoint | `/bff/agora/ask/sessions/{id}` |
| auth scope | `agora.ask` / `persona.consult` |

## 5.4 SSE catalog update

Final SSE catalog must include:

```text
approval
ask
artifact
runtime
mcp
skill
channel
tool
ranking
rebalance
evolution
research
signal
inbox
journal
postmortem
loop
sentinel
intervention
audit
system
```

---

# 6. C.5 — Action table canonical vs v3/v4 sources

## 6.1 Problem

The repo has multiple action definitions:

- `src/lib/v3/availableActions.ts`
- `src/lib/v4/actionDescriptor.ts`
- BFF contract action table
- legacy `availableActions: string[]`

Need explicit source of truth.

## 6.2 Decision

**Accept. BFF contract action table is backend-facing canonical; v4 `ActionDescriptor` is frontend TypeScript target; v3 is back-compat only.**

Canonical order:

```text
1. BFF Contract Action Table — backend-facing source of action IDs, endpoints, risk, approval, confirm-token, two-man, cooldown, idempotency.
2. v4 ActionDescriptor — frontend runtime DTO shape.
3. v3 availableActions — legacy migration/back-compat only.
4. legacy string[] — deprecated.
```

## 6.3 Required spec text

Add to B patch:

```text
The action table in this BFF contract is canonical for backend implementation.
BFF MUST emit ActionDescriptor[] compatible with v4 `ActionDescriptor`.
v3 `availableActions.ts` remains a compatibility adapter and MUST NOT introduce new canonical actions.
Any new action ID must be added to the BFF contract first, then mapped to v4 ActionDescriptor.
```

## 6.4 Alignment mechanism

Recommended:

```text
Phase 1: manual table + TypeScript tests
Phase 2: codegen from BFF action catalog JSON/YAML into frontend action descriptor test fixtures
Phase 3: CI lint forbids unknown action IDs in UI
```

### 6.4.1 Required test

Add a frontend contract test later:

```ts
describe("BFF action catalog alignment", () => {
  it("every BFF action id maps to a v4 ActionDescriptor id", () => {});
  it("no UI action id is missing from BFF action catalog", () => {});
});
```

---

# 7. C.6 — Missing `McpToolCreateInput`

## 7.1 Problem

B patch adds `McpToolDTO` and actions such as grant/revoke, but create semantics are unclear.

## 7.2 Decision

**Accept with clarification: MCP Tool is not independently creatable by default.**

Canonical rule:

```text
MCP Tool is discovered/imported from an MCP Server schema. It is not created as an independent UI form in v1.
```

## 7.3 Required endpoints

```http
POST /bff/mcp-servers/{id}/import-tools
POST /bff/mcp-tools/{id}/grant
POST /bff/mcp-tools/{id}/revoke
POST /bff/mcp-tools/{id}/disable
POST /bff/mcp-tools/{id}/test
```

Import request:

```ts
type McpToolImportRequest = {
  schemaUrl?: string;
  schemaJson?: unknown;
  memo?: string;
};
```

Import response:

```ts
type McpToolImportResponse = CommandResponse<{
  serverId: string;
  imported: McpToolDTO[];
  skipped: Array<{
    name: string;
    reason: string;
  }>;
}>;
```

## 7.4 Optional future create

If backend later supports standalone MCP Tool registration, add:

```ts
type McpToolCreateInput = {
  serverId: string;
  name: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  scope: "read" | "write" | "destructive";
  envGrants: Array<"research" | "paper" | "live">;
  memo?: string;
};
```

But mark it:

```text
status: future / not v1 canonical
```

---

# 8. C.7 — EvidenceKind vs Pack D Permission Contract

## 8.1 Problem

EvidenceKind expanded to include:

```text
journal
postmortem
signal
artifact
...
```

But permission/capability contract must allow frontend to decide whether evidence can be shown.

## 8.2 Decision

**Accept. Add EvidenceKind → capability map.**

Canonical map:

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

## 8.3 UI behavior

If user lacks capability:

```ts
type RedactedEvidenceRef = {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: "INSUFFICIENT_CAPABILITY";
  requiredCapability: Capability;
};
```

UI may show:

```text
Evidence hidden — insufficient capability.
```

Do not omit evidence silently; show redacted placeholder when evidence count matters.

## 8.4 Backend behavior

BFF should either:

1. filter inaccessible evidence and return `redactedCount`, or
2. return redacted evidence refs.

Canonical preference:

```text
Return redacted evidence refs.
```

---

# 9. C.8 — PATCH `/bff/agora/journal/{id}` body format

## 9.1 Decision

**Accept. Use JSON Merge Patch RFC 7396 as default.**

Reason:

```text
- Easier for frontend forms.
- Compatible with current simple journal edit UI.
- Does not require operation array.
- Can be upgraded later for audit-rich JSON Patch if needed.
```

## 9.2 Endpoint

```http
PATCH /bff/agora/journal/{id}
Content-Type: application/merge-patch+json
Idempotency-Key: idem_...
```

Body:

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

Response:

```ts
CommandResponse<DecisionJournalEntryDTO>
```

## 9.3 Validation

```text
title: if present, 1–160 chars
body: if present, max 20000 chars
tags: if present, each tag lowercase dot.case or slug
visibility: must be allowed by user capability
```

## 9.4 Audit

Each PATCH must write audit:

```text
action = agora.journal.update
target = journalId
before/after diff required
correlationId required
```

## 9.5 Future upgrade

If backend needs exact list mutation semantics, it may add:

```http
PATCH /bff/agora/journal/{id}
Content-Type: application/json-patch+json
```

But default remains merge patch.

---

# 10. Required Update to 2026-05-07-B Patch

Lovable should apply these exact updates:

## 10.1 P0 mandatory

```text
C.1:
  Remove `requires_confirm_token`, `requires_approval`, `requires_two_man` from success ActionCommandStatus.
  Missing preconditions return non-2xx BffErrorEnvelope.

C.2:
  Move all idempotencyKey fields from request bodies to `Idempotency-Key` header.

C.3:
  Make CommandResponse<T>.data required.
  For no payload use CommandResponse<null>.
  Errors remain BffErrorEnvelope.
```

## 10.2 P1 mandatory

```text
C.4:
  Add approval and ask SSE channels.

C.5:
  Declare BFF action table canonical.
  v4 ActionDescriptor is frontend DTO target.
  v3 availableActions is back-compat only.

C.6:
  Clarify MCP Tool is discovered/imported from MCP Server schema.
  No standalone McpToolCreateInput in v1.
  Add import-tools endpoint.
```

## 10.3 P2 clarity

```text
C.7:
  Add EvidenceKind → capability map.
  Add redacted evidence behavior.

C.8:
  Set PATCH /bff/agora/journal/{id} default to JSON Merge Patch RFC 7396.
```

---

# 11. Disposition Template Filled

| Item | Decision | Rationale | Spec section to update |
|---|---|---|---|
| C.1 | Modify | Avoid dual success/error paths; missing preconditions are non-2xx BffErrorEnvelope. | §3, §5 |
| C.2 | Accept | Idempotency is transport-level HTTP header. | all write/action endpoints |
| C.3 | Modify | Preserve frontend type narrowing; `data` required, use `null` when no payload. | §3.2 |
| C.4 | Accept | Approval stage updates and Ask streaming are visible realtime frontend flows. | §8.3 |
| C.5 | Accept | Need single canonical action table; v4 DTO aligns to it, v3 is legacy. | §5.3 |
| C.6 | Modify | MCP Tool is not independently creatable in v1; import from MCP Server schema. | §4.3, §5.3 |
| C.7 | Accept | Evidence visibility must align with capability model. | §2.2, §15 |
| C.8 | Accept | PATCH must define body format; JSON Merge Patch is default. | §6.3 |

---

# 12. Final Status

After applying this C disposition:

```text
2026-05-07-B patch can be merged.
BFF Contract Spec becomes ready for backend P0 review.
Open P2 items remain non-blocking, except artifact upload / SSE replay / idempotency persistence when backend starts implementation.
```

Recommended next artifacts after applying this disposition:

```text
.lovable/spec/bff/2026-05-07-H/Pantheon_BFF_Contract_Spec_2026-05-07.md
.lovable/spec/bff/2026-05-07-H/Pantheon_BFF_Contract_Spec_2026-05-07-B.md
.lovable/spec/bff/2026-05-07-H/Pantheon_BFF_Contract_Spec_2026-05-07-C_Disposition.md
.lovable/spec/bff/2026-05-07-H/Pantheon_BFF_OpenAPI_3_1.yaml
.lovable/spec/bff/2026-05-07-H/Pantheon_BFF_AsyncAPI_SSE.md
```

---

## 13. Prompt for Lovable

```md
Apply Planner Disposition for 2026-05-07-C BFF Contract Follow-up Questions.

No src/ changes.
Spec/docs only.

Mandatory P0:
1. Remove requires_confirm_token / requires_approval / requires_two_man from success ActionCommandStatus.
   Missing preconditions must return non-2xx BffErrorEnvelope with CONFIRM_TOKEN_REQUIRED / APPROVAL_REQUIRED / TWO_MAN_REQUIRED.
2. Move all idempotencyKey fields from request bodies to Idempotency-Key HTTP header.
3. Make CommandResponse<T>.data required. Use CommandResponse<null> when no business payload exists.

Mandatory P1:
4. Add approval and ask SSE channels, with payload schema, replay policy, auth scope, and resync endpoint.
5. Declare BFF action table canonical. v4 ActionDescriptor is frontend DTO target. v3 availableActions is legacy/back-compat only.
6. Clarify McpTool creation: no standalone create in v1. MCP tools are imported/discovered from MCP server schema. Add /bff/mcp-servers/{id}/import-tools.

P2 consistency:
7. Add EvidenceKind to required capability map and redacted evidence behavior.
8. Set PATCH /bff/agora/journal/{id} default body format to JSON Merge Patch RFC 7396.

After applying, mark 2026-05-07-C follow-up as RESOLVED and allow B patch to merge.
```
