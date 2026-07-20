# Pantheon Dev FE VM Deployment

`execute-plans` dev deployment runs on the Pantheon dev VM, not Lovable.

## Current VM Shape

- Public FE: `https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io`
- Public BFF: `https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io`
- Caddy config: `/etc/caddy/Caddyfile`
- Caddy FE root path: `/var/www/pantheon-dev-fe`
- Release store: `/var/www/pantheon-dev-fe-releases`
- Deploy runner: GitHub self-hosted runner on this VM
- Required runner labels: `self-hosted`, `Linux`, `X64`, `pantheon-dev-vm`, `execute-plans-deploy`

Caddy serves static files from `/var/www/pantheon-dev-fe`. The deploy script
converts that path to a symlink that points at an immutable release directory
under `/var/www/pantheon-dev-fe-releases`.

## Deployment Flow

1. Feature and repair work merges to `dev` through PR.
2. `Pantheon FE-BFF Integration Gate` runs on the `dev` push.
3. The gate builds three immutable profiles against the exact dev BFF URL:
   `read-only` (`REAL_WRITES=false`, stub writes false), persistent
   `operator-live` (`REAL_WRITES=true`, stub writes false), and bounded
   `write-proof` (both write flags true). All use live/strict transport and no
   embedded browser token. One authenticated candidate-set identity binds the
   exact FE SHA, BFF SHA, gate run, three distinct asset digests, and files.
4. `Pantheon Dev FE Deploy` is triggered by `workflow_run` only when that exact
   `dev` push gate succeeds. The job rejects missing, duplicated, expired, or
   mismatched artifacts and authenticates the downloaded archive against the
   SHA-256 digest reported by GitHub's artifact API before safe extraction.
5. The self-hosted runner checks out the current `dev` SHA as the trusted
   controller. Candidate bytes are never used as deployment code. A controller
   that has become stale is rejected before and again immediately before the
   switch.
6. `scripts/deploy-dev-vm.sh` verifies the candidate metadata and bytes, binds
   the candidate to the exact live `/bff/version` source commit, acquires an
   exclusive lock, and qualifies the current release as the rollback target.
7. The controller installs an immutable release directory, runs the strict
   browser/auth/UX probe against those candidate bytes at the formal FE origin,
   and atomically switches `/var/www/pantheon-dev-fe` only after that pre-probe.
8. After the switch it verifies public `deployment.json`, live BFF identity,
   desktop/mobile browser behavior, accessibility, reduced motion, performance,
   and the absence of browser credentials or write enablement. Only then does it
   change `deploymentState` from `candidate` to `accepted`.

Workflow-run deployment remains read-only. A repository-authorized operator
may manually select the persistent `operator-live` sibling from the exact same
accepted candidate set. That path requires the exact current gated SHA and an
exact healthy BFF whose `/bff/version` reports the paired commit,
`auth_mode=strict`, and `auth_stub=false`; `/readyz` must be 200 and anonymous
`/bff/me` must be 401. It deploys with `VITE_BFF_REAL_WRITES=true`,
`VITE_BFF_ALLOW_DEV_STUB_WRITES=false`, and no embedded bearer. It does not
dispatch the bounded-proof watchdog and is not automatically restored.

`write-proof` remains a separate, manually acknowledged permissive-stub test
profile. It alone arms the independent watchdog and automatically restores the
exact paired read-only sibling. Neither persistent nor proof deployment can
skip integrity, auth, browser, BFF identity, or rollback probes.

The legacy Supabase login provider still needs two public browser values:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The integration gate
injects them from GitHub Actions repository variables while building the
immutable candidate. They are public configuration, but the key must be a
publishable/anon client key, never a service-role or `sb_secret_` key. Missing
values fail before the candidate build; the deploy controller does not rebuild
or inject configuration after the gate.

