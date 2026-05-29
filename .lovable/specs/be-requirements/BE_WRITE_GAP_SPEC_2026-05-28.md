# Pantheon BFF — Backend Write-Gap Requirements Spec

| | |
|---|---|
| **Doc ID** | `BE_WRITE_GAP_SPEC_2026-05-28` |
| **Version** | 1.0 |
| **Date** | 2026-05-28 |
| **Author** | Frontend (Lovable agent) |
| **Audience** | Backend / BFF owners (`pantheon-lupin-*-bff`) |
| **Status** | Open — awaiting BE implementation |
| **Probe env** | `https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io` |
| **Probe auth** | `Authorization: Bearer pantheon-dev-browser:reviewer`, `X-Dry-Run: 1` |

## 0. Scope

Frontend has live-wired every write path in Pack D BFF API Contract + Persona Onboarding Wizard Spec (2026-05-28). Two probes against dev BFF show **15 write endpoints still return 404 / 405 / 410** — i.e. not implemented or deprecated without a documented replacement. FE currently masks these with `withWriteFallback` (writeOverlay 30 min TTL + `LiveStatusBanner` degraded strip), but the user-facing flows below cannot complete end-to-end until BE lands the routes in this document.

### Upstream sources

- `.lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md`
- `.lovable/spec/v4/pack-d/Pantheon_Pack_D_StateMachine_Contract.md`
- `.lovable/spec/v4/pack-d/Pantheon_Pack_D_SSE_Event_Contract.md`
- `.lovable/spec/v4/pack-d/Pantheon_Pack_D_Permission_Contract.md`
- `.lovable/feedback/2026-05-07-final/Pantheon_BFF_Contract_Spec_2026-05-07_Final.md` (OpenAPI)
- `docs/04/pantheon_persona_onboarding_wizard_2026-05-28/PERSONA_ONBOARDING_WIZARD_SPEC.md`

### Probe evidence

- `.lovable/audits/bff-backend-write-probe-2026-05-28.md` (31 endpoints, 8 open)
- `.lovable/audits/persona-onboarding-endpoint-probe-2026-05-28.md` (8 endpoints, 7 open)
- `scripts/probe-bff-write-paths.mjs`
- `scripts/probe-persona-onboarding-endpoints.mjs`

### Out of scope

- New entity / new spec design — this doc only closes gaps **vs. existing specs**.
- FE changes — `withWriteFallback` already shipped.

---

## 1. Headline

| Group | Total routes | Open | Severity | Blocks |
|---|---|---|---|---|
| Persona Onboarding (lifecycle / binding / plan / approval / runtime + F4 read) | 8 | **7** | **P0** | Wizard cannot drive draft → active; 2 stuck dev personas |
| Action confirm (HighRiskConfirm 2-step) | 1 | **1** | **P0** | Every high-risk action (retire, promote_live, force-transition…) stuck at "awaiting confirm" |
| Entity create | 9 (P0-D) | 1 | P1 | Cannot create runtime entity |
| Agora writes | 7 (P1-E) | 5 | P1 | Signals / feedback / triage / coaching / postmortems all degraded |
| v5 Intervention batch | 8 (P1-C) | 1 | P2 | Batch decide unavailable; per-item works |
| Sentinel rule coverage | — | — | P2 | 13 personas `degraded(85)` produce 0 findings |
| **Endpoints open** | — | **15** | — | — |

### Open endpoints — one-line index

```
P0  POST /bff/personas/{id}/actions/AdvanceLifecycle              410 (deprecated, no replacement documented)
P0  POST /bff/capital-pools/{id}/actions/ApprovePool              410 (deprecated, no replacement documented)
P0  POST /bff/runtimes/{id}/actions/StartRuntime                  410 (deprecated, no replacement documented)
P0  POST /api/v1/bindings                                          405
P0  POST /api/v1/deployment-plans                                  405
P0  POST /api/v1/approval-decisions                                405
P0  GET  /api/v1/operator/persona-management/{id}  (+ data.health) 404 / F4 health field missing
P0  POST /bff/command-confirmations/{token}/confirm                404
P1  POST /bff/runtimes                                             405
P1  POST /bff/agora/signals                                        405
P1  POST /bff/agora/feedback                                       404
P1  POST /bff/agora/inbox/{id}/triage                              404
P1  POST /bff/agora/skill-coaching                                 404
P1  POST /bff/agora/postmortems                                    405
P2  POST /bff/v5/interventions/batch-decide                        405
```

