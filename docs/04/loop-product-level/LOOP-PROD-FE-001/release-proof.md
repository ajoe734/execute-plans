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

Repository evidence through PR #361:

- PR #361 (`task/LOOP-PROD-FE-001-final-gate-fix`) merged into `dev` as
  `00df6eef83fb50f9c9b4482a13cb6c8a8255e14d`.
- The `dev` push Pantheon FE-BFF Integration Gate run
  [`29437937309`](https://github.com/ajoe734/execute-plans/actions/runs/29437937309)
  succeeded for frontend SHA
  `00df6eef83fb50f9c9b4482a13cb6c8a8255e14d` against dev BFF
  `https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io` at BFF source
  `a10f752b3ea4420f271535e255f2d4e7d3d498b2`.
- Run `29437937309` uploaded deployable candidate
  `pantheon-fe-release-candidate-attempt-1` with GitHub artifact digest
  `sha256:e54143e1154b73bb31a4c9eaeaebb1891c00f44fe34dd2e2a9b176fafde94f3d`
  and candidate asset digest
  `2797b8765556b9f6899ccaa5c88cda28f9f1ff87a09f50da3ff3db56e27815ee`.

Deployment evidence:

- Manual deploy run
  [`29439399913`](https://github.com/ajoe734/execute-plans/actions/runs/29439399913)
  correctly validated the exact `00df6ee` candidate and its immutable artifact,
  then rejected before switch with evidence outcome `rejected_before_switch`.
- The rejected pre-switch check was
  `rollback_target.manifest.previous_target_pre_switch`; live remained on
  predecessor `b352faa087e6e1bd6087c619d6e9d99a35fbca41`.
- Root cause: the qualified predecessor was a safe transitional legacy manifest
  with BFF provenance fields such as `bffHost` but without the newer
  schema/gate/GitHub artifact identity. The controller treated those BFF-only
  fields as incomplete modern release identity.
- This follow-up keeps full modern identity mandatory for incoming candidates
  and modern predecessors, but accepts transitional legacy predecessor BFF
  fields only when they match the expected BFF host and commit.

The release gate summary remains `overall=warn` only because pre-existing soft
gates remain advisory on pull requests: create dry-run endpoints disabled, F10
rollback-saga specs expected-skipped, and the management Write-CTA source scan.
All critical gates passed and Gate 5 recorded `0 unexpected or incomplete
spec(s)`.

The final closeout must replace each pending entry with immutable evidence:

| Proof                     | Required evidence                                                                 | Status  |
| ------------------------- | --------------------------------------------------------------------------------- | ------- |
| Local controller contract | Full deploy harness, focused unit tests, lint, typecheck, build                   | Passed: deploy controller harness `bash scripts/test-deploy-dev-vm.sh` (19 passed, including transitional legacy BFF fields and BFF host mismatch); focused Vitest `src/test/deploy-safe-defaults.test.ts` + `src/test/hosted-browser-release-policy.test.ts` (48 passed); GHA run 29437937309 also passed lint, test, deploy-controller regression, contract drift, bundle budget, management persona 3000, build, and final immutable candidate verification |
| Independent review        | Claude review artifact and checksum                                               | Verified: support/reviews/LOOP-PROD-FE-001-review-antigravity.md (SHA: 0cc00798608874e4e10d74597fdc362c14756243c07a6a95f9e7ecbb0c75f6e0) |
| Repository delivery       | PR, required checks, `dev` merge commit                                           | PR #361 merged as `00df6eef83fb50f9c9b4482a13cb6c8a8255e14d`; follow-up deploy compatibility fix pending merge |
| Exact candidate gate      | Integration run id/attempt, artifact id, archive and canonical digests            | Verified: GHA run 29437937309 attempt 1, release identity artifact `pantheon-release-identity-attempt-1`; deployable candidate artifact digest `sha256:e54143e1154b73bb31a4c9eaeaebb1891c00f44fe34dd2e2a9b176fafde94f3d`; candidate asset digest `2797b8765556b9f6899ccaa5c88cda28f9f1ff87a09f50da3ff3db56e27815ee` |
| Hosted acceptance         | Deploy run, accepted public manifest, desktop 1440/mobile 390 probe               | Pending follow-up deploy: run 29439399913 rejected before switch and preserved live predecessor; accepted manifest must be recorded after the compatibility fix merges |
| Target rollback/readback  | Manual drill run and sealed `rolled_back` evidence                                | Passed locally: deploy harness covers pre-switch rejection, post-switch rollback/reprobe, rollback drill, external switch preservation, and exact no-op revalidation |
| Evidence integrity        | Attempt-scoped GitHub artifact plus durable VM audit path and audit-seal checksum | Sealed failure evidence exists for deploy run 29439399913 (`pantheon-dev-fe-deploy-evidence-attempt-1`, outcome `rejected_before_switch`); accepted deploy evidence pending follow-up deploy |

Do not mark the task done while any row remains pending.
