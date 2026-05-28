# Persona Onboarding Wizard — FE Landing — 2026-05-28

Spec: `docs/04/pantheon_persona_onboarding_wizard_2026-05-28/PERSONA_ONBOARDING_WIZARD_SPEC.md` (L4, 2026-05-28).

## Endpoint probe (DoD #1)

Ran `node scripts/probe-persona-onboarding-endpoints.mjs` against
`https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`:

| Stage | Status | Route |
|---|---|---|
| 1   | 410 | POST `/bff/personas/{id}/actions/AdvanceLifecycle` |
| 2a  | **201** | POST `/bff/capital-pools` (✅ live) |
| 2b  | 410 | POST `/bff/capital-pools/{id}/actions/ApprovePool` |
| 2c  | 405 | POST `/api/v1/bindings` |
| 3   | 405 | POST `/api/v1/deployment-plans` |
| 4   | 405 | POST `/api/v1/approval-decisions` |
| 5   | 410 | POST `/bff/runtimes/{id}/actions/StartRuntime` |
| F4  | 404 | GET  `/api/v1/operator/persona-management/{id}` |

→ Wizard wraps every write in `withWriteFallback` (404/405/410/501 ⇒ writeOverlay + LiveStatusBanner). Full probe details in `persona-onboarding-endpoint-probe-2026-05-28.md`.

## Files

- `scripts/probe-persona-onboarding-endpoints.mjs`
- `src/management/lib/personaReadiness.ts` — `derivePersonaReadiness()` + reason i18n map
- `src/management/components/persona/PersonaReadinessCard.tsx` — checklist + health chip
- `src/management/pages/PersonaOnboarding.tsx` — 5-step wizard
- `src/App.tsx` — route `personas/:id/onboarding`
- `src/management/pages/PersonaDetail.tsx` — mounts `PersonaReadinessCard` in Overview tab
- `supabase/functions/management-agent/index.ts` — `start_persona_onboarding` tool
- `src/management/components/agent/AgentPanelBody.tsx` — tool whitelisted
- i18n: `persona.onboarding.*` + `persona.health.*` in zh-TW + en-US

## DoD status

- [x] 8-endpoint smoke audit committed
- [x] Persona card 5-step checklist + health chip (Overview tab)
- [x] Reasons tooltip in zh-TW (Radix Tooltip)
- [x] Wizard completes 5 steps on lupin dev (with overlay fallback on missing routes)
- [x] ErrorCode + retry on failure (StepShell shows code)
- [~] Advanced mode — existing PersonaDetail editors unchanged (no new restrictions)
- [x] dev auto-approve banner in step 4 (rendered only when `import.meta.env.DEV`)
- [ ] `persona-management/{id}.health` parity — pending BE F4

## Deferred

- Capital pool / artifact dropdowns (free-text id for now)
- Dev-only "Reset persona to draft" button
- Persona-fleet row inline readiness expansion
- Agent tool whitelist tests (typecheck/test run pending)