---

## 2. Cross-cutting requirements (apply to every endpoint below)

Re-stated from Pack D for convenience. **No exceptions.**

### 2.1 Request headers

| Header | Required | Note |
|---|---|---|
| `Authorization: Bearer <jwt>` | yes | Pack D Session/Auth Contract |
| `Content-Type: application/json` | yes (write) | |
| `Idempotency-Key` | yes (write) | Replay window ≥ 24h, return original response |
| `X-Correlation-Id` | yes | Echoed in response `meta.correlationId` |
| `X-Request-Id` | yes | Per-request UUID |
| `X-BFF-Api-Version: 2026-05-07` | yes | Reject mismatched versions with `VERSION_MISMATCH` |
| `X-Dry-Run: 1` | optional | Validate only, do not persist, return `meta.dryRun=true` |

### 2.2 Response envelope

**Success** (2xx):
```json
{
  "data": { /* entity or { commandId, status } for action commands */ },
  "meta": { "correlationId": "...", "snapshot_at": "ISO8601", "dryRun": false }
}
```
Action commands return HTTP 202 + `data.status: "accepted" | "queued" | "running"` + `data.commandId` per Pack D `ActionCommandStatus` enum.

**Error** (4xx/5xx) — Pack D 26-code envelope:
```json
{
  "error": {
    "code": "ONE_OF_26_CANONICAL_CODES",
    "i18nKey": "errors.<CODE>",
    "message": "human-readable",
    "retryable": false,
    "userActionable": true,
    "details": { /* code-specific */ }
  },
  "meta": { "correlationId": "..." }
}
```

Allowed codes (Pack D §D21): `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`, `CONFLICT`, `PRECONDITION_FAILED`, `RATE_LIMITED`, `IDEMPOTENCY_REPLAY`, `VERSION_MISMATCH`, `OPERATION_NOT_ALLOWED`, `MANDATE_BREACH`, `STATE_TRANSITION_INVALID`, `APPROVAL_REQUIRED`, `TWO_MAN_REQUIRED`, `CONFIRM_TOKEN_EXPIRED`, `CONFIRM_TOKEN_INVALID`, `COOLDOWN_ACTIVE`, `BREAK_GLASS_REQUIRED`, `MEMO_REQUIRED`, `INSUFFICIENT_PERMISSIONS`, `DEPENDENCY_FAILURE`, `UPSTREAM_TIMEOUT`, `INTERNAL_ERROR`, `MAINTENANCE`, `NOT_IMPLEMENTED`, `METHOD_NOT_ALLOWED`.

### 2.3 Audit chain (Pack D §D26)

Every write must append one audit-chain entry with `prevHash`, `hash`, `evidenceKind` (Pack D 19+3 EvidenceKind enum). Retention ≥ 7 years. Listed per endpoint in §3.

### 2.4 SSE invalidation

Every state-changing write must publish on the matching channel (Pack D `ENTITY_TO_SSE_CHANNEL`) so FE `useLiveListV1` cache invalidates. Listed per endpoint.

### 2.5 Deprecated route policy

If a `410 Gone` is returned, the `error.details.replacement` field MUST contain the canonical replacement route. OpenAPI must list the replacement. Otherwise treat as P0 regression.

---

## 3. Endpoint requirement cards

Format per card:
- **Route + Method**
- **Probe observation** (status + envelope snippet, from 2026-05-28 evidence)
- **FE call site**
- **Spec reference**
- **Request body schema**
- **Success response**
- **Error responses** (typed 4xx subset)
- **State machine effect**
- **SSE channel(s) to publish**
- **EvidenceKind** (audit chain)
- **Permission** (Pack D Permission Contract)
- **Acceptance**
- **FE fallback removal condition**

---

### Card P0-1 — `POST /bff/personas/{id}/actions/AdvanceLifecycle`

