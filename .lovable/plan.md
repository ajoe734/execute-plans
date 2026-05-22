
# Pathreon Management Revamp — Implementation Plan

Source of truth: `user-uploads://Pathreon_Management_Lovable_實作計畫_2026-05-20.md` (will archive into `.lovable/spec/management-2026-05-20/Pathreon_Management_Lovable_Implementation_Plan_2026-05-20.md` as a normative addendum to the existing `Pantheon_Management_Lovable_Spec_2026-05-20.md`).

Scope: Management-only. Agora user UI is touched only by PM-11 (boundary audit).

## Hard rules (must hold across all packs)

- Visible UI must read **Pathreon Management** / Management Cockpit / Persona Fleet / Human Inbox / Trading Pulse / Evolution Journal / Evidence Explorer / Persona Intent Traces / Readiness. **No** One Ring / Ring Bearer / Ring Persona / 魔戒 / Sauron in any visible label, breadcrumb, page title or i18n value. Internal symbol names may stay (`_core.tsx`, `OneRingCockpitPage`) — not a Phase 1 blocker.
- NL Console remains fixed-mock only; **no** direct AI gateway call from FE; strict mode never silently falls back.
- Persona Intent Traces: no reveal/expand/download/reconstruct affordance; `userIntentSummary` treated as already redacted.
- High-risk actions stay behind confirm-token / HighRiskConfirm; enable canary/live buttons stay human-gate placeholders.
- Strict mode (`VITE_BFF_FALLBACK=strict`) must surface typed errors, never seed fallback.

## Sprint sequencing (per spec §16)

### Sprint L-MGMT-1 — Naming + IA + Deep Link (PM-1, PM-2)

1. **Naming Cleanup**
   - Add `/management/cockpit` route; redirect `/management`, `/management/control-room`, `/management/one-ring` → `/management/cockpit`. Preserve `/management/control-room-legacy`, `/management/overview-legacy`.
   - Rewrite all visible strings + i18n values (`nav.pathreonManagement`, `nav.managementCockpit`, `groups.pathreonManagement`, `page.managementCockpit.subtitle`, etc.) in `src/i18n/locales/{en-US,zh-TW}.ts`. Old keys retained but values updated.
   - Update `ManagementLayout.tsx` group titles + page titles + breadcrumbs.
   - Add CI guard: `scripts/check-management-naming.ts` greps `src/management/**` + `src/i18n/**` for forbidden tokens (One Ring, Ring Bearer, Ring Persona, 魔戒, Sauron, 至尊魔戒) and fails build on hit.

2. **Deep Link Model** (`src/lib/v5/management/links.ts`)
   - Add `ManagementLinkSet` + `RelatedHrefKind` enum (12 kinds per §5.3).
   - Add pure resolver `resolveManagementHref(kind, id, opts?)` covering all 17 rules (persona, strategy, capital_pool, capital_pool_live, approval, human_gate, deployment, runtime, evidence, postmortem, evolution, loop_run, sentinel, intervention, broker_live, bff_ha, strict_publish).
   - Wire into every existing oversight page so every row carries `manageHref` + optional `evidenceHref` + `recommendedActionHref`. Fallback labels `Evidence missing` / `No action required` when absent.

### Sprint L-MGMT-2 — Cockpit Visual Upgrade (PM-3)

- Rename `OneRingCockpit` page label → `Pathreon Management Cockpit`. Add 4 new components under `src/management/components/cockpit/`:
  - `SystemStateStrip.tsx` (9-field model, all cards clickable)
  - `LoopFlowMap.tsx` — SVG-based OODA flow with 10 nodes / 10 edges, severity color rules, keyboard-navigable, aria-labeled
  - `PersonaOodaMatrix.tsx` — persona × {Observe, Orient, Decide, Act, Learn} grid, cell click → deep link
  - `CriticalAnomalyPanel.tsx` — top 5–8 with severity / domain / why / recommended action / manage + evidence links
