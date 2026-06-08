# Codex Repository Work Rules

These rules apply to Codex work in this repository.

## Active Frontend

This repository, `ajoe734/execute-plans`, is the active Pantheon frontend. Do
not route current work to `front-ai-trading-system`; that project name is
legacy-only and must not be revived, mirrored, or used as the implementation
checkout.

## Dev Hosting

Pantheon dev frontend delivery is no longer Lovable-first. Do not use Lovable
publish state as the dev frontend host or release truth. Build and validate this
repo against the Pantheon-owned dev hosts:

- FE: `https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io`
- BFF: `https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io`

Dev builds should use:

```sh
VITE_BFF_MODE=live
VITE_BFF_BASE_URL=https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io
VITE_BFF_FALLBACK=strict
VITE_BFF_REAL_WRITES=false
```

Only enable real writes when the operator explicitly asks for governed write
testing.

## Management AI

Management AI SA/SD generation is owned by Pantheon BFF assistant routes, not by
Lovable:

- `GET /bff/assistant/mode`
- `GET /bff/assistant/orchestrator/status`
- `POST /bff/assistant/dev-docs/generate`
- `POST /bff/assistant/dev-bridge/task-packet`

Provider readiness alone is not enough. Before claiming Management AI can
read/write VM files or coordinate debugging through OpenClaw, verify
`/bff/assistant/mode` reports `kernel_enabled: true` and that control mode is
activatable by an authorized operator/admin session. If provider readiness is
ready but kernel is disabled, fix the dev BFF configuration in `pantheon`; do
not patch around it in frontend code.

## Repository Discipline

Before editing, inspect `git status -sb`, current branch, and remote. Keep
generated `dist/`, runtime evidence, and unrelated local changes out of commits.
Run relevant local validation, stage only intentional files, commit, push, and
open a PR for repository changes.
