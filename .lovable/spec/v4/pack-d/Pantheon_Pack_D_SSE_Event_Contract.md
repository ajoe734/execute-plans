# Pantheon Pack D-D — SSE / Realtime Event Contract

**版本**：Pack-D-2026-05-06 / Sub-pack D-D
**對應 Audit D**：D26–D29（4 條）
**狀態**：Canonical
**重要**：禁止 `payload: unknown` 作最終契約。所有 SSE event 必須是 typed discriminated union。

---

## D26 — SseEventEnvelope（Blocker）

```ts
type SseEventEnvelope<T> = {
  id: string;
  schemaVersion: 1;
  channel: string;
  type: string;
  occurredAt: string;     // ISO UTC
  correlationId: string;
  payload: T;
};
```

**Discriminated union 範例**：

```ts
type StrategyEvent =
  | { type: "strategy.lifecycle.changed"; strategyId: string; lifecycleStatus: string; at: string }
  | { type: "strategy.review.updated";    strategyId: string; reviewStatus: string;    at: string }
  | { type: "strategy.deployment.changed"; strategyId: string; deploymentStatus: string; at: string };

type DeploymentEvent =
  | { type: "deployment.status.changed"; deploymentId: string; status: string; at: string }
  | { type: "deployment.rollback.started"; deploymentId: string; incidentId?: string; at: string }
  | { type: "deployment.rollback.success"; deploymentId: string; targetVersion: string; at: string }
  | { type: "deployment.rollback.failed";  deploymentId: string; failureReasonCode: string; at: string };

type IncidentEvent =
  | { type: "incident.opened"; incidentId: string; severity: string; at: string }
  | { type: "incident.mitigation.linked"; incidentId: string; deploymentId: string; at: string }
  | { type: "incident.status.changed"; incidentId: string; status: string; at: string };

type LoopEvent =
  | { type: "loop.run.started"; loopRunId: string; loopType: string; at: string }
  | { type: "loop.run.completed"; loopRunId: string; outcome: string; at: string }
  | { type: "sentinel.finding.created"; findingId: string; severity: string; at: string }
  | { type: "intervention.created"; interventionId: string; tier: string; at: string };

type ApprovalEvent =
  | { type: "approval.created"; approvalId: string; kind: string; subject: string; riskLevel: string; at: string }
  | { type: "approval.stage.changed"; approvalId: string; stageName: string; state: "pending" | "approved" | "rejected" | "skipped"; decidedBy?: string; at: string }
  | { type: "approval.decided"; approvalId: string; decision: "approved" | "rejected" | "changes_requested"; decidedBy: string; at: string }
  | { type: "approval.sla.escalated"; approvalId: string; stageName: string; escalateTo: string; at: string };

type AskEvent =
  | { type: "ask.session.started"; sessionId: string; personaIds: string[]; at: string }
  | { type: "ask.message.delta"; sessionId: string; messageId: string; personaId?: string; delta: string; seq: number; at: string }
  | { type: "ask.tool.called"; sessionId: string; toolName: string; callId: string; at: string }
  | { type: "ask.message.completed"; sessionId: string; messageId: string; at: string }
  | { type: "ask.session.completed"; sessionId: string; summary?: string; at: string }
  | { type: "ask.session.failed"; sessionId: string; errorCode: string; at: string };
```

每 channel 一份 union；新增 event 必須先擴 union。

**Canonical channels**（2026-05-10 backport from FE_Blueprint_Gap addendum 2026-05-09 §B3.2，與 `Pantheon_BFF_AsyncAPI_SSE.md` §4 對齊）：

```text
strategy   persona   capital   deployment   job   risk
approval   ask
loop       sentinel  intervention
signal     insight   journal   postmortem
channel    audit     system
```

`approval` / `ask` 為 first-class channel（前者承載四階段 approval lifecycle，後者承載 streaming Ask Personas session）。

**EvidenceKind canonical 19 + legacy alias 3**（與 `bff-v1/dto.ts` `CanonicalEvidenceKind` / `LegacyEvidenceKindAlias` 對齊）：

```text
canonical: alert incident job audit metric strategy persona deployment runtime policy
           approval artifact signal journal postmortem loop_run sentinel_finding
           intervention ask_session

legacy alias (backend SHOULD NOT emit in new APIs;
              FE 仍接受並 normalize): snapshot rebalance experiment
```

EvidenceKind → capability 對應表落於 `Pantheon_Pack_D_Permission_Contract.md` §EvidenceKind Capability Map。

---

## D27 — Last-Event-Id Replay Window

```text
replayWindowSec  = 86400   (24h)
replayMaxEvents  = 10000
```

**過期行為**：emit `resync_required` event；client 觸發 channel resync endpoint。

---

## D28 — Heartbeat / Timeout

```text
heartbeatSec      = 15
staleAfterSec     = 30
timeoutSec        = 45
reconnectBackoffMs = [1000, 2000, 5000, 10000, 30000]
```

---

## D29 — resync_required Endpoints

| Channel | resync endpoint |
|---|---|
| strategy.* | `/bff/strategies/{id}` 或 `/bff/strategies` |
| persona.*  | `/bff/personas/{id}` 或 `/bff/v5/execution/persona-health` |
| deployment.* | `/bff/deployments/{id}` |
| risk.* | `/bff/alerts`, `/bff/incidents` |
| loop.* | `/bff/v5/loop-runs` |
| sentinel.* | `/bff/v5/sentinel/findings` |
| intervention.* | `/bff/v5/interventions` |
| approval.* | `/bff/approvals`, `/bff/v5/interventions` |
| ask.* | `/bff/agora/ask/sessions/{id}` |
| audit.* | `/bff/audit` |

---

## 落地階段建議

- Batch III（需 BFF spec 同步）：將現有 `bff.realtime.emit("data", { kind, ... })` 包成 `SseEventEnvelope<T>`；先在 `src/lib/v4/sse.ts` 提供 wrapper。
- Batch III：實作 `lastEventId` cache + `resync_required` handler（mock 可重複呼叫對應 endpoint）。
- 2026-05-10 backport：`approval` / `ask` 列為 first-class；EvidenceKind canonical/legacy 對齊 `bff-v1/dto.ts`。
