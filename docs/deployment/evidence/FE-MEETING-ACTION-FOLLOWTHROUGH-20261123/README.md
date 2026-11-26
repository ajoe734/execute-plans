# FE-MEETING-ACTION-FOLLOWTHROUGH-20261123 — Evidence

Status: `review-candidate` (local component/browser validation complete; independent review, merge and hosted acceptance pending).

Owner: Codex. Assigned reviewer: Codex2. PR: [#1077](https://github.com/ajoe734/execute-plans/pull/1077).

## Scope & Contract Alignment

1. **Meeting Detail (`/management/meetings/:id`, `MeetingDetailPage` + `MeetingActionCards`)**
   - Displays **Previous decisions (`PriorActionsSection`) first**, followed by **Tasks adopted in this meeting (`AdoptedActionsSection`)** and **Participant capability limits (`ParticipantCapabilities`)**, before the deliberation rounds.
   - Renders accountable owner, expected deliverable, acceptance criterion, due/review schedule, execution result (`executed` vs `submitted, not yet accepted` vs `accepted` vs `returned` vs `dispatch_pending`), navigable evidence links (`/management/artifacts/:id` for research artifacts and `/management/evidence?ref_id=:id` for research notes/evidence refs), resolved `evidence_notes` (`title`, `body`), review decision/reason, live owner status (`live_owner_status`) separate from frozen meeting state, and next step (`required_actor`).
   - Distinguishes round discussion (`unchangedPosition` / `維持立場`) from chair decision to retain the pool (`decision_kind: "retain_pool"` / `主席決議維持目前策略池配置`).
   - Distinguishes `prior_actions` owner unavailable (`action_read.status="unavailable"` or `prior_actions_source.status="unavailable"`), permission denied (`status="denied"` / `"forbidden"`), partial/degraded page reads, and genuine zero prior obligations (`not_recorded` / legacy W47 records) even when `prior_actions` is an empty array `[]`.
   - Renders participant capability limits (`allowed`, `advisory_only`, `restricted_data`, `suspended`, `no_workflow`, `expired_access`, `downgraded_access`, `owner_unavailable`) in plain language in `zh-TW` and `en-US` without leaking confidential `persona_id` or `persona_display_name` when `anonymised_labels_revealed` is `false`.
   - Supports `?action=<ticketId>` deep-link focus and back-to-inbox navigation (`/management/human-inbox`).

2. **Human Inbox (`/management/human-inbox` via `HumanInboxPage` and `/management/human-inbox/:id` via `HumanGateDetailPage`)**
   - Consumes canonical flat fields from BFF `_human_input_ticket_items`: `response_action` (`"submit" | "provide_input"`), `can_respond`, `resumes_with`, `human_requirement`, `reason`, `review_reason`, `requested_material`, `acceptance_criterion`, `required_actor`, `ticket_id`, `revision`, `status`, `due_at`, `next_review`, `overdue`, typed `evidence_refs`, `links.ticket`, and `links.meeting`.
   - Preserves direct-human requirement/reason separate from the requested deliverable (`requested_material` / `deliverable`).
   - Enforces authentic operator (`can_respond: true`) vs read-only viewer (`can_respond: false`) permissions while keeping ordinary app write mode (`liveWriteGated`).
   - Sends canonical `PATCH /api/v1/research/tickets/{ticket_id}` with `{ action: "submit" | "provide_input", expected_revision, evidence_note: { title, body, source_refs? }, evidence_refs?: [{ kind, artifact_id }] }` and `Idempotency-Key` header (reusing the same key on same-content retry).
   - Reads back the canonical ticket via `GET /api/v1/research/tickets/{ticket_id}` after submission and across reload after the ticket leaves the `human_actionable=true` queue, displaying the updated ticket status (`submitted` / `in_progress`, `revision`) and resolved `evidence_notes` (`title`, `body`) on the same `ticket_id`.

## Caller Trace & Regression Audit

- `getMeetingDetail` / `normalizeMeetingDetailPayload` (`src/lib/bff-v1/meetings.ts`):
  - Consumed by `MeetingDetailPage` (`src/management/pages/meetings/MeetingDetailPage.tsx`).
  - Existing W47 zero-action `REVIEW` operator disposition (`reviewMeeting`, `operator_review`, `unreadable_reason`) and MT-1/MT-4 rendering remain intact.
- `adaptHumanInboxList` / `adaptInboxMeetingAction` (`src/lib/bff-v1/management.ts`):
  - Consumed by `HumanInboxPage` (`src/management/pages/oversight/_core.tsx`) and `HumanGateDetailPage` (`src/management/pages/oversight/HumanGateDetail.tsx`).
  - Existing `meeting_review`, `meeting_refusal`, `meeting_proposal`, `incident`, `approval`, `promotion_review`, and `readiness_blocker` kinds remain untouched.

## Local Validation

- `npx vitest run src/management/pages/meetings/MeetingActionCards.test.tsx src/lib/bff-v1/meetings.test.ts src/management/pages/oversight/HumanInboxPage.test.tsx src/management/pages/meetings/meetings.test.tsx src/lib/v5/management/__tests__/i18nParity.test.ts src/lib/v5/management/__tests__/management.test.ts src/lib/bff-v1/__tests__/contract-drift.test.ts`: **7 test files, 108 tests passed**.
- `npm run typecheck:app` (`tsc -p tsconfig.app.json --noEmit`): **0 errors**.
- `npm run typecheck:agora` (`tsc -p tsconfig.agora.json --noEmit`): **0 errors**.
- `node scripts/build-e2e-server.mjs` (Playwright prerequisite): **strict-live read-only production build succeeded** using the configured dev BFF base and `SAFE_BUILD_MODE`.


## Review rework and removed paths

- Canonical flat/nested action owner fields now resolve alongside legacy assignees. A service-level `owner` cannot replace a recorded accountable ID. Unrevealed Persona owners use the existing `label_reveal` mapping (`#?` when unavailable); revealed records show their recorded display name. Adapter tests cover both visibility states, and original meeting-route assertions cover Persona and human owners.
- Empty degraded, partial, unknown or paginated prior-action reads retain their incomplete-source warning. The removed early empty branch only runs after source completeness is established. `unavailable`, `forbidden`, and genuine historical empty remain separate.
- Deleted the redundant `resolveInboxMeetingActionEvidenceHref` implementation in `management.ts`; Inbox calls the existing meeting resolver. A typed reference containing `/management/artifacts/artifact-shared` keeps that exact URL on both original pages. Absolute URLs also have adapter regression coverage.
- No historical renderers were removed: proposal/downstream work is distinct from adopted research tickets; operator review closes an unreadable synthesis rather than accepting ticket work; W47 zero-action minutes remain historical truth. Existing incident/approval/promotion/readiness inbox kinds keep their distinct workflows. No alternate route, store, scheduler, style system or translation family was introduced by this rework.
- Current dev caller trace: `MeetingDetailPage -> getMeetingDetail -> consultation-owned minutes`; `HumanInboxPage` / `HumanGateDetailPage -> mgmt.humanInbox -> BFF contributor`; response/readback uses the existing research-owned ticket facade. FE persists no action state. The two declared prerequisite changes remain integrated in the branch base `fac4cfc12`.

## Saved browser evidence

Command (exit 0, **4 passed**):

```sh
MEETING_ACTION_EVIDENCE_DIR=docs/deployment/evidence/FE-MEETING-ACTION-FOLLOWTHROUGH-20261123/browser npx playwright test e2e/meeting-action-followthrough.spec.ts --project=chromium
```

| Locale | Viewport | Outcome record |
|---|---|---|
| en-US | 1440 × 1000 | [desktop](browser/en-US-1440.json) |
| en-US | 390 × 1000 | [narrow](browser/en-US-390.json) |
| zh-TW | 1440 × 1000 | [desktop](browser/zh-TW-1440.json) |
| zh-TW | 390 × 1000 | [narrow](browser/zh-TW-390.json) |

Each case saves five PNGs in `browser/`: meeting, inbox, view-only detail, canonical same-ticket readback after reload, and degraded meeting history. [SHA-256 inventory](browser-sha256.json) binds all 24 saved outputs. The three original normal routes have no horizontal overflow in either viewport. Screenshots use sanitized contract fixtures; shell counts/offline indicators reflect intentionally absent unrelated fixtures.

All browser HTTP boundaries are intercepted on loopback with contained fixture authentication. Real writes remain **false**, and each outcome records **zero mutation requests**. Browser validation exercises required fields, the closed write gate, retained retry text, source permissions, actual evidence hrefs, owner visibility, and reload of the same ticket after the fixture owner state advances independently. Successful PATCH/provide-input, idempotent retry and canonical response continuation are covered in the focused unit/component suites; the browser run does not claim successful submission to a real owner.

Focused verification used the source bytes committed as `f31a17b88`; the build ran before that commit, so its local manifest names predecessor anchor `15df32329`. This is local component evidence, never a deployment SHA claim. Production build, app/agora typechecks and all seven focused suites exited 0. Existing React test scheduling and bundle-size warnings are non-fatal.

## Remaining proof ownership

No known residual FE defect from the requested rework. `MEETING-ACTION-TWO-MEETING-PROOF-20261123` and `MEETING-HOSTED-ACCEPTANCE-20261115` retain real-owner two-meeting and hosted FE/BFF acceptance. This PR has not been declared merged, deployed, or accepted. Only the supervisor integrator may merge after Codex2 approves the frozen PR head; deployment evidence must then name the served commit.
