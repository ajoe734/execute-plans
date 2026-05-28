# Persona Onboarding Wizard — Endpoint Probe — 2026-05-28

Generated: 2026-05-28T14:24:32.499Z
BFF base: https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io
Spec: docs/04/pantheon_persona_onboarding_wizard_2026-05-28/PERSONA_ONBOARDING_WIZARD_SPEC.md §4.1 / §12 DoD #1

Probe: dev IDs + `X-Dry-Run: 1`. Any typed 4xx envelope counts as implemented.
Wizard wraps every write in `withWriteFallback` so any `❌ NOT implemented` row
auto-degrades to writeOverlay + LiveStatusBanner.

| Stage | Tag | Status | Method | Route | Snippet |
|---|---|---|---|---|---|
| 1 | ? 410 | 410 | POST | /bff/personas/persona-dev/actions/AdvanceLifecycle | {"detail":{"error":{"code":"OPERATION_NOT_ALLOWED","message":"Deprecated BFF route","details":{"reason":"route_deprecated","route":"/bff/personas/{persona_id}/actions/{action_id}","replacement":"/bff/ |
| 2a | ✅ implemented | 201 | POST | /bff/capital-pools | {"id":"pool-20260528-7355ea9a","pool_id":"pool-20260528-7355ea9a","name":"probe-pool","status":"draft","risk_policy_ref":null,"params":{},"created_at":"2026-05-28T14:24:30Z","updated_at":"2026-05-28T1 |
| 2b | ? 410 | 410 | POST | /bff/capital-pools/cp-dev/actions/ApprovePool | {"detail":{"error":{"code":"OPERATION_NOT_ALLOWED","message":"Deprecated BFF route","details":{"reason":"route_deprecated","route":"/bff/capital-pools/{pool_id}/actions/{action_id}","replacement":"/bf |
| 2c | ❌ NOT implemented | 405 | POST | /api/v1/bindings | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable":true,"details":{"reason":"Method Not Allowed"}},"meta":{"cor |
| 3 | ❌ NOT implemented | 405 | POST | /api/v1/deployment-plans | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable":true,"details":{"reason":"Method Not Allowed"}},"meta":{"cor |
| 4 | ❌ NOT implemented | 405 | POST | /api/v1/approval-decisions | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable":true,"details":{"reason":"Method Not Allowed"}},"meta":{"cor |
| 5 | ? 410 | 410 | POST | /bff/runtimes/runtime-dev/actions/StartRuntime | {"detail":{"error":{"code":"OPERATION_NOT_ALLOWED","message":"Deprecated BFF route","details":{"reason":"route_deprecated","route":"/bff/runtimes/{runtime_id}/actions/{action_id}","replacement":"/bff/ |
| F4 | ❌ NOT implemented | 404 | GET | /api/v1/operator/persona-management/persona-dev | {"error":{"code":"RESOURCE_NOT_FOUND","i18nKey":"errors.RESOURCE_NOT_FOUND","message":"Persona not found","retryable":false,"userActionable":true,"details":{"reason":"Persona persona-dev does not exis |
