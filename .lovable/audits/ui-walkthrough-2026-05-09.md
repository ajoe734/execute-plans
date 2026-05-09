# UI Walkthrough — 2026-05-09 (C5)

Scope: spot-check `wire-up` ✅ items from Planner Response 2026-05-07 to confirm
the FE flows render and behave per spec in **mock mode** (`VITE_BFF_MODE=mock`).
No endpoints required from live backend.

| # | Surface | Wire-up reference | Verified | Notes |
|---|---|---|---|---|
| 1 | `IncidentDetail` → "View Rollback Saga" → `RollbackSagaDrawer` | Planner Response §RollbackSagaDrawer | ✅ | Drawer opens with stepper + compensating actions; closing returns focus to trigger button. |
| 2 | `HighRiskConfirm` cooldown banner | §cooldownPriority | ✅ | When `cooldownSec > 0` and `lastExecutedAt` recent, banner shows remaining seconds and disables Confirm. |
| 3 | `HighRiskConfirm` two-man distinct-user check | §twoManPolicy | ✅ | Same-user secondary approver triggers inline error; distinct user clears it. |
| 4 | `HighRiskConfirm` memo policy | §memoPolicy | ✅ | When `requireMemo=true`, Confirm disabled until memo length ≥ min chars. |
| 5 | Settings → **Break-Glass** tab → `validateForceTransition` | §forceTransitionPolicy | ✅ | Disallowed transitions surface `ERR_FORCE_TRANSITION_DENIED` toast; allowed ones write audit ephemeral entry. |
| 6 | `GovernanceQueue` reviewer quorum progress | §reviewerQuorum | ✅ | Progress chip shows `n/quorum`; CTA disabled until quorum met. |
| 7 | `DataTable` density toggle | §uiBudgets | ✅ | Compact / cozy / comfortable persist per-table via `usePlatform`. |
| 8 | `LineageGraph` node-limit warning | §uiBudgets | ✅ | When nodes > `uiBudgets.lineageMaxNodes`, banner offers depth filter. |
| 9 | `MandatePanel` breach defaults | §mandateBreachDefaults | ✅ | Defaults render greyed; user override marks dirty + enables Save. |
| 10 | G05 ephemeral badge tooltip (AuditTimeline) | spec-conflict-G G05 | ✅ | Radix tooltip explains 30-min mock TTL (i18n: `audit.ephemeralTooltip`). |

## Outstanding

None blocking. Items below are deepening, tracked under §D in
`fe-blueprint-gap-2026-05-09.md`:

- ControlRoom cross-section drill-down
- Sentinel timeline view
- Intervention batch decide
- PersonaHealthMatrix sparkline
