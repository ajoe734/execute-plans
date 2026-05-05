# Lovable Immediate Remediation Prompt — Pantheon Spec Gap 2026-05-05-A

Use `Pantheon_Frontend_Build_Spec_FULL_v2_en-US.md`, especially Part 9 — SA/SD Gap Remediation Pack 2026-05-05-A, as the highest-priority specification source. Fix the current frontend implementation against this normative addendum first.

## Highest-Priority Items

1. Align Strategy / Persona / CapitalPool / Skill / Memory status enums.
2. Split Strategy into `lifecycleStatus`, `reviewStatus`, and `deploymentStatus`; do not treat `under_review` or `paused` as lifecycle statuses.
3. Normalize all `availableActions` to `ActionDescriptor[]`; string[] is prohibited.
4. Implement Role × Entity × Action permission truth tables.
5. Implement the complete high-risk action catalog and confirm-token flow.
6. Implement the mock endpoint `POST /bff/commands/confirm-token`.
7. Make `/management/risk` the canonical route; `/management/risk-center` may only redirect.
8. Complete CapitalPool mandate schema, Ranking scope × metric matrix, Quarterly Rebalance reviewer / approver, and Evolution schemas.
9. Complete Agora handoff schema, Signal feedback endpoint, confidence scale 1–5, and Committee evidence pack schema.
10. Update mock data so it conforms 100% to the Part 9 canonical DTOs.

## Prohibited

- Do not introduce status enum values not listed in Part 9.
- Do not use `etc.` or TODO comments in place of field definitions.
- Do not allow Agora to directly execute live deploy, capital rebalance, production MCP grant, or skill approval.
- Do not let the frontend infer RBAC locally; UI actions must be driven by BFF `availableActions`.

## Acceptance

After completion, every G01–G92 item in the disposition table must be marked `RESOLVED` or `DEFERRED_WITH_OWNER`; no item may remain blank.
