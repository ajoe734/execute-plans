# Pantheon BFF Backend Handoff

**文件類型**：Backend Handoff / Implementation Guide  
**版本**：2026-05-07-final  
**交付對象**：Pathreon / Pantheon backend team  
**前端對接方**：Lovable / Pantheon frontend  
**狀態**：Frontend BFF Contract v1 — frozen for backend P0 review

---

## 0. What This Package Contains

This handoff package contains four files:

```text
Pantheon_BFF_OpenAPI_3_1.yaml
Pantheon_BFF_AsyncAPI_SSE.md
Pantheon_BFF_DTO_Catalog.md
Pantheon_BFF_Backend_Handoff.md
```

It is derived from the final BFF contract bundle:

```text
base 2026-05-07 spec
+ 2026-05-07-B P0/P1 patch
+ 2026-05-07-C final disposition override
```

Conflict order:

```text
Final C disposition > B patch > base spec
```

---

## 1. BFF Responsibility

The BFF is the frontend-facing contract layer. It is responsible for:

1. Session / tenant / capability normalization.
2. Aggregating backend services into UI-ready DTOs.
3. Pagination / filtering / sorting.
4. Error envelope consistency.
5. Command/action idempotency.
6. Audit correlation and causation chain propagation.
7. High-risk confirm-token and approval coordination.
8. v5 loop / Sentinel / HIQ view-model aggregation.
9. SSE event stream bridging and replay/resync behavior.
10. Capability-based evidence redaction.

The BFF is **not** required to expose backend internal service topology.

---

## 2. Backend Service Ownership Map

| BFF area | Backend owner candidate | Notes |
|---|---|---|
| `/bff/me`, auth, tenant | Auth / Identity / Tenant service | First milestone; frontend cannot integrate real permissions without this |
| capabilities / roles | IdP / IAM service | capabilities are source of truth |
| strategies / personas / artifacts / experiments | Strategy / Research service | must support lifecycle/review/deployment triple for strategies |
| capital pools / allocation / rebalances | Portfolio / Capital service | breach formulas and risk budget needed |
| deployments / runtimes / jobs | Execution / Runtime service | job and deployment events must stream |
| alerts / incidents | Risk / Incident service | must coordinate rollback saga |
| approvals / governance | Governance / Approval service | approval stages and two-man sign |
| audit | Audit / Observability service | all writes/actions must audit |
| v5 control room | BFF aggregation | can derive from underlying services |
| v5 loop runs | Loop orchestration or BFF-derived | backend decision required |
| v5 execution health | Execution metrics + risk + strategy/persona | can start as BFF aggregation |
| v5 Sentinel findings | LLM Sentinel / Risk rules | can start rules-derived if LLM not ready |
| v5 interventions | Governance + Sentinel + Incident aggregation | canonical HIQ endpoint |
| Agora | LLM / Research / Memory services | ask streaming needs SSE ask channel |
| SSE | Event gateway / BFF bridge | Last-Event-Id replay required |

---

## 3. Implementation Phases

## 3.1 P0-A — Session / Auth / Tenant / Permission

Implement:

```http
GET  /bff/me
POST /bff/auth/refresh
POST /bff/logout
GET  /bff/capabilities
GET  /bff/feature-flags
```

Acceptance:

```text
- /bff/me returns user, tenant, roles, capabilities, env, featureFlags, serverTime, sessionExpiresAt, permissionsVersion.
- capabilities use lowercase dot.case.
- roles are UI grouping/bundle hints.
- serverTime is ISO UTC.
- 401 refresh flow retries once only.
```

Frontend replacement target:

```text
src/lib/v4/session/me.ts mockMe() → real /bff/me
```

---

## 3.2 P0-B — Common API Infrastructure

Implement:

```text
ListResponse<T>
BffErrorEnvelope
ErrorCode master list
ErrorDetails
Idempotency-Key handling
X-Correlation-Id propagation
X-Tenant-Id enforcement
Filter/sort/cursor grammar
Rate limit headers
```

Acceptance:

```text
- All list endpoints return ListResponse<T>.
- All write/action endpoints require Idempotency-Key header.
- No request body contains idempotencyKey.
- All error responses use BffErrorEnvelope.
- CommandResponse<T>.data is always present.
- Missing confirm token / approval / two-man returns non-2xx error, not success status.
```

---

## 3.3 P0-C — Core Entity Read APIs

Implement list/get:

