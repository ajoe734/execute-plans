# Planner Response to Lovable — 34 條回覆歸檔與 Stage 2 A 組 P0 核對

**文件類型**：Planner Response / Lovable Feedback Disposition  
**日期**：2026-05-08  
**對象**：Lovable frontend implementation team  
**對應檔案**：  
- `.lovable/feedback/2026-05-07-planner-response/INDEX.md`  
- `.lovable/feedback/2026-05-07-planner-response/Disposition.csv`  
- `src/lib/bff-v1/dto.ts`  
- `src/lib/v4/errorCodes.ts`  
- `src/lib/bff-v1/sse/channels.ts`  

**總結狀態**：Lovable 歸檔與 Stage 2 方向正確；I1/I2/I3 採 superset / alias 方式向下相容是合理的，但必須把「FE 相容層」與「BFF canonical contract」明確切開，避免後續後端誤以為所有 FE accepted values 都是 backend canonical emission values。

---

## 0. Executive Decision

Lovable 本輪動作可以接受：

1. 34 條規劃團隊回覆已歸檔至 `.lovable/feedback/2026-05-07-planner-response/`。
2. `Disposition.csv` 已把 A/B/C/D/E 條目拆成 priority、status、fe_action。
3. FE 審閱發現 I1/I2/I3 三個既有實作不一致點，採 superset / alias 方式向下相容。
4. Stage 2 A 組 P0 已先落地：
   - `errorCodes.ts` 移除 H2 superset 註解。
   - `dto.ts` EvidenceKind 擴成 wider union。
   - SSE channel 從 27 擴成 32。

但是請 Lovable 套用以下修正原則：

```text
Superset acceptance is OK for FE compatibility.
Backend canonical emission must be narrower and explicitly documented.
Alias fields are OK in FE DTOs.
Backend-facing DTO fields must still use canonical names.
```

本回覆後，Lovable 不應再把 I1/I2/I3 標成 planning-open；它們應標為：

```text
RESOLVED_BY_COMPATIBILITY_LAYER — contract backport pending
```

---

## 1. I1 — EvidenceKind 範圍差異

### 1.1 Lovable 現況

Lovable INDEX 說：

```text
FE 既有 EvidenceKind = 11 種，含 v5 closed-loop
Planner EvidenceKind = 15 種，缺 v5 三項
FE 取 union（≈19 種）
```

但目前 `src/lib/bff-v1/dto.ts` 實際 union 是：

```text
15 planner canonical
+ 4 v5 closed-loop / Agora additions
+ 3 legacy kept for back-compat
= 22 accepted values
```

目前 FE 實際包含：

```ts
type EvidenceKind =
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
  | "ask_session"
  | "snapshot"
  | "rebalance"
  | "experiment";
```

### 1.2 Planner Decision

**ACCEPT WITH CLARIFICATION.**

Define three layers:

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

type LegacyEvidenceKindAlias =
  | "snapshot"
  | "rebalance"
  | "experiment";

