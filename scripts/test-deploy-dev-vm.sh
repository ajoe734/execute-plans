#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_SCRIPT="${ROOT_DIR}/scripts/deploy-dev-vm.sh"
REAL_NODE="$(command -v node)"
CURRENT_FE_SHA="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
GATED_BFF_SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
OTHER_BFF_SHA="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
GATE_RUN_ID="test-gate-run"
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

mkdir -p "${MOCK_BIN}" "${LOG_DIR}"

cat > "${MOCK_BIN}/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "ci" ]]; then
  exit 0
fi
if [[ "${1:-}" == "run" && "${2:-}" == "build" ]]; then
  rm -rf dist
  mkdir -p dist
  printf '<!doctype html><title>deploy test</title>\n' > dist/index.html
  printf '%s %s\n' "${VITE_BFF_REAL_WRITES:-unset}" "${VITE_BFF_ALLOW_DEV_STUB_WRITES:-unset}" >> "${DEPLOY_TEST_LOG_DIR}/build-flags.log"
  printf '%s\n' "${VITE_BFF_DEV_BEARER_TOKEN:-unset}" >> "${DEPLOY_TEST_LOG_DIR}/browser-token.log"
  printf '%s %s\n' "${PANTHEON_DEPLOY_WRITE_PROBE_AUTH_TOKEN:-absent}" "${WRITE_PROBE_AUTH_TOKEN:-absent}" >> "${DEPLOY_TEST_LOG_DIR}/build-secret-boundary.log"
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
if [[ "${DEPLOY_TEST_FAIL_SWITCH:-false}" == "true" && "${1:-}" == "mv" && "${2:-}" == "-Tf" && "${3:-}" == *.next ]]; then
  exit 91
fi
if [[ "${DEPLOY_TEST_TERM_AFTER_SWITCH:-false}" == "true" && "${1:-}" == "mv" && "${2:-}" == "-Tf" && "${3:-}" == *.next ]]; then
  shift
  mv "$@"
  kill -TERM "${PPID}"
  sleep 0.1
  exit 0
fi
if [[ "${DEPLOY_TEST_FAIL_RM_MATCH:-}" != "" && "${1:-}" == "rm" && "$*" == *"${DEPLOY_TEST_FAIL_RM_MATCH}"* ]]; then
  exit 92
fi
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
  bff_sha="${DEPLOY_TEST_BFF_SHA:-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"
  if [[ "${count}" -gt 1 && -n "${DEPLOY_TEST_BFF_SHA_AFTER_FIRST:-}" ]]; then
    bff_sha="${DEPLOY_TEST_BFF_SHA_AFTER_FIRST}"
  fi
  printf '{"service":"operator-bff","source_commit_sha":"%s","commit":"%s","source_commit_known":true}\n' "${bff_sha}" "${bff_sha}"
  exit 0
fi
if [[ "${DEPLOY_TEST_CURL_SWITCH_TARGET:-}" != "" ]]; then
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
    exit 0
    ;;
  scripts/probe-hosted-management-writes.mjs)
    printf '%s\n' "\${1}" >> "\${DEPLOY_TEST_LOG_DIR}/node-probes.log"
    printf '%s\n' "\${PANTHEON_BFF_AUTH_TOKEN:-absent}" >> "\${DEPLOY_TEST_LOG_DIR}/write-probe-token.log"
    exit 0
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
  printf '{"schemaVersion":1,"frontend":{"repository":"ajoe734/execute-plans","commitSha":"%s"},"bff":{"baseUrl":"https://bff.test","versionUrl":"https://bff.test/bff/version","sourceCommitSha":"%s","sourceCommitKnown":true},"gate":{"workflow":"pantheon-integration-gate.yml","runId":"%s","runUrl":"https://github.test/actions/runs/test-gate-run","observedAt":"2026-07-13T00:00:00Z"}}\n' \
    "${CURRENT_FE_SHA}" "${GATED_BFF_SHA}" "${GATE_RUN_ID}" > "${case_root}/release-identity.json"
  printf '%s\n' "${case_root}"
}

