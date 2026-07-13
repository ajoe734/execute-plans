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
2. `Pantheon FE-BFF Integration Gate` runs on the `dev` push. Before the rest
   of the gate, it fetches the live BFF `/bff/version`, requires a known exact
   40-character source SHA, and rejects an internally inconsistent response or
   a mismatch with an explicit manual `workflow_dispatch` `bff_sha` input. Push
   gates do not read a `PANTHEON_BFF_SHA` repository variable; the live response
   is their identity source of truth.
3. The gate uploads `pantheon-release-identity`, binding the exact FE commit,
   BFF source commit, BFF URL, observation time, and integration-gate run ID.
4. `Pantheon Dev FE Deploy` is triggered by `workflow_run` only when that gate
   succeeds for a `dev` push.
5. The deploy job checks out the exact gated SHA on the VM self-hosted runner,
   skips it if a newer commit has become the `dev` head, and downloads the
   identity artifact from that exact successful gate run.
6. `scripts/deploy-dev-vm.sh` runs:
   - validate the artifact's FE SHA, BFF URL/SHA, and gate run ID
   - `npm ci`
   - Playwright Chromium install for the post-deploy browser probe
   - strict live Vite build against the dev BFF
   - write the exact FE+BFF release identity and safe write flags into
     `dist/deployment.json`
   - install a release directory under `/var/www/pantheon-dev-fe-releases`
   - re-fetch `/bff/version` and require the gated BFF SHA before switching
   - atomically switch `/var/www/pantheon-dev-fe`
   - immediately re-fetch `/bff/version` after switching; a mismatch fails and
     restores the previous FE release
   - fetch `/deployment.json` and verify the deployed FE+BFF pair, strict-live
     mode, and write-safety flags
   - run `scripts/probe-hosted-browser-bff.mjs` against the public FE host
   - run the Persona Fleet live linked-page contract
   - roll back the symlink to the previous release if any post-switch
     verification or probe fails
   - only when explicitly enabled, run
     `scripts/probe-hosted-management-writes.mjs` to submit a governed
     recommendation, persist a Human Review decision, and read it back

Automatic Pantheon dev deployments build with `VITE_BFF_REAL_WRITES=false`
and `VITE_BFF_ALLOW_DEV_STUB_WRITES=false`. A manual workflow dispatch may set
`real_writes=true` only for explicitly authorized governed write testing. That
opt-in admits the dev BFF's authenticated stub session only when `/bff/me`
identifies the backend as `dev` or `test`; any production environment marker
still fails closed. The conditional write probe records a rejected governance
recommendation and verifies `live_capital_mutation=false`, so it exercises
persistence without changing capital or runtime state.

`VITE_BFF_DEV_BEARER_TOKEN` is public build input. Automated deployment
accepts only an empty value or a dev-only `subject:viewer` identity. Operator,
admin, MFA, and `assistant.kernel.*` credentials must be supplied through an
interactive cookie or browser session storage and are never embedded in the
static release.

Manual deployment is available through `workflow_dispatch` on
`.github/workflows/pantheon-dev-fe-deploy.yml`. The workflow only accepts the
current `dev` head after a successful integration-gate push run and consumes
the exact identity artifact from that run. The `real_writes` input defaults to
`false` and must not be enabled without explicit operator authorization.

## Local VM Command

From a clean checkout of the target commit on the dev VM, first download the
`pantheon-release-identity` artifact from the successful push gate for that
commit. Both the artifact path and its run ID are mandatory:

```bash
PANTHEON_DEPLOY_BRANCH=dev \
PANTHEON_DEPLOY_REF="$(git rev-parse HEAD)" \
PANTHEON_RELEASE_IDENTITY_FILE=/tmp/pantheon-release-identity/release-identity.json \
PANTHEON_RELEASE_GATE_RUN_ID=<successful-integration-gate-run-id> \
bash scripts/deploy-dev-vm.sh
```

Use `PANTHEON_DEPLOY_SKIP_PROBE=true` only for emergency static-host repair, and
follow it immediately with the browser/BFF probe before claiming dev publish.

## Publish Evidence

Do not say "published to dev" unless all of these are true:

- the commit is on `origin/dev`;
- `Pantheon FE-BFF Integration Gate` passed for that SHA;
- `Pantheon Dev FE Deploy` passed for that SHA;
- `https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io/deployment.json`
  reports that FE SHA, the exact gated BFF `source_commit_sha`, strict/live
  mode, `VITE_BFF_REAL_WRITES=false`, and
  `VITE_BFF_ALLOW_DEV_STUB_WRITES=false` for an automatic deployment;
- the BFF `/bff/version` still reports the gated BFF SHA after the FE switch;
- the deployed-host browser/BFF probe passed against `/management/persona-fleet`.
- when `real_writes=true` was explicitly requested, the governed management
  write/read-back probe persisted a Human Review command and resolved it from
  Human Inbox.

The deployed-host probe must show Persona Fleet rows for US/TW/Crypto, shioaji
/ qlib source evidence, no `NaN`, no old BFF URL, and no armed seed fallback.

## Rollback

The deploy script automatically restores the previous release symlink if a
post-switch host verification or probe fails. Manual rollback remains available
for an already accepted release:

Rollback is a VM operation:

1. List releases: `ls -1dt /var/www/pantheon-dev-fe-releases/*`
2. Point `/var/www/pantheon-dev-fe` to the chosen release:
   `sudo ln -sfn "$release" /var/www/pantheon-dev-fe.next && sudo mv -Tf /var/www/pantheon-dev-fe.next /var/www/pantheon-dev-fe`.
3. Verify `/deployment.json`.
4. Run the deployed-host browser/BFF probe.

Rollback changes live dev FE state and must be reported with the release path
and commit SHA.