```text
/bff/strategies
/bff/personas
/bff/capital-pools
/bff/ranking-formulas
/bff/rebalances
/bff/deployments
/bff/evolution-programs
/bff/research-experiments
/bff/artifacts
/bff/runtimes
/bff/jobs
/bff/alerts
/bff/incidents
/bff/approvals
/bff/audit
/bff/tools
/bff/mcp-servers
/bff/mcp-tools
/bff/skills
/bff/channels
```

Acceptance:

```text
- entity registry pages can load without mock seed.
- actionDescriptors are returned where actions are visible.
- lockVersion is returned for mutable resources.
```

---

## 3.4 P0-D — Write Intent Create APIs

Implement create for Pack F P0 entities:

```http
POST /bff/strategies
POST /bff/personas
POST /bff/capital-pools
POST /bff/ranking-formulas
POST /bff/rebalances
POST /bff/deployments
POST /bff/evolution-programs
POST /bff/research-experiments
POST /bff/artifacts
```

Acceptance:

```text
- Create never creates live/deployed active entity directly.
- Created resources start as draft / discovered / queued / pending.
- Audit event created.
- SSE event emitted.
- CommandResponse<T>.data contains created DTO.
- Idempotency replay returns same result.
```

Frontend replacement target:

```text
src/lib/bff/writeOverlay.ts
src/management/components/write/EntityCreateDrawer.tsx
```

---

## 3.5 P1-A — Action Command Endpoints

Implement generic action pattern:

```http
POST /bff/actions/{entityType}/{entityId}/{actionId}
```

Plus convenience endpoints for alerts, incidents, approvals, MCP tool import.

Acceptance:

```text
- BFF action table is canonical.
- BFF emits v4-compatible ActionDescriptor[].
- v3 availableActions is legacy only.
- Missing preconditions return BffErrorEnvelope.
- Accepted command returns status accepted/queued/completed only.
```

Important:

```text
Success statuses must not include requires_confirm_token / requires_approval / requires_two_man.
```

---

## 3.6 P1-B — v5 Closed-Loop Aggregation APIs

Implement:

```http
GET /bff/v5/control-room
GET /bff/v5/loop-runs
GET /bff/v5/loop-runs/{id}
GET /bff/v5/execution/persona-health
GET /bff/v5/execution/strategy-health
```

Acceptance:

```text
- Control Room loads without frontend deriving from seed.
- Execution Loop shows persona health matrix from backend DTO.
- Strategy health is server-derived or BFF-aggregated.
- LoopRun can be backend-native or BFF-derived, but must be stable for the session.
```

---

## 3.7 P1-C — Sentinel + HIQ

Implement:

```http
GET  /bff/v5/sentinel/findings
GET  /bff/v5/sentinel/findings/{id}
POST /bff/v5/sentinel/findings/{id}/status
POST /bff/v5/sentinel/remediation/build
POST /bff/v5/sentinel/remediation/{actionId}/execute

GET  /bff/v5/interventions
GET  /bff/v5/interventions/{id}
POST /bff/v5/interventions/{id}/claim
POST /bff/v5/interventions/{id}/release
POST /bff/v5/interventions/{id}/escalate
POST /bff/v5/interventions/{id}/decide
POST /bff/v5/interventions/{id}/two-man-sign
POST /bff/v5/interventions/batch-decide
```

Acceptance:

```text
- HIQ canonical namespace is /bff/v5/interventions.
- /bff/hiq may exist as alias only.
- Evidence refs are redacted by capability.
- Two-man sign respects distinct user and role requirements.
- Emergency actions require HighRiskConfirm/confirm token where applicable.
```

---

## 3.8 P1-D — SSE Event Stream

Implement:

```http
GET /bff/events/stream
```

Acceptance:

```text
- Last-Event-Id supported.
- Replay window 24h or resync_required emitted.
- Heartbeat every 15s.
- approval and ask channels included.
- Every write/action emits event with correlationId.
- resync endpoints match AsyncAPI/SSE catalog.
```

---

## 3.9 P1-E — Agora APIs

Implement:

```http
GET  /bff/agora/signals
GET  /bff/agora/signals/{id}
POST /bff/agora/signals/{id}/feedback
POST /bff/agora/signals/{id}/convert-to-insight
POST /bff/agora/signals/{id}/create-research-task

GET  /bff/agora/inbox
GET  /bff/agora/inbox/{id}
POST /bff/agora/inbox/{id}/triage
POST /bff/agora/inbox/{id}/archive
POST /bff/agora/inbox/{id}/convert-to-strategy

GET  /bff/agora/journal
POST /bff/agora/journal
GET  /bff/agora/journal/{id}
PATCH /bff/agora/journal/{id}

POST /bff/agora/ask
GET  /bff/agora/ask/sessions
GET  /bff/agora/ask/sessions/{id}

GET/POST /bff/agora/skill-coaching/sessions
GET/POST /bff/agora/persona-lab/runs
GET/POST /bff/agora/postmortems
GET      /bff/agora/evaluation-suites
GET      /bff/agora/evaluation-runs
```

