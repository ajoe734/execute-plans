# Pantheon BFF AsyncAPI / SSE Contract

**文件類型**：SSE / Realtime Event Contract  
**版本**：2026-05-07-final  
**對應 REST contract**：`Pantheon_BFF_OpenAPI_3_1.yaml`  
**基準**：Pantheon BFF Contract Final bundle，C disposition overrides B patch.  
**狀態**：Backend handoff ready

---

## 0. Purpose

This document defines the frontend-facing realtime contract for Pantheon / Pathreon BFF.

The REST OpenAPI contract covers request / response endpoints. This document covers:

```text
GET /bff/events/stream
```

and all event channels needed by:

- Management entity pages
- v5 Closed-Loop Supervisor OS
- Sentinel Findings
- Human Intervention Queue
- Agora Workbench
- Platform/session state

The frontend must never depend on untyped `payload: unknown` for final backend integration. Every event must use a `schemaVersion: 1` envelope and a discriminated payload union.

---

## 1. SSE Endpoint

```http
GET /bff/events/stream
Accept: text/event-stream
Authorization: Bearer <token>
X-Tenant-Id: <tenant_id>
Last-Event-Id: <last_event_id>
```

Optional query:

```text
channels=strategy,approval,ask,sentinel,intervention
```

### 1.0 Stream authentication (Live-Wiring Alignment Patch 2026-05-08)

The browser-native `EventSource` API CANNOT set `Authorization` headers.
Backend MUST therefore support exactly ONE of the two modes below; the FE
selects per-deployment via build-time config.

**Mode A — Cookie session (default for in-tenant browser FE).**
- Authentication propagated via the same HttpOnly session cookie used by
  REST endpoints. FE opens `new EventSource(url, { withCredentials: true })`.
- Backend MUST honour `Set-Cookie` SameSite=Lax + the existing tenant
  resolution middleware. `X-Tenant-Id` is derived server-side from the
  session, NOT sent by the client.
- CORS: `Access-Control-Allow-Credentials: true` and a non-wildcard
  `Access-Control-Allow-Origin`.

**Mode B — Signed stream token (cross-origin / CLI / mobile clients).**
- Client first calls `POST /bff/auth/refresh` (or a dedicated
  `POST /bff/events/stream-token`) with its Bearer token to obtain a
  short-lived `streamToken`.
- Client then opens
  `GET /bff/events/stream?streamToken=<jwt>&channels=...`.
- Backend validates the token's `aud=sse`, `tenantId`, and channel
  capabilities before subscribing.

**Backend-facing correlation (unchanged).** Every emitted event MUST carry
`correlationId` (event-level field), and every `subscribe` server log
entry MUST include the correlation id of the originating request that
caused the subscription (e.g. the page mount that opened the stream).


### 1.1 Timing

```text
heartbeatSec       = 15
staleAfterSec      = 30
timeoutSec         = 45
reconnectBackoffMs = [1000, 2000, 5000, 10000, 30000]
replayWindowSec    = 86400
replayMaxEvents    = 10000
```

### 1.2 Transport format

Each SSE message:

```text
id: <event_id>
event: <channel>
data: <SseEventEnvelope JSON>
```

Heartbeat:

```text
event: system
data: {"schemaVersion":1,"type":"heartbeat",...}
```

---

## 2. Canonical Envelope

```ts
type SseEventEnvelope<TPayload> = {
  schemaVersion: 1;
  id: string;
  channel: SseChannelKind;
  type: string;
  occurredAt: string;      // ISO UTC
  correlationId: string;
  causationId?: string;
  payload: TPayload;
};
```

### 2.1 Required semantics

1. `id` must be monotonically sortable enough for replay.
2. `schemaVersion` is required and currently always `1`.
3. `correlationId` is required for every non-heartbeat event.
4. `causationId` should reference the triggering event or command if available.
5. `occurredAt` is backend server time in UTC.
6. `channel` must match the catalog below.
7. `type` must be one of the event types registered for that channel.

---

## 3. Resync Protocol

When replay is impossible:

```ts
type ResyncRequiredPayload = {
  channel: string;
  reason: "replay_window_expired" | "event_gap" | "schema_version_changed";
  resyncEndpoint: string;
};
```

Envelope:

```json
{
  "schemaVersion": 1,
  "id": "evt_sys_001",
  "channel": "system",
  "type": "resync_required",
  "occurredAt": "2026-05-07T00:00:00.000Z",
  "correlationId": "corr_resync_001",
  "payload": {
    "channel": "sentinel",
    "reason": "replay_window_expired",
    "resyncEndpoint": "/bff/v5/sentinel/findings"
  }
}
```

