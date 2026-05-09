# Pantheon FE Blueprint Gap 2026-05-09 — Missing Spec Addendum

**文件類型**：Planner Spec Addendum / FE Blueprint Gap Closure  
**版本**：2026-05-09-A  
**對應 Audit**：`.lovable/audits/fe-blueprint-gap-2026-05-09.md`  
**對象**：Lovable FE team、BFF contract owner、Pathreon / Pantheon backend team  
**狀態**：APPROVED — apply as contract/backport addendum  
**目的**：補齊 2026-05-09 前端 vs 設計藍圖盤點報告中仍標為 A/B/C/D 的剩餘規格缺口，將它們從「未定義」轉成「已定義、待實作 / 待後端 / 待驗收」。

---

## 0. Executive Summary

`fe-blueprint-gap-2026-05-09.md` 將剩餘工作分成四類：

```text
A. 阻塞於後端實作 — FE 無事可做
B. 等待規格 backport — FE 已就緒
C. 純 FE 小尾巴 — 可立即清掉
D. v5 Phase E 觀察項 — 非缺漏，可深化
```

本 addendum 的裁示：

| 類別 | 裁示 |
|---|---|
| A | 不新增 FE spec；轉成 Backend P0 endpoint readiness acceptance。 |
| B | 補 canonical backport 規格：ActionCommandStatus、ErrorCode 26、SSE correlationId + approval/ask + EvidenceKind capability。 |
| C | 補 FE governance/QA spec：legacy import ban、deprecated timeoutPolicy、axe smoke 擴覆、ephemeral audit overlay、walkthrough checklist。 |
| D | 不作為缺漏；建立 optional enhancement backlog 規格，不阻塞 BFF live。 |

關鍵狀態：

```text
A = BACKEND_IMPLEMENTATION_PENDING
B = SPEC_BACKPORT_REQUIRED, now fully specified by this addendum
C = FE_IMPLEMENTATION_READY, now has acceptance criteria
D = PRODUCT_ENHANCEMENT_OPTIONAL
```

---

## 1. Status Vocabulary

請在後續 audit / plan / smoke report 使用以下狀態：

| Status | Meaning |
|---|---|
| `BACKEND_IMPLEMENTATION_PENDING` | Contract 已定，後端 endpoint 尚未實作。 |
| `SPEC_BACKPORT_REQUIRED` | 裁示已定，需回灌 OpenAPI / AsyncAPI / Pack D markdown。 |
| `FE_IMPLEMENTATION_READY` | 規格已定，FE 可直接清尾巴。 |
| `FE_VALIDATION_PENDING` | FE 已 wire-up，但尚未跑 walkthrough / axe / smoke。 |
| `PRODUCT_ENHANCEMENT_OPTIONAL` | 非 spec 缺漏，屬產品深化 backlog。 |
| `RESOLVED_BY_THIS_ADDENDUM` | 本文件已補齊規格，不應再標 planning-open。 |

---

# 2. A 組 — Backend Endpoint Readiness Contract

## 2.1 Decision

A 組不是 FE 規格缺口，而是 backend implementation gap。  
FE 已有 mock fallback、strict/auto mode、canonical paths；現在應將 A 組轉給 backend lupin team。

### Status

```text
A = BACKEND_IMPLEMENTATION_PENDING
FE action = none
```

---

## 2.2 Backend P0 Endpoint Readiness Checklist

Backend lupin team must implement at least these P0 endpoints before FE live mode can be considered usable.

### P0-A Session bootstrap

```http
GET  /bff/me
POST /bff/auth/refresh
POST /bff/logout
```

Acceptance:

```text
/bff/me returns MeResponse with user, tenant, roles, capabilities, env, featureFlags, serverTime, sessionExpiresAt, permissionsVersion.
401 flow supports refresh once.
logout invalidates session and returns CommandResponse<null>.
```

### P0-B OpenAPI self-description

```http
GET /openapi.json
```

Acceptance:

```text
returns HTTP 200
valid OpenAPI 3.1
includes X-BFF-Api-Version = 2026-05-07
contains components.schemas.ActionCommandStatus
```

### P0-C Canonical action endpoint

```http
POST /bff/actions/{entityType}/{entityId}/{actionId}
```

Acceptance:

```text
supports Idempotency-Key header
returns CommandResponse<ActionCommandResponseData>
missing confirm token / approval / two-man returns non-2xx BffErrorEnvelope
does not return requires_* as success status
```

### P0-D Decision endpoints

```http
POST /bff/approvals/{id}/decide
POST /bff/v5/interventions/{id}/decide
```

