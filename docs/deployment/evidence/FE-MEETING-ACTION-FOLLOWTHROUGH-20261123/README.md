# FE-MEETING-ACTION-FOLLOWTHROUGH-20261123 — Evidence

Status: `merged-candidate` (local validation complete; not yet deployed or accepted on hosted dev).

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

- `npx vitest run src/management/pages/meetings/MeetingActionCards.test.tsx src/lib/bff-v1/meetings.test.ts src/management/pages/oversight/HumanInboxPage.test.tsx src/management/pages/meetings/meetings.test.tsx src/lib/v5/management/__tests__/i18nParity.test.ts src/lib/v5/management/__tests__/management.test.ts src/lib/bff-v1/__tests__/contract-drift.test.ts`: **7 test files, 96 tests passed**.
- `npm run typecheck:app` (`tsc -p tsconfig.app.json --noEmit`): **0 errors**.
- `npm run typecheck:agora` (`tsc -p tsconfig.agora.json --noEmit`): **0 errors**.
- `env VITE_BFF_MODE=live VITE_BFF_BASE_URL=https://api.dev.mvl-cap.tw VITE_BFF_FALLBACK=strict VITE_BFF_REAL_WRITES=false npm run build`: **strict-live dev production build succeeded**.