Frontend behavior:

```text
1. Stop applying events for affected channel.
2. Refetch resyncEndpoint.
3. Replace local channel state.
4. Resume stream from newest event id.
```

---

## 4. Channel Catalog

| Channel | Auth scope | Resync endpoint |
|---|---|---|
| strategy | `strategy.view` | `/bff/strategies` |
| persona | `persona.view` | `/bff/personas`, `/bff/v5/execution/persona-health` |
| capital | `capital.view` | `/bff/capital-pools` |
| deployment | `deployment.read` | `/bff/deployments` |
| job | `job.read` | `/bff/jobs` |
| risk | `risk.alert.read` / `risk.incident.read` | `/bff/alerts`, `/bff/incidents` |
| approval | `approval.read` | `/bff/approvals`, `/bff/v5/interventions` |
| audit | `audit.read` | `/bff/audit` |
| artifact | `artifact.read` | `/bff/artifacts` |
| runtime | `runtime.read` | `/bff/runtimes` |
| mcp | `mcp.read` | `/bff/mcp-servers`, `/bff/mcp-tools` |
| skill | `skill.read` | `/bff/skills` |
| channel | `channel.read` | `/bff/channels` |
| tool | `tool.read` | `/bff/tools` |
| ranking | `ranking.read` | `/bff/ranking-formulas` |
| rebalance | `rebalance.read` | `/bff/rebalances` |
| evolution | `evolution.read` | `/bff/evolution-programs` |
| research | `research.read` | `/bff/research-experiments` |
| signal | `agora.signal.read` | `/bff/agora/signals` |
| inbox | `agora.inbox.read` | `/bff/agora/inbox` |
| journal | `agora.journal.read` | `/bff/agora/journal` |
| postmortem | `postmortem.read` | `/bff/agora/postmortems` |
| ask | `agora.ask` / `persona.consult` | `/bff/agora/ask/sessions/{id}` |
| loop | `loop.read` | `/bff/v5/loop-runs` |
| sentinel | `sentinel.read` | `/bff/v5/sentinel/findings` |
| intervention | `intervention.read` | `/bff/v5/interventions` |
| system | session-dependent | varies |

---

## 5. Management Entity Events

### 5.1 StrategyEvent

```ts
type StrategyEvent =
  | {
      type: "strategy.created";
      strategyId: string;
      name: string;
      at: string;
    }
  | {
      type: "strategy.updated";
      strategyId: string;
      changedFields: string[];
      lockVersion: number;
      at: string;
    }
  | {
      type: "strategy.lifecycle.changed";
      strategyId: string;
      lifecycleStatus: string;
      at: string;
    }
  | {
      type: "strategy.review.updated";
      strategyId: string;
      reviewStatus: string;
      approvalId?: string;
      at: string;
    }
  | {
      type: "strategy.deployment.changed";
      strategyId: string;
      deploymentStatus: string;
      deploymentId?: string;
      at: string;
    };
```

Reducer behavior:

```text
- If event has strategyId and row is loaded, patch row.
- If unknown strategyId, increment pending update count.
- For lifecycle/review/deployment changes, refetch detail if currently open.
```

### 5.2 PersonaEvent

```ts
type PersonaEvent =
  | { type: "persona.created"; personaId: string; name: string; at: string }
  | { type: "persona.updated"; personaId: string; changedFields: string[]; lockVersion: number; at: string }
  | { type: "persona.health.changed"; personaId: string; healthStatus: string; score: number; at: string }
  | { type: "persona.routing.paused"; personaId: string; reason: string; at: string }
  | { type: "persona.mode.changed"; personaId: string; mode: "live" | "paper" | "shadow" | "suspended"; at: string };
```

Resync:

```text
/bff/personas
/bff/v5/execution/persona-health
```

### 5.3 CapitalEvent

```ts
type CapitalEvent =
  | { type: "capital.pool.created"; poolId: string; at: string }
  | { type: "capital.pool.updated"; poolId: string; changedFields: string[]; at: string }
  | { type: "capital.pool.frozen"; poolId: string; reasonCode: string; at: string }
  | { type: "capital.pool.unfrozen"; poolId: string; at: string }
  | { type: "capital.breach.detected"; poolId: string; severity: string; metricId: string; at: string };
```

### 5.4 DeploymentEvent

```ts
type DeploymentEvent =
  | { type: "deployment.created"; deploymentId: string; strategyId?: string; at: string }
  | { type: "deployment.status.changed"; deploymentId: string; status: string; at: string }
  | { type: "deployment.rollback.started"; deploymentId: string; incidentId?: string; at: string }
  | { type: "deployment.rollback.success"; deploymentId: string; targetVersion: string; at: string }
  | { type: "deployment.rollback.failed"; deploymentId: string; failureReasonCode: string; at: string };
```

