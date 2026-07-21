# Evidence Operations Gap Audit - 2026-07-02

這份文件追蹤 `/management/evidence` 為什麼不應只是「證據庫列表」，以及這次把它升級成第一梯隊 Evidence Operations 頁面的 gap closeout。

結論先講清楚：如果這頁只能列 packet、hash、建立時間，它不該放在 Management Console 第一梯隊。它只有在能回答「證據在哪裡、可信度如何、是否可解析、關聯到誰、誰要處置、下一步是什麼」時，才有資格和 Persona Fleet、Human Inbox、Trading Pulse 這些日常營運入口放在同一層。

## First-Tier Qualification

Evidence 頁放在第一梯隊的合理條件是：

- Operator 要能從 readiness、artifact、assertion、decision 反查支撐證據。
- Operator 要能看到 evidence ref 的 source availability、credibility tier、verified state、parseability/actionability。
- Operator 要能開啟 source、artifact、linked readiness/assertion/decision/persona/context，或明確看到為什麼不能開。
- Operator 要能看 chain：source -> evidence ref -> artifact/assertion/decision/readiness。
- Operator 要能看 operation state：是否 stale、needs evidence、needs reviewer、resolved。
- Operator 要能處置：mark stale、request more evidence、create disposition task、assign reviewer、resolve。
- Operator 要能看到 audit/task receipt，避免「按了但不知道有沒有生效」。

如果以上任何一大塊缺席，它應降級成 Advanced Registry / Diagnostics，而不是第一梯隊管理頁。

## What Enters Evidence

Evidence 庫接收的是「可被決策或 readiness 依賴的證據引用」，不是任意 log 或任意 UI row。

典型進入條件：

- Proof packet 被 research/orchestration flow 產生，並需要支撐 readiness、assertion、artifact admission 或 decision。
- Artifact provenance 需要保留來源、producer record、model/dataset/context 的可追溯引用。
- Readiness gate 需要引用某個外部/內部來源，證明 canary、broker live、capital binding、BFF HA、strict publish 等狀態。
- Assertion 或 decision 需要持久化「這個判斷依據什麼」。
- Source/document/artifact 因權限或解析失敗而無法開啟，但仍需要留下 evidence ref 與處置狀態。
- Evidence operation command 被提交，例如 `EvidenceRefAction` 的 `mark_stale`、`request_more_evidence`、`create_disposition_task`、`assign_reviewer`、`resolve`。

最小資料面應包含：

- identity: `ref_id`, title/display label, captured time, producer/source type。
- provenance: link type, linked object summary, linked object route if available。
- trust: credibility tier, verified flag, verification method/time。
- source resolution: availability, route, external/open behavior, unavailable reason。
- actionability: traceable/openable/needs-attention state and reasons。
- operation: status, owner/reviewer, task refs, command refs, audit refs, last action/reason。
- relationship graph: artifacts, assertions, decisions, readiness, personas, source contexts。
- chain: nodes/edges/degraded reasons。
- audit/tasks: operation events and disposition task projection。

## Original Gaps

| Gap | Impact |
| --- | --- |
| Static table showed packet-ish rows only | User could not decide whether evidence was useful or broken. |
| Source unavailable was displayed but not actionable | User saw the problem but could not request補證 or mark stale. |
| Linked object was plain text | User could not jump to artifact/readiness/decision owner. |
| No chain view | User could not tell what depended on the evidence. |
| No operation state | User could not know whether someone already started handling the evidence. |
| No durable command action | UI was effectively read-only; no audit receipt. |
| Adapter did not require new operation fields | Backend could send actionability/operation and FE could silently drop it. |
| Tests only protected old "not hash table" behavior | Regression could bring the page back to a prettier registry. |

## Changes In This Branch

- `/management/evidence` list now renders operations-oriented rows:
  - total, traceable, needs attention, verified, open ops metrics;
  - actionability state and reasons;
  - operation status/reviewer;
  - source resolution;
  - linked object link;
  - inspect action.
- Evidence detail now renders:
  - actionability and operation badges in the header;
  - operation panel with reason/reviewer inputs;
  - mark stale, request evidence, create task, assign reviewer, resolve actions;
  - source/credibility/resolution/linked object cards;
  - trace chain;
  - relationships;
  - linked decisions;
  - source note/memory contexts;
  - disposition tasks;
  - audit events.
- Added `submitEvidenceOperation` helper:
  - posts `EvidenceRefAction` to `/bff/v1/commands`;
  - includes target `EvidenceRef`, action id, reason, reviewer/task params;
  - mints correlation id and idempotency key;
  - returns command receipt for UI feedback.
- BFF v1 management adapter now preserves:
  - linked object route;
  - actionability;
  - operation state;
  - allowed actions;
  - disabled action reasons;
  - relationships;
  - chain;
  - tasks;
  - audit events.
- Adapter accepts both camelCase and snake_case action keys, so backend payloads do not accidentally disable all actions.
- Added `/bff/management/evidence/:ref_id` path helper.
- Added English and zh-TW i18n strings for operation/actionability/task/audit/chain UI.
- Tests now cover list, detail, adapter, path catalog, and command submission.

## Architecture After Fix

Read path:

```text
Management route
  -> useV5Live
  -> mgmt.evidence.overview/detail
  -> /bff/management/evidence
  -> /bff/management/evidence/:ref_id
  -> adapter normalizes live BFF envelope
  -> Evidence Operations list/detail UI
```

Write path:

```text
Evidence operation panel
  -> submitEvidenceOperation
  -> submitCommand
  -> POST /bff/v1/commands
  -> command = EvidenceRefAction
  -> operation projection/audit/task state
  -> detail refresh
```

This means the page is no longer a passive registry. It is now the operator surface for evidence disposition.

## Acceptance Evidence

Local validation on this branch:

- `npm test -- src/management/pages/oversight/EvidenceExplorerPage.test.tsx src/lib/bff-v1/__tests__/management.test.ts`: passed, 20 tests.
- `npm test`: passed, 110 files / 1049 tests.
- `npm run build`: passed with existing bundle/CSS warnings.
- `npm run lint`: passed with existing warnings only.
- `PANTHEON_CONTRACT_ROOT=/home/lupin/code/pantheon-evidence-operations-plan npm run test:contract`: passed, 13 schemas / 51 routes / 15 sha256 entries aligned.

## Remaining Risks

- Hosted dev deployment still needs to pick up the merged frontend PR before claiming the live UI is published.
- Operation buttons depend on backend `allowedActions`; if the backend disables actions, UI will correctly show disabled state.
- Relationship depth is only as good as the backend projection. The FE now preserves and renders artifacts/assertions/decisions/readiness/personas/source contexts, but missing backend edges will still appear as absent relationships.
- Full production proof should include a hosted browser probe after merge/deploy to verify `/management/evidence` loads against strict live BFF and command actions return durable receipts.

## Decision

Keep `/management/evidence` in the first-tier page list only under the Evidence Operations definition above.

If future changes remove operation state, chain, relationship drilldown, or durable disposition actions, the page should be demoted back to Advanced Registry/System Diagnostics until those capabilities are restored.
