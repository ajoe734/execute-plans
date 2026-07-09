# Persona has no delete — only retire

Date: 2026-05-28
Owner: FE (Lovable)

## Why personas can't be deleted

1. **Pack D StateMachine Contract (D02)** — `persona.retired` is a **terminal state**.
   The state machine has no `deleted` transition. The only way to take a persona out of
   active service is `retire`, which preserves the entity for audit.
2. **Audit immutability (`src/lib/v4/auditImmutability.ts`, Pack C §C064)** — the
   audit log is append-only; `assertAppendOnly` throws if the log shrinks. Persona ids
   are referenced as `EvidenceKind: "persona"` (D26) in approval / intervention / decision
   chains. Physical deletion would dangle every evidence reference that points at the
   persona, violating immutability.
3. **Retention policy (`src/lib/v4/retention.ts`)** — `persona.retired` carries a
   **7-year retention** (2555 days) and `purgeAllowed: "admin_after_retention"`. Only an
   admin tool, after the retention window, may purge — **never the operator UI**.
4. **BFF surface** — there is no `DELETE /bff/personas/{id}` route in the OpenAPI
   contract (`.lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md`). Lifecycle
   transitions are exposed only through `POST /bff/actions/persona/{id}/{actionId}`.
5. **Sentinel remediation `Accepted` ≠ deleted** — the action whitelist (D04) covers
   `freeze / suspend / retire / rollback / capital_cut`, not `delete`. An `Accepted`
   response only means the remediation plan was queued.

## What the user saw

On 2026-05-28 the user clicked the **red 刪除 button** in `PersonaDetail` (and the
matching Sentinel "強制計畫"). The UI showed success, but the persona stayed in the
fleet registry. That's because the FE wired the button to
`deleteEntity('persona', id)` → `runPersonaAction(id, 'archive', …)`, but `archive`
is not a real persona action — BE silently no-ops / 404s, and the FE swallowed the
error in the legacy `catch` block.

This was **a FE UI bug, not a BE rejection** — the button never should have existed.

## Fixes landed (this commit)

| File | Change |
| --- | --- |
| `src/management/pages/PersonaDetail.tsx` | Removed red `Trash2` 刪除 button, removed `AlertDialog`, removed `deleteEntity` import. Added an **Archive (封存)** button next to Suspend, routed through `HighRiskConfirm` (`actionId: persona.retire`) → `runPersonaAction(id, 'retire', { memo, confirmToken })`. |
| `src/management/components/write/createEntity.ts` | `deleteEntity('persona', …)` now throws an explicit error pointing at `runPersonaAction(id, 'retire', …)`. Other entities unchanged (they're still overlay-only soft-delete). |
| `supabase/functions/management-agent/index.ts` | Added `retire_persona` tool (`needsApproval: true`, `POST /bff/actions/persona/{id}/retire`). Updated system prompt with an explicit "personas cannot be deleted — use `retire_persona`" rule so the agent stops scanning for a `delete_persona` tool. |
| `src/management/components/agent/AgentPanelBody.tsx` | Added `retire_persona` to `ACTIVE_TOOL_NAMES` whitelist. |
| `src/i18n/locales/{zh-TW,en-US}.ts` | Added `persona.ops.retireTitle / retireDesc / retireHint`. |

## What still needs FE follow-up (next round, not in this commit)

- **Fleet list filtering** — `PersonaFleet*` views do not yet filter `retired` /
  `deprecated` by default; add a `Show retired` toggle (default off) so old personas
  fall off the active board after retire.
- **Other entities** — strategy, deployment, artifact, skill all have similar
  terminal-state semantics (see `RETENTION` in `src/lib/v4/retention.ts`). Audit
  their delete buttons in the next pass.
- **Fork from Retired** — spec'd but no UI shortcut yet; add to `PersonaDetail`
  retired-state empty view.

## What to do with the existing 13 personas

| Group | Count | Action |
| --- | --- | --- |
| 5/13 legacy personas (06627c91, d611ddc2) | 2 | Click **Archive** → confirm. They will leave the default fleet view, audit retained. |
| `dev-probe-*` test personas | 2 | Same — Archive, or filter by `tag=test` once the Fleet filter ships. |
| 9 new draft personas | 9 | Leave running; they auto-advance through the research loop. |

## Acceptance

1. `PersonaDetail` no longer shows a red 刪除 button. The action bar ends with
   **Suspend** and **Archive (封存)**.
2. Clicking **Archive** opens `HighRiskConfirm` → on confirm calls
   `POST /bff/actions/persona/{id}/retire` → navigates back to `/management/personas`.
3. In the agent (confirm / agent mode), the prompt "刪掉 persona X" makes the model
   pick `retire_persona`, not `create_ask` or a fictional delete tool. The approval
   card renders correctly (it's in `ACTIVE_TOOL_NAMES`).
4. Calling `deleteEntity('persona', …)` from any code path throws the explicit
   "use retire" error rather than silently no-op'ing.
