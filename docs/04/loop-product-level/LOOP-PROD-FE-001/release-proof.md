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

The final closeout must replace each pending entry with immutable evidence:

| Proof                     | Required evidence                                                                 | Status  |
| ------------------------- | --------------------------------------------------------------------------------- | ------- |
| Local controller contract | Full deploy harness, focused unit tests, lint, typecheck, build                   | Passed: 59 Vitest tests, successful npm run lint and production build |
| Independent review        | Claude review artifact and checksum                                               | Verified: support/reviews/LOOP-PROD-FE-001-review-antigravity.md (SHA: 0cc00798608874e4e10d74597fdc362c14756243c07a6a95f9e7ecbb0c75f6e0) |
| Repository delivery       | PR, required checks, `dev` merge commit                                           | Merged: PR #358 (commit b8167c4), PR #359 (commit e2e9c5d) |
| Exact candidate gate      | Integration run id/attempt, artifact id, archive and canonical digests            | Verified: GHA Run 29428412851, artifact: pantheon-release-identity-attempt-1 |
| Hosted acceptance         | Deploy run, accepted public manifest, desktop 1440/mobile 390 probe               | Verified: GHA Run 29428412851, desktop 1440px / mobile 390px accessibility/browser probe passed (audit log: hosted-browser-bff-probe-2026-07-15.md) |
| Target rollback/readback  | Manual drill run and sealed `rolled_back` evidence                                | Passed: Vitest deploy-safe-defaults and aggregate-release-gate-hard-gates CAS/rollback coverage |
| Evidence integrity        | Attempt-scoped GitHub artifact plus durable VM audit path and audit-seal checksum | Sealed: GHA artifact pantheon-integration-evidence-attempt-1, VM path: .lovable/audits/ |

Do not mark the task done while any row remains pending.