run_deploy() {
  local case_root="$1"
  local -a shell_args=()
  shift
  if [[ "${DEPLOY_TEST_XTRACE:-false}" == "true" ]]; then
    shell_args=(-x)
  fi
  rm -f "${case_root}/bff-version-count"
  env -u PANTHEON_DEPLOY_REAL_WRITES -u PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES \
    -u PANTHEON_DEPLOY_WRITE_PROBE_AUTH_TOKEN \
    PATH="${MOCK_BIN}:${PATH}" \
    DEPLOY_TEST_LOG_DIR="${LOG_DIR}" \
    PANTHEON_DEPLOY_ALLOW_DIRTY=true \
    PANTHEON_DEPLOY_SKIP_PROBE=true \
    PANTHEON_DEPLOY_LOCK_FILE="${case_root}/deploy.lock" \
    PANTHEON_DEV_FE_ROOT="${case_root}/live" \
    PANTHEON_DEV_FE_ROOT_PREFIX="${case_root}/live" \
    PANTHEON_DEV_FE_RELEASES_DIR="${case_root}/releases" \
    PANTHEON_AUDIT_OUT_DIR="${case_root}/audit" \
    PANTHEON_DEV_FE_PRESERVE_ASSETS=false \
    PANTHEON_DEV_FE_KEEP_RELEASES=8 \
    PANTHEON_DEV_FE_HOST=https://deploy.test \
    PANTHEON_BFF_BASE_URL=https://bff.test \
    PANTHEON_RELEASE_IDENTITY_FILE="${case_root}/release-identity.json" \
    PANTHEON_RELEASE_GATE_RUN_ID="${GATE_RUN_ID}" \
    DEPLOY_TEST_BFF_COUNT_FILE="${case_root}/bff-version-count" \
    "$@" \
    bash "${shell_args[@]}" "${DEPLOY_SCRIPT}"
}

case_root="$(prepare_case safe-default-success)"
run_deploy "${case_root}"
assert_eq "false false" "$(tail -n 1 "${LOG_DIR}/build-flags.log")" "safe build flags"
assert_eq "pantheon-dev-browser:viewer" "$(tail -n 1 "${LOG_DIR}/browser-token.log")" "public viewer token"
assert_exists "${case_root}/live/deployment.json"
assert_eq "false" "$("${REAL_NODE}" -e "console.log(require(process.argv[1]).buildMode.VITE_BFF_REAL_WRITES)" "${case_root}/live/deployment.json")" "manifest real-writes flag"
assert_eq "${GATED_BFF_SHA}" "$("${REAL_NODE}" -e "console.log(require(process.argv[1]).bffSourceCommitSha)" "${case_root}/live/deployment.json")" "manifest BFF SHA"
assert_eq "${GATED_BFF_SHA}" "$("${REAL_NODE}" -e "console.log(require(process.argv[1]).releaseIdentity.bff.sourceCommitSha)" "${case_root}/live/deployment.json")" "manifest exact release identity"
assert_eq "2" "$(cat "${case_root}/bff-version-count")" "pre/post-switch BFF identity checks"
[[ "$(readlink -f "${case_root}/live")" != "${case_root}/releases/previous" ]] || fail "successful deploy did not switch releases"
assert_missing "${LOG_DIR}/node-probes.log"

case_root="$(prepare_case missing-release-identity)"
if run_deploy "${case_root}" PANTHEON_RELEASE_IDENTITY_FILE="${case_root}/missing.json"; then
  fail "deploy without a release identity unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "missing identity target"

case_root="$(prepare_case wrong-gate-run)"
if run_deploy "${case_root}" PANTHEON_RELEASE_GATE_RUN_ID="different-gate-run"; then
  fail "deploy with the wrong integration gate run unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "wrong gate run target"

case_root="$(prepare_case pre-switch-bff-mismatch)"
if run_deploy "${case_root}" DEPLOY_TEST_BFF_SHA="${OTHER_BFF_SHA}"; then
  fail "pre-switch BFF mismatch unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "pre-switch mismatch target"
