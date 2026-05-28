## Persona Onboarding Wizard — Implementation Plan

Source: `docs/04/pantheon_persona_onboarding_wizard_2026-05-28/PERSONA_ONBOARDING_WIZARD_SPEC.md` (L4, 2026-05-28).

Core idea: BFF stays atomic; FE orchestrates the 5 lifecycle stages (Persona → Binding → Plan → Approval → Runtime) and surfaces "what's missing / next step" everywhere a persona is shown.

### Pre-flight (mandatory per spec §4.1, §12)

1. **Smoke-probe 8 write endpoints** on lupin dev and produce `.lovable/audits/persona-onboarding-endpoint-probe-2026-05-28.md` listing status code + response shape for each. Required before wizard ships:
   - `POST /bff/personas/{id}/actions/AdvanceLifecycle`
   - `POST /bff/capital-pools` + `POST /bff/capital-pools/{id}/actions/ApprovePool`
   - `POST /api/v1/bindings`
   - `POST /api/v1/deployment-plans`
   - `POST /api/v1/approval-decisions`
   - `POST /bff/runtimes/{id}/actions/StartRuntime`
   - `GET /api/v1/operator/persona-management/{id}` (verify `data.health` once BFF F4 lands)

   Any endpoint still 404/stub → wizard step wraps in `withWriteFallback` (writeOverlay degraded banner, same pattern as the 2026-05-28 write-gap audit).

### 1. i18n — health.reasons → zh-TW

Add 6 keys (en-US + zh-TW) per spec §5: `persona.health.lifecycle_not_active`, `no_runtime_binding`, `active_incident`, `drawdown_threshold`, `negative_pnl`, `runtime_status_attention`, plus severity + "next step" labels and wizard step titles.

### 2. Persona readiness model (shared)

New `src/management/lib/personaReadiness.ts`:
- `PersonaStage = "lifecycle" | "binding" | "plan" | "approval" | "runtime"`
- `derivePersonaReadiness(pm)` → `{ stages: {key, done, blockedReason?}[], completed: 0..5, nextStage, healthStatus, reasons }` from `persona-management/{id}` shape (`data.persona.lifecycle_state`, `data.bindings`, `data.deploymentPlans`, `data.approvals`, `data.runtimeBindings`, `data.health`). Tolerant of missing F4 fields — degrade gracefully.

### 3. PersonaReadinessCard (spec §6)

New `src/management/components/persona/PersonaReadinessCard.tsx`:
- Header: name, lifecycle chip, health chip (`healthy`/`degraded`/`critical`, design-token colors).
- 5 fixed checklist rows with `●/○` + i18n label + per-row "next step" button when blocked.
- `reasons[]` expandable Radix tooltip with zh-TW text.
- "Start Onboarding Wizard" primary button; "Advanced (manual)" secondary.
- Happy-path variant (5/5) shows runtime summary + telemetry line.

Mount in: `PersonaDetail.tsx` (top section, replaces ad-hoc status block) and `oversight/_core.tsx` Persona Fleet row expansion.

### 4. Onboarding Wizard (spec §7)

Route: `/management/personas/:id/onboarding` (in-app navigation via existing SmartLink/navigate tool — no new tab).

New files:
- `src/management/pages/PersonaOnboarding.tsx` — shell + step routing + `LifecycleStepper` reuse.
- `src/management/components/persona/onboarding/Step1Lifecycle.tsx` … `Step5Runtime.tsx`.
- `src/management/lib/personaOnboardingClient.ts` — thin wrappers over `runPersonaAction`, `createCapitalPool`, `createBinding`, `createDeploymentPlan`, `submitApproval`, `startRuntime`. Each uses idempotency key + correlation id and surfaces canonical 26-enum ErrorCode.

Per-step behavior follows spec §7.2–§7.6 exactly:
- Step 1: AdvanceLifecycle to `paper_owner` with confirm_token (HighRiskConfirm reuse).
- Step 2: choose/create+approve capital pool, then create binding (paper scope, paper_owner role).
- Step 3: pick approved artifact (filtered), create deployment plan (paper, locked).
- Step 4: submit approval. **dev auto-approve toggle** with prominent warning banner; in non-dev the toggle is hidden and a reviewer queue link is shown.
- Step 5: StartRuntime; on success refetch `persona-management/{id}` and redirect to runtime detail.

State persisted in URL (`?step=N`) so reload survives. No auto-rollback (spec §9.2); on failure show ErrorCode, retry, or "switch to advanced mode" link.

### 5. Advanced mode (spec §8)

PersonaDetail keeps existing per-section editors (lifecycle / bindings / plans / approvals / runtimes). Each section gets a "Create / Advance" button that runs the same atomic call as the wizard. After any single-step success, refetch `persona-management/{id}` so readiness card updates.

Permission gating via existing `usePermissions`:
- wizard: `persona_operator`+
- lifecycle/runtime advance: respective roles
- live mode: `live_owner_approver` + MFA (already enforced by HighRiskConfirm two-man path).

### 6. Dev-only utilities (spec §9.3)

"Reset persona to draft" button in PersonaDetail, **hidden unless `import.meta.env.DEV` or env flag `VITE_PERSONA_DEV_RESET=1`**. Sequences: delete runtime bindings → delete plans → delete bindings → AdvanceLifecycle back to `draft`. Each step uses writeOverlay fallback if endpoint 404.

### 7. Agent integration

Add tools to `supabase/functions/management-agent/index.ts`: `start_persona_onboarding(personaId)` (returns navigate intent to wizard route), `query_persona_readiness(personaId)`. System prompt: when user says "啟動 persona" / "讓 persona 跑起來", prefer wizard navigation over manual tool chains. Whitelist new tools in `AgentPanelBody`.

### 8. Audit + memory

- `.lovable/audits/persona-onboarding-wizard-2026-05-28.md` — implementation log + endpoint probe results + open items from spec §11.
- Memory file `mem://features/persona-onboarding-wizard` referenced from index Core.

### Out of scope

- BFF F4 `data.health` surface (BE side; FE degrades gracefully until live).
- Capital-pool / persona lifecycle action_id enum cleanup (spec §11 open question — BE side).
- New i18n module split (spec §11.5 — kept in existing locale files).

### Acceptance (spec §12 DoD)

- [ ] 8-endpoint smoke audit committed
- [ ] Every persona card renders 5-step checklist + health chip
- [ ] Reasons tooltip in zh-TW
- [ ] Wizard completes draft→active on lupin dev (with overlay fallback where BE missing)
- [ ] ErrorCode + next-step button on failures
- [ ] Advanced mode independently usable
- [ ] dev auto-approve banner visible in step 4
- [ ] `persona-management/{id}.health` matches `persona-fleet[].health` once F4 lands

### Sequencing

1. Smoke probe + audit (read-only, no FE changes).
2. i18n + readiness model + PersonaReadinessCard wired into PersonaDetail/Fleet.
3. Wizard route + 5 steps behind feature flag `VITE_PERSONA_ONBOARDING=1`.
4. Advanced mode polish + dev reset.
5. Agent tools + memory + final audit + flag flip.