### 5.5 JobEvent

```ts
type JobEvent =
  | { type: "job.started"; jobId: string; kind: string; owner: string; at: string }
  | { type: "job.progress"; jobId: string; progressPct: number; at: string }
  | { type: "job.completed"; jobId: string; at: string }
  | { type: "job.failed"; jobId: string; failureReasonCode: string; at: string }
  | { type: "job.cancelled"; jobId: string; at: string };
```

### 5.6 RiskEvent

```ts
type RiskEvent =
  | { type: "alert.created"; alertId: string; severity: string; source: string; at: string }
  | { type: "alert.acknowledged"; alertId: string; acknowledgedBy: string; at: string }
  | { type: "incident.opened"; incidentId: string; severity: string; at: string }
  | { type: "incident.status.changed"; incidentId: string; status: string; at: string }
  | { type: "incident.mitigation.linked"; incidentId: string; deploymentId?: string; at: string };
```

---

## 6. Approval Channel

Final bundle requires explicit approval channel.

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

Frontend refresh behavior:

```text
- Governance Queue refetches /bff/approvals.
- HIQ refetches /bff/v5/interventions.
- Detail pages with linked approval refetch their governance tab.
```

---

## 7. v5 Closed-Loop Events

### 7.1 LoopEvent

```ts
type LoopEvent =
  | { type: "loop.run.started"; loopRunId: string; loopKind: "research" | "execution" | "optimization"; at: string }
  | { type: "loop.run.updated"; loopRunId: string; currentStageId?: string; status: string; at: string }
  | { type: "loop.run.blocked"; loopRunId: string; blockerId: string; blockerType: string; at: string }
  | { type: "loop.run.completed"; loopRunId: string; outcome: "succeeded" | "failed" | "cancelled"; at: string };
```

Resync:

```text
/bff/v5/loop-runs
```

### 7.2 SentinelEvent

```ts
type SentinelEvent =
  | { type: "sentinel.finding.created"; findingId: string; severity: string; at: string }
  | { type: "sentinel.finding.status_changed"; findingId: string; status: string; at: string }
  | { type: "sentinel.action.executed"; actionId: string; findingId?: string; mode: string; at: string }
  | { type: "sentinel.action.emergency_executed"; actionId: string; findingId?: string; at: string };
```

Resync:

```text
/bff/v5/sentinel/findings
```

### 7.3 InterventionEvent

```ts
type InterventionEvent =
  | { type: "intervention.created"; interventionId: string; source: string; severity: string; at: string }
  | { type: "intervention.claimed"; interventionId: string; claimedBy: string; at: string }
  | { type: "intervention.released"; interventionId: string; releasedBy: string; at: string }
  | { type: "intervention.escalated"; interventionId: string; escalateTo: string; at: string }
  | { type: "intervention.decided"; interventionId: string; decision: string; decidedBy: string; at: string }
  | { type: "intervention.expired"; interventionId: string; at: string };
```

Resync:

```text
/bff/v5/interventions
```

---

## 8. Agora Events

### 8.1 SignalEvent

```ts
type SignalEvent =
  | { type: "signal.created"; signalId: string; severity: string; confidence: number; at: string }
  | { type: "signal.feedback_added"; signalId: string; rating: string; at: string }
  | { type: "signal.converted"; signalId: string; targetKind: "insight" | "research" | "strategy"; targetId: string; at: string };
```

### 8.2 InsightInboxEvent

```ts
type InsightInboxEvent =
  | { type: "insight.created"; insightId: string; at: string }
  | { type: "insight.triaged"; insightId: string; state: string; at: string }
  | { type: "insight.archived"; insightId: string; at: string }
  | { type: "insight.converted"; insightId: string; targetKind: string; targetId: string; at: string };
```

### 8.3 JournalEvent

```ts
type JournalEvent =
  | { type: "journal.entry_created"; journalId: string; at: string }
  | { type: "journal.entry_updated"; journalId: string; changedFields: string[]; at: string }
  | { type: "journal.entry_linked"; journalId: string; targetKind: string; targetId: string; at: string };
```

### 8.4 AskEvent

Final bundle requires explicit `ask` channel.