Acceptance:

```text
list → decide flow works
returns auditEventId + correlationId
emits approval / intervention SSE event
```

### P0-E Entity registry lists

Minimum first wave:

```http
GET /bff/strategies
GET /bff/personas
GET /bff/capital-pools
GET /bff/deployments
GET /bff/jobs
GET /bff/alerts
GET /bff/incidents
GET /bff/audit
```

Acceptance:

```text
returns ListResponse<T>
registry lists set totalCountExact=true
auth-gated endpoints return 401 before auth, not 404
```

---

## 2.3 Backend Probe Classification

Use this status vocabulary in live probe reports:

| HTTP | Meaning |
|---|---|
| 2xx | implemented and public / usable |
| 401 | implemented and auth-gated |
| 403 | implemented but unauthorized |
| 404 | route not registered |
| 405 | route exists, wrong method |
| 5xx | backend bug / transport failure |

A route is considered backend-implemented if it returns:

```text
2xx / 401 / 403 / 405
```

A route is not implemented if it returns:

```text
404
```

---

# 3. B 組 — Required Spec Backports

## B1. A1 — OpenAPI named `ActionCommandStatus`

### Decision

**RESOLVED_BY_THIS_ADDENDUM — SPEC_BACKPORT_REQUIRED**

OpenAPI must define named enum:

```yaml
components:
  schemas:
    ActionCommandStatus:
      type: string
      enum:
        - accepted
        - queued
        - completed
      description: >
        Success-only action command status. Missing confirm token,
        approval, or two-man requirements are non-2xx BffErrorEnvelope,
        not success statuses.
```

Any schema currently using inline:

```yaml
enum: [accepted, queued, completed]
```

must change to:

```yaml
$ref: '#/components/schemas/ActionCommandStatus'
```

### Acceptance

```text
grep OpenAPI for inline accepted/queued/completed returns zero except inside ActionCommandStatus definition.
```

---

## B2. A2 — Pack D D21 ErrorCode master 26

### Decision

**RESOLVED_BY_THIS_ADDENDUM — SPEC_BACKPORT_REQUIRED**

Pack D D21 canonical ErrorCode master must be 26 codes:

```text
VALIDATION_FAILED
AUTH_REQUIRED
TOKEN_EXPIRED
REFRESH_FAILED
PERMISSION_DENIED
CAPABILITY_MISSING
TENANT_SCOPE_MISMATCH
FEATURE_DISABLED
STATE_CONFLICT
ILLEGAL_TRANSITION
CONFIRM_TOKEN_REQUIRED
CONFIRM_TOKEN_EXPIRED
CONFIRM_TOKEN_REUSED
CONFIRM_TOKEN_BINDING_MISMATCH
TWO_MAN_REQUIRED
COOLDOWN_ACTIVE
CURSOR_EXPIRED
CURSOR_INVALID
RATE_LIMITED
IDEMPOTENCY_CONFLICT
BACKEND_UNAVAILABLE
SSE_REPLAY_UNAVAILABLE
UNKNOWN_ERROR
RESOURCE_NOT_FOUND
APPROVAL_REQUIRED
CONFIRM_TOKEN_REVOKED
```

### Required backport target

```text
.lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md
.lovable/feedback/2026-05-07-final/Pantheon_BFF_OpenAPI_3_1.yaml
```

### Acceptance

```text
src/lib/v4/errorCodes.ts and Pack D D21 markdown have identical 26-code list.
OpenAPI ErrorCode schema has identical 26-code list.
```

---

## B3. A3 — AsyncAPI correlationId required + approval/ask + EvidenceKind capability map

### Decision

**RESOLVED_BY_THIS_ADDENDUM — SPEC_BACKPORT_REQUIRED**

### B3.1 Backend-facing SSE envelope

AsyncAPI / BFF backend contract must define `correlationId` as required:

```ts
type SseEventEnvelope<TPayload> = {
  schemaVersion: 1;
  id: string;
  channel: SseChannelKind;
  type: string;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
};
```

FE mock bridge may temporarily allow:

```ts
correlationId?: string
```

but must normalize:

```ts
ensureCorrelationId(event)
```

before treating event as canonical.

### B3.2 Required channels

AsyncAPI must include:

```text
approval
ask
```

as first-class channels.

### B3.3 ApprovalEvent

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

### B3.4 AskEvent