| Field | Value |
|---|---|
| Probe | `410 OPERATION_NOT_ALLOWED` `details.reason=route_deprecated`, `details.replacement` **missing** |
| FE call site | `src/management/pages/PersonaOnboarding.tsx` step 1 → `personaOnboardingClient.advanceLifecycle()` |
| Spec | Pack D §D-PersonaActions; Wizard Spec §7.2 |
| Body | `{ target_state: "paper_owner" \| "live_owner" \| "retired", confirm_token: string, memo?: string }` |
| Success | `202` `{ data: { status: "accepted", commandId, persona_id, from_state, to_state }, meta }` |
| Errors | 401 `UNAUTHENTICATED`, 403 `INSUFFICIENT_PERMISSIONS`, 409 `STATE_TRANSITION_INVALID`, 412 `CONFIRM_TOKEN_INVALID`, 422 `VALIDATION_FAILED` |
| State machine | Pack D persona lifecycle: `draft → paper_owner → live_owner → retired` (no skip; retire allowed from any non-retired) |
| SSE | `personas:{id}`, `management.persona-fleet`, `audit:persona-{id}` |
| EvidenceKind | `persona.lifecycle.advance` |
| Permission | `persona_operator` for paper; `live_owner_approver` + MFA for live; `persona_operator` for retire |
| Acceptance | Probe returns 202 + commandId; persona `lifecycle_state` reflects new state within 2s |
| FE removal | `scripts/probe-persona-onboarding-endpoints.mjs` stage 1 green |

**BE action required**: either restore this route or publish replacement (e.g. `POST /bff/personas/{id}/lifecycle:advance`) and update OpenAPI + this doc.

---

### Card P0-2 — `POST /bff/capital-pools/{id}/actions/ApprovePool`

| Field | Value |
|---|---|
| Probe | `410 OPERATION_NOT_ALLOWED route_deprecated` no replacement |
| FE call site | `PersonaOnboarding.tsx` step 2b |
| Spec | Pack D §D-CapitalPoolActions; Wizard §7.3 |
| Body | `{ memo: string (≥8 chars), confirm_token?: string }` |
| Success | `202` `{ data: { status: "accepted", commandId, pool_id, state: "approved" }, meta }` |
| Errors | 403 `FORBIDDEN`, 409 `STATE_TRANSITION_INVALID` (already approved), 422 `MEMO_REQUIRED` |
| State machine | `draft → approved` (one-way; revoke is separate action) |
| SSE | `capital-pools:{id}`, `management.capital-pools` |
| EvidenceKind | `capital_pool.approve` |
| Permission | `treasury_approver` |
| Acceptance | 202 + pool state visible as `approved` in `GET /bff/capital-pools/{id}` |
| FE removal | Probe stage 2b green |

---

### Card P0-3 — `POST /bff/runtimes/{id}/actions/StartRuntime`

| Field | Value |
|---|---|
| Probe | `410 OPERATION_NOT_ALLOWED route_deprecated` no replacement |
| FE call site | `PersonaOnboarding.tsx` step 5 |
| Spec | Pack D §D-RuntimeActions; Wizard §7.6 |
| Body | `{ confirm_token: string, two_man_token?: string }` (two-man required for live runtime) |
| Success | `202` `{ data: { status: "accepted", commandId, runtime_id, state: "starting" }, meta }` |
| Errors | 403 `INSUFFICIENT_PERMISSIONS`, 403 `TWO_MAN_REQUIRED`, 409 `STATE_TRANSITION_INVALID`, 412 `CONFIRM_TOKEN_EXPIRED`, 423 `COOLDOWN_ACTIVE` |
| State machine | `stopped → starting → running` (BE drives `starting→running` via runtime daemon) |
| SSE | `runtimes:{id}`, `management.runtime-status` |
| EvidenceKind | `runtime.start` |
| Permission | `runtime_operator` (paper); `live_owner_approver` + two-man (live) |
| Acceptance | 202 then SSE `runtime.status=running` within `uiBudgets.runtimeStart` (Pack D = 30s) |
| FE removal | Probe stage 5 green |

---

### Card P0-4 — `POST /api/v1/bindings`

