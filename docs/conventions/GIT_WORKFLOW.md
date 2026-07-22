# execute-plans Git Workflow

Status: canonical · Ported from: pantheon `docs/conventions/GIT_WORKFLOW.md` (2026-05-17 per-task model) · Adopted: 2026-07-13 (OPS-EP-GITFLOW-001)

Operational source of truth for execute-plans branching, per-task PR
flow, hourly publish, promote to main, and CI gates. The pantheon repo's
GIT_WORKFLOW.md is the upstream design document; this file records the
execute-plans instantiation and its deliberate deviations (§9).

---

## 1. Branch Topology

```
main     ── PR-only ── canonical / staging line
   ▲
   │ promote/<v> PR  (auto-merged after soak + CI)
   │
publish/v<YYYY>.<MM>.<DD>.<N> ── immutable snapshots from dev
   ▲
   │ nightly-publish-cut.yml  (cron hourly :05 UTC)
   │
dev      ── PR-only ── integration line, every task PR auto-merges here
   ▲                       ↑
   │ PR (auto-merge)   hotfix/<topic> ── dual-PR back to dev + main
   │
task/<TASK-ID>  ── ephemeral, auto-deleted by GitHub when PR merges
```

| Type        | Naming                          | Lifetime             | Writer                                |
|-------------|----------------------------------|----------------------|----------------------------------------|
| canonical   | `main`                           | permanent            | PR auto-merge only (promote / hotfix)  |
| integration | `dev`                            | permanent            | PR auto-merge only (task / hotfix)     |
| task        | `task/<TASK-ID>`                 | minutes to hours     | one autoworker / human; PR + auto-delete |
| publish     | `publish/v<YYYY>.<MM>.<DD>.<N>`  | permanent (snapshot) | hourly cron; immutable after cut       |
| hotfix      | `hotfix/<topic>`                 | < 24 h               | one author; dual-PR (main + dev)       |

Tags: `release/v<...>` at snapshot cut, `prod/v<...>` when a promote PR
merges into main.

## 2. Task Branch Lifecycle

```bash
./scripts/git/task_start.sh <TASK-ID>     # task/<TASK-ID> from origin/dev
# ... make changes, commit with required trailers (§5) ...
./scripts/git/task_finalize.sh <TASK-ID>  # push + PR --base dev + auto-merge
```

Auto-merge holds until the dev branch protection's required status
checks (§6) turn green; then GitHub merges and auto-deletes the branch.
A task PR lingering > 24 h unmerged is a process violation.

## 3. Hourly Publish

`nightly-publish-cut.yml` runs hourly at :05 UTC. If `origin/dev`
advanced past the latest `release/v*` tag it cuts
`publish/v<YYYY>.<MM>.<DD>.<N>` (N auto-increments within a UTC day)
and tags `release/v<...>`. Snapshots are immutable — never push to a
`publish/v*` branch; patch via the normal path and let the next cut
pick it up. Manual cut: `./scripts/git/nightly_publish.sh now`.

## 4. Promote to Main

`publish-promote.yml` (hourly) discovers `release/v*` tags older than
`promote.soak_days` (default 1) not yet on main, opens a `promote/<v>`
PR, and enables auto-merge. Block a promotion by opening an issue
labeled `regression/v<...>` (or `hold-promote` / `regression`).
`main-release.yml` tags `prod/<v>` when the promote PR merges. No
direct pushes to main.

## 5. Commit Conventions

Subject: `<TASK-ID>: <imperative summary>`, ≤ 72 chars.
Exempt prefixes: `Merge` / `Revert` / `promote:` / `hotfix:` /
`publish:` / `fixup!` / `squash!` / `Initial commit`.

Required trailers (enforced by CI and `.githooks/commit-msg`):

```
LLM-Agent: <Claude | Claude2 | Codex | Codex2 | Gemini | Gemini2 | Copilot | Qwen>
Task-ID: <task-id>
Reviewer: <name, must differ from LLM-Agent>
```

Optional: `Verified: <command summary>` (required when checks ran),
`Hotfix: yes` on hotfix-path commits.

Never commit generated artifacts: `dist/`, `node_modules/`,
`coverage/`, `playwright-report/`, `test-results/`, `.lovable/audits/`,
`pantheon-audits/`, `pantheon-contract/` (CI's Generated files guard
rejects them).

Local hook setup (once per clone): `git config core.hooksPath .githooks`

## 6. CI Gates and Branch Protection

Provided by `.github/workflows/branch-ci.yml`:

| Status check name       | What it does                                        |
|-------------------------|------------------------------------------------------|
| `Commit trailers`       | Enforce subject prefix + LLM-Agent / Task-ID / Reviewer |
| `Generated files guard` | Reject build/audit artifacts from the diff           |
| `Smoke acceptance`      | `npm ci && npm run build`                            |

Branch protection on `dev` and `main`: require PR, the 3 checks above +
base up-to-date, 0 approvals (gating discipline is in CI, mirroring
pantheon), force push and deletion blocked.

The pre-existing `pantheon-integration-gate.yml` (FE-BFF live release
gate) keeps running on PRs/pushes as an informational check; it is not
a required status check because its live probes depend on external dev
VM availability.

## 7. Hotfix Path

Branch `hotfix/<topic>` from `origin/main`, commit with `Hotfix: yes`,
open two auto-merge PRs — one `--base main`, one `--base dev`.

## 8. Configuration

Workflow parameters live in `.github/branch-workflow.json`
(`branch_workflow.*` — same schema as pantheon's
`.orchestrator/config.json branch_workflow`, with `main_branch: main`).

## 9. Deviations from pantheon

| Area | pantheon | execute-plans | Why |
|------|----------|---------------|-----|
| Canonical branch | `master` | `main` | `main` predates this port (promote PR #73 already targeted it) |
| dev environment binding | latest `publish/v*` snapshot | `dev` HEAD (push:dev → `pantheon-dev-fe-deploy.yml`) | FE dev deploy was deliberately wired to merge-to-dev (2026-06); snapshots serve only the promotion line |
| staging deploy on main | `master` push redeploys staging VMs | none yet | no staging FE host exists; hook a deploy job onto `main` push when it does |
| Smoke acceptance | `run-acceptance.sh smoke` | `npm ci && npm run build` | FE equivalent of a fast deterministic gate; the heavier live gate stays informational |
| worker_commit.py scope guard | mandatory commit path | not ported | scope manifests live in pantheon `.orchestrator/task-briefs/`; this repo has no equivalent source of truth |