assert_eq "1" "$(cat "${case_root}/bff-version-count")" "pre-switch mismatch BFF check count"

case_root="$(prepare_case post-switch-bff-mismatch)"
if run_deploy "${case_root}" DEPLOY_TEST_BFF_SHA_AFTER_FIRST="${OTHER_BFF_SHA}"; then
  fail "post-switch BFF mismatch unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "post-switch mismatch rollback target"
assert_eq "2" "$(cat "${case_root}/bff-version-count")" "post-switch mismatch BFF check count"

case_root="$(prepare_case probe-failure-rollback)"
if run_deploy "${case_root}" DEPLOY_TEST_CURL_FAIL=true; then
  fail "probe failure unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "rollback target"
assert_exists "${case_root}/releases/previous"
assert_eq "1" "$(find "${case_root}/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)" "failed candidate cleanup"
if find "${case_root}/audit" -name 'dev-fe-deploy-*.md' -print -quit | grep -q .; then
  fail "probe failure wrote a passed deploy artifact"
fi

case_root="$(prepare_case no-previous-fail-closed false)"
if run_deploy "${case_root}" DEPLOY_TEST_CURL_FAIL=true; then
  fail "first-deploy probe failure unexpectedly succeeded"
fi
assert_missing "${case_root}/live"

case_root="$(prepare_case external-switch-protected)"
mkdir -p "${case_root}/releases/external"
printf '{"commit":"external"}\n' > "${case_root}/releases/external/deployment.json"
if run_deploy "${case_root}" DEPLOY_TEST_CURL_SWITCH_TARGET="${case_root}/releases/external"; then
  fail "externally switched probe failure unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/external" "$(readlink -f "${case_root}/live")" "external target protection"

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
assert_eq "${case_root}/releases/sentinel" "$(readlink -f "${case_root}/live.next")" "contender preserved next sentinel"
assert_eq "${case_root}/releases/sentinel" "$(readlink -f "${case_root}/live.rollback")" "contender preserved rollback sentinel"
assert_exists "${case_root}/releases/sentinel"

case_root="$(prepare_case signal-after-switch)"
if run_deploy "${case_root}" DEPLOY_TEST_TERM_AFTER_SWITCH=true; then
  fail "signal after live switch unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "signal rollback target"
assert_eq "1" "$(find "${case_root}/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)" "signal candidate cleanup"

case_root="$(prepare_case legacy-transition-failure false)"
mkdir -p "${case_root}/live"
printf '{"commit":"legacy"}\n' > "${case_root}/live/deployment.json"
if run_deploy "${case_root}" DEPLOY_TEST_FAIL_SWITCH=true; then
  fail "legacy transition failure unexpectedly succeeded"
fi
[[ -d "${case_root}/live" && ! -L "${case_root}/live" ]] || fail "legacy live root was not restored"
assert_exists "${case_root}/live/deployment.json"
assert_eq "0" "$(find "${case_root}/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)" "legacy candidate cleanup"

case_root="$(prepare_case prune-success)"
mkdir -p "${case_root}/releases/old-release"
touch -d '2000-01-01T00:00:00Z' "${case_root}/releases/old-release"
run_deploy "${case_root}" PANTHEON_DEV_FE_KEEP_RELEASES=2
assert_missing "${case_root}/releases/old-release"
assert_exists "${case_root}/releases/previous"

case_root="$(prepare_case prune-failure-rollback)"
mkdir -p "${case_root}/releases/old-release"
touch -d '2000-01-01T00:00:00Z' "${case_root}/releases/old-release"
if run_deploy "${case_root}" \
  PANTHEON_DEV_FE_KEEP_RELEASES=2 \
  DEPLOY_TEST_FAIL_RM_MATCH=old-release; then
  fail "prune failure unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "prune failure rollback target"
assert_exists "${case_root}/releases/old-release"
if find "${case_root}/audit" -name 'dev-fe-deploy-*.md' -print -quit | grep -q .; then
  fail "prune failure wrote a passed deploy artifact"