| Field | Value |
|---|---|
| Probe | `405 Method Not Allowed` |
| FE call site | `PersonaOnboarding.tsx` step 2c → `personaOnboardingClient.createBinding()` |
| Spec | Wizard Spec §4.2c |
| Body | `{ persona_id: string, capital_pool_id: string, role: "paper_owner" \| "live_owner", allowed_deployment_scope: "paper" \| "live", budget: number, expires_at?: string }` |
| Success | `201` `{ data: { id, persona_id, capital_pool_id, role, allowed_deployment_scope, budget, created_at }, meta }` |
| Errors | 403 `FORBIDDEN`, 409 `CONFLICT` (binding already exists), 422 `VALIDATION_FAILED` (pool not approved, persona lifecycle mismatch) |
| State machine | Creates binding entity; persona readiness stage `binding=done` derived |
| SSE | `bindings:{persona_id}`, `personas:{persona_id}` |
| EvidenceKind | `binding.create` |
| Permission | `persona_operator` + binding's role-implied permission |
| Acceptance | Probe stage 2c returns 201 with binding id; included in `GET /api/v1/operator/persona-management/{id}.bindings[]` |
| FE removal | Probe stage 2c green |

---

### Card P0-5 — `POST /api/v1/deployment-plans`

| Field | Value |
|---|---|
| Probe | `405` |
| FE call site | `PersonaOnboarding.tsx` step 3 |
| Spec | Wizard §4.3 |
| Body | `{ binding_id: string, artifact_id: string, deployment_mode: "paper" \| "live", capital_pool_id: string, params?: object, locked?: boolean }` |
| Success | `201` `{ data: { id, binding_id, artifact_id, deployment_mode, status: "pending_approval", capital_pool_id, locked, created_at }, meta }` |
| Errors | 403, 409 (artifact not approved), 422 |
| State machine | Plan created in `pending_approval`; persona readiness stage `plan=done` |
| SSE | `deployment-plans:{id}`, `personas:{persona_id}` |
| EvidenceKind | `deployment_plan.create` |
| Permission | `persona_operator` |
| Acceptance | Probe stage 3 = 201; plan appears in `persona-management/{id}.deploymentPlans[]` |
| FE removal | Probe stage 3 green |

---

### Card P0-6 — `POST /api/v1/approval-decisions`

| Field | Value |
|---|---|
| Probe | `405` |
| FE call site | `PersonaOnboarding.tsx` step 4 (+ dev `autoApprove` toggle) |
| Spec | Wizard §4.4; Pack D Approval flow |
| Body | `{ plan_id: string, decision: "approve" \| "reject", memo: string (≥8), two_man_token?: string }` |
| Success | `202` `{ data: { status: "accepted", commandId, plan_id, decision, approver_id, decided_at }, meta }` |
| Errors | 403 `INSUFFICIENT_PERMISSIONS` (not in approver quorum), 403 `TWO_MAN_REQUIRED`, 409 (already decided), 422 `MEMO_REQUIRED` |
| State machine | Plan: `pending_approval → approved \| rejected`; persona readiness `approval=done` on approve |
| SSE | `approvals:{plan_id}`, `deployment-plans:{plan_id}`, `personas:{persona_id}` |
| EvidenceKind | `approval.decide` |
| Permission | Pack D `reviewerQuorum` rules; live mode requires `live_owner_approver` + MFA |
| Acceptance | Probe stage 4 = 202; plan status updates within 2s |
| FE removal | Probe stage 4 green |

---

### Card P0-7 — `GET /api/v1/operator/persona-management/{id}` (+ `data.health`)

| Field | Value |
|---|---|
| Probe | `404 RESOURCE_NOT_FOUND` for dev id; `data.health` field absent on existing personas |
| FE call site | `src/lib/bff-v1/management.ts` + `derivePersonaReadiness()` in `src/management/lib/personaReadiness.ts`; `PersonaReadinessCard` |
| Spec | Wizard §5 (F4); Pack D §D-Management |
| Body | n/a (GET) |
| Success | `200` `{ data: { persona: {...}, bindings: [...], deploymentPlans: [...], approvals: [...], runtimeBindings: [...], health: { status: "healthy"\|"degraded"\|"critical", score: 0..100, reasons: HealthReasonCode[] } }, meta }` |
| Errors | 404 (real id miss), 403 |
| HealthReasonCode enum | `persona_lifecycle_not_active`, `no_runtime_binding`, `active_incident`, `drawdown_threshold`, `negative_pnl`, `runtime_status_attention` (Wizard §5) |
| State machine | n/a (read) |
| SSE | n/a |
| EvidenceKind | n/a |
| Permission | `persona_operator` or above |
| Acceptance | Probe F4 returns 200 for a valid persona id with all six top-level keys present; `data.health` parity with `persona-fleet[].health` |
| FE removal | Probe F4 green AND `data.health` defined for ≥1 persona |