type EvidenceKind = CanonicalEvidenceKind | LegacyEvidenceKindAlias;
```

### 1.3 Canonical backend rule

Backend BFF v1 SHOULD emit only `CanonicalEvidenceKind`.

FE MAY accept `LegacyEvidenceKindAlias` for:

```text
legacy seed
v0-mock
old audit entries
backward-compatible adapters
```

### 1.4 Required update to Lovable docs

Please update `.lovable/feedback/2026-05-07-planner-response/INDEX.md` I1 wording from:

```text
FE 取 union（≈19 種）
```

to:

```text
FE accepted union = 22 values.
Backend canonical EvidenceKind = 19 values.
Legacy aliases = snapshot / rebalance / experiment; FE accepts them for backward compatibility but backend SHOULD NOT emit them in new APIs.
```

### 1.5 Capability map

Current map is acceptable, but mark aliases explicitly:

| EvidenceKind | Capability | Status |
|---|---|---|
| alert | `risk.alert.read` | canonical |
| incident | `risk.incident.read` | canonical |
| job | `job.read` | canonical |
| audit | `audit.read` | canonical |
| metric | `metric.read` | canonical |
| strategy | `strategy.view` | canonical |
| persona | `persona.view` | canonical |
| deployment | `deployment.read` | canonical |
| runtime | `runtime.read` | canonical |
| policy | `policy.read` | canonical |
| approval | `approval.read` | canonical |
| artifact | `artifact.read` | canonical |
| signal | `agora.signal.read` | canonical |
| journal | `agora.journal.read` | canonical |
| postmortem | `postmortem.read` | canonical |
| loop_run | `loop.read` | canonical |
| sentinel_finding | `sentinel.read` | canonical |
| intervention | `intervention.read` | canonical |
| ask_session | `agora.ask` | canonical |
| snapshot | `artifact.read` | legacy alias |
| rebalance | `rebalance.read` | legacy alias |
| experiment | `research.read` | legacy alias |

### 1.6 Status

```text
I1 = RESOLVED_BY_COMPATIBILITY_LAYER
Remaining = Pack D-B / DTO Catalog backport
```

---

## 2. I2 — RedactedEvidenceRef 命名差異

### 2.1 Lovable 現況

Planner 原本定義：

```ts
type RedactedEvidenceRef = {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: "INSUFFICIENT_CAPABILITY";
  requiredCapability: Capability;
};
```

目前 FE 實作：

```ts
export interface RedactedEvidenceRef {
  kind: EvidenceKind;
  id: string;
  redacted: true;
  reason: "PERMISSION_DENIED" | "CAPABILITY_MISSING" | "TENANT_SCOPE_MISMATCH";
  redactionReasonCode?: "INSUFFICIENT_CAPABILITY";
  capabilityRequired: string;
}
```

### 2.2 Planner Decision

**ACCEPT WITH CANONICAL / ALIAS SPLIT.**

FE 保留 `reason` union 是合理的，因為它比單一 `INSUFFICIENT_CAPABILITY` 更能表達 UI 文案。但是 backend-facing canonical DTO 不能只有 optional alias。

### 2.3 Canonical backend-facing RedactedEvidenceRef

```ts
type RedactionReasonCode =
  | "INSUFFICIENT_CAPABILITY"
  | "TENANT_SCOPE_MISMATCH"
  | "POLICY_REDACTED";

type RedactedEvidenceRef = {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: RedactionReasonCode;
  requiredCapability?: Capability;
};
```

### 2.4 FE compatibility alias

FE may keep:

```ts
reason?: "PERMISSION_DENIED" | "CAPABILITY_MISSING" | "TENANT_SCOPE_MISMATCH";
capabilityRequired?: string;
```

But they are aliases:

| FE alias | Canonical mapping |
|---|---|
| `reason = PERMISSION_DENIED` | `redactionReasonCode = INSUFFICIENT_CAPABILITY` |
| `reason = CAPABILITY_MISSING` | `redactionReasonCode = INSUFFICIENT_CAPABILITY` |
| `reason = TENANT_SCOPE_MISMATCH` | `redactionReasonCode = TENANT_SCOPE_MISMATCH` |
| `capabilityRequired` | `requiredCapability` |

### 2.5 Required FE helper

Please add or document a normalizer:

```ts
function normalizeRedactedEvidenceRef(input: RedactedEvidenceRef): {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: RedactionReasonCode;
  requiredCapability?: Capability;
} {
  return {
    id: input.id,
    kind: input.kind,
    redacted: true,
    redactionReasonCode:
      input.redactionReasonCode ??
      (input.reason === "TENANT_SCOPE_MISMATCH"
        ? "TENANT_SCOPE_MISMATCH"
        : "INSUFFICIENT_CAPABILITY"),
    requiredCapability: input.requiredCapability ?? input.capabilityRequired,
  };
}
```

### 2.6 Required update to comments

In `src/lib/bff-v1/dto.ts`, update comment:

```text
redactionReasonCode alias 對齊 planner
```

to:

```text
redactionReasonCode is backend canonical; reason/capabilityRequired are FE legacy aliases.
```

### 2.7 Status

```text
I2 = RESOLVED_BY_COMPATIBILITY_LAYER
Remaining = DTO Catalog should define canonical fields; FE may keep aliases.
```

---

## 3. I3 — Role set 差異

### 3.1 Lovable 現況

Lovable INDEX says:

```text
FE v4 roles = 5
planner roles = 12
Stage 4 expands to 12-role superset
```

This is correct.

### 3.2 Planner Decision

**ACCEPT.**

The 12-role superset is canonical for BFF contract and backend `/bff/me`.

Canonical roles:

```ts
type Role =
  | "platform_admin"
  | "portfolio_manager"
  | "research_lead"
  | "ops"
  | "viewer"
  | "admin"
  | "risk_officer"
  | "capital_manager"
  | "strategy_manager"
  | "system_operator"
  | "reviewer"
  | "capability_admin";