Manual deployment is available through `workflow_dispatch` on
`.github/workflows/pantheon-dev-fe-deploy.yml`. It still requires an exact
successful `dev` push gate run and its immutable candidate artifact. Deploying
an older candidate additionally requires `emergency_override=true`, an actor,
an audited reason of at least 20 characters, and membership in the
comma-separated repository variable `PANTHEON_DEV_FE_DEPLOY_OPERATORS`. The override relaxes ordering
only; it cannot relax candidate integrity, BFF identity, read-only posture, or
probes.

To install the daily strict operator profile, dispatch once with the exact
current `candidate_sha` and successful `gate_run_id`, set
`deployment_profile=operator-live`, leave `proof_window_ack=false`, and leave
all override/drill inputs false. The actor must be listed in
`PANTHEON_DEV_FE_DEPLOY_OPERATORS`. No proof coordinator, proof watchdog, or
read-only auto-restore is started for this profile.

## Controller Validation

Run the deterministic controller regression harness before changing the
workflow or controller:

```bash
npm run test:deploy-release
```

Do not invoke `scripts/deploy-dev-vm.sh` as a build-from-checkout shortcut. It
requires the authenticated candidate directory, exact gate and artifact
identities, current trusted-controller SHA, scoped release paths, and deployment
lock supplied by the workflow. `PANTHEON_DEPLOY_SKIP_PROBE=true` is rejected.

## Publish Evidence

Do not say "published to dev" unless all of these are true:

- the commit is on `origin/dev`;
- `Pantheon FE-BFF Integration Gate` passed for that SHA;
- `Pantheon Dev FE Deploy` passed for that SHA;
- `https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io/deployment.json`
  reports that SHA, its canonical asset digest, exact gate run id, exact BFF
  commit, `deploymentState=accepted`, strict live mode, the selected profile's
  exact write flags, all three paired digests, and no embedded browser bearer;
- the deployed-host browser/BFF probe passed against `/management/persona-fleet`
  at desktop 1440 and mobile 390 widths with axe, keyboard focus,
  reduced-motion, strict performance, console, resource, and page-error checks;
- the redacted deploy evidence artifact verifies its append-only hash chain and
  checksums every regular audit file. Artifact names include
  `GITHUB_RUN_ATTEMPT`, so reruns retain their own immutable candidate and
  evidence instead of overwriting a prior attempt. A sealed copy is also kept
  under `/var/lib/pantheon-dev-fe-deploy-evidence/` on the dev VM.

The release probe is intentionally unauthenticated and must observe the
governed `401/AUTH_REQUIRED` boundary without sending an Authorization header
or placing a bearer in browser storage. Persona Fleet may render only accepted
production/live rows or an explicit auth/live-empty state; seed identities,
fallback fixtures, `NaN`, old BFF URLs, an empty application root, uncaught page
errors, or unexpected console/resource failures fail closed.

## Rollback And Drill

Any failure after a switch triggers a compare-and-swap rollback to the exact
qualified previously accepted `operator-live` or `read-only` predecessor. The controller re-hashes that predecessor before and
after the switch, verifies public `deployment.json` and BFF identity, and reruns
the browser/auth probe. A concurrent external live-target change is preserved
and reported instead of being overwritten. A rollback or rollback re-probe
failure remains a failed deployment with an explicit evidence outcome.

For target-VM proof, dispatch the deploy workflow manually with
`rollback_drill=true`, an exact gated candidate that is not already live, and an
audited reason. The controller performs the normal verified switch, deliberately
stops before acceptance, restores the predecessor, and re-probes it. The job is
expected to finish nonzero with evidence outcome `rolled_back`; success means
the candidate was accepted and therefore does **not** prove the drill. The drill
cannot be invoked by `workflow_run` and cannot run as a same-candidate no-op.

Direct symlink edits are emergency operator recovery only, not accepted release
or rollback evidence. Record the previous and observed targets and follow with
the same public manifest, BFF identity, asset digest, and browser probes.