```ts
type AskEvent =
  | { type: "ask.session.started"; sessionId: string; personaIds: string[]; at: string }
  | { type: "ask.message.delta"; sessionId: string; messageId: string; personaId?: string; delta: string; seq: number; at: string }
  | { type: "ask.tool.called"; sessionId: string; toolName: string; callId: string; at: string }
  | { type: "ask.message.completed"; sessionId: string; messageId: string; at: string }
  | { type: "ask.session.completed"; sessionId: string; summary?: string; at: string }
  | { type: "ask.session.failed"; sessionId: string; errorCode: string; at: string };
```

### B3.5 EvidenceKind canonical set

Backend canonical EvidenceKind = 19 values:

```ts
type CanonicalEvidenceKind =
  | "alert"
  | "incident"
  | "job"
  | "audit"
  | "metric"
  | "strategy"
  | "persona"
  | "deployment"
  | "runtime"
  | "policy"
  | "approval"
  | "artifact"
  | "signal"
  | "journal"
  | "postmortem"
  | "loop_run"
  | "sentinel_finding"
  | "intervention"
  | "ask_session";
```

FE may accept 22 values with legacy aliases:

```ts
type LegacyEvidenceKindAlias =
  | "snapshot"
  | "rebalance"
  | "experiment";
```

Backend SHOULD NOT emit legacy aliases in new APIs.

### B3.6 EvidenceKind capability map

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
| loop_run | `loop.read` |
| sentinel_finding | `sentinel.read` |
| intervention | `intervention.read` |
| ask_session | `agora.ask` |

Legacy aliases:

| Alias | Required capability |
|---|---|
| snapshot | `artifact.read` |
| rebalance | `rebalance.read` |
| experiment | `research.read` |

### Acceptance

```text
AsyncAPI has correlationId required.
AsyncAPI includes approval and ask channel.
Permission contract includes EvidenceKind capability map.
FE compatibility optional correlationId is documented as mock-only.
```

---

# 4. C 組 — FE 小尾巴規格

## C1. v3 lib residual governance

### Decision

**FE_IMPLEMENTATION_READY**

`src/lib/v3/` may remain as a legacy shim, but new code must not import from it unless explicitly allowed.

### Required deprecation header

Every file in `src/lib/v3/` should include:

```ts
/**
 * @deprecated v3 compatibility shim only.
 * New code must use src/lib/v4, src/lib/v5, or src/lib/bff-v1.
 * Do not add new canonical types/actions here.
 */
```

### ESLint rule

Add `no-restricted-imports`:

```json
{
  "paths": [
    {
      "name": "@/lib/v3",
      "message": "v3 is legacy compatibility only. Use v4/v5/bff-v1."
    }
  ],
  "patterns": [
    {
      "group": ["@/lib/v3/*"],
      "message": "v3 imports are restricted to approved legacy adapters."
    }
  ]
}
```

### Allowlist

Allowed importers:

```text
migration adapters
legacy tests
codemod scripts
explicit compatibility shims
```

### Acceptance

```text
New app/page/component files cannot import src/lib/v3.
Existing imports are either migrated or documented in allowlist.
```

---

## C2. `src/lib/v5/timeoutPolicy.ts` superseded governance

### Decision

**FE_IMPLEMENTATION_READY**

`src/lib/v5/timeoutPolicy.ts` is superseded by:

```text
src/lib/v4/asyncTransitionPolicy.ts
```

### Required deprecation header

```ts
/**
 * @deprecated Superseded by src/lib/v4/asyncTransitionPolicy.ts.
 * v5 timeoutPolicy is retained only for transitional v5 view-model compatibility.
 * New async transition logic must use AsyncTransitionDescriptor / transition policies.
 */
```

### ESLint rule

Restrict new imports:

```json
{
  "patterns": [
    {
      "group": ["@/lib/v5/timeoutPolicy"],
      "message": "Use @/lib/v4/asyncTransitionPolicy instead."
    }
  ]
}
```

### Acceptance

```text
No new imports from v5/timeoutPolicy outside v5 compatibility adapters.
```

---

## C3. Axe smoke coverage for v5 pages

### Decision

**FE_IMPLEMENTATION_READY**

Extend axe smoke to the v5 surfaces listed in the blueprint report.

### Required pages

```text
/management/control-room
/management/loops/research
/management/loops/execution
/management/loops/optimization
/management/sentinel
/management/interventions
```

Component-level coverage:

```text
PersonaHealthMatrix
```

Optional if routed inside execution page, but at least one direct component smoke should mount it with sample items.

### Required axe rule subset

Use existing CI gate:

```text
wcag2a
wcag2aa
```

Fail on:

```text
critical
serious
```

Warn on:

```text
moderate unless allowlisted with owner + expiry
```