```

### 3.3 Important source-of-truth rule

```text
Capabilities are source of truth.
Roles are grouping / default bundle hints.
```

Therefore, if a user has:

```json
{
  "roles": ["viewer"],
  "capabilities": ["strategy.promote_live"]
}
```

the BFF / UI permission evaluator should treat capability as authoritative, unless policy explicitly denies the action.

### 3.4 Unknown backend roles

If backend returns a role not in the 12-role set:

```text
1. Do not crash.
2. Preserve role string for display/debug.
3. Do not infer capabilities from unknown role.
4. Use /bff/me.capabilities as source of truth.
5. Emit warning in development/test only.
```

### 3.5 Stage 4 requirement

When Stage 4 lands, please create:

```text
src/lib/v4/roleCapabilities.ts
```

with:

```ts
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]>;
export function capabilitiesForRoles(roles: readonly Role[]): Capability[];
export function hasCapability(capabilities: readonly Capability[], required: Capability): boolean;
```

### 3.6 Status

```text
I3 = ACCEPTED — Stage 4 required
Current 5-role FE mock is a subset and may remain until /bff/me real adapter lands.
```

---

# 4. Stage 2 A 組 P0 核對

## 4.1 A1 ActionCommandStatus named enum

### Current FE

`src/lib/bff-v1/dto.ts` now has:

```ts
export const ACTION_COMMAND_STATUSES = ["accepted", "queued", "completed"] as const;
export type ActionCommandStatus = (typeof ACTION_COMMAND_STATUSES)[number];
```

### Planner Decision

**ACCEPTED.**

But mark status as:

```text
FE_READY — OpenAPI_BACKPORT_PENDING
```

until `Pantheon_BFF_OpenAPI_3_1.yaml` has:

```yaml
components:
  schemas:
    ActionCommandStatus:
      type: string
      enum: [accepted, queued, completed]
