# Codex Repository Work Rules

These rules apply to Codex work in this repository.

## Development-Stage Approval Posture

During active development, Codex should keep work moving without asking the
operator for repeated approval on ordinary repo, validation, and dev-deploy
commands. If the sandbox blocks a necessary command for git, GitHub CLI,
package install/build/test, local smoke tests, Playwright, curl probes, rsync to
Pantheon-owned dev hosting, or other Pantheon dev deployment tasks, Codex should
use the available approved prefix or request tool escalation directly with a
concise justification and continue after approval. Do not pause the task just to
ask a separate chat question for these normal development actions.

This posture does not authorize reckless actions. Codex must still ask before
unrequested destructive commands, secret disclosure, credential rotation,
production/live trading or capital-affecting changes, broad filesystem deletion,
or any action outside the stated development objective.

## Active Frontend

This repository, `ajoe734/execute-plans`, is the active Pantheon frontend. Do
not route current work to `front-ai-trading-system`; that project name is
legacy-only and must not be revived, mirrored, or used as the implementation
checkout.

## Dev Hosting

Pantheon dev frontend delivery is no longer Lovable-first. Do not use Lovable
publish state as the dev frontend host or release truth. Build and validate this
repo against the Pantheon-owned dev hosts:

- FE: `https://pantheon-lupin-dev-fe.35.201.204.12.sslip.io`
- BFF: `https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io`

Dev builds should use:

```sh
VITE_BFF_MODE=live
VITE_BFF_BASE_URL=https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io
VITE_BFF_FALLBACK=strict
VITE_BFF_REAL_WRITES=false
```

Only enable real writes when the operator explicitly asks for governed write
testing.

The dev FE host is a Caddy static site on the Pantheon dev VM:

- Caddy FE root: `/var/www/pantheon-dev-fe`
- release store: `/var/www/pantheon-dev-fe-releases`
- deploy workflow: `.github/workflows/pantheon-dev-fe-deploy.yml`
- deploy script: `scripts/deploy-dev-vm.sh`
- deployment evidence: `https://pantheon-lupin-dev-fe.35.201.204.12.sslip.io/deployment.json`

The prior GCP project `pantheon-benjamin-20260528` and IP `35.201.239.38`
are retired from active dev routing because the project is suspended. The
replacement dev VM is in project `pantheon-lupin-dev-20260719`.

The deployment workflow runs on the VM self-hosted GitHub runner with labels
`self-hosted`, `Linux`, `X64`, `pantheon-dev-vm`, and
`execute-plans-deploy`. It is triggered only after `Pantheon FE-BFF Integration
Gate` succeeds for a `dev` push, or by explicit `workflow_dispatch`.

## Branch And Dev Deployment Policy

`main` was the historical Lovable integration branch. Now that this repo is
served by Pantheon-owned dev infrastructure, ordinary frontend development must
follow the same governed branch posture as the rest of Pantheon:

- `dev` is the canonical integration branch for execute-plans development and
  the source branch for Pantheon dev FE deployment.
- Feature, repair, and Codex task branches should open PRs against `dev`.
- `main` is a stable/promotion branch. Merge to `main` only for an explicit
  promotion, compatibility cut, or repository bootstrap task.
- Do not claim a frontend change is published to dev until the target commit is
  present on `dev`, the integration gate has passed for that commit, the dev FE
  deployment workflow has updated the VM from that commit, `/deployment.json`
  reports that commit, and the direct execute-plans browser/BFF gate passes
  against the Pantheon dev BFF.
- Lovable publish state is obsolete evidence for dev readiness. It may be useful
  only as historical context.

If a local checkout lacks `origin/dev`, create or request the one-time
`dev` branch from the current accepted repository head before starting normal
frontend feature work. Do not keep opening routine dev PRs to `main` just
because this repo used to be Lovable-hosted.

## Management AI

Management AI SA/SD generation is owned by Pantheon BFF assistant routes, not by
Lovable:

- `GET /bff/assistant/mode`
- `GET /bff/assistant/orchestrator/status`
- `POST /bff/assistant/dev-docs/generate`
- `POST /bff/assistant/dev-bridge/task-packet`
- `POST /bff/assistant/repair-worktrees/prepare`

`/bff/assistant/tools/*` is not the VM file-system access surface. It is the
governed Pantheon action surface for BFF-owned preview, validation, and execute
contracts. Do not use it as proof that Management AI can read, write, search, or
debug VM files.

Provider readiness alone is not enough. Before claiming Management AI can
read/write VM files or coordinate debugging through OpenClaw, verify
`/bff/assistant/mode` reports `kernel_enabled: true` and that control mode is
activatable by an authorized operator/admin session. If provider readiness is
ready but kernel is disabled, fix the dev BFF configuration in `pantheon`; do
not patch around it in frontend code.

Supervisor is the queue/drain process, not a worker identity. SA/SD task
packets emitted by the frontend must use dispatchable worker names such as
`Codex` and `Claude`; do not set `proposedReviewer: "Supervisor"` or similar
non-agent values.

OpenClaw-backed VM inspection/debugging is reached through Pantheon BFF
conversation routes, primarily `POST /bff/management/nl/ask`, with the BFF
calling the OpenClaw gateway adapter. The frontend must not call the OpenClaw
adapter directly and must not write files from the browser.

For write-capable repair, the request must run under active `kernel_repair` and
the frontend must call `prepareAssistantRepairWorktree` /
`POST /bff/assistant/repair-worktrees/prepare` before sending the chat turn.
Use `repoKey: execute-plans` and merge target `dev` for frontend work; use
`repoKey: pantheon` and merge target `dev` for backend/BFF repair. Use
`execute-plans` merge target `main` only when the operator explicitly requests a
stable/promotion cut. The
subsequent `POST /bff/management/nl/ask` request must include the returned
`openclaw.repair` metadata:

- `repo_key`
- `task_id`
- `task_worktree`
- `declared_scope`
- `expected_branch`
- `remote`
- `merge_target`

The repair worktree must already exist under the backend-configured repair root,
be clean, be checked out on `expected_branch`, and be limited to repo-relative
`declared_scope` entries. Do not use `.` as a blanket write scope. If the
prepare route fails, the UI must fail closed and must not ask Management AI to
perform VM writes in that turn.

## Repository Discipline

Before editing, inspect `git status -sb`, current branch, and remote. Keep
generated `dist/`, runtime evidence, and unrelated local changes out of commits.
For routine frontend work, branch from `origin/dev` and open the PR against
`dev`; use `origin/main` only for this repository's initial dev-branch bootstrap
or an explicit promotion task. Run relevant local validation, stage only
intentional files, commit, push, open a PR for repository changes, wait for the
integration gate, merge, and report whether the dev deployment was actually
updated.
