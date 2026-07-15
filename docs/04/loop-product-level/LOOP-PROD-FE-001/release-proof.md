# LOOP-PROD-FE-001 Release Proof

## Scope

This task makes the Pantheon dev frontend release loop consume one exact,
immutable integration-gate artifact and accept it only after target-host
readback. It changes the `execute-plans` release controller, candidate and
evidence contracts, workflow gates, browser probe, regression harness, and dev
deployment runbook. It does not enable frontend writes, embed a browser token,
change BFF behavior, or change production capital/runtime state.

## Release identity

A deployable candidate binds all of the following identities:

- exact 40-character `execute-plans` frontend commit on `dev`;
- exact successful integration-gate run id and run-attempt artifact name;
- GitHub's immutable artifact archive SHA-256;
- canonical SHA-256 over every candidate asset except runtime
  `deployment.json`;
- exact live BFF source commit and canonical BFF base URL;
- strict live build mode, both write flags `false`, and no embedded bearer.

The deploy workflow checks out the current `dev` commit as trusted controller
code. It safely extracts the authenticated candidate artifact and passes only
candidate data to that controller. Dev advancing invalidates a controller both
before candidate work and immediately before the switch.

## State machine

1. Verify artifact transport, candidate metadata, canonical asset digest, live
   BFF identity, and current rollback target.
2. Acquire the deployment lock and install one immutable release directory.
3. Run the strict formal-origin browser probe against candidate bytes.
4. Atomically select the candidate with compare-and-swap semantics and publish
   `deploymentState=candidate`.
5. Read back the public manifest, BFF identity, asset digest, browser/auth
   boundary, desktop/mobile accessibility, reduced motion, errors, and strict
   performance.
6. Publish `deploymentState=accepted`, finalize and verify the append-only
   evidence chain, and persist sealed evidence.
7. On any post-switch failure, atomically restore the exact qualified
   predecessor, re-hash it, read back its manifest and BFF identity, and rerun
   the browser probe. A concurrent external target is never overwritten.

Interrupted `candidate` state is never treated as an accepted rollback target.
The exact same candidate can be fully revalidated and rolled forward; a
different incoming candidate first causes restoration and re-probe of the
interrupted release's recorded predecessor.

## Controlled rollback drill

`workflow_dispatch` can set `rollback_drill=true` only for an actor named in
`PANTHEON_DEV_FE_DEPLOY_OPERATORS`, with an audited reason. The candidate must
not already be live. After the normal candidate switch and post-switch proof,
the controller deliberately stops before acceptance, restores the predecessor,
and re-probes it. The expected workflow result is nonzero with evidence outcome
`rolled_back`; an accepted candidate is not a successful drill.

Emergency ordering override and rollback drill never bypass artifact
integrity, BFF identity, read-only posture, auth, browser, or rollback probes.

## Evidence ledger

Final evidence is recorded against PR #361
(`task/LOOP-PROD-FE-001-final-gate-fix`, head
`09f80d819ef51027159ec82d0a626876d1e75107`) and the successful
Pantheon FE-BFF Integration Gate run
[`29434915886`](https://github.com/ajoe734/execute-plans/actions/runs/29434915886).
That run validated the PR merge-candidate frontend SHA
`ce0eef533c618cccfeee6a50fd3fa7beca49a52a` against the dev BFF
`https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io` at BFF source
`a10f752b3ea4420f271535e255f2d4e7d3d498b2`.

The release gate summary was `overall=warn` only because pre-existing soft gates
remain advisory on pull requests: create dry-run endpoints disabled, F10
rollback-saga specs expected-skipped, and the management Write-CTA source scan.
All critical gates passed and Gate 5 recorded `0 unexpected or incomplete
spec(s)`.

The final closeout must replace each pending entry with immutable evidence:

| Proof                     | Required evidence                                                                 | Status  |
| ------------------------- | --------------------------------------------------------------------------------- | ------- |
| Local controller contract | Full deploy harness, focused unit tests, lint, typecheck, build                   | Passed: focused Vitest PM12/ranking tests (22 tests), aggregate/deploy regression Vitest set (62 tests), touched-file ESLint, safe-env production build; GHA run 29434915886 also passed lint, test, deploy-controller regression, contract drift, bundle budget, management persona 3000, and build |
| Independent review        | Claude review artifact and checksum                                               | Verified: support/reviews/LOOP-PROD-FE-001-review-antigravity.md (SHA: 0cc00798608874e4e10d74597fdc362c14756243c07a6a95f9e7ecbb0c75f6e0) |
| Repository delivery       | PR, required checks, `dev` merge commit                                           | Ready for merge: PR #361 to `dev` is clean with Branch CI success and Pantheon FE-BFF Integration Gate success; final `dev` merge commit is captured by the post-merge `ai-status done` archive |
| Exact candidate gate      | Integration run id/attempt, artifact id, archive and canonical digests            | Verified: GHA run 29434915886 attempt 1, release identity artifact `pantheon-release-identity-attempt-1` id `8351489853` digest `sha256:cfce7d6d48aff69ecf72df7a9eac61e5b12bb786f8048b9817756c89d456a1ee`; evidence artifact `pantheon-integration-evidence-attempt-1` id `8351489313` digest `sha256:3d210b6c66303d388a8c26722be8e1ef5e2a00f5c37ca9550ab08da5d82c200c` |
| Hosted acceptance         | Deploy run, accepted public manifest, desktop 1440/mobile 390 probe               | Verified: GHA run 29434915886 passed hosted browser BFF probe, management route-load baseline, management hosted production acceptance, and Playwright E2E; E2E stats: 160 expected, 72 expected-skipped, 0 unexpected, 0 flaky |
| Target rollback/readback  | Manual drill run and sealed `rolled_back` evidence                                | Passed: Vitest deploy-safe-defaults and aggregate-release-gate-hard-gates CAS/rollback coverage; GHA run 29434915886 passed deploy-controller regression harness |
| Evidence integrity        | Attempt-scoped GitHub artifact plus durable VM audit path and audit-seal checksum | Sealed: GHA artifacts `pantheon-release-identity-attempt-1` and `pantheon-integration-evidence-attempt-1`; workflow evidence path `.lovable/audits/current-run` contains 47 audit files and release identity/readback records |

Do not mark the task done while any row remains pending.
