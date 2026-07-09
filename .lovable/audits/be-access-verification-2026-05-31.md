# BE Dev Access Verification — Post Lupin VM Rebuild — 2026-05-31

> **Context**: BE PR #661 landed (Caddy IaC + cutover). FE switched env to new BFF URLs
> and reran the 3 standing probes. This file is the closing artifact for the access request
> filed at `.lovable/specs/be-requirements/BE_DEV_ACCESS_REQUEST_2026-05-30.md`.

## §0 BE Response Summary (mirrored)

| Item | Value |
|---|---|
| Dev BFF URL | `https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io` |
| Staging BFF URL | `https://pantheon-lupin-staging-bff.104.155.223.192.sslip.io` |
| Bearer token | `pantheon-dev-browser:reviewer` (unchanged, still valid) |
| IaC | `deploy/caddy/{dev,staging}.Caddyfile.tmpl` + `sync-caddy.sh` (idempotent, ownership-safe) |
| Cutover script | `scripts/migrate_to_benjamin_cutover.sh` (auto runs `sync-caddy` post `gh var`) |
| Bug fixed mid-flight | first version used `mv` → file became `lupin:lupin 0600` → `systemctl reload` EACCES (silent: caddy kept old config in memory, /health still 200). Now uses `install -o root -g root -m 644`. |

## §1 Connectivity (FE sandbox → new BFF)

```
GET https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io/health
  → HTTP 200 in 0.755s
  → {"status":"ok","service":"operator-bff","version":"0.2.0","timestamp":"2026-05-31T14:41:27Z"}

GET https://pantheon-lupin-staging-bff.104.155.223.192.sslip.io/health
  → HTTP 200 in 0.870s
  → {"status":"ok","service":"operator-bff","version":"0.2.0","timestamp":"2026-05-31T14:41:27Z"}
```

✅ §2.1 (new URL), §2.2 (firewall), §2.3 (CORS), §2.4 (auth) — all live verified from
agent sandbox egress.

## §2 Write-path probe (31 endpoints) — vs 05-28 baseline

Headline: **23/31 implemented, 8 still NOT implemented** — **unchanged** from 2026-05-28.
VM rebuild restored access only; the BE write-gap workstream from
`BE_WRITE_GAP_SPEC_2026-05-28.md` is independent and still open.

| Batch | Route | 05-28 status | 05-31 status | Δ |
|---|---|---|---|---|
| P0-D | POST /bff/strategies | ✅ 201 | ✅ 201 | — |
| P0-D | POST /bff/personas | ✅ 201 | ✅ 201 | — |
| P0-D | POST /bff/capital-pools | ✅ 201 | ✅ 201 | — |
| P0-D | POST /bff/rebalances | ✅ 422 | ✅ 422 | — |
| P0-D | POST /bff/deployments | ✅ 201 | ✅ 201 | — |
| P0-D | POST /bff/runtimes | ❌ 405 | ❌ 405 | **still OPEN** |
| P0-D | POST /bff/ranking-formulas | ✅ 201 | ✅ 201 | — |
| P0-D | POST /bff/research-experiments | ✅ 201 | ✅ 201 | — |
| P0-D | POST /bff/skills | ✅ 201 | ✅ 201 | — |
| P1-A | POST /bff/actions/strategies/{id}/promote_live | ✅ 422 | ✅ 422 | — |
| P1-A | POST /bff/actions/strategies/{id}/pause | ✅ 422 | ✅ 422 | — |
| P1-A | POST /bff/actions/strategies/{id}/throttle | ✅ 422 | ✅ 422 | — |
| P1-A | POST /bff/actions/strategies/{id}/archive | ✅ 422 | ✅ 422 | — |
| P1-A | POST /bff/actions/strategies/{id}/edit | ✅ 422 | ✅ 422 | — |
| P1-A | POST /bff/approvals/{id}/decide | ✅ 403 | ✅ 403 | — |
| P1-A | POST /bff/command-confirmations/{token}/confirm | ❌ 404 | ❌ 404 | **still OPEN** |
| P1-C | POST /bff/v5/sentinel/findings/{id}/status | ✅ 202 | ✅ 202 | — |
| P1-C | POST /bff/v5/sentinel/remediation/build | ✅ 202 | ✅ 202 | — |
| P1-C | POST /bff/v5/interventions/{id}/claim | ✅ 202 | ✅ 202 | — |
| P1-C | POST /bff/v5/interventions/{id}/release | ✅ 202 | ✅ 202 | — |
| P1-C | POST /bff/v5/interventions/{id}/escalate | ✅ 202 | ✅ 202 | — |
| P1-C | POST /bff/v5/interventions/{id}/decide | ✅ 403 | ✅ 403 | — |
| P1-C | POST /bff/v5/interventions/{id}/two-man-sign | ✅ 202 | ✅ 202 | — |
| P1-C | POST /bff/v5/interventions/batch-decide | ❌ 405 | ❌ 405 | **still OPEN** |
| P1-E | POST /bff/agora/signals | ❌ 405 | ❌ 405 | **still OPEN** |
| P1-E | POST /bff/agora/feedback | ❌ 404 | ❌ 404 | **still OPEN** |
| P1-E | POST /bff/agora/inbox/{id}/triage | ❌ 404 | ❌ 404 | **still OPEN** |
| P1-E | POST /bff/agora/journal | ✅ 201 | ✅ 201 | — |
| P1-E | POST /bff/agora/skill-coaching | ❌ 404 | ❌ 404 | **still OPEN** |
| P1-E | POST /bff/agora/postmortems | ❌ 405 | ❌ 405 | **still OPEN** |
| P1-E | POST /bff/agora/ask/sessions | ✅ 201 | ✅ 201 | — |

