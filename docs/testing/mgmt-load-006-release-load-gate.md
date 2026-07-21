# MGMT-LOAD-006 Release Load Gate — Frontend Evidence

Date: 2026-07-01
Base commit: `5b7d6b724f91` (origin/dev)
Branch: `task/MGMT-LOAD-006`

## Scope

- Add `scripts/bundle-budget-check.mjs`: measures gzip size of the initial
  management entry chunk and the Evidence route-specific async chunk from
  `npm run build` output, and fails closed if either exceeds the budget from
  `docs/bff/execution-tasks/2026-07-01-management-console-load-gap/MGMT-LOAD-004-management-route-code-split.md`
  (initial <= 800 KB gzip, Evidence chunk <= 150 KB gzip). This closes the
  structured-evidence gap flagged in
  `support/sidecars/MGMT-LOAD-006/MGMT-LOAD-006-SIDECAR-BFF-HANDOFF-FOLLOWUP-6.md`:
  bundle size previously existed only as prose in the MGMT-LOAD-004 doc, not
  as an artifact a release gate can consume.
- Wire `probe:bundle-budget` into `package.json` and into
  `.github/workflows/pantheon-integration-gate.yml` (the existing FE
  release/smoke aggregation path used by management production acceptance),
  running right after `Build` so every PR against `dev` gets fresh bundle
  evidence in `$PANTHEON_AUDIT_OUT_DIR`.
- No new e2e spec is added here: `e2e/23-management-shell-fanout.spec.ts`
  (MGMT-LOAD-003) already hard-gates zero duplicate startup `/bff/jobs`
  requests and shell-summary-based fanout reduction, `e2e/22-management-evidence-load.spec.ts`
  (MGMT-LOAD-001) already hard-gates content-milestone readiness without
  `networkidle`, and `e2e/19-route-split.spec.ts` (MGMT-LOAD-004) already
  hard-gates the Evidence route not pulling non-Evidence chunks. The Pantheon
  release load gate (`scripts/aggregate-release-gate.mjs` in `ajoe734/pantheon`)
  treats these specs' continued pass as CI-safe regression coverage and
  additionally aggregates hosted-probe evidence (route timing, request
  waterfall, BFF fanout, bundle size) into a single pass/fail manifest.

## Bundle Evidence

`npm run probe:bundle-budget` on this branch (dist built from `npm run build`,
commit `5b7d6b724f91`):

| Chunk | File | Gzip | Budget | Pass |
|---|---|---:|---:|---|
| Initial management entry | `index-BwntuNVc.js` | 269,474 B | 819,200 B (800 KB) | true |
| Evidence route chunk | `evidence-CzIuH3P1.js` | 13,345 B | 153,600 B (150 KB) | true |

Both chunks remain well inside budget; no regression since MGMT-LOAD-004.

## Handoff

The Pantheon-side gate (`ajoe734/pantheon` `scripts/aggregate-release-gate.mjs`)
consumes this bundle-budget JSON via `--bundle-file`, alongside the
MGMT-LOAD-001 route-timing/request-waterfall archive and the MGMT-LOAD-001/005
BFF fanout archive, to produce
`docs/04/pantheon_management_console_load_gap_2026-07-01/archive/release-load-gate-*.json/.md`
for `MGMT-LOAD-007` closeout. That run currently reports `pass: false` because
the archived route-timing/waterfall/fanout evidence predates the
MGMT-LOAD-002/003/005 shell-summary and read-isolation fixes (it is the
MGMT-LOAD-001 pre-fix baseline); a fresh hosted probe run against the merged
dev FE/BFF pair is required before the gate can report a true green result.
This matches the fail-closed runbook in
`support/sidecars/MGMT-LOAD-006/MGMT-LOAD-006-SIDECAR-BFF-HANDOFF-FOLLOWUP-6.md`.
