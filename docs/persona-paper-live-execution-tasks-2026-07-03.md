# Persona Paper/Live Execution Tasks - 2026-07-03

This document turns `docs/persona-paper-live-production-gap-2026-07-03.md`
into dispatchable work packets for the fleet. The gap document is the product
and acceptance source of truth; this file is the implementation queue.

## Execution Goal

Persona must move from a misleading draft/deployed/start-wizard model to a
paper-first operating model:

1. Creating a Persona completes the required bindings and starts paper trading.
2. Paper, canary, and live Personas compete in one league with mode-aware
   ranking.
3. Promotion to canary/live and quarterly live reallocation require Human Inbox
   approval.
4. Emergency risk breaches can be acted on immediately, with evidence and human
   follow-up.
5. Persona Fleet is an operations surface, not an onboarding checklist.

## Dispatch Order

- Phase 1: `PPL-EXEC-001`, `PPL-EXEC-002`, and `PPL-EXEC-006`.
- Phase 2: `PPL-EXEC-003`, `PPL-EXEC-004`, and `PPL-EXEC-005`.
- Phase 3: `PPL-EXEC-007` and final hosted acceptance.

`PPL-EXEC-001` and `PPL-EXEC-002` are the critical path. The rest of the work
can run in parallel once the lifecycle/status contract is stable.

## Fleet Assignment

- Codex lane: execution task maintenance, Persona Fleet FE route behavior,
  hosted proof, load-gate proof, final PR/check/deploy accountability.
- Claude lane: FE Human Inbox, Persona Fleet row/detail UX, create flow UI, and
  test coverage for operator routing.
- Gemini lane: BFF/domain contracts for create, lifecycle projection, ranking,
  promotion review, quarterly review, and emergency intervention.
- Gemini2 lane: dev deployment, BFF latency diagnostics, hosted browser probes,
  evidence capture, and integration-gate reruns.

## Execution Tasks

### PPL-EXEC-001 - One-shot paper-running Persona creation

- Owner lane: Gemini primary, Claude secondary.
- Repo area: BFF persona create contract, FE create flow, evidence/audit
  adapters.
- Depends on: none.
- Problem: A created Persona must not be a long-lived draft shell that needs a
  row-level "startup wizard" later.
- Scope:
  - Replace draft-only create semantics with a governed create flow that binds
    identity, mandate, strategy direction, data grants, paper capital pool, risk
    profile, and paper runtime.
  - Enforce paper/sandbox capital at create time. Live capital binding must be
    rejected or redirected to promotion review.
  - Return one of `paper_running`, `needs_human_approval`, `failed`, or
    `stopped`; do not return ambiguous `deployed` for new creates.
  - Persist evidence for request, binding result, data readback, risk snapshot,
    capital pool, and runtime binding.
  - Update create UI copy and completion screen to say the Persona is entering
    paper trading, not merely becoming a draft.
- Acceptance:
  - Creating a valid Persona yields `paper_running` and a paper capital pool.
  - Missing required grants yields `needs_human_approval` or `failed`, with
    evidence.
  - Creating with live capital is impossible without a Human Inbox promotion
    path.
  - FE tests cover success, approval-needed, and failure states.
  - Hosted dev proof shows a newly created Persona in Persona Fleet without a
    startup-wizard primary action.

### PPL-EXEC-002 - Persona Fleet lifecycle projection normalization

- Owner lane: Gemini primary, Codex secondary.
- Repo area: BFF Persona Fleet projection, FE route adapter, Persona Fleet
  tests.
- Depends on: lifecycle names from `PPL-EXEC-001`.
- Problem: Existing Personas still appear as `deployed`, which makes risk
  findings and row actions sound like pre-runtime onboarding issues.
- Scope:
  - Normalize legacy `deployed` into explicit runtime states:
    `paper_running`, `canary_running`, `live_running`, `needs_human_approval`,
    `rollback_required`, `stopped`, or `failed`.
  - Add row fields: `capital_mode`, `capital_pool_id`, `runtime_binding_id`,
    `review_id`, `review_type`, `league_rank`, `league_score`, and
    `runtime_health`.
  - Rewrite risk finding language to reference actual runtime/capital/review
    state instead of saying already-running Personas are not deployed.
  - Keep `draft` only for unsent/temporary form state.
  - Ensure row primary actions route running states to runtime detail and human
    pending states to Human Inbox review detail.
