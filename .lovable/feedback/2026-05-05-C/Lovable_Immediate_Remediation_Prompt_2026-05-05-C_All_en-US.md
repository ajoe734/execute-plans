# Lovable Immediate Remediation Prompt — 2026-05-05-C

Apply `Pantheon_Frontend_Build_Spec_SA_SD_Gap_Remediation_2026-05-05-C_All_en-US.md` to the current Pantheon frontend. Pack C is a normative addendum and overrides v3, Pack A, and Pack B where conflicts exist.

Required implementation work:

1. Implement the legacy → v3 mapping table and `apiVersion='v3'` response behavior.
2. Add failure / timeout / cancellation transitions for state machines and enforce Strategy three-axis invariants.
3. Replace guessed permissions with the Pack C permission matrix.
4. Extend `ActionDescriptor` with group, order, disabledReasonCode, requiresEnv, requiresTwoMan, ttlSec, cooldownSec, and idempotencyKeyRequired.
5. Add confirm token revoke / reuse detection / token-idempotency binding.
6. Use cursor pagination, unified filter/sort, and standard error envelopes.
7. Implement SSE reconnect protocol with Last-Event-Id, heartbeat, replay window, and resync_required.
8. Implement Agora handoff SLA, escalation, reject DTO, and attachment constraints.
9. Add mandate breach monitor, ranking metric metadata, and rebalance quorum / rollback rules.
10. Add WCAG 2.1 AA accessibility, security baseline, performance budget, and cross-page E2E scenarios.
11. Update mock seed scale and state coverage per Pack C C060.
12. Do not use placeholders or implementation guesses for fields defined by this pack.

Acceptance: C001–C078 must have corresponding UI / mock BFF / state machine / permission / i18n / QA implementation, or an explicit future-work guard where the pack states future work.