---

### Card P0-8 — `POST /bff/command-confirmations/{token}/confirm`

| Field | Value |
|---|---|
| Probe | `404 RESOURCE_NOT_FOUND Not Found` (route missing — GET `/bff/command-confirmations/{token}` works, POST `/confirm` does not) |
| FE call site | `src/components/highRisk/HighRiskConfirm.tsx` → `bffV1.actions.confirmCommand(token)`; used by every action command (persona retire, strategy promote_live, runtime start, break-glass, force-transition…) |
| Spec | Pack D §D-ActionCommand 2-step protocol |
| Body | `{ confirm_token: string, command_id: string, memo?: string, two_man_token?: string }` |
| Success | `202` `{ data: { status: "accepted", commandId, confirmed_at }, meta }` |
| Errors | 404 (token unknown), 410 `CONFIRM_TOKEN_EXPIRED`, 412 `CONFIRM_TOKEN_INVALID`, 403 `TWO_MAN_REQUIRED` |
| State machine | Promotes a `pending_confirmation` command to `accepted` and triggers the underlying action |
| SSE | Depends on underlying command; minimum `audit:command-{commandId}` |
| EvidenceKind | `command.confirm` |
| Permission | Original action's permission + MFA when required |
| Acceptance | Probe `POST /bff/command-confirmations/token-dev/confirm` returns typed 4xx (not 404 RESOURCE_NOT_FOUND with "Not Found"); valid live token returns 202 |
| FE removal | Probe row green; HighRiskConfirm e2e in `e2e/07-high-risk-confirm.spec.ts` passes |

**Severity rationale**: this single route blocks **every** high-risk write in the system. Until it lands, all retire / promote / break-glass paths stop at the confirm dialog.

---

### Card P1-9 — `POST /bff/runtimes`

| Field | Value |
|---|---|
| Probe | `405 Method Not Allowed` (only GET implemented) |
| FE call site | `src/management/components/write/createEntity.ts` runtime branch; `supabase/functions/management-agent/index.ts` — `create_runtime` tool currently disabled |
| Spec | Pack D §D-EntityCreate |
| Body | `{ name: string, persona_id: string, binding_id: string, deployment_plan_id: string, runtime_kind: "paper" \| "live", params?: object }` |
| Success | `201` `{ data: { id, name, state: "stopped", persona_id, binding_id, deployment_plan_id, runtime_kind, created_at }, meta }` |
| Errors | 403, 409 (binding already has runtime), 422 |
| State machine | Creates runtime in `stopped`; persona readiness `runtime` derived |
| SSE | `runtimes:{id}`, `management.runtime-status` |
| EvidenceKind | `runtime.create` |
| Permission | `runtime_operator` |
| Acceptance | Probe row = 201; agent `create_runtime` re-enabled |
| FE removal | Probe row green |

---

### Card P1-10 — `POST /bff/agora/signals`

| Field | Value |
|---|---|
| Probe | `405` |
| FE call site | `src/agora/pages/SignalReview.tsx`, `SignalDetail.tsx` ("create signal" composer) |
| Spec | Pack D §D-Agora; v3 `signalFeedback.ts` write contract |
| Body | `{ title: string, body: string, market?: string, tags?: string[], linkedPersonaIds?: string[], linkedStrategyIds?: string[], severity?: "info"\|"warn"\|"alert" }` |
| Success | `201` `{ data: { id, title, body, status: "open", createdAt, … }, meta }` |
| Errors | 403, 422 |
| SSE | `agora.signals`, `agora.inbox` |
| EvidenceKind | `agora.signal.create` |
| Permission | `analyst` or above |
| Acceptance | Probe row = 201 |
| FE removal | Probe row green |

---

### Card P1-11 — `POST /bff/agora/feedback`