- View-model: `src/lib/v5/management/cockpit.ts` exposing `composeCockpit(seed | live)` → `{ strip, loopFlow, matrix, anomalies }`. 100% pure + tested.
- Replace cards-only layout in `_core.tsx`'s cockpit section with the new composition.

### Sprint L-MGMT-3 — Trading Pulse Ranking + Unified Anomaly (PM-4, PM-5)

- **Trading Pulse**: extend `tradingBaseline.ts` enum to include `champion_artifact`, `30d_rolling`, `last_paper`, `last_canary`, `last_live`, `pre_mutation`, `pre_deployment`, `benchmark`, `custom_period` (validate full 12 values). Add `TradingPulseRankRow` type. Add 8 ranking blocks (Top Improving Personas, Top Degrading Personas, Top Improving Strategies, Worst Execution Quality, Highest Risk Capital Pools, Most Blocked Deployments, Most Human-Intervened Personas, Most Unstable After Training). Each row uses Deep Link model.
- **Unified Anomaly Model** (`src/lib/v5/management/anomaly.ts`):
  - `ManagementAnomalySeverity` (5) + `ManagementAnomalyDomain` (12) + `ManagementAnomaly` shape per §8.2.
  - Components: `AnomalyBadge`, `AnomalyCard`, `AnomalyList` under `src/management/components/`.
  - Apply across Cockpit, Persona Fleet, Human Inbox, Trading Pulse, Evolution Journal, Readiness, Evidence Explorer, Persona Intent Traces.

### Sprint L-MGMT-4 — Human Inbox + Readiness Drilldown (PM-6, PM-7)

- **Human Inbox**: extend `HumanInboxItem` to 9 kinds. Add `/management/human-inbox/:id` detail route with full §9.3 fields (decision type, signatures, TTL, can_proceed, blocking reasons, evidence, decision history, audit refs). Action buttons gated by `canDecide`; canary/live remain placeholders.
- **Readiness**: extend `ReadinessChecklistItem` with `blockerIds`, `manageHref`, `evidenceHref`, `nextActionHref`. Make `ReadinessChecklist` expandable with §10.3 detail panel. Each blocker in `BlockersList` opens a detail with §10.4 fields. Apply to all 5 readiness pages without changing the §4 minimum-fields contract.

### Sprint L-MGMT-5 — Persistent NL Shell + Write Path Hardening (PM-8, PM-10)

- **Persistent NL** (`src/management/components/nl/`):
  - `NlCommandInput.tsx` mounted in TopBar (always-on input)
  - `NlAssistantDrawer.tsx` (Radix right drawer)
  - `useManagementNlContext()` hook computing `ManagementNlContext` from route + selected entity + visible anomaly IDs
  - Extend `ManagementNlIntent` with `explain_current_page` + `explain_selected_anomaly`; extend `managementNl.ts` responder. Strict-mode behaviour unchanged.
- **Write Path Hardening**:
  - `src/lib/bff-v1/personas.ts`: switch `runPersonaAction` to `paths.action("persona", id, action)`.
  - Audit + migrate: Deployment (rollback/reduce/schedule), Approval (decide/batchDecide), Alert acknowledge, Incident transitions, Capital pool risk budget, Persona (suspend/restrict/run_eval).
  - Extend existing AST scan test (`src/lib/v4/__tests__/noLegacyMutations.test.ts`) to fail on any new live caller of `paths.{personaAction,strategyAction,capitalPoolAction,deploymentAction}`.

### Sprint L-MGMT-6 — Live Aggregate Wiring + Agora Boundary (PM-9, PM-11)