```

and all inline status enums reference it.

### Required status

```text
A1 = not fully closed until OpenAPI schema is updated.
```

---

## 4.2 A2 ErrorCode master 26

### Current FE

`src/lib/v4/errorCodes.ts` contains the 26-code list and says:

```text
No longer "FE superset"; this list IS the canonical D21 master.
```

### Planner Decision

**ACCEPTED WITH BACKPORT REQUIREMENT.**

The FE file may treat the 26-code list as canonical for runtime, but Pack D-C D21 spec must still be updated.

Required backport:

```text
.lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md
```

must include:

```text
RESOURCE_NOT_FOUND
APPROVAL_REQUIRED
CONFIRM_TOKEN_REVOKED
```

### Required status

```text
A2 = FE_READY — PackD_BACKPORT_PENDING
```

Do not let smoke reports claim Pack D D21 is backported until the Pack D markdown is updated.

---

## 4.3 A3 SSE channel 32 + EvidenceKind capability map

### Current FE

`src/lib/bff-v1/sse/channels.ts` contains 32 channels, including:

```text
confirm_token
cooldown
transition
rollback
handoff
```

This is correct.

### Planner Decision

**ACCEPTED WITH ONE CONTRACT WARNING.**

The current `SseEvent` type has:

```ts
correlationId?: string;
```

But final BFF contract requires `correlationId` as mandatory in canonical backend SSE envelope.

### Canonical distinction

FE compatibility:

```ts
correlationId?: string
```

is allowed for mock / legacy event bridge.

Backend-facing AsyncAPI:

```ts
correlationId: string
```

must be required.

### Required helper

If FE receives a mock/legacy event without correlationId, it may normalize:

```ts
function ensureCorrelationId(event: SseEvent): SseEvent {
  return {
    ...event,
    correlationId: event.correlationId ?? `corr_mock_${event.id}`,
  };
}
```

### Required status

```text
A3 = FE_READY — AsyncAPI_BACKPORT_PENDING
```

---

# 5. Required Updates to Lovable Archive

Please update `.lovable/feedback/2026-05-07-planner-response/INDEX.md` section 5 as follows.

## 5.1 Replace I1 row

Current:

```text
FE 取 union（≈19 種）
```

Replace with:

```text
FE accepted union = 22 values:
19 backend-canonical EvidenceKind + 3 legacy aliases (snapshot/rebalance/experiment).
Backend SHOULD emit only canonical 19; FE accepts aliases for legacy/mock.
```

## 5.2 Replace I2 row

Current:

```text
FE 保留 union（資訊量大），新增 redactionReasonCode alias 對齊 planner
```

Replace with:

```text
Backend canonical fields are redactionReasonCode + requiredCapability.
FE aliases reason + capabilityRequired remain for backward compatibility and are normalized.
```

## 5.3 Replace I3 row

Current:

```text
階段 4 擴成 12 角色 superset
```

Replace with:

```text
12-role set is canonical for BFF /bff/me. 5-role current FE mock is a subset. Capabilities remain source of truth.
```

---

# 6. Required Updates to Disposition.csv

Add or adjust statuses:

```csv
id,status,fe_action,notes
I1,RESOLVED_BY_COMPATIBILITY_LAYER,Keep EvidenceKind 22 accepted union; document canonical 19 + 3 legacy aliases,Backend should emit canonical 19 only
I2,RESOLVED_BY_COMPATIBILITY_LAYER,Normalize redactionReasonCode/requiredCapability aliases,Backend canonical requires redactionReasonCode
I3,ACCEPTED_STAGE4,Expand Role to 12-role canonical set; capabilities first,Current 5-role mock remains valid subset
A1,FE_READY_OPENAPI_BACKPORT_PENDING,Regenerate codegen when OpenAPI named enum exists,Do not mark full closed until YAML updated
A2,FE_READY_PACKD_BACKPORT_PENDING,Keep 26 ErrorCode list; update Pack D D21 markdown,Runtime ok; spec backport pending
A3,FE_READY_ASYNCAPI_BACKPORT_PENDING,Keep 32 channels; AsyncAPI must require correlationId,Mock compatibility may keep optional field
```

---

# 7. Do / Do Not

## Do

```text
- Keep superset/alias compatibility in FE.
- Explicitly label canonical vs legacy alias.
- Keep backend-facing spec narrower and deterministic.
- Keep capabilities as permission source of truth.
- Maintain 32 SSE channel catalog.
- Require correlationId in backend AsyncAPI.
```

## Do Not

```text
- Do not let backend emit legacy EvidenceKind aliases unless unavoidable.
- Do not make redactionReasonCode optional in backend-facing DTO.
- Do not treat 5-role mock set as canonical.
- Do not mark A1/A2/A3 fully closed before OpenAPI / Pack D / AsyncAPI are updated.
- Do not re-open I1/I2/I3 as planning gaps; they are compatibility/backport items.
```

---

# 8. Final Status

After Lovable applies this response:

```text
I1 = RESOLVED_BY_COMPATIBILITY_LAYER
I2 = RESOLVED_BY_COMPATIBILITY_LAYER
I3 = ACCEPTED_STAGE4
A1 = FE_READY_OPENAPI_BACKPORT_PENDING
A2 = FE_READY_PACKD_BACKPORT_PENDING
A3 = FE_READY_ASYNCAPI_BACKPORT_PENDING
```

This keeps FE progress unblocked while preserving the backend-facing BFF contract as a clean canonical interface.

---

## 9. Prompt for Lovable

```md
Apply Planner Response to Stage 2 A-group P0 compatibility review.

No business behavior changes.
Spec / comments / archive status only unless explicitly requested.

1. Update planner-response INDEX I1:
   FE accepted EvidenceKind union is 22 values.
   Backend canonical EvidenceKind is 19 values.
   Legacy aliases are snapshot / rebalance / experiment.
   Backend SHOULD emit canonical 19 only.

2. Update planner-response INDEX I2:
   Backend canonical RedactedEvidenceRef fields are redactionReasonCode + requiredCapability.
   FE aliases reason + capabilityRequired remain for backward compatibility.
   Add or document normalizeRedactedEvidenceRef().

3. Update planner-response INDEX I3:
   12-role set is canonical for BFF /bff/me.
   Current 5-role FE mock is a subset.
   Capabilities are source of truth.

4. Update Disposition.csv statuses:
   I1 = RESOLVED_BY_COMPATIBILITY_LAYER
   I2 = RESOLVED_BY_COMPATIBILITY_LAYER
   I3 = ACCEPTED_STAGE4
   A1 = FE_READY_OPENAPI_BACKPORT_PENDING
   A2 = FE_READY_PACKD_BACKPORT_PENDING
   A3 = FE_READY_ASYNCAPI_BACKPORT_PENDING

5. Keep src/lib/bff-v1/dto.ts superset and alias types for FE compatibility.
   Do not narrow them until real BFF codegen is available.

6. For AsyncAPI, correlationId must be required.
   FE mock SseEvent may keep correlationId optional only as compatibility bridge.
```