| Field | Value |
|---|---|
| Probe | `404` |
| FE call site | `SignalDetail.tsx` feedback panel, `src/lib/v3/signalFeedback.ts` |
| Spec | Pack D §D-Agora |
| Body | `{ signal_id: string, verdict: "useful" \| "noise" \| "false_positive", memo?: string }` |
| Success | `201` `{ data: { id, signal_id, verdict, author_id, created_at }, meta }` |
| Errors | 403, 404 (signal id), 422 |
| SSE | `agora.signals:{signal_id}` |
| EvidenceKind | `agora.feedback.create` |
| Permission | `analyst` |
| Acceptance | Probe row = 201 |
| FE removal | Probe row green |

---

### Card P1-12 — `POST /bff/agora/inbox/{id}/triage`

| Field | Value |
|---|---|
| Probe | `404` |
| FE call site | `src/agora/pages/AlertTriage.tsx`, `InsightInbox.tsx` |
| Spec | Pack D §D-Agora-Inbox |
| Body | `{ disposition: "ack" \| "snooze" \| "dismiss" \| "escalate", memo?: string, snooze_until?: string }` |
| Success | `202` `{ data: { status: "accepted", commandId, inbox_id, disposition }, meta }` |
| Errors | 403, 404, 422 |
| SSE | `agora.inbox` |
| EvidenceKind | `agora.inbox.triage` |
| Permission | `analyst` |
| Acceptance | Probe row = 202 |
| FE removal | Probe row green |

---

### Card P1-13 — `POST /bff/agora/skill-coaching`

| Field | Value |
|---|---|
| Probe | `404` |
| FE call site | `src/agora/pages/SkillCoaching.tsx` |
| Spec | Pack D §D-Agora-Coaching |
| Body | `{ skill_id: string, persona_id?: string, prompt: string, expected_behavior?: string, examples?: object[] }` |
| Success | `201` `{ data: { id, skill_id, status: "queued", … }, meta }` |
| Errors | 403, 422 |
| SSE | `agora.skill-coaching` |
| EvidenceKind | `agora.skill_coaching.create` |
| Permission | `coach` / `analyst` |
| Acceptance | Probe row = 201 |
| FE removal | Probe row green |

---

### Card P1-14 — `POST /bff/agora/postmortems`

| Field | Value |
|---|---|
| Probe | `405` |
| FE call site | `src/agora/pages/DecisionJournal.tsx` postmortem composer |
| Spec | Pack D §D-Agora |
| Body | `{ incident_id?: string, title: string, body: string, root_cause: string, action_items: { owner, due, description }[] }` |
| Success | `201` `{ data: { id, title, status: "draft", created_at, … }, meta }` |
| Errors | 403, 422 |
| SSE | `agora.postmortems` |
| EvidenceKind | `agora.postmortem.create` |
| Permission | `analyst` |
| Acceptance | Probe row = 201 |
| FE removal | Probe row green |

---

### Card P2-15 — `POST /bff/v5/interventions/batch-decide`

| Field | Value |
|---|---|
| Probe | `405` |
| FE call site | `src/management/components/v5/InterventionBatchDecide.tsx` |
| Spec | Pack D §D-V5-HIQ, Planner Response 2026-05-07 (batch UX) |
| Body | `{ items: { intervention_id: string, decision: "approve" \| "reject", memo: string }[], two_man_token?: string }` (max 50/req) |
| Success | `202` `{ data: { status: "accepted", batchId, accepted: n, rejected: n, items: [{ intervention_id, commandId, status }] }, meta }` |
| Errors | 403 `INSUFFICIENT_PERMISSIONS`, 403 `TWO_MAN_REQUIRED`, 422 `VALIDATION_FAILED` (>50, memo too short) |
| SSE | `v5.interventions` (one event per item) |
| EvidenceKind | `v5.intervention.batch_decide` |
| Permission | Same as single `decide`: `operator` / `approver` / `admin` |
| Acceptance | Probe row = 202 |
| FE removal | Probe row green |

---

## 4. Sentinel rule coverage gap (informational; not an endpoint)

**Observed**: 13 personas with `health.status=degraded`, `health.score=85`, `reasons=[persona_lifecycle_not_active, no_runtime_binding]` produce **zero** Sentinel findings.

