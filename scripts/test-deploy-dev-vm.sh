#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_SCRIPT="${ROOT_DIR}/scripts/deploy-dev-vm.sh"
REAL_NODE="$(command -v node)"
CURRENT_FE_SHA="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
RUNTIME_BFF_SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
OTHER_BFF_SHA="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/execute-plans-deploy-test.XXXXXX")"
MOCK_BIN="${TEST_ROOT}/bin"
LOG_DIR="${TEST_ROOT}/logs"
HARNESS_LOCK_FILE="${PANTHEON_DEPLOY_TEST_LOCK_FILE:-${TMPDIR:-/tmp}/execute-plans-deploy-test-harness.lock}"

exec 8>"${HARNESS_LOCK_FILE}"
flock 8

cleanup() {
  rm -rf "${TEST_ROOT}"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  [[ "${actual}" == "${expected}" ]] || fail "${message}: expected ${expected}, got ${actual}"
}

assert_exists() {
  [[ -e "$1" || -L "$1" ]] || fail "expected path to exist: $1"
}

assert_missing() {
  [[ ! -e "$1" && ! -L "$1" ]] || fail "expected path to be missing: $1"
}

assert_no_passed_artifact() {
  local audit_dir="$1"
  if find "${audit_dir}" -name 'dev-fe-deploy-*.md' -print -quit | grep -q .; then
    fail "failed deploy wrote a passed deploy artifact under ${audit_dir}"
  fi
}

assert_only_previous_release() {
  local case_root="$1"
  assert_eq "1" "$(find "${case_root}/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)" \
    "failed candidate cleanup"
  assert_exists "${case_root}/releases/previous"
}

mkdir -p "${MOCK_BIN}" "${LOG_DIR}"

cat > "${MOCK_BIN}/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "ci" ]]; then
  exit 0
fi
if [[ "${1:-}" == "run" && "${2:-}" == "build" ]]; then
  [[ "${VITE_BFF_REAL_WRITES:-}" == "false" ]] || {
    echo "deploy harness refuses real writes" >&2
    exit 81
  }
  [[ "${VITE_BFF_ALLOW_DEV_STUB_WRITES:-}" == "false" ]] || {
    echo "deploy harness refuses dev-stub writes" >&2
    exit 82
  }
  [[ -z "${VITE_BFF_DEV_BEARER_TOKEN:-}" ]] || {
    echo "deploy harness refuses an embedded bearer token" >&2
    exit 83
  }
  rm -rf dist
  mkdir -p dist
  printf '<!doctype html><title>deploy test</title>\n' > dist/index.html
  printf '%s %s %s\n' \
    "${VITE_BFF_REAL_WRITES}" \
    "${VITE_BFF_ALLOW_DEV_STUB_WRITES}" \
    "${VITE_BFF_DEV_BEARER_TOKEN:-}" >> "${DEPLOY_TEST_LOG_DIR}/build-flags.log"
  exit 0
fi
echo "unexpected npm invocation: $*" >&2
exit 2
EOF

cat > "${MOCK_BIN}/rsync" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
args=("$@")
source_path="${args[$((${#args[@]} - 2))]}"
destination_path="${args[$((${#args[@]} - 1))]}"
mkdir -p "${destination_path}"
find "${destination_path}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp -a "${source_path}"/. "${destination_path}"/
EOF

cat > "${MOCK_BIN}/sudo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "install" ]]; then
  shift
  filtered=()
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      -o|-g)
        shift 2
        ;;
      *)
        filtered+=("$1")
        shift
        ;;
    esac
  done
  exec install "${filtered[@]}"
fi
exec "$@"
EOF

cat > "${MOCK_BIN}/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
url="${!#}"