Acceptance:

```text
- Agora endpoints use /bff/agora, not /agora.
- Ask streaming uses ask SSE channel.
- Journal PATCH uses JSON Merge Patch RFC 7396.
- Agora handoffs create correlationId and audit.
```

---

## 4. Open Backend Questions

Backend must answer these before full implementation:

1. Does backend store Strategy as lifecycle/review/deployment triple already?
2. Does backend have LoopRun model, or should BFF derive loop runs?
3. Which service owns PersonaExecutionHealth?
4. Which service owns StrategyExecutionHealth?
5. Are Sentinel findings produced by LLM service, rules engine, or BFF aggregation first?
6. Which remediation actions can execute directly?
7. Which remediation actions always create intervention items?
8. Which capability IDs are emitted by IdP?
9. Does backend support idempotency persistence across all write endpoints?
10. Can SSE replay window be 24h now?
11. Artifact upload: multipart through BFF or pre-signed storage?
12. Which actions require two-man approval in production?
13. Should AuditEvent ID be minted by BFF or downstream service?
14. Is `/bff/hiq` alias desired, or only `/bff/v5/interventions`?
15. Which Agora endpoints should be real in first backend milestone?

---

## 5. Handoff Acceptance Checklist

Frontend BFF contract is accepted for backend work when:

- [ ] Backend confirms P0-A session/auth plan.
- [ ] Backend confirms list envelope support or BFF adapter strategy.
- [ ] Backend confirms core entity DTO mapping.
- [ ] Backend confirms create endpoints for Pack F 9 entities.
- [ ] Backend confirms idempotency storage.
- [ ] Backend confirms confirm-token lifecycle.
- [ ] Backend confirms approval/two-man semantics.
- [ ] Backend confirms event gateway / SSE replay strategy.
- [ ] Backend confirms Sentinel source of truth.
- [ ] Backend confirms evidence redaction by capability.
- [ ] Backend confirms Agora scope for first milestone.

---

## 6. Frontend Integration Strategy

Do not remove mock BFF immediately. Use feature flags:

```ts
featureFlags.realBffSession
featureFlags.realBffCoreEntities
featureFlags.realBffWrites
featureFlags.realBffActions
featureFlags.realBffV5Loops
featureFlags.realBffSentinel
featureFlags.realBffSse
featureFlags.realBffAgora
```

Recommended rollout:

```text
1. realBffSession
2. realBffCoreEntities read-only
3. realBffWrites for one entity at a time
4. realBffActions for low-risk actions
5. realBffV5Loops
6. realBffSentinel / HIQ
7. realBffSse
8. realBffAgora
```

---

## 7. Backend Deliverables

Backend team should deliver:

```text
1. Endpoint implementation plan by P0/P1 phase.
2. DTO mapping document from backend models to BFF DTOs.
3. Auth/capability mapping.
4. SSE event production plan.
5. Idempotency storage design.
6. Audit correlation propagation design.
7. Sentinel remediation execution policy.
8. Test fixtures for frontend contract tests.
```

---

## 8. Contract Tests Required

Frontend/backend contract tests should include:

```text
GET /bff/me returns required fields.
GET /bff/strategies returns ListResponse<StrategyDTO>.
POST /bff/strategies with Idempotency-Key creates discovered strategy.
POST /bff/actions/strategy/{id}/promote_live without confirm token returns 428 CONFIRM_TOKEN_REQUIRED.
POST /bff/v5/interventions/{id}/two-man-sign does not include idempotencyKey in body.
GET /bff/events/stream emits SseEventEnvelope with schemaVersion=1.
approval.stage.changed event resyncs /bff/approvals.
ask.message.delta event has seq and final transcript endpoint.
Evidence without capability is returned as RedactedEvidenceRef.
PATCH /bff/agora/journal/{id} accepts application/merge-patch+json.
```

---

## 9. Final Backend Handoff Statement

This BFF contract is ready for backend P0 review.

It is not yet a guarantee that every backend service already exists. The BFF may aggregate, adapt, or derive view-models where backend services are not yet split.

The frontend will treat this contract as frozen for v1 integration unless backend identifies a blocker in the open questions.