- Acceptance:
  - No existing deployed/running Persona uses onboarding/start-wizard as the row
    primary action.
  - `deployed` fixture rows render as explicit paper/canary/live runtime states.
  - Risk findings mention concrete blockers such as data stale, capital binding
    invalid, review pending, or runtime paused.
  - Persona Fleet tests cover all lifecycle routing branches.
  - Hosted browser proof captures rows with capital mode and runtime state.

### PPL-EXEC-003 - Unified paper/canary/live league ranking

- Owner lane: Gemini primary, Claude secondary.
- Repo area: ranking BFF, league snapshot, Persona Fleet ranking fields,
  ranking UI.
- Depends on: `PPL-EXEC-002`.
- Problem: Paper and live Personas need to compete together, while the score
  still distinguishes real capital risk from paper-only performance.
- Scope:
  - Build a single league snapshot containing paper, canary, and live Personas.
  - Add mode-aware ranking components: risk-adjusted return, downside control,
    stability, cost/execution, capacity, data reliability, governance penalty,
    and live/paper divergence.
  - Surface rank, score, score delta, capital mode, review recommendation, and
    evidence freshness.
  - Generate promotion/demotion/reallocation candidates without executing live
    changes automatically.
- Acceptance:
  - League API returns one table containing all modes.
  - Paper rows can outrank live rows, but display `capital_mode=paper`.
  - Candidate recommendations include evidence references and do not mutate live
    capital without review approval.
  - UI can filter by mode while defaulting to the unified table.
  - Tests cover scoring inputs, mode labels, and no-auto-live-mutation behavior.

### PPL-EXEC-004 - Human-reviewed promotion to canary/live

- Owner lane: Gemini primary, Claude secondary.
- Repo area: promotion review BFF, Human Inbox detail, Persona Fleet action
  routing.
- Depends on: `PPL-EXEC-001`, `PPL-EXEC-002`, partial `PPL-EXEC-003`.
- Problem: Paper winners need a governed path into canary/live, and operators
  need an obvious place to approve or reject the move.
- Scope:
  - Define eligibility gates: observation window, minimum signals/trades, data
    health, risk health, execution health, evidence freshness, and rollback
    plan.
  - Create promotion candidate records from league snapshots.
  - Route candidates to Human Inbox as `promotion_review`.
  - Support approve, reject, request evidence, and conservative canary approval.
  - On approval, bind canary/live broker/auth/capital only according to the
    reviewed decision.
- Acceptance:
  - A paper Persona can request promotion and appears in Human Inbox.
  - Approval transitions to `canary_authorized_not_started`,
    `canary_running`, or another explicit approved state.
  - Rejection records the reason and keeps the Persona in paper.
  - Persona Fleet row opens the correct Human Inbox review detail.
  - Tests cover approval, rejection, evidence-request, and no-review shortcuts.

### PPL-EXEC-005 - Quarterly review and emergency intervention

- Owner lane: Gemini primary, Gemini2 secondary.
- Repo area: quarterly review BFF, risk sentinel/intervention BFF, Human Inbox,
  evidence operations.
- Depends on: `PPL-EXEC-002`, `PPL-EXEC-003`.
- Problem: Quarterly re-ranking requires human approval, while hard risk
  breaches require immediate system action.
- Scope:
  - Generate quarterly ranking reviews with proposed promotion, demotion,
    replacement, and capital reallocation decisions.
  - Require Human Inbox approval before live capital rebalance or live Persona
    replacement.
  - Implement emergency triggers for hard daily loss, max drawdown, VaR,
    exposure, leverage, concentration, broker/auth/capital invalid state,
    live/paper divergence, data stale, and unauthorized side effects.
  - Allow system actions: freeze new orders, reduce capital, pause Persona,
    rollback artifact, force paper-only, or kill runtime.
  - Create incident evidence and emergency Human Inbox follow-up for every
    immediate action.