```ts
type AskEvent =
  | { type: "ask.session.started"; sessionId: string; personaIds: string[]; at: string }
  | { type: "ask.message.delta"; sessionId: string; messageId: string; personaId?: string; delta: string; seq: number; at: string }
  | { type: "ask.tool.called"; sessionId: string; toolName: string; callId: string; at: string }
  | { type: "ask.message.completed"; sessionId: string; messageId: string; at: string }
  | { type: "ask.session.completed"; sessionId: string; summary?: string; at: string }
  | { type: "ask.session.failed"; sessionId: string; errorCode: string; at: string };
```

Important streaming rule:

```text
ask.message.delta is replayed best-effort within the 24h replay window,
but final transcript must be available through /bff/agora/ask/sessions/{id}.
```

### 8.5 PostmortemEvent

```ts
type PostmortemEvent =
  | { type: "postmortem.created"; postmortemId: string; incidentId?: string; at: string }
  | { type: "postmortem.published"; postmortemId: string; at: string };
```

---

## 9. Capability / Redaction for Evidence Events

### 9.0 EvidenceKind canonical enum (2026-05-10 backport)

Aligns with `src/lib/bff-v1/dto.ts` `CanonicalEvidenceKind` (19) + `LegacyEvidenceKindAlias` (3).
Capability mapping is normative in `Pantheon_Pack_D_Permission_Contract.md` §D-EvidenceKind.

```ts
type CanonicalEvidenceKind =
  | "alert" | "incident" | "job" | "audit" | "metric"
  | "strategy" | "persona" | "deployment" | "runtime" | "policy"
  | "approval" | "artifact" | "signal" | "journal" | "postmortem"
  | "loop_run" | "sentinel_finding" | "intervention" | "ask_session";

// Backend SHOULD NOT emit these in new APIs; FE accepts and normalizes.
type LegacyEvidenceKindAlias = "snapshot" | "rebalance" | "experiment";

type EvidenceKind = CanonicalEvidenceKind | LegacyEvidenceKindAlias;
```



When an event contains evidence references, BFF must only include evidence that the user is allowed to see or return redacted refs.

```ts
type RedactedEvidenceRef = {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: "INSUFFICIENT_CAPABILITY";
  requiredCapability: Capability;
};
```

Example payload:

```json
{
  "type": "sentinel.finding.created",
  "findingId": "find_123",
  "severity": "critical",
  "evidence": [
    {
      "id": "aud_001",
      "kind": "audit",
      "redacted": true,
      "redactionReasonCode": "INSUFFICIENT_CAPABILITY",
      "requiredCapability": "audit.read"
    }
  ],
  "at": "2026-05-07T00:00:00.000Z"
}
```

---

## 10. Frontend Event Application Rules

### 10.1 List pages

For entity list pages:

```text
created / updated event → increment pending update count or patch visible row
deleted / archived event → remove row if visible or show stale warning
```

### 10.2 Detail pages

For currently open entity detail page:

```text
matching entity event → refetch detail endpoint
non-matching event → no-op
```

### 10.3 v5 pages

```text
loop.* → refetch /bff/v5/loop-runs
sentinel.* → refetch /bff/v5/sentinel/findings
intervention.* → refetch /bff/v5/interventions
persona.health.changed → refetch /bff/v5/execution/persona-health
strategy health changes → refetch /bff/v5/execution/strategy-health
```

### 10.4 Ask page

```text
ask.message.delta → append token/delta to active message
ask.message.completed → seal message
ask.session.completed → mark transcript complete and allow handoff
ask.session.failed → show error and allow retry/resync
```

---

## 11. Backend Implementation Checklist

- [ ] `GET /bff/events/stream` supports Last-Event-Id.
- [ ] Replay window is at least 24h or emits `resync_required`.
- [ ] Heartbeat every 15s.
- [ ] Every write/action endpoint emits an event.
- [ ] Every emitted event has correlationId.
- [ ] Every channel in this catalog has a resync endpoint.
- [ ] `approval` and `ask` channels are included.
- [ ] `ask.message.delta` supports ordered `seq`.
- [ ] Evidence refs are permission-filtered or redacted.
- [ ] Stream auth respects tenant and capabilities.

---

## 12. Minimal AsyncAPI Skeleton

This section provides a compact AsyncAPI-like description. Full machine-readable AsyncAPI may be generated later.

```yaml
asyncapi: 3.0.0
info:
  title: Pantheon BFF SSE
  version: 2026-05-07-final
servers:
  production:
    host: api.pantheon.example
    protocol: https
channels:
  events:
    address: /bff/events/stream
    messages:
      SseEventEnvelope:
        payload:
          type: object
          required: [schemaVersion, id, channel, type, occurredAt, correlationId, payload]
operations:
  receiveEvents:
    action: receive
    channel:
      $ref: '#/channels/events'
```