### Test naming

```text
a11y.v5.controlRoom.noCriticalViolations
a11y.v5.researchLoop.noCriticalViolations
a11y.v5.executionLoop.noCriticalViolations
a11y.v5.optimizationLoop.noCriticalViolations
a11y.v5.sentinel.noCriticalViolations
a11y.v5.interventions.noCriticalViolations
a11y.v5.personaHealthMatrix.noCriticalViolations
```

### Acceptance

```text
All required v5 pages pass axe smoke.
No critical/serious violations.
If moderate violations remain, they are allowlisted with owner and expiry.
```

---

## C4. Mock overlay TTL vs audit append asymmetry

### Decision

**FE_IMPLEMENTATION_READY**

Mock audit events generated by overlay writes are ephemeral and must be visibly labeled.

### Canonical rule

```text
In mock mode, writeOverlay-created entities and their audit events share the same 30-minute TTL semantics.
UI must label these as ephemeral.
Real backend audit events remain permanent and append-only.
```

### Required UI treatment

For mock audit rows generated by overlay:

```text
Badge: ephemeral
Tooltip: "Mock 環境暫存事件，30 分鐘後清除。正式後端 audit 為永久 append-only。"
```

### Required DTO extension for mock only

```ts
type MockAuditEventMeta = {
  ephemeral: true;
  expiresAt: string;
  source: "writeOverlay" | "v5ActionOverlay";
};
```

Do not add `ephemeral` to backend canonical `AuditEventDTO` unless backend explicitly supports temporary audit sandbox.

### Acceptance

```text
Overlay-created audit rows show ephemeral badge.
Tooltip explains 30-min TTL.
Backend audit rows do not show ephemeral badge.
```

---

## C5. UI walkthrough acceptance spec

### Decision

**FE_VALIDATION_PENDING**

The listed UI entries are already wired, but need explicit walkthrough acceptance.

### Walkthrough items

#### C5.1 Incident rollback saga

Flow:

```text
IncidentDetail
→ View Rollback Saga
→ RollbackSagaDrawer
```

Acceptance:

```text
drawer opens
saga id / incident id / deployment id displayed
current step visible
timeout / failure state visible if present
empty state shown if no saga
```

#### C5.2 HighRiskConfirm cooldown + two-man

Flow:

```text
HighRiskConfirm
→ cooldown banner
→ two-man distinct-user check
```

Acceptance:

```text
cooldown active disables confirm
cooldown uses serverTime or mock serverTime offset
same user cannot satisfy two-man
missing second signature shows TWO_MAN_REQUIRED
confirm token missing shows CONFIRM_TOKEN_REQUIRED, not success status
```

#### C5.3 Settings Break-Glass tab

Flow:

```text
Settings
→ Break-Glass tab
→ validateForceTransition
```

Acceptance:

```text
requires justification
requires approvers
shows expiry if provided
live-impacting action shows critical warning
does not execute; only validates in FE mock
```

#### C5.4 GovernanceQueue quorum progress

Flow:

```text
GovernanceQueue
→ reviewerQuorum progress
```

Acceptance:

```text
shows required quorum
shows completed signatures
shows missing role family if distinct-role required
SLA extension / escalation state visible
```

#### C5.5 DataTable density + LineageGraph node-limit

Acceptance:

```text
density toggle changes table row height
density preference persists if designed to persist
LineageGraph >500 nodes shows warning / clustered summary
no layout thrash or unbounded render
```

### Walkthrough output

Write report:

```text
.lovable/audits/fe-walkthrough-2026-05-09.md
```

Required columns:

```text
surface
flow
result
issue
screenshot? optional
follow-up ticket
```

---

# 5. D 組 — v5 Phase E optional enhancement spec

## D0. Decision

The v5 Phase E items in the audit are **not missing specs**. They are optional product enhancement backlog.

Status:

```text
PRODUCT_ENHANCEMENT_OPTIONAL
```

They must not block:

```text
BFF live wiring
OpenAPI / AsyncAPI backport
FE smoke clean
backend P0 review
```

---

## D1. Control Room enhancements

Optional backlog:

```text
saved views
cross-section drill-down
operator-specific layout preferences
```

Acceptance if implemented:

```text
saved view does not change canonical ControlRoomSummary DTO
drill-down uses existing route links
preferences stored as UI preference, not domain state
```

---

## D2. Sentinel timeline comparison

Optional backlog:

```text
finding timeline
before/after evidence comparison
remediation result comparison
```

Acceptance if implemented:

