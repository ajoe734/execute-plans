# Lovable Immediate Remediation Prompt — 2026-05-05-B Medium / Low

Apply `Pantheon_Frontend_Build_Spec_SA_SD_Gap_Remediation_2026-05-05-B_Medium_Low_en-US.md` immediately. Do not infer from existing mocks. Do not leave TODOs. Do not keep any item as a future patch target.

## Required fixes

1. Update Notification Center: implement NotificationType enum and NotificationDTO.
2. Update RightDrawer: implement the full RightDrawerSurface enum.
3. Update Global Search: implement SearchEntityType, SearchResultDTO, and BFF score behavior.
4. Update i18n: Persona response language fallback, Accept-Language fallback, BffError.i18nKey.
5. Update Incident: timeline attachments, mitigation, training feedback.
6. Update Jobs: complete JobType set and input/output payloads for every job type, plus progress throttling.
7. Update Agora Handoff: 7 handoff types, SLA, attach-to-strategy endpoint.
8. Update Command Center KPI formulas.
9. Update Strategy list filters/sort and RunExperimentRequest.
10. Update Risk/Review source of truth.
11. Update Skill sandbox schema.
12. Update Committee Evidence Pack.
13. Update Signal Feedback endpoint and fixed 1–5 confidence scale.
14. Update EvaluationSuiteDTO and publish gate.
15. Update SSE catalog and diagnostics endpoint.
16. Update mock naming convention and mock schema alignment.
17. Update route param patterns.
18. Update index count to H=28 / M=41 / L=23.

## Acceptance

All G06–G12, G20–G27, G34–G47, G50–G55, G59–G65, G69–G77, G79–G85, G87–G92 must have concrete implementation and mock coverage. Do not ship UI-only placeholders.