**Expected** (per Pack D §D-SentinelRules + v5 SA+SD): every persona health reason code below `healthy` SHOULD emit at least one matching Sentinel finding so it surfaces in the Sentinel timeline and triggers HIQ when severity thresholds met.

**Ask**: Sentinel rule engine adds coverage for the 6 `HealthReasonCode` values (see Card P0-7). FE cannot patch this — rule engine is BE-side only.

---

## 5. Acceptance / verification flow

After each BE deploy:

```bash
# 31-endpoint write probe
node scripts/probe-bff-write-paths.mjs
# 8-endpoint persona onboarding probe
node scripts/probe-persona-onboarding-endpoints.mjs
# Optional: create-then-read probe
node scripts/probe-create-persona-then-fleet.mjs
```

Both probe markdown files (`.lovable/audits/bff-backend-write-probe-2026-05-28.md`, `.lovable/audits/persona-onboarding-endpoint-probe-2026-05-28.md`) regenerate. A row flips to ✅ when:
- `2xx` for a success path, OR
- `4xx` with a Pack D 26-code envelope (not `RESOURCE_NOT_FOUND "Not Found"` and not `VALIDATION_FAILED "Method Not Allowed"`).

When all 15 rows are green:
1. FE removes the corresponding `withWriteFallback` branch in `src/lib/bff-v1/writeFallback.ts` allow-list.
2. FE removes `LiveStatusBanner` write-degraded entries.
3. FE re-enables the `create_runtime` agent tool.
4. Memory entry `mem://audits/bff-write-gap-2026-05-28` is closed.

### CI gate matrix (proposed)

| Route | Method | Expected status (live) | Expected status (dry-run) |
|---|---|---|---|
| `/bff/personas/{id}/actions/AdvanceLifecycle` | POST | 202 | 200 + dryRun:true |
| `/bff/capital-pools/{id}/actions/ApprovePool` | POST | 202 | 200 + dryRun:true |
| `/bff/runtimes/{id}/actions/StartRuntime` | POST | 202 | 200 + dryRun:true |
| `/api/v1/bindings` | POST | 201 | 200 + dryRun:true |
| `/api/v1/deployment-plans` | POST | 201 | 200 + dryRun:true |
| `/api/v1/approval-decisions` | POST | 202 | 200 + dryRun:true |
| `/api/v1/operator/persona-management/{id}` | GET | 200 (incl. `data.health`) | — |
| `/bff/command-confirmations/{token}/confirm` | POST | 202 | 200 + dryRun:true |
| `/bff/runtimes` | POST | 201 | 200 + dryRun:true |
| `/bff/agora/signals` | POST | 201 | 200 + dryRun:true |
| `/bff/agora/feedback` | POST | 201 | 200 + dryRun:true |
| `/bff/agora/inbox/{id}/triage` | POST | 202 | 200 + dryRun:true |
| `/bff/agora/skill-coaching` | POST | 201 | 200 + dryRun:true |
| `/bff/agora/postmortems` | POST | 201 | 200 + dryRun:true |
| `/bff/v5/interventions/batch-decide` | POST | 202 | 200 + dryRun:true |

Recommend wiring this matrix into `.github/workflows/pantheon-integration-gate.yml` as a release-gate step.

---

## 6. Suggested BE work breakdown (ticketing)

| Sprint | Tickets | Unblocks |
|---|---|---|
| Sprint 1 (P0) | Cards 1, 2, 3, 8 (4 routes — restore deprecated + confirm token) | HighRiskConfirm; persona lifecycle; pool approve; runtime start |
| Sprint 2 (P0) | Cards 4, 5, 6, 7 (4 routes — wizard middle stages + F4 health) | Persona onboarding wizard end-to-end on lupin dev |
| Sprint 3 (P1) | Cards 9–14 (6 routes — runtime create + 5 agora) | Agora flows; agent runtime creation |
| Sprint 4 (P2) | Card 15 + Sentinel rule coverage | v5 batch UX; finding emission for degraded personas |

---

## 7. Change log

- **2026-05-28** v1.0 — initial doc consolidating two 2026-05-28 probes + Wizard Spec into a single BE-facing requirements file.
