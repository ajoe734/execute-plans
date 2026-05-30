# Persona Onboarding Wizard — Endpoint Probe — 2026-05-28

Generated: 2026-05-30T11:30:08.911Z
BFF base: https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io
Spec: docs/04/pantheon_persona_onboarding_wizard_2026-05-28/PERSONA_ONBOARDING_WIZARD_SPEC.md §4.1 / §12 DoD #1

Probe: dev IDs + `X-Dry-Run: 1`. Any typed 4xx envelope counts as implemented.
Wizard wraps every write in `withWriteFallback` so any `❌ NOT implemented` row
auto-degrades to writeOverlay + LiveStatusBanner.

| Stage | Tag | Status | Method | Route | Snippet |
|---|---|---|---|---|---|
| 1 | ⚠️ network | 0 | POST | /bff/personas/persona-dev/actions/AdvanceLifecycle | TimeoutError: The operation was aborted due to timeout |
| 2a | ⚠️ network | 0 | POST | /bff/capital-pools | TimeoutError: The operation was aborted due to timeout |
| 2b | ⚠️ network | 0 | POST | /bff/capital-pools/cp-dev/actions/ApprovePool | TimeoutError: The operation was aborted due to timeout |
| 2c | ⚠️ network | 0 | POST | /api/v1/bindings | TimeoutError: The operation was aborted due to timeout |
| 3 | ⚠️ network | 0 | POST | /api/v1/deployment-plans | TimeoutError: The operation was aborted due to timeout |
| 4 | ⚠️ network | 0 | POST | /api/v1/approval-decisions | TimeoutError: The operation was aborted due to timeout |
| 5 | ⚠️ network | 0 | POST | /bff/runtimes/runtime-dev/actions/StartRuntime | TimeoutError: The operation was aborted due to timeout |
| F4 | ⚠️ network | 0 | GET | /api/v1/operator/persona-management/persona-dev | TimeoutError: The operation was aborted due to timeout |