if [[ "${url}" == */bff/version ]]; then
  count_file="${DEPLOY_TEST_BFF_COUNT_FILE:?}"
  count=0
  if [[ -f "${count_file}" ]]; then
    count="$(cat "${count_file}")"
  fi
  count=$((count + 1))
  printf '%s\n' "${count}" > "${count_file}"

  initial_sha="${DEPLOY_TEST_BFF_INITIAL_SHA:-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"
  initial_commit="${DEPLOY_TEST_BFF_INITIAL_COMMIT:-${initial_sha}}"
  initial_known="${DEPLOY_TEST_BFF_INITIAL_KNOWN:-true}"
  before_sha="${DEPLOY_TEST_BFF_BEFORE_SHA:-${initial_sha}}"
  before_commit="${DEPLOY_TEST_BFF_BEFORE_COMMIT:-${before_sha}}"
  before_known="${DEPLOY_TEST_BFF_BEFORE_KNOWN:-true}"
  after_sha="${DEPLOY_TEST_BFF_AFTER_SHA:-${before_sha}}"
  after_commit="${DEPLOY_TEST_BFF_AFTER_COMMIT:-${after_sha}}"
  after_known="${DEPLOY_TEST_BFF_AFTER_KNOWN:-true}"

  case "${count}" in
    1)
      bff_sha="${initial_sha}"
      bff_commit="${initial_commit}"
      bff_known="${initial_known}"
      ;;
    2)
      bff_sha="${before_sha}"
      bff_commit="${before_commit}"
      bff_known="${before_known}"
      ;;
    *)
      bff_sha="${after_sha}"
      bff_commit="${after_commit}"
      bff_known="${after_known}"
      ;;
  esac

  printf '{"service":"operator-bff","source_commit_sha":"%s","commit":"%s","source_commit_known":%s}\n' \
    "${bff_sha}" "${bff_commit}" "${bff_known}"
  exit 0
fi

if [[ "${DEPLOY_TEST_CURL_SWITCH_TARGET:-}" != "" && "${url}" == "${PANTHEON_DEV_FE_HOST}/" ]]; then
  ln -sfn "${DEPLOY_TEST_CURL_SWITCH_TARGET}" "${PANTHEON_DEV_FE_ROOT}.external"
  mv -Tf "${PANTHEON_DEV_FE_ROOT}.external" "${PANTHEON_DEV_FE_ROOT}"
  exit 22
fi

if [[ "${DEPLOY_TEST_CURL_FAIL:-false}" == "true" ]]; then
  exit 22
fi

if [[ "${url}" == */deployment.json ]]; then
  cat "$(readlink -f "${PANTHEON_DEV_FE_ROOT}")/deployment.json"
fi
EOF

cat > "${MOCK_BIN}/npx" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${DEPLOY_TEST_LOG_DIR}/npx.log"
EOF

cat > "${MOCK_BIN}/node" <<EOF
#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  scripts/probe-hosted-browser-bff.mjs)
    printf '%s\n' "\${1}" >> "\${DEPLOY_TEST_LOG_DIR}/node-probes.log"
    if [[ "\${DEPLOY_TEST_FAIL_BROWSER_PROBE:-false}" == "true" ]]; then
      exit 84
    fi
    exit 0
    ;;
  scripts/probe-hosted-management-writes.mjs)
    echo "deploy harness refuses the management write probe" >&2
    exit 85
    ;;
esac
exec "${REAL_NODE}" "\$@"
EOF