- **Live wiring**: add 13 management aggregate paths to `bff-v1/paths.ts` (§12.2). Each new oversight page swaps `seed → useV5Live(aggregate)` with strict-mode typed error surfacing via `LiveStatusBanner`. Mock provider returns existing seeds; live provider hits BFF. No silent fallback in strict.
- **Agora boundary scan**: `scripts/check-agora-boundary.ts` grep `src/agora/**` for forbidden tokens (Management, Governance Queue, Runtime Binding, Capital Binding Live, Operator Gate, Artifact State, Deployment Stage, Pathreon Management). Rename Agora handoff buttons to `Request Review` / `Submit for Validation` etc. Wire as CI guard.

## Testing (PM-spec §15)

Add unit tests: `managementLinkRules`, `managementAnomaly`, `tradingBaseline` (12-enum), `humanInbox`, `readinessChecklist`, `managementNlContext`, `personaIntentPrivacy` (asserts no `rawPrompt` / `reveal*` API on type surface), `canonicalWritePath` (AST scan).

Playwright additions: `/management → /cockpit` redirect, `/one-ring → /cockpit` redirect, cockpit loop-map rendering + clickable anomalies, persona row → detail, human-inbox item → detail/evidence/action, trading-pulse ranking → subject detail, readiness item drilldown → blocker/gate/evidence, NL drawer open from TopBar.

Strict-mode pass with `VITE_BFF_MODE=live`, `VITE_BFF_FALLBACK=strict`, `VITE_BFF_REAL_WRITES=false`: no seed fallback on aggregate pages, NL refuses, readiness typed-error, banner correct.

A11y: loop flow keyboard-navigable; anomaly markers aria-labeled; no color-only severity.

## Deliverables / file layout

```text
.lovable/spec/management-2026-05-20/Pathreon_Management_Lovable_Implementation_Plan_2026-05-20.md   # archived
.lovable/audits/mgmt-revamp-2026-05-20-plan.md                                                       # extended w/ PM-1..PM-11 rows
src/lib/v5/management/
  links.ts            anomaly.ts          cockpit.ts          humanInbox.ts
  tradingBaseline.ts (extended)           readiness.ts (extended)        nl.ts (extended)
src/management/components/cockpit/{SystemStateStrip,LoopFlowMap,PersonaOodaMatrix,CriticalAnomalyPanel}.tsx
src/management/components/{AnomalyBadge,AnomalyCard,AnomalyList}.tsx
src/management/components/nl/{NlCommandInput,NlAssistantDrawer}.tsx + hooks/useManagementNlContext.ts
src/management/pages/oversight/HumanGateDetail.tsx (new /human-inbox/:id)
scripts/{check-management-naming,check-agora-boundary}.ts (+ CI hooks)
src/lib/bff-v1/paths.ts (+ 13 management aggregate paths)
```

Estimated ~30 new files, ~25 modified. No changes to v4 normative layer, Pack D contracts, BFF DTO schemas (only client paths + new aggregates per §12.2). Each sprint must pass `tsc --noEmit` + vitest + i18n parity + axe smoke before the next begins.

## Gate per sprint

- L-MGMT-1: forbidden-token scan = 0 hits; redirects verified in Playwright.
- L-MGMT-2: cockpit renders 4 new components; loop map keyboard-navigable.
- L-MGMT-3: 12 baseline values present; 8 ranking blocks rendered; AnomalyBadge used on ≥7 pages.
- L-MGMT-4: `/human-inbox/:id` reachable; all readiness items expandable with deep links.
- L-MGMT-5: NL drawer mounted globally; AST scan green; personas write path uses canonical `paths.action`.
- L-MGMT-6: strict-mode E2E green; Agora boundary scan = 0 hits.

## Open items for confirmation before build

1. Archive the uploaded plan under `.lovable/spec/management-2026-05-20/` and reference it from `.lovable/spec/INDEX.md` + `mem://index.md` — OK?
2. Sprint cadence: ship sprint-by-sprint with verification gates (recommended), or batch PM-1+PM-2 then pause for review?
3. PM-9 (Live BFF aggregate paths) — implement client paths + mock providers now, leaving real BFF integration as a separate ticket once backend ships the endpoints?