- Acceptance:
  - Quarterly review can be approved, rejected, or sent back for evidence.
  - Live rebalance is impossible without review approval.
  - Simulated hard-loss breach pauses or freezes the Persona immediately.
  - Emergency action creates incident evidence and a Human Inbox confirmation
    task.
  - Tests cover quarterly approval, quarterly rejection, and emergency hard stop.

### PPL-EXEC-006 - Management UI mode cleanup

- Owner lane: Claude primary, Codex secondary.
- Repo area: TopBar, Persona Fleet, create Persona, Human Inbox routing, UI
  tests.
- Depends on: `PPL-EXEC-002` contract shape.
- Problem: A global `research / paper / live` selector wrongly implies the
  whole console is in one mode, while Personas actually run mixed paper/live
  competition.
- Scope:
  - Remove or permanently guard the global mode selector from the management
    TopBar.
  - Display mode per row with `capital_mode` and lifecycle state.
  - Rename entry points from startup/onboarding language to create paper Persona
    or runtime/review actions.
  - Ensure Human Inbox owns promotion, quarterly, emergency, rollback, and
    restart approvals.
  - Keep ranking filters local to ranking/league pages, not global console
    state.
- Acceptance:
  - No TopBar `research / paper / live` dropdown appears on management routes.
  - Persona Fleet rows show mode locally.
  - Running rows open runtime detail; human-pending rows open Human Inbox; only
    unsent draft form state can open onboarding.
  - UI tests cover the removed TopBar selector and row action routing.
  - Hosted browser proof captures the cleaned TopBar and Persona Fleet actions.

### PPL-EXEC-007 - Persona Fleet performance and production gate proof

- Owner lane: Gemini2 primary, Codex secondary.
- Repo area: integration gate, route-load gate, hosted browser probes, BFF
  projection/query/cache.
- Depends on: any route/API changes from `PPL-EXEC-001` through
  `PPL-EXEC-006`.
- Problem: Persona Fleet currently feels slow, and the gate previously masked a
  real route-load timeout as `manifest missing`.
- Scope:
  - Keep load-gate manifest propagation reliable even when route-load fails.
  - Measure hosted `/management/persona-fleet` cold load, `/bff/me`, `/health`,
    and `/bff/management/persona-fleet` timings.
  - If repeated hosted BFF first-load latency exceeds the route-load budget,
    improve projection/query/cache/hydration rather than hiding the failure.
  - Add evidence artifacts for pass/fail/missing route-load states.
  - Ensure strict-live browser probes fail on failed BFF calls.
- Acceptance:
  - Integration gate reports the real route-load state and preserves the
    manifest path.
  - Hosted probe records Persona Fleet load timing and BFF timing.
  - `/deployment.json` points at the merged commit being verified.
  - Slow BFF behavior is either fixed or left as an explicit production blocker
    with timing evidence.
  - Final acceptance includes PR number, merge commit, deployment commit, and
    hosted proof links/logs.

## Global Definition Of Done

Every execution task is incomplete until it has:

- A scoped branch and PR against the correct repo target.
- Local validation appropriate to the files changed.
- Tests or fixtures for lifecycle, review, ranking, intervention, or UI routing
  behavior touched by the task.
- Staged changes limited to the task scope.
- A commit with task ID in the subject or body.
- PR checks passing, or a named blocker with exact failing check/log.
- Merge to `dev` when policy allows.
- Dev deployment proof when the task affects runtime behavior.
- Hosted browser/BFF proof for Persona Fleet or Human Inbox behavior affected by
  the task.
- Evidence that no live capital mutation occurs without Human Inbox approval.

## Non-goals

- Do not reintroduce long-lived draft Personas as a normal state.
- Do not make live capital selectable during initial Persona creation.
- Do not use a global console mode selector to represent mixed paper/live fleet
  state.
- Do not auto-promote or auto-rebalance live capital from ranking alone.
- Do not mark a local-only or restarted-process result as completed delivery.