chmod +x "${MOCK_BIN}"/*

prepare_case() {
  local case_name="$1"
  local with_previous="${2:-true}"
  local case_root="${TEST_ROOT}/${case_name}"
  mkdir -p "${case_root}/releases" "${case_root}/audit"
  if [[ "${with_previous}" == "true" ]]; then
    mkdir -p "${case_root}/releases/previous"
    printf '{"commit":"previous"}\n' > "${case_root}/releases/previous/deployment.json"
    ln -s "${case_root}/releases/previous" "${case_root}/live"
  fi
  printf '%s\n' "${case_root}"
}

run_deploy() {
  local case_root="$1"
  shift
  rm -f "${case_root}/bff-version-count"
  env \
    -u GITHUB_EVENT_NAME \
    -u PANTHEON_DEPLOY_BFF_COMMIT \
    -u PANTHEON_DEPLOY_EXPECTED_BFF_COMMIT \
    -u PANTHEON_DEPLOY_REAL_WRITES \
    -u PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES \
    -u VITE_BFF_DEV_BEARER_TOKEN \
    PATH="${MOCK_BIN}:${PATH}" \
    DEPLOY_TEST_LOG_DIR="${LOG_DIR}" \
    PANTHEON_DEPLOY_ALLOW_DIRTY=true \
    PANTHEON_DEPLOY_SKIP_PROBE=true \
    PANTHEON_DEPLOY_LOCK_FILE="${case_root}/deploy.lock" \
    PANTHEON_DEPLOY_RELEASE_INSTANCE="$(basename "${case_root}")" \
    PANTHEON_DEV_FE_ROOT="${case_root}/live" \
    PANTHEON_DEV_FE_ROOT_PREFIX="${case_root}/live" \
    PANTHEON_DEV_FE_RELEASES_DIR="${case_root}/releases" \
    PANTHEON_AUDIT_OUT_DIR="${case_root}/audit" \
    PANTHEON_DEV_FE_PRESERVE_ASSETS=false \
    PANTHEON_DEV_FE_KEEP_RELEASES=8 \
    PANTHEON_DEV_FE_HOST=https://deploy.test \
    PANTHEON_BFF_BASE_URL=https://bff.test \
    VITE_SUPABASE_URL=https://deploy-test.supabase.co \
    VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_deploy_test \
    DEPLOY_TEST_BFF_COUNT_FILE="${case_root}/bff-version-count" \
    "$@" \
    bash "${DEPLOY_SCRIPT}"
}

case_root="$(prepare_case success)"
run_deploy "${case_root}"
assert_eq "false false " "$(tail -n 1 "${LOG_DIR}/build-flags.log")" "tokenless read-only build flags"
assert_exists "${case_root}/live/deployment.json"
assert_eq "${RUNTIME_BFF_SHA}" "$("${REAL_NODE}" -e 'console.log(require(process.argv[1]).bffCommit)' "${case_root}/live/deployment.json")" \
  "manifest runtime BFF SHA"
assert_eq "true" "$("${REAL_NODE}" -e 'console.log(require(process.argv[1]).bffCommitEvidence)' "${case_root}/live/deployment.json")" \
  "manifest BFF evidence flag"
assert_eq "bff_version" "$("${REAL_NODE}" -e 'console.log(require(process.argv[1]).bffCommitSource)' "${case_root}/live/deployment.json")" \
  "manifest BFF evidence source"
assert_eq "3" "$(cat "${case_root}/bff-version-count")" "initial/before-switch/after-switch BFF reads"
[[ "$(readlink -f "${case_root}/live")" != "${case_root}/releases/previous" ]] || \
  fail "successful deploy did not switch releases"

case_root="$(prepare_case matching-expected)"
run_deploy "${case_root}" PANTHEON_DEPLOY_EXPECTED_BFF_COMMIT="${RUNTIME_BFF_SHA}"
assert_eq "3" "$(cat "${case_root}/bff-version-count")" "matching expected BFF read count"
assert_eq "${RUNTIME_BFF_SHA}" "$("${REAL_NODE}" -e 'console.log(require(process.argv[1]).bffCommit)' "${case_root}/live/deployment.json")" \
  "matching expected manifest BFF SHA"
assert_eq "bff_version" "$("${REAL_NODE}" -e 'console.log(require(process.argv[1]).bffCommitSource)' "${case_root}/live/deployment.json")" \
  "matching expected remains a runtime-version evidence source"

case_root="$(prepare_case unknown-initial)"
if run_deploy "${case_root}" DEPLOY_TEST_BFF_INITIAL_KNOWN=false; then
  fail "deploy with unknown initial BFF provenance unexpectedly succeeded"
fi
assert_eq "1" "$(cat "${case_root}/bff-version-count")" "unknown initial BFF read count"
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "unknown initial target"
assert_only_previous_release "${case_root}"
assert_no_passed_artifact "${case_root}/audit"

case_root="$(prepare_case inconsistent-initial)"
if run_deploy "${case_root}" DEPLOY_TEST_BFF_INITIAL_COMMIT="${OTHER_BFF_SHA}"; then
  fail "deploy with unequal source_commit_sha and commit unexpectedly succeeded"
fi
assert_eq "1" "$(cat "${case_root}/bff-version-count")" "inconsistent initial BFF read count"
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "inconsistent initial target"
assert_only_previous_release "${case_root}"
assert_no_passed_artifact "${case_root}/audit"

case_root="$(prepare_case stale-expected)"
if run_deploy "${case_root}" PANTHEON_DEPLOY_EXPECTED_BFF_COMMIT="${OTHER_BFF_SHA}"; then
  fail "deploy with stale expected BFF commit unexpectedly succeeded"
fi
assert_eq "1" "$(cat "${case_root}/bff-version-count")" "stale expected BFF read count"
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "stale expected target"
assert_only_previous_release "${case_root}"
assert_no_passed_artifact "${case_root}/audit"

case_root="$(prepare_case pre-switch-drift)"
if run_deploy "${case_root}" DEPLOY_TEST_BFF_BEFORE_SHA="${OTHER_BFF_SHA}"; then
  fail "deploy with pre-switch BFF drift unexpectedly succeeded"
fi
assert_eq "2" "$(cat "${case_root}/bff-version-count")" "pre-switch drift BFF read count"
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "pre-switch drift target"
assert_only_previous_release "${case_root}"
assert_no_passed_artifact "${case_root}/audit"

case_root="$(prepare_case post-switch-drift)"
if run_deploy "${case_root}" DEPLOY_TEST_BFF_AFTER_SHA="${OTHER_BFF_SHA}"; then
  fail "deploy with post-switch BFF drift unexpectedly succeeded"
fi
assert_eq "3" "$(cat "${case_root}/bff-version-count")" "post-switch drift BFF read count"
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "post-switch drift rollback target"
assert_only_previous_release "${case_root}"
assert_no_passed_artifact "${case_root}/audit"

case_root="$(prepare_case post-switch-unknown)"
if run_deploy "${case_root}" DEPLOY_TEST_BFF_AFTER_KNOWN=false; then
  fail "deploy with unknown post-switch BFF provenance unexpectedly succeeded"
fi
assert_eq "3" "$(cat "${case_root}/bff-version-count")" "unknown post-switch BFF read count"
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "unknown post-switch rollback target"
assert_only_previous_release "${case_root}"
assert_no_passed_artifact "${case_root}/audit"

case_root="$(prepare_case browser-probe-failure)"
if run_deploy "${case_root}" \
  PANTHEON_DEPLOY_SKIP_PROBE=false \
  DEPLOY_TEST_FAIL_BROWSER_PROBE=true; then
  fail "deploy with a failed browser probe unexpectedly succeeded"
fi
assert_eq "3" "$(cat "${case_root}/bff-version-count")" "probe failure BFF read count"
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "probe failure rollback target"
assert_only_previous_release "${case_root}"
assert_no_passed_artifact "${case_root}/audit"

case_root="$(prepare_case prior-symlink-protected false)"
mkdir -p "${case_root}/outside-release-store"
printf '{"commit":"outside"}\n' > "${case_root}/outside-release-store/deployment.json"
ln -s "${case_root}/outside-release-store" "${case_root}/live"
if run_deploy "${case_root}"; then
  fail "deploy over a prior symlink outside the release store unexpectedly succeeded"
fi
assert_eq "${case_root}/outside-release-store" "$(readlink -f "${case_root}/live")" "prior symlink protection"
assert_eq "0" "$(find "${case_root}/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)" \
  "prior symlink candidate cleanup"
assert_no_passed_artifact "${case_root}/audit"

case_root="$(prepare_case external-switch-protected)"
mkdir -p "${case_root}/releases/external"
printf '{"commit":"external"}\n' > "${case_root}/releases/external/deployment.json"
if run_deploy "${case_root}" DEPLOY_TEST_CURL_SWITCH_TARGET="${case_root}/releases/external"; then
  fail "externally switched hosted verification failure unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/external" "$(readlink -f "${case_root}/live")" "external switch protection"
remaining_candidate="$(find "${case_root}/releases" -mindepth 1 -maxdepth 1 -type d \
  ! -name previous ! -name external -print -quit)"
[[ -z "${remaining_candidate}" ]] || fail "external-switch failure retained candidate: ${remaining_candidate}"
assert_no_passed_artifact "${case_root}/audit"

case_root="$(prepare_case concurrent-deploy-rejected)"
mkdir -p "${case_root}/releases/sentinel"
ln -s "${case_root}/releases/sentinel" "${case_root}/live.next"
ln -s "${case_root}/releases/sentinel" "${case_root}/live.rollback"
exec {lock_fd}>"${case_root}/deploy.lock"
flock -n "${lock_fd}"
if run_deploy "${case_root}"; then
  fail "concurrent deployment unexpectedly succeeded"
fi
flock -u "${lock_fd}"
exec {lock_fd}>&-
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "concurrent deploy target"
assert_eq "${case_root}/releases/sentinel" "$(readlink -f "${case_root}/live.next")" \
  "concurrent contender next sentinel"
assert_eq "${case_root}/releases/sentinel" "$(readlink -f "${case_root}/live.rollback")" \
  "concurrent contender rollback sentinel"
assert_exists "${case_root}/releases/sentinel"
assert_no_passed_artifact "${case_root}/audit"

echo "OK: deploy runtime-BFF safety regression harness passed"