## §3 Persona Onboarding (8 stages) — unchanged

| # | Stage | Endpoint | Status |
|---|---|---|---|
| 1 | AdvanceLifecycle | POST /bff/personas/{id}/actions/AdvanceLifecycle | 410 (deprecated route) |
| 2 | Create capital pool | POST /bff/capital-pools | ✅ 201 |
| 3 | ApprovePool | POST /bff/capital-pools/{id}/actions/ApprovePool | 410 |
| 4 | Create binding | POST /api/v1/bindings | ❌ 405 |
| 5 | Create deployment plan | POST /api/v1/deployment-plans | ❌ 405 |
| 6 | Approval decision | POST /api/v1/approval-decisions | ❌ 405 |
| 7 | StartRuntime | POST /bff/runtimes/{id}/actions/StartRuntime | 410 |
| 8 | Read persona management | GET /api/v1/operator/persona-management/{id} | ❌ 404 |

Same as 05-28 baseline. Wizard remains gated by `withWriteFallback` overlay.

## §4 Write→Read consistency (create-persona-then-fleet)

```
step 1 POST /bff/personas                       → 201
       new id: persona-20260531-1715d8d2
step 2 GET  /bff/management/persona-fleet       → 200  (items: 15, contains new id: YES)
step 3 GET  /bff/management/persona-league      → 200  (items: 15, contains new id: YES)
```

✅ Verdict: **PASS** — write commits propagate to fleet + league reads.

## §5 FE Changes Landed This PR

`grep -rl '34.81.75.241\|35.236.178.81\|34.81.225.122'` returns empty for runtime files.
19 files updated (env examples + e2e specs + probe scripts + integration gate workflow +
supabase function default base URL):

```
.env.dev.example
.env.development.example
.env.integration.example
.env.staging-live.example
.github/workflows/pantheon-integration-gate.yml
e2e/01-startup-session.spec.ts
e2e/02-control-room.spec.ts
e2e/03-execution-loop.spec.ts
e2e/06-entity-registry.spec.ts
e2e/08-create-intent.spec.ts
e2e/10-rollback-saga.spec.ts
e2e/helpers/env.ts
scripts/probe-bff-routes.mjs
scripts/probe-bff-write-paths.mjs
scripts/probe-create-persona-then-fleet.mjs
scripts/probe-hosted-browser-bff.mjs
scripts/probe-persona-onboarding-endpoints.mjs
supabase/functions/management-agent/index.ts
```

`.env` itself is auto-regenerated by Lovable Cloud from `.env.development.example` —
preview will switch to the new dev BFF on the next build cycle (resolves the current
`bff.search live transport failed (strict mode): Failed to fetch` runtime error
which was still hitting the old `34.81.75.241` host).

## §6 Remaining Gaps → BE Owner

The 8 open write endpoints + persona onboarding remain tracked under
`.lovable/specs/be-requirements/BE_WRITE_GAP_SPEC_2026-05-28.md`. Access request from
2026-05-30 is now **CLOSED** — gap work continues on its own thread.

## §7 FE Tail Work (kept open)

- [ ] Once all 31 write endpoints + 8 onboarding stages = green, remove
      `src/lib/bff-v1/writeFallback.ts` `NOT_IMPLEMENTED` branches
- [ ] Remove `LiveStatusBanner` writeDegraded strip
- [ ] Archive `BE_WRITE_GAP_SPEC_2026-05-28.md` + `BE_DEV_ACCESS_REQUEST_2026-05-30.md`

---

**Evidence files**:
- `.lovable/audits/bff-backend-write-probe-2026-05-28.md` (regenerated 2026-05-31)
- `.lovable/audits/persona-onboarding-endpoint-probe-2026-05-28.md` (regenerated 2026-05-31)
- `.lovable/audits/bff-list-after-write-2026-05-28.md` (regenerated 2026-05-31)
