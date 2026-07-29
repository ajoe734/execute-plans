#!/usr/bin/env bash
# Cut a publish snapshot from dev tip if dev advanced since the latest
# release tag. Ported from pantheon scripts/git/nightly_publish.sh; the
# version is computed inline (vYYYY.MM.DD.N, N auto-increments per UTC
# day) since execute-plans has no release_branch_discipline.py.
#
# Usage: scripts/git/nightly_publish.sh [now|check]
#   now    cut and push immediately (default)
#   check  exit 0 if a cut would happen, exit 10 if dev hasn't advanced
#
# Driven by .github/workflows/nightly-publish-cut.yml on cron. Also
# usable manually after a hotfix when an out-of-band publish is needed.
#
# Output: pushes publish/v<YYYY>.<MM>.<DD>.<N> and release/v<...> tag.
# Refuses to overwrite an existing publish branch (immutable snapshots).

set -euo pipefail

MODE="${1:-now}"

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
PUBLISH_PREFIX=$(cfg publish_branch_prefix publish/)
RELEASE_PREFIX=$(cfg release_tag_prefix release/)

echo "→ fetch origin"
git fetch origin --tags --prune --quiet

DEV_SHA=$(git rev-parse "origin/${DEV_BRANCH}")
LATEST_RELEASE_SHA=$(git for-each-ref --sort=-creatordate \
  --format='%(objectname) %(refname:short)' "refs/tags/${RELEASE_PREFIX}*" \
  | head -1 | awk '{print $1}')

# Resolve to the commit the tag points at (handle annotated tags).
if [[ -n "$LATEST_RELEASE_SHA" ]]; then
  LATEST_RELEASE_COMMIT=$(git rev-parse "${LATEST_RELEASE_SHA}^{commit}")
else
  LATEST_RELEASE_COMMIT=""
fi

if [[ -n "$LATEST_RELEASE_COMMIT" && "$DEV_SHA" == "$LATEST_RELEASE_COMMIT" ]]; then
  echo "no new commits on origin/${DEV_BRANCH} since the latest release; nothing to cut"
  if [[ "$MODE" == "check" ]]; then exit 10; fi
  exit 0
fi

# Compute vYYYY.MM.DD.N — N is the next free same-day slot.
TODAY=$(date -u +%Y.%m.%d)
N=0
while git ls-remote --exit-code --tags origin "${RELEASE_PREFIX}v${TODAY}.${N}" >/dev/null 2>&1; do
  N=$((N + 1))
done
VER="v${TODAY}.${N}"

PUBLISH_BRANCH="${PUBLISH_PREFIX}${VER}"
RELEASE_TAG="${RELEASE_PREFIX}${VER}"

# Sanity: ensure the branch doesn't already exist on origin.
if git ls-remote --exit-code --heads origin "$PUBLISH_BRANCH" >/dev/null 2>&1; then
  echo "ERROR: $PUBLISH_BRANCH already exists on origin; refusing to overwrite immutable snapshot" >&2
  exit 4
fi

if [[ "$MODE" == "check" ]]; then
  echo "would cut $PUBLISH_BRANCH @ ${DEV_SHA:0:10}"
  exit 0
fi

# Cut in an isolated worktree so we don't disturb the main checkout.
WT=$(mktemp -d -t nightly-publish-XXXXXX)
cleanup() { git worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"; }
trap cleanup EXIT

echo "→ cut $PUBLISH_BRANCH from origin/${DEV_BRANCH} (${DEV_SHA:0:10})"
git worktree add "$WT" "origin/${DEV_BRANCH}" --quiet
(
  cd "$WT"
  git checkout -B "$PUBLISH_BRANCH" "origin/${DEV_BRANCH}" --quiet
  git push -u origin "$PUBLISH_BRANCH"
  git tag -a "$RELEASE_TAG" -m "publish: ${VER} from ${DEV_BRANCH}@${DEV_SHA:0:10}"
  git push origin "$RELEASE_TAG"
)

echo "✓ published ${VER} (${DEV_SHA:0:10})"
echo "  branch: $PUBLISH_BRANCH"
echo "  tag:    $RELEASE_TAG"
echo "  next:   publish-promote.yml will pick this up after the soak window"
