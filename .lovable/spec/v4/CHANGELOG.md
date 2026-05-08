# Pantheon Spec — Changelog

Format per **Planner Response §E20** (2026-05-07): MAJOR / MINOR / PATCH.

```text
MAJOR: breaking DTO / endpoint / state machine change
MINOR: additive endpoint / field / event
PATCH: wording / examples / i18n / non-breaking clarification
```

---

## 2026-05-08-H — Planner Response 34 backlog landing (FE)

- **Added**:
  - `src/lib/v4/asyncTransitionPolicy.ts` — D05 15-action canonical policy table
  - `src/lib/v4/roleCapabilities.ts` — D12 12-role × Capability bundle + wildcard match
  - `src/lib/v4/listTotalCountPolicy.ts` — D22 list endpoint exact/estimated/absent map
  - `src/lib/v4/cooldownPriority.ts` — C1/D36 cooldown > confirm-token precedence
  - `src/lib/v4/twoManPolicy.ts` — C2/D35 distinct user + role-family policy
  - `src/lib/v4/rollbackSaga.ts` — D04 RollbackSagaDTO + 9-step machine
  - `src/lib/v4/handoffSlaSegments.ts` — D30 SlaSegment[] timeline
  - `src/lib/v4/handoffMultiTurn.ts` — E9 handoff message DTO; supersedes Pack C C037
  - `src/lib/v4/forceTransitionPolicy.ts` — E2 break-glass force-transition
  - `src/lib/v4/memoPolicy.ts` — E4 memo policy by risk class
  - `src/lib/v4/mandateBreachDefaults.ts` — E10 cadence + auto actions
  - `src/lib/v4/reviewerQuorum.ts` — E11 quorum policies (high/critical/live*)
  - `src/lib/v4/uiBudgets.ts` — E12/E14/E15 reproducibility lock + density + lineage budgets
  - `src/lib/v4/stateConflictToast.ts` — E3 STATE_CONFLICT toast helper
  - `src/platform/components/BulkResultDrawer.tsx` — C4 standard partial-failure UI
  - `src/platform/components/RollbackSagaStepper.tsx` — D04 stepper UI
  - `src/platform/components/KeyboardShortcutsHelp.tsx` — E17 `?`-triggered help + `g <x>` chords
  - `src/lib/bff-v1/sse/payloads.ts` — B4 7 typed payload unions
  - `mem://features/planner-response-2026-05-07`
- **Changed**:
  - `src/lib/bff-v1/dto.ts` — A3 EvidenceKind 19-union + RedactedEvidenceRef.redactionReasonCode alias
  - `src/lib/v4/errorCodes.ts` — A2 D21 v26 canonical (H2 superset note removed)
  - `src/lib/bff-v1/sse/channels.ts` — B4 32 channels (+5: confirm_token/cooldown/transition/rollback/handoff)
  - `src/lib/v4/session/me.ts` — B5 MeResponse.counters
  - `src/lib/bff-v1/liveStatus.ts` + `client.ts` — E7 echo X-Request-Id / X-Correlation-Id
- **Deprecated**:
  - `src/lib/v5/timeoutPolicy.ts` (`v0-mock`) — superseded by `src/lib/v4/asyncTransitionPolicy.ts`. Keep for back-compat re-export only.
  - `src/lib/v4/asyncTransitions.ts` 12-row table — superseded by 15-row `asyncTransitionPolicy.ts`.
- **Removed**: none
- **Migration**: import `asyncTransitionPolicy` instead of `asyncTransitions`/`timeoutPolicy` for new code.
- **Backward compatibility**: All older imports continue to resolve.