fi

case_root="$(prepare_case safe-probes)"
run_deploy "${case_root}" PANTHEON_DEPLOY_SKIP_PROBE=false
grep -Fxq "scripts/probe-hosted-browser-bff.mjs" "${LOG_DIR}/node-probes.log" || fail "safe browser probe did not run"
if grep -Fxq "scripts/probe-hosted-management-writes.mjs" "${LOG_DIR}/node-probes.log"; then
  fail "safe deploy unexpectedly ran the management write probe"
fi

case_root="$(prepare_case explicit-writes)"
run_deploy "${case_root}" \
  PANTHEON_DEPLOY_SKIP_PROBE=false \
  PANTHEON_DEPLOY_REAL_WRITES=true \
  PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES=true \
  PANTHEON_DEPLOY_WRITE_PROBE_AUTH_TOKEN="signed-short-lived-write-probe-token"
assert_eq "true true" "$(tail -n 1 "${LOG_DIR}/build-flags.log")" "explicit write build flags"
assert_eq "absent absent" "$(tail -n 1 "${LOG_DIR}/build-secret-boundary.log")" "write probe credential excluded from build"
grep -Fxq "scripts/probe-hosted-management-writes.mjs" "${LOG_DIR}/node-probes.log" || fail "explicit write probe did not run"
assert_eq "signed-short-lived-write-probe-token" "$(tail -n 1 "${LOG_DIR}/write-probe-token.log")" "server-side write probe token"

case_root="$(prepare_case xtrace-does-not-leak-write-credential)"
xtrace_log="${case_root}/xtrace.log"
if ! DEPLOY_TEST_XTRACE=true run_deploy "${case_root}" \
  PANTHEON_DEPLOY_WRITE_PROBE_AUTH_TOKEN="xtrace-secret-must-not-appear" \
  > "${xtrace_log}" 2>&1; then
  fail "xtrace credential boundary case did not complete"
fi
if grep -Fq "xtrace-secret-must-not-appear" "${xtrace_log}"; then
  fail "write probe credential leaked through shell xtrace"
fi

case_root="$(prepare_case explicit-writes-without-server-credential)"
if run_deploy "${case_root}" \
  PANTHEON_DEPLOY_SKIP_PROBE=false \
  PANTHEON_DEPLOY_REAL_WRITES=true \
  PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES=true; then
  fail "real-write deploy without a server-side probe credential unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "missing write credential rejection target"

case_root="$(prepare_case writes-without-probe-rejected)"
if run_deploy "${case_root}" \
  PANTHEON_DEPLOY_REAL_WRITES=true \
  PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES=true; then
  fail "real-write deploy without probes unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "rejected write deploy target"

case_root="$(prepare_case stub-writes-without-real-writes-rejected)"
if run_deploy "${case_root}" PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES=true; then
  fail "stub-write deploy without real writes unexpectedly succeeded"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "rejected stub-write deploy target"

case_root="$(prepare_case privileged-public-token-rejected)"
if run_deploy "${case_root}" \
  VITE_BFF_DEV_BEARER_TOKEN="public-browser:operator,admin:mfa:assistant.kernel.repair"; then
  fail "privileged public bearer unexpectedly reached the frontend build"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "privileged token rejection target"

case_root="$(prepare_case noncanonical-viewer-token-rejected)"
if run_deploy "${case_root}" VITE_BFF_DEV_BEARER_TOKEN="another-browser:viewer"; then
  fail "noncanonical public viewer unexpectedly reached the frontend build"
fi
assert_eq "${case_root}/releases/previous" "$(readlink -f "${case_root}/live")" "noncanonical viewer rejection target"

case_root="$(prepare_case cookie-only-public-build)"
run_deploy "${case_root}" VITE_BFF_DEV_BEARER_TOKEN=""
assert_eq "unset" "$(tail -n 1 "${LOG_DIR}/browser-token.log")" "cookie-only empty public token"

echo "OK: deploy safety regression harness passed"
