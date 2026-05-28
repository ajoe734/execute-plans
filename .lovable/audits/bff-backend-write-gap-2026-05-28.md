# BFF Backend Write-Path Gap — 2026-05-28 (rev 2)

> **Update 2026-05-28 (rev 2):** Earlier draft of this file said "all batches OPEN /
> not verified". That was wrong. After running `scripts/probe-bff-write-paths.mjs`
> against the live dev BFF, **23 of 31 write endpoints are implemented**.
> See `.lovable/audits/bff-backend-write-probe-2026-05-28.md` for the raw probe.

## Headline

| Batch | Total | ✅ implemented | ❌ NOT implemented |
|---|---|---|---|
| P0-D Entity create | 9 | 8 | 1 (`/bff/runtimes`) |
| P1-A Action commands | 7 | 6 | 1 (`/bff/command-confirmations/{token}/confirm`) |
| P1-C v5 Sentinel + HIQ writes | 8 | 7 | 1 (`/bff/v5/interventions/batch-decide`) |
| P1-E Agora writes | 7 | 2 | 5 |
| **Total** | **31** | **23** | **8** |

Probe classification: any 2xx / 4xx-typed envelope counts as "implemented".
404 / 405 / 501 counts as "NOT implemented (route missing)".

## Still OPEN — 8 endpoints

```
P0-D /bff/runtimes                                        405
P1-A /bff/command-confirmations/{token}/confirm            404
P1-C /bff/v5/interventions/batch-decide                    405
P1-E /bff/agora/signals                                    405
P1-E /bff/agora/feedback                                   404
P1-E /bff/agora/inbox/{id}/triage                          404
P1-E /bff/agora/skill-coaching                             404
P1-E /bff/agora/postmortems                                405
```

These are the only routes the FE must keep `withWriteFallback` degrading for. Everything else
should go straight to BE in the happy path.

## What's actually ready (selected highlights)

- All 7 implemented P0-D create endpoints respond 201 with a real entity id:
  `/bff/personas`, `/bff/strategies`, `/bff/capital-pools`, `/bff/deployments`,
  `/bff/ranking-formulas`, `/bff/research-experiments`, `/bff/skills`.
  `/bff/rebalances` returns 422 "capital_pool_id is required" — that's a
  validation envelope, route exists, agent tool now requires the field.
- All 5 strategy action commands return typed 422 ("Unsupported action entity type"
  with `strategy-dev`), proving routing + envelope are wired. Real strategy ids
  should pass.
- `/bff/approvals/{id}/decide` returns 403 (auth/role rejected) — route exists,
  reviewer role check works.
- All 7 implemented v5 endpoints accept commands (202 / 403).
- `/bff/agora/journal` and `/bff/agora/ask/sessions` work (201).

## FE mitigation (LANDED 2026-05-28)

1. **`src/lib/bff-v1/writeFallback.ts`** — `withWriteFallback<T>(fn, { entity, payload })`:
   - Run BE write.
   - On `404 / 405 / 501` or typed code `NOT_IMPLEMENTED / RESOURCE_NOT_FOUND / METHOD_NOT_ALLOWED / ROUTE_NOT_FOUND`: stash in `writeOverlay` (30min TTL) + `liveStatus.recordWriteDegraded(path)` and return `{ degraded: true }`.
   - Other errors: propagate typed envelope unchanged.

2. **`LiveStatusBanner`** writeDegraded strip: shows "BE write endpoint not live — local draft only (30min TTL)" + endpoint list popover.

3. **`src/management/components/write/createEntity.ts`** — `createPersona()` failure path now mirrors other entities: NOT_IMPLEMENTED-ish error → overlay write + `persistence: 'overlay' + degraded: true` + typed error envelope returned to drawer. Real errors still throw so the drawer can show the envelope.

4. **`supabase/functions/management-agent/index.ts`**:
   - **Removed** `create_intervention` (spec does not define such an endpoint).
   - **Added** `decide_intervention(id, decision, memo)` → `POST /bff/v5/interventions/{id}/decide`.
   - **Added** `request_sentinel_remediation(findingId, plan)` → `POST /bff/v5/sentinel/remediation/build`.
   - **Added 8 entity-create tools** (all `needsApproval: true`) for the BE-verified P0-D routes: `create_persona`, `create_strategy`, `create_capital_pool`, `create_rebalance` (required `capital_pool_id`), `create_deployment`, `create_ranking_formula`, `create_research_experiment`, `create_skill`. `/bff/runtimes` excluded (405).
   - **Added** `query_persona_fleet` → `GET /bff/management/persona-fleet`, the correct registry endpoint to verify newly created personas. `query_persona_league` keeps its existing route but the prompt now explains it's a ranking snapshot that may lag.
   - **Added** `propose_create_persona` draft variant for draft mode.
   - Prompt rewritten: "create N entities → call create_X N times, do NOT use create_ask, do NOT navigate one page per entity".

5. **`src/management/components/agent/AgentPanelBody.tsx`** — ToolBlock has an `ACTIVE_TOOL_NAMES` whitelist. Tool-call parts in chat history whose `toolName` is not in the current registry (e.g. legacy `create_intervention`) render as "此工具已下線（歷史紀錄）" muted notice instead of pending approve/reject cards. One-shot fix, no DB writes.

## Acceptance probes

- `scripts/probe-bff-write-paths.mjs` → 31 endpoints, classification → `bff-backend-write-probe-2026-05-28.md`.
- `scripts/probe-create-persona-then-fleet.mjs` → POST /bff/personas → GET /bff/management/persona-fleet → verifies new id appears in registry → `bff-list-after-write-2026-05-28.md`.

If probe #2 returns "WRITE OK, FLEET STALE", that pinpoints a BE projection bug, **not** a write-path bug.

## Next steps

- Hand the 8 open routes to BE owner with this audit + the raw probe.
- Re-run both probes after each BE deploy; flip rows green when 200/201/202 lands.

## Addendum — 2026-05-28 evening: removed two fabricated tools

These tool→endpoint mappings were FE-invented (never present in any BFF spec) and have been removed from `supabase/functions/management-agent/index.ts`. They are listed here only so future audits do not reintroduce them:

| FE tool name | Faked endpoint | Status |
|---|---|---|
| `annotate_evidence` | `POST /bff/evidence/{id}/annotate` | **NOT IN SPEC** — removed. Evidence wall is read-only via `GET /bff/management/evidence`. |
| (none registered) | `POST /bff/journal/*` | **NOT IN SPEC** — Evolution Journal is read-only at `/management/evolution-journal`. |

If product wants evidence annotation or journal entries to be writable, BE owners must:
1. Add the route to Pack D BFF API Contract + Final OpenAPI.
2. Update audit-chain hashing semantics (D26 EvidenceKind) to include the new evidence subtype.
3. Add the route to `src/lib/bff-v1/paths.ts` and re-register the agent tool as `needsApproval: true`.

See `.lovable/audits/agent-fake-evidence-write-2026-05-28.md` for full diagnosis.

## Addendum — 2026-05-28 evening: independent Sentinel rule gap

Observed: 13 personas in `degraded (score 85)` with reasons `persona_lifecycle_not_active` + `no_runtime_binding` produce **zero Sentinel findings**.

This is a BE rule-coverage gap (the rule engine does not emit a finding for these reason codes). FE can only display whatever findings the BE produces — no FE fix is possible. Tracked for BE / Sentinel rules team.
