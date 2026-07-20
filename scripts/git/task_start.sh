#!/usr/bin/env bash
# Start a fresh per-task branch (ported from pantheon scripts/git/task_start.sh).
#
# Usage: scripts/git/task_start.sh <TASK-ID>
#
# Creates `task/<TASK-ID>` from origin/dev HEAD.
# Pairs with scripts/git/task_finalize.sh.

set -euo pipefail

TASK_ID="${1:-}"
if [[ -z "$TASK_ID" ]]; then
  echo "usage: $0 <TASK-ID>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

CONFIG_FILE=".github/branch-workflow.json"
cfg() {
  python3 -c "
import json, sys
try:
    c = json.load(open('$CONFIG_FILE'))
except Exception:
    c = {}
print(c.get('branch_workflow', {}).get(sys.argv[1]) or sys.argv[2])
" "$1" "$2"
}
DEV_BRANCH=$(cfg dev_branch dev)
PREFIX=$(cfg task_branch_prefix task/)
TASK_BRANCH="${PREFIX}${TASK_ID}"

echo "→ fetch origin $DEV_BRANCH"
git fetch origin "$DEV_BRANCH" --quiet

# If we're already on the target branch with unrelated dirty staging,
# abort to avoid sweeping someone else's index in.
CURRENT=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT" == "$TASK_BRANCH" ]]; then
  if ! git diff --cached --quiet; then
    echo "ERROR: task branch already checked out with files staged." >&2
    echo "Refusing to clobber; clear the index first:" >&2
    echo "  git restore --staged --" >&2
    exit 2
  fi
fi

git checkout -B "$TASK_BRANCH" "origin/${DEV_BRANCH}" --quiet
git restore --staged -- . 2>/dev/null || true

echo "✓ task branch '$TASK_BRANCH' is at $(git rev-parse --short HEAD) (origin/${DEV_BRANCH})"
echo
echo "Next steps:"
echo "  1. make your changes"
echo "  2. commit with required trailers (LLM-Agent / Task-ID / Reviewer)"
echo "  3. push + open PR:  ./scripts/git/task_finalize.sh '${TASK_ID}'"
