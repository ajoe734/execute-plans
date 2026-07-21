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
2. `Pantheon FE-BFF Integration Gate` runs on the `dev` push and remains
   required release evidence.
3. `Pantheon Dev FE Deploy` is triggered directly by the same `dev` push.
4. The deploy job checks out the exact pushed SHA on the VM self-hosted runner.
5. `scripts/deploy-dev-vm.sh` runs:
   - `npm ci`
   - Playwright Chromium install for the post-deploy browser probe
   - strict live Vite build against the dev BFF
   - write `dist/deployment.json`
   - install a release directory under `/var/www/pantheon-dev-fe-releases`
   - atomically switch `/var/www/pantheon-dev-fe`
   - fetch `/deployment.json` and verify the deployed commit
   - run `scripts/probe-hosted-browser-bff.mjs` against the public FE host;
     uncaught page errors or an empty `#root` fail the deploy
   - run the read-only Persona Fleet linked-page contract

Automated Pantheon dev deployment builds with `VITE_BFF_REAL_WRITES=false`
and `VITE_BFF_ALLOW_DEV_STUB_WRITES=false`. The deploy script fails before
dependency installation, build, or network probes if runner state attempts to
enable either flag.

`VITE_BFF_DEV_BEARER_TOKEN` is public build input. Automated deployment keeps
it empty. Operator, admin, MFA, and `assistant.kernel.*` credentials must be
supplied through an interactive cookie or browser session and are never
embedded in the static release.
Governed write qualification is a separate operator workflow; it is not part
of automated static frontend deployment.

The legacy Supabase login provider still needs two public browser values:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. They are configured as
GitHub Actions repository variables and injected explicitly into build and
deploy steps. They are not secrets—the static bundle exposes them—but the key
must be a publishable/anon client key, never a service-role or `sb_secret_` key.
Vite fails before build or dev-server bind when either value is absent.

Manual deployment is available through `workflow_dispatch` on
`.github/workflows/pantheon-dev-fe-deploy.yml`. Manual deploys should still use
a SHA that has passed the integration gate unless this is an explicitly declared
emergency dev repair.

## Local VM Command

From a clean checkout of the target commit on the dev VM:

```bash
PANTHEON_DEPLOY_BRANCH=dev \
PANTHEON_DEPLOY_REF="$(git rev-parse HEAD)" \
VITE_SUPABASE_URL="${VITE_SUPABASE_URL:?required public client URL}" \
VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:?required public client key}" \
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
  reports that SHA;
- the deployed-host browser/BFF probe passed against `/management/persona-fleet`.

The deployed-host probe receives `PANTHEON_BFF_SMOKE_BEARER_TOKEN` only at
runtime as `PANTHEON_HOSTED_BROWSER_BEARER_TOKEN`; it is written to the
ephemeral browser session and is never embedded in the static build. The probe
must show Persona Fleet rows for US/TW/Crypto, shioaji / qlib source evidence,
a successful Persona Fleet BFF response, no `NaN`, no old BFF URL, and no armed
seed fallback. A missing runtime credential or live empty state fails closed.

## Rollback

Rollback is a VM operation:

1. List releases: `ls -1dt /var/www/pantheon-dev-fe-releases/*`
2. Point `/var/www/pantheon-dev-fe` to the chosen release:
   `sudo ln -sfn "$release" /var/www/pantheon-dev-fe.next && sudo mv -Tf /var/www/pantheon-dev-fe.next /var/www/pantheon-dev-fe`.
3. Verify `/deployment.json`.
4. Run the deployed-host browser/BFF probe.

Rollback changes live dev FE state and must be reported with the release path
and commit SHA.