```text
timeline reads audit/SSE/evidence refs
does not invent new SentinelFinding status
uses existing EvidenceRef/RedactedEvidenceRef rules
```

---

## D3. Interventions batch decide

Optional backlog, but if implemented must use existing bulk contract.

Endpoint:

```http
POST /bff/v5/interventions/batch-decide
```

Response:

```ts
BulkActionResponse<InterventionItem>
```

UI behavior follows C4 bulk partial-failure standard.

---

## D4. Loop stage detail drawer

Optional backlog:

```text
stage evidence expansion
stage transition details
stage linked job/approval/sentinel finding
```

Must use:

```text
AsyncTransitionDescriptor
EvidenceRef
RedactedEvidenceRef
```

---

## D5. PersonaHealthMatrix trend sparkline

Optional backlog:

```text
health score sparkline
mode change markers
risk/sentinel finding overlay
```

Do not change canonical `PersonaExecutionHealth`; use optional series endpoint if needed:

```http
GET /bff/v5/execution/persona-health/{personaId}/series
```

---

# 6. Required Updates to Audit / Plan

## 6.1 Update `fe-blueprint-gap-2026-05-09.md` status wording

A:

```text
from: 阻塞於後端實作（FE 端無事可做）
to: BACKEND_IMPLEMENTATION_PENDING — contract complete
```

B:

```text
from: 等待規格 backport
to: SPEC_BACKPORT_REQUIRED — exact snippets supplied by addendum
```

C:

```text
from: 純 FE 小尾巴
to: FE_IMPLEMENTATION_READY / FE_VALIDATION_PENDING
```

D:

```text
from: v5 Phase E 觀察項
to: PRODUCT_ENHANCEMENT_OPTIONAL
```

## 6.2 Add this file

Suggested path:

```text
.lovable/spec/bff/2026-05-09/FE_Blueprint_Gap_Missing_Spec_Addendum_2026-05-09.md
```

or if using feedback folder:

```text
.lovable/feedback/2026-05-09-blueprint-gap/FE_Blueprint_Gap_Missing_Spec_Addendum_2026-05-09.md
```

---

# 7. Lovable Implementation Prompt

```md
Apply FE Blueprint Gap Missing Spec Addendum 2026-05-09.

No backend changes.
No product redesign.
No DTO rewrite except documented backport comments.

Tasks:

1. Backport B-group specs:
   - OpenAPI: add components.schemas.ActionCommandStatus and replace inline accepted/queued/completed enums with $ref.
   - Pack D D21: update ErrorCode master to 26 codes.
   - AsyncAPI: require correlationId in backend SSE envelope.
   - AsyncAPI: include approval and ask channels.
   - Permission Contract: add CanonicalEvidenceKind 19 + legacy alias policy + capability map.

2. FE governance:
   - Add @deprecated headers to src/lib/v3 files.
   - Add no-restricted-imports rule for new src/lib/v3 imports, with allowlist for legacy adapters/tests.
   - Add @deprecated header to src/lib/v5/timeoutPolicy.ts.
   - Restrict new imports from v5/timeoutPolicy except compatibility adapters.

3. A11y:
   - Extend axe smoke to:
     /management/control-room
     /management/loops/research
     /management/loops/execution
     /management/loops/optimization
     /management/sentinel
     /management/interventions
     PersonaHealthMatrix component
   - Fail on critical/serious violations.

4. Mock overlay/audit:
   - Add ephemeral badge + tooltip to overlay-created audit events.
   - Tooltip text:
     "Mock 環境暫存事件，30 分鐘後清除。正式後端 audit 為永久 append-only。"
   - Do not add ephemeral to backend canonical AuditEventDTO.

5. Walkthrough:
   - Run walkthrough for C5 flows.
   - Write .lovable/audits/fe-walkthrough-2026-05-09.md.

6. Update audit wording:
   - A = BACKEND_IMPLEMENTATION_PENDING — contract complete
   - B = SPEC_BACKPORT_REQUIRED — snippets supplied
   - C = FE_IMPLEMENTATION_READY / FE_VALIDATION_PENDING
   - D = PRODUCT_ENHANCEMENT_OPTIONAL

Do not reopen these as planning gaps unless backend rejects a contract.
```

---

# 8. Final Status After Applying This Addendum

```text
A backend endpoints:
  contract complete, backend implementation pending

B backports:
  exact snippets supplied, spec backport pending

C FE tails:
  governance/QA specs supplied, FE can implement immediately

D v5 observations:
  optional product enhancement backlog, not spec gap
```

The FE blueprint gap report should no longer be treated as unresolved planning ambiguity after this addendum is archived.
