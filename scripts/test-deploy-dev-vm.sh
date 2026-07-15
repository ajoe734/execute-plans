#!/usr/bin/env bash
# Isolated regression harness for scripts/deploy-dev-vm.sh.
#
# Every scenario uses its own clean git clone, bare origin, release store,
# deploy symlink, audit directory, lock, and prepared release candidate. Network,
# package installation, Playwright, sudo, and rsync are replaced with narrow
# local fakes; candidate/evidence verification and git/flock remain real.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_SOURCE="${ROOT_DIR}/scripts/deploy-dev-vm.sh"
CANDIDATE_SOURCE="${ROOT_DIR}/scripts/release-candidate.mjs"
EVIDENCE_SOURCE="${ROOT_DIR}/scripts/release-evidence.mjs"
CAS_SOURCE="${ROOT_DIR}/scripts/atomic-symlink-cas.py"
ATOMIC_MANIFEST_SOURCE="${ROOT_DIR}/scripts/atomic-release-manifest.py"
SYSTEM_PATH="${PATH}"
REAL_NODE="$(command -v node)"

for required_file in \
  "${DEPLOY_SOURCE}" \
  "${CANDIDATE_SOURCE}" \
  "${EVIDENCE_SOURCE}" \
  "${CAS_SOURCE}" \
  "${ATOMIC_MANIFEST_SOURCE}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "missing test contract: ${required_file}" >&2
    exit 2
  fi
done
for required_command in git flock node python3; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    echo "missing test command: ${required_command}" >&2
    exit 2
  fi
done

HARNESS_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/deploy-dev-vm-contract.XXXXXX")"
MOCK_BIN="${HARNESS_ROOT}/mock-bin"
BASE_SOURCE="${HARNESS_ROOT}/base-source"
BASE_ORIGIN="${HARNESS_ROOT}/base-origin.git"
GATE_RUN_ID="731"
BFF_SHA="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
PREVIOUS_DIGEST="auto"
PASSED=0
FAILED=0

cleanup_harness() {
  chmod -R u+w "${HARNESS_ROOT}" 2>/dev/null || true
  rm -rf "${HARNESS_ROOT}"
}
trap cleanup_harness EXIT

die() {
  echo "assertion failed: $*" >&2
  exit 1
}

show_deploy_failure() {
  local message="$1"
  echo "${message}" >&2
  if [[ -f "${RUN_OUTPUT:-}" ]]; then
    sed -n '1,220p' "${RUN_OUTPUT}" >&2
  fi
  exit 1
}

json_field() {
  local file="$1"
  local expression="$2"
  "${REAL_NODE}" -e '
    const fs = require("node:fs");
    const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const path = process.argv[2].split(".");
    let value = payload;
    for (const part of path) value = value?.[part];
    if (value === undefined) process.exit(2);
    process.stdout.write(typeof value === "string" ? value : JSON.stringify(value));
  ' "${file}" "${expression}"
}

repeat_character() {
  local character="$1"
  local count="$2"
  printf '%*s' "${count}" '' | tr ' ' "${character}"
}

mkdir -p "${MOCK_BIN}"

cat > "${MOCK_BIN}/npm" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'npm\n' >> "${MOCK_CALL_LOG:?}"
MOCK

cat > "${MOCK_BIN}/npx" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'npx\n' >> "${MOCK_CALL_LOG:?}"
MOCK

cat > "${MOCK_BIN}/rsync" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
arguments=("$@")
if (( ${#arguments[@]} < 2 )); then
  echo "mock rsync requires source and destination" >&2
  exit 2
fi
source_path="${arguments[${#arguments[@]}-2]%/}"
destination_path="${arguments[${#arguments[@]}-1]%/}"
case "${source_path}" in
  "${MOCK_ALLOWED_ROOT:?}"/*) ;;
  *) echo "mock rsync source escaped case root" >&2; exit 2 ;;
esac
case "${destination_path}" in
  "${MOCK_ALLOWED_ROOT}"/*) ;;
  *) echo "mock rsync destination escaped case root" >&2; exit 2 ;;
esac
if [[ "${MOCK_FAIL_DURABLE_RSYNC_ONCE:-false}" == "true" && "${destination_path}" == *"/durable-evidence/"* ]]; then
  marker="${MOCK_ALLOWED_ROOT}/.durable-rsync-failed-once"
  if [[ ! -e "${marker}" ]]; then
    : > "${marker}"
    echo "mock durable evidence rsync failure" >&2
    exit 23
  fi
fi
mkdir -p "${destination_path}"
cp -a "${source_path}/." "${destination_path}/"
printf 'rsync\n' >> "${MOCK_CALL_LOG:?}"
MOCK

cat > "${MOCK_BIN}/sudo" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
while [[ "${1:-}" == --preserve-env=* ]]; do
  shift
done
if [[ "${1:-}" == "install" && "${2:-}" == "-d" ]]; then
  destination="${@: -1}"
  case "${destination}" in
    "${MOCK_ALLOWED_ROOT:?}"/*) mkdir -p "${destination}" ;;
    *) echo "mock install destination escaped case root" >&2; exit 2 ;;
  esac
  exit 0
fi
if [[ "${1:-}" == "install" ]]; then
  source_path="${@: -2:1}"
  destination="${@: -1}"
  case "${source_path}" in
    "${MOCK_ALLOWED_ROOT:?}"/*) ;;
    *) echo "mock install source escaped case root" >&2; exit 2 ;;
  esac
  case "${destination}" in
    "${MOCK_ALLOWED_ROOT}"/*) cp "${source_path}" "${destination}" ;;
    *) echo "mock install destination escaped case root" >&2; exit 2 ;;
  esac
  exit 0
fi
if [[ "${1:-}" == "python3" && "${2:-}" == */scripts/atomic-symlink-cas.py ]]; then
  printf 'atomic-cas:%s\n' "${3:-unknown}" >> "${MOCK_CALL_LOG:?}"
fi
if [[ "${1:-}" == "python3" && "${2:-}" == */scripts/atomic-release-manifest.py ]]; then
  printf 'atomic-manifest:%s\n' "${3:-unknown}" >> "${MOCK_CALL_LOG:?}"
fi
exec "$@"
MOCK

cat > "${MOCK_BIN}/curl" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
url="${@: -1}"
case "${url}" in
  */bff/version*)
    call_index="$(grep -Fxc 'curl:bff-version' "${MOCK_CALL_LOG:?}" || true)"
    IFS=',' read -r -a sha_sequence <<< "${MOCK_BFF_SHA_SEQUENCE:-${MOCK_BFF_SHA:?}}"
    IFS=',' read -r -a commit_sequence <<< "${MOCK_BFF_COMMIT_SEQUENCE:-${MOCK_BFF_SHA_SEQUENCE:-${MOCK_BFF_SHA:?}}}"
    IFS=',' read -r -a known_sequence <<< "${MOCK_BFF_KNOWN_SEQUENCE:-true}"
    sequence_index="${call_index}"
    if (( sequence_index >= ${#sha_sequence[@]} )); then
      sequence_index=$((${#sha_sequence[@]} - 1))
    fi
    commit_index="${call_index}"
    if (( commit_index >= ${#commit_sequence[@]} )); then
      commit_index=$((${#commit_sequence[@]} - 1))
    fi
    known_index="${call_index}"
    if (( known_index >= ${#known_sequence[@]} )); then
      known_index=$((${#known_sequence[@]} - 1))
    fi
    printf 'curl:bff-version\n' >> "${MOCK_CALL_LOG:?}"
    printf '{"source_commit_known":%s,"source_commit_sha":"%s","commit":"%s"}\n' \
      "${known_sequence[${known_index}]}" \
      "${sha_sequence[${sequence_index}]}" \
      "${commit_sequence[${commit_index}]}"
    ;;
  */deployment.json*)
    printf 'curl:deployment\n' >> "${MOCK_CALL_LOG:?}"
    if [[ -n "${MOCK_EXTERNAL_SWITCH_TARGET:-}" ]]; then
      ln -sfn "${MOCK_EXTERNAL_SWITCH_TARGET}" "${PANTHEON_DEV_FE_ROOT:?}.external"
      mv -Tf "${PANTHEON_DEV_FE_ROOT}.external" "${PANTHEON_DEV_FE_ROOT}"
    fi
    manifest="${PANTHEON_DEV_FE_ROOT:?}/deployment.json"
    if [[ ! -f "${manifest}" ]]; then
      echo "mock public manifest is unavailable" >&2
      exit 22
    fi
    digest_marker="${MOCK_ALLOWED_ROOT}/.github-digest-tampered-once"
    if [[ "${MOCK_BAD_GITHUB_DIGEST:-false}" == "true" && ! -e "${digest_marker}" ]]; then
      : > "${digest_marker}"
      node -e '
        const fs=require("node:fs");const file=process.argv[1];
        const value=JSON.parse(fs.readFileSync(file,"utf8"));
        value.githubArtifactDigest=`sha256:${"0".repeat(64)}`;
        fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`);
      ' "${manifest}"
    fi
    cat "${manifest}"
    ;;
  *)
    echo "unexpected mock curl URL" >&2
    exit 22
    ;;
esac
MOCK

chmod +x "${MOCK_BIN}/npm" "${MOCK_BIN}/npx" "${MOCK_BIN}/rsync" \
  "${MOCK_BIN}/sudo" "${MOCK_BIN}/curl"

mkdir -p "${BASE_SOURCE}/scripts"
cp "${DEPLOY_SOURCE}" "${BASE_SOURCE}/scripts/deploy-dev-vm.sh"
cp "${CANDIDATE_SOURCE}" "${BASE_SOURCE}/scripts/release-candidate.mjs"
cp "${EVIDENCE_SOURCE}" "${BASE_SOURCE}/scripts/release-evidence.mjs"
cp "${CAS_SOURCE}" "${BASE_SOURCE}/scripts/atomic-symlink-cas.py"
cp "${ATOMIC_MANIFEST_SOURCE}" "${BASE_SOURCE}/scripts/atomic-release-manifest.py"
chmod +x "${BASE_SOURCE}/scripts/deploy-dev-vm.sh" \
  "${BASE_SOURCE}/scripts/release-candidate.mjs" \
  "${BASE_SOURCE}/scripts/release-evidence.mjs" \
  "${BASE_SOURCE}/scripts/atomic-symlink-cas.py" \
  "${BASE_SOURCE}/scripts/atomic-release-manifest.py"

cat > "${BASE_SOURCE}/scripts/probe-hosted-browser-bff.mjs" <<'MOCK_PROBE'
#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const output = process.env.PANTHEON_PROBE_JSON_OUT || "";
const match = path.basename(output).match(/^browser-probe-(.+)\.json$/u);
const phase = match?.[1] || "unknown";
const log = process.env.MOCK_CALL_LOG;
if (!log) throw new Error("MOCK_CALL_LOG is required");
fs.appendFileSync(log, `probe:${phase}\n`, "utf8");
if (phase === "recovery_rollback") {
  const calls = fs.readFileSync(log, "utf8").trim().split(/\r?\n/u);
  const probeIndex = calls.lastIndexOf(`probe:${phase}`);
  const npmIndex = calls.lastIndexOf("npm", probeIndex);
  const npxIndex = calls.lastIndexOf("npx", probeIndex);
  if (npmIndex < 0 || npxIndex < 0 || npmIndex >= probeIndex || npxIndex >= probeIndex) {
    throw new Error("recovery probe dependencies were not installed first");
  }
}
if (
  phase === "candidate_pre_switch" &&
  process.env.MOCK_ADVANCE_DEV_AFTER_PROBE === "true"
) {
  execFileSync(
    "git",
    [
      `--git-dir=${process.env.MOCK_ORIGIN_DIR}`,
      "update-ref",
      "refs/heads/dev",
      process.env.MOCK_ADVANCED_DEV_SHA,
    ],
    { stdio: "ignore" },
  );
}
if (output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({ phase, pass: true })}\n`, "utf8");
}
const failures = String(process.env.MOCK_FAIL_PROBE_PHASES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (failures.includes(phase)) {
  console.error(`mock browser/auth probe failure: ${phase}`);
  process.exitCode = 1;
}
MOCK_PROBE
chmod +x "${BASE_SOURCE}/scripts/probe-hosted-browser-bff.mjs"

git -C "${BASE_SOURCE}" init -q -b dev
git -C "${BASE_SOURCE}" config user.name "deploy-contract-test"
git -C "${BASE_SOURCE}" config user.email "deploy-contract-test@example.invalid"
printf 'previous release\n' > "${BASE_SOURCE}/history.txt"
git -C "${BASE_SOURCE}" add scripts history.txt
git -C "${BASE_SOURCE}" commit -qm "previous release"
PREVIOUS_SHA="$(git -C "${BASE_SOURCE}" rev-parse HEAD)"
printf 'candidate release\n' >> "${BASE_SOURCE}/history.txt"
git -C "${BASE_SOURCE}" add history.txt
git -C "${BASE_SOURCE}" commit -qm "candidate release"
CANDIDATE_SHA="$(git -C "${BASE_SOURCE}" rev-parse HEAD)"

git init -q --bare "${BASE_ORIGIN}"
git -C "${BASE_SOURCE}" remote add origin "${BASE_ORIGIN}"
git -C "${BASE_SOURCE}" push -q origin dev

make_previous_manifest() {
  local output="$1"
  local commit="$2"
  local digest="$3"
  local bff_commit="${4:-${BFF_SHA}}"
  "${REAL_NODE}" --input-type=module - "${output}" "${commit}" "${digest}" "${bff_commit}" <<'NODE'
import fs from "node:fs";
const [output, commit, digest, bffCommit] = process.argv.slice(2);
const manifest = {
  app: "execute-plans",
  environment: "pantheon-dev-fe",
  commit,
  bffCommit,
  bffCommitEvidence: true,
  artifactDigest: digest,
  artifactDigestSha256: digest,
  buildMode: {
    VITE_BFF_MODE: "live",
    VITE_BFF_FALLBACK: "strict",
    VITE_BFF_REAL_WRITES: "false",
    VITE_BFF_ALLOW_DEV_STUB_WRITES: "false",
    VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
  },
};
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE
}

upgrade_previous_manifest_to_modern() {
  local manifest="$1"
  local commit digest
  commit="$(json_field "${manifest}" commit)"
  digest="$(json_field "${manifest}" artifactDigestSha256)"
  "${REAL_NODE}" --input-type=module - \
    "${manifest}" "${commit}" "${digest}" "${BFF_SHA}" <<'NODE'
import fs from "node:fs";
const [file, commit, digest, bffCommit] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(file, "utf8"));
const gateRunId = "7001";
payload.schemaVersion = 1;
payload.repository = "ajoe734/execute-plans";
payload.frontendSha = commit;
payload.frontend = { repository: "ajoe734/execute-plans", commitSha: commit };
payload.gate = {
  workflow: "pantheon-integration-gate.yml",
  runId: gateRunId,
  runUrl: `https://github.com/ajoe734/execute-plans/actions/runs/${gateRunId}`,
};
payload.integrationGateRunId = gateRunId;
payload.githubArtifactDigest = `sha256:${digest}`;
payload.bffSourceCommitSha = bffCommit;
payload.bffHost = "https://bff.test";
payload.bff = {
  baseUrl: "https://bff.test",
  sourceCommitSha: bffCommit,
  sourceCommitKnown: true,
};
payload.deploymentState = "accepted";
fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
NODE
}

corrupt_modern_previous_manifest() {
  local manifest="$1"
  local field="$2"
  "${REAL_NODE}" --input-type=module - "${manifest}" "${field}" <<'NODE'
import fs from "node:fs";
const [file, field] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(file, "utf8"));
if (field === "gate_url") payload.gate.runUrl = "https://attacker.invalid/actions/runs/7001";
else if (field === "github_digest") payload.githubArtifactDigest = "sha256:bad";
else if (field === "frontend_sha") payload.frontend.commitSha = "3".repeat(40);
else if (field === "frontend_repository") payload.frontend.repository = "attacker/execute-plans";
else if (field === "bff_sha") payload.bff.sourceCommitSha = "4".repeat(40);
else throw new Error(`unsupported corruption field: ${field}`);
fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
NODE
}

setup_case() {
  local name="$1"
  local previous_commit="${2:-${PREVIOUS_SHA}}"
  local previous_digest="${3:-${PREVIOUS_DIGEST}}"

  CASE_NAME="${name}"
  CASE_DIR="${HARNESS_ROOT}/cases/${name}"
  CASE_ORIGIN="${CASE_DIR}/origin.git"
  CASE_REPO="${CASE_DIR}/repo"
  CASE_HOME="${CASE_DIR}/home"
  CASE_TMP="${CASE_DIR}/tmp"
  CASE_RELEASES="${CASE_DIR}/releases"
  CASE_LIVE="${CASE_DIR}/live"
  CASE_AUDIT="${CASE_DIR}/audit"
  CASE_DURABLE="${CASE_DIR}/durable-evidence"
  CASE_LOCK="${CASE_DIR}/deploy.lock"
  CASE_CALL_LOG="${CASE_DIR}/calls.log"
  PREVIOUS_TARGET="${CASE_RELEASES}/previous"
  CANDIDATE_DIST="${CASE_DIR}/candidate-dist"
  CANDIDATE_DIR="${CASE_DIR}/candidate"
  RUN_OUTPUT="${CASE_DIR}/deploy.out"
  RUN_STATUS=255

  mkdir -p "${CASE_DIR}" "${CASE_HOME}" "${CASE_TMP}" "${CASE_RELEASES}" \
    "${PREVIOUS_TARGET}" "${CANDIDATE_DIST}/assets"
  cp -a "${BASE_ORIGIN}" "${CASE_ORIGIN}"
  git clone -q --branch dev "${CASE_ORIGIN}" "${CASE_REPO}"
  git -C "${CASE_REPO}" config user.name "deploy-contract-test"
  git -C "${CASE_REPO}" config user.email "deploy-contract-test@example.invalid"

  printf '<!doctype html><html><body>previous</body></html>\n' > "${PREVIOUS_TARGET}/index.html"
  if [[ "${previous_digest}" == "auto" ]]; then
    previous_digest="$(env -i PATH="${SYSTEM_PATH}" HOME="${CASE_HOME}" \
      "${REAL_NODE}" "${CASE_REPO}/scripts/release-candidate.mjs" digest \
        --dist-dir "${PREVIOUS_TARGET}")"
  fi
  make_previous_manifest "${PREVIOUS_TARGET}/deployment.json" "${previous_commit}" "${previous_digest}"
  ln -s "${PREVIOUS_TARGET}" "${CASE_LIVE}"

  printf '<!doctype html><html><body>candidate</body></html>\n' > "${CANDIDATE_DIST}/index.html"
  printf 'globalThis.__candidate = true;\n' > "${CANDIDATE_DIST}/assets/app-abcdef12.js"
  CANDIDATE_DIGEST="$(env -i PATH="${SYSTEM_PATH}" HOME="${CASE_HOME}" \
    "${REAL_NODE}" "${CASE_REPO}/scripts/release-candidate.mjs" prepare \
      --dist-dir "${CANDIDATE_DIST}" \
      --output-dir "${CANDIDATE_DIR}" \
      --frontend-sha "${CANDIDATE_SHA}" \
      --bff-sha "${BFF_SHA}" \
      --gate-run-id "${GATE_RUN_ID}" \
      --gate-run-url "https://github.com/ajoe734/execute-plans/actions/runs/${GATE_RUN_ID}" \
      --bff-base-url "https://bff.test")"
  [[ "${CANDIDATE_DIGEST}" =~ ^[0-9a-f]{64}$ ]] || die "fixture candidate digest is invalid"
  : > "${CASE_CALL_LOG}"
}

select_interrupted_candidate() {
  local interrupted_sha="${1:-${CANDIDATE_SHA}}"
  local previous_digest
  INTERRUPTED_TARGET="${CASE_RELEASES}/interrupted-candidate"
  previous_digest="$(json_field "${PREVIOUS_TARGET}/deployment.json" artifactDigestSha256)"
  mkdir -p "${INTERRUPTED_TARGET}"
  cp -a "${CANDIDATE_DIR}/dist/." "${INTERRUPTED_TARGET}/"
  "${REAL_NODE}" -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    payload.deploymentState = "candidate";
    payload.releaseName = "interrupted-candidate";
    payload.previousReleaseName = "previous";
    payload.previousCommit = process.argv[2];
    payload.previousArtifactDigest = process.argv[3];
    payload.commit = process.argv[4];
    payload.githubArtifactDigest = `sha256:${process.argv[5]}`;
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  ' "${INTERRUPTED_TARGET}/deployment.json" "${PREVIOUS_SHA}" "${previous_digest}" "${interrupted_sha}" "${CANDIDATE_DIGEST}"
  ln -sfn "${INTERRUPTED_TARGET}" "${CASE_LIVE}.interrupted"
  mv -Tf "${CASE_LIVE}.interrupted" "${CASE_LIVE}"
}

run_deploy() {
  set +e
  (
    cd "${CASE_REPO}"
    env -i \
      PATH="${MOCK_BIN}:${SYSTEM_PATH}" \
      HOME="${CASE_HOME}" \
      LANG=C \
      TMPDIR="${CASE_TMP}" \
      MOCK_ALLOWED_ROOT="${CASE_DIR}" \
      MOCK_BFF_SHA="${BFF_SHA}" \
      MOCK_BFF_SHA_SEQUENCE="" \
      MOCK_BFF_COMMIT_SEQUENCE="" \
      MOCK_BFF_KNOWN_SEQUENCE="" \
      MOCK_EXTERNAL_SWITCH_TARGET="" \
      MOCK_CALL_LOG="${CASE_CALL_LOG}" \
      MOCK_FAIL_PROBE_PHASES="" \
      MOCK_FAIL_DURABLE_RSYNC_ONCE="false" \
      MOCK_BAD_GITHUB_DIGEST="false" \
      MOCK_ADVANCE_DEV_AFTER_PROBE="false" \
      MOCK_ADVANCED_DEV_SHA="" \
      MOCK_ORIGIN_DIR="${CASE_ORIGIN}" \
      PANTHEON_DEV_FE_HOST="https://fe.test" \
      PANTHEON_BFF_BASE_URL="https://bff.test" \
      PANTHEON_OLD_BFF_URL="https://old-bff.test" \
      PANTHEON_DEV_FE_ROOT="${CASE_LIVE}" \
      PANTHEON_DEV_FE_RELEASES_DIR="${CASE_RELEASES}" \
      PANTHEON_DEV_FE_ROOT_PREFIX="${CASE_DIR}" \
      PANTHEON_DEV_FE_RELEASES_PREFIX="${CASE_RELEASES}" \
      PANTHEON_AUDIT_OUT_DIR="${CASE_AUDIT}" \
      PANTHEON_DEPLOY_DURABLE_EVIDENCE_ROOT="${CASE_DURABLE}" \
      PANTHEON_DEPLOY_DURABLE_EVIDENCE_PREFIX="${CASE_DIR}" \
      PANTHEON_DEPLOY_CANDIDATE_DIR="${CANDIDATE_DIR}" \
      PANTHEON_DEPLOY_REF="${CANDIDATE_SHA}" \
      PANTHEON_DEPLOY_BRANCH="dev" \
      PANTHEON_DEPLOY_GATE_RUN_ID="${GATE_RUN_ID}" \
      PANTHEON_DEPLOY_GITHUB_ARTIFACT_DIGEST="sha256:${CANDIDATE_DIGEST}" \
      PANTHEON_DEPLOY_EXPECTED_DEV_SHA="${CANDIDATE_SHA}" \
      PANTHEON_DEPLOY_EMERGENCY_OVERRIDE="false" \
      PANTHEON_DEPLOY_ROLLBACK_DRILL="false" \
      PANTHEON_DEPLOY_OVERRIDE_REASON="" \
      PANTHEON_DEPLOY_OVERRIDE_ACTOR="" \
      PANTHEON_DEPLOY_REAL_WRITES="false" \
      PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES="false" \
      PANTHEON_DEPLOY_SKIP_PROBE="false" \
      PANTHEON_DEPLOY_ALLOW_BOOTSTRAP="false" \
      PANTHEON_DEPLOY_LOCK_FILE="${CASE_LOCK}" \
      PANTHEON_DEPLOY_LOCK_PREFIX="${CASE_DIR}" \
      PANTHEON_DEPLOY_RELEASE_INSTANCE="${CASE_NAME}" \
      PANTHEON_DEV_FE_KEEP_RELEASES="8" \
      VITE_BFF_DEV_BEARER_TOKEN="" \
      GITHUB_RUN_ID="9001" \
      GITHUB_RUN_ATTEMPT="1" \
      "$@" \
      bash scripts/deploy-dev-vm.sh
  ) > "${RUN_OUTPUT}" 2>&1
  RUN_STATUS=$?
  set -e
}

assert_previous_is_live() {
  local observed
  observed="$(readlink -f "${CASE_LIVE}" 2>/dev/null || true)"
  [[ "${observed}" == "${PREVIOUS_TARGET}" ]] || \
    show_deploy_failure "expected exact previous target ${PREVIOUS_TARGET}, observed ${observed:-missing}"
}

assert_candidate_is_live() {
  local observed commit state
  observed="$(readlink -f "${CASE_LIVE}" 2>/dev/null || true)"
  [[ -n "${observed}" && "${observed}" != "${PREVIOUS_TARGET}" ]] || \
    show_deploy_failure "candidate was not selected"
  [[ "${observed}" == "${CASE_RELEASES}"/* ]] || die "live target escaped release store"
  commit="$(json_field "${observed}/deployment.json" commit)"
  state="$(json_field "${observed}/deployment.json" deploymentState)"
  [[ "${commit}" == "${CANDIDATE_SHA}" ]] || die "live candidate commit mismatch"
  [[ "${state}" == "accepted" ]] || die "live candidate was not marked accepted"
}

assert_probe_called() {
  local phase="$1"
  grep -Fxq "probe:${phase}" "${CASE_CALL_LOG}" || \
    show_deploy_failure "expected probe phase ${phase}"
}

assert_probe_not_called() {
  local phase="$1"
  if grep -Fxq "probe:${phase}" "${CASE_CALL_LOG}"; then
    show_deploy_failure "unexpected probe phase ${phase}"
  fi
}

assert_summary_outcome() {
  local expected="$1"
  local observed
  observed="$(json_field "${CASE_AUDIT}/evidence.json" outcome)"
  [[ "${observed}" == "${expected}" ]] || \
    show_deploy_failure "expected evidence outcome ${expected}, observed ${observed}"
}

verify_evidence_pair() {
  local log="${CASE_AUDIT}/evidence.jsonl"
  local summary="${CASE_AUDIT}/evidence.json"
  local durable="${CASE_DURABLE}/run-9001-attempt-1-${CASE_NAME}"
  local head
  [[ -s "${log}" && -s "${summary}" ]] || die "evidence pair is missing"
  head="$("${REAL_NODE}" "${CASE_REPO}/scripts/release-evidence.mjs" verify --log "${log}")"
  "${REAL_NODE}" --input-type=module - "${log}" "${summary}" "${head}" <<'NODE'
import crypto from "node:crypto";
import fs from "node:fs";
const [logPath, summaryPath, verifiedHead] = process.argv.slice(2);
const logBytes = fs.readFileSync(logPath);
const lines = logBytes.toString("utf8").trim().split(/\r?\n/u).filter(Boolean);
const events = lines.map((line) => JSON.parse(line));
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const logSha = crypto.createHash("sha256").update(logBytes).digest("hex");
if (summary.logSha256 !== logSha) throw new Error("summary log SHA mismatch");
if (summary.headHash !== verifiedHead || summary.headHash !== events.at(-1)?.hash) {
  throw new Error("summary head hash mismatch");
}
if (summary.eventCount !== events.length || summary.events.length !== events.length) {
  throw new Error("summary event count mismatch");
}
NODE
  [[ -s "${durable}/evidence.jsonl" && -s "${durable}/evidence.json" ]] || \
    die "durable evidence pair is missing"
  cmp -s "${log}" "${durable}/evidence.jsonl" || die "durable evidence log differs"
  cmp -s "${summary}" "${durable}/evidence.json" || die "durable evidence summary differs"
  "${REAL_NODE}" "${CASE_REPO}/scripts/release-evidence.mjs" verify \
    --log "${durable}/evidence.jsonl" \
    --summary "${durable}/evidence.json" \
    --root "${durable}" >/dev/null
}

test_valid_candidate_success() {
  setup_case valid-success
  run_deploy
  [[ "${RUN_STATUS}" -eq 0 ]] || show_deploy_failure "valid candidate should succeed"
  assert_candidate_is_live
  assert_probe_called candidate_pre_switch
  assert_probe_called post_switch
  assert_probe_not_called rollback
  grep -Fxq 'atomic-cas:exchange' "${CASE_CALL_LOG}" || \
    show_deploy_failure "valid switch did not use atomic symlink exchange CAS"
  grep -Fxq 'atomic-manifest:publish' "${CASE_CALL_LOG}" || \
    show_deploy_failure "valid acceptance did not atomically publish its manifest"
  assert_summary_outcome accepted
  verify_evidence_pair

  setup_case valid-legacy-without-manifest-digest
  "${REAL_NODE}" -e '
    const fs=require("node:fs");const file=process.argv[1];
    const payload=JSON.parse(fs.readFileSync(file,"utf8"));
    delete payload.artifactDigest;
    delete payload.artifactDigestSha256;
    fs.writeFileSync(file,`${JSON.stringify(payload,null,2)}\n`);
  ' "${PREVIOUS_TARGET}/deployment.json"
  run_deploy
  [[ "${RUN_STATUS}" -eq 0 ]] || \
    show_deploy_failure "explicit legacy predecessor compatibility should succeed"
  assert_candidate_is_live
  assert_probe_called previous_target_pre_switch
  assert_probe_called candidate_pre_switch
  assert_probe_called post_switch
  assert_summary_outcome accepted
  verify_evidence_pair

  setup_case valid-transitional-legacy-bff-fields
  "${REAL_NODE}" -e '
    const fs=require("node:fs");const file=process.argv[1];
    const payload=JSON.parse(fs.readFileSync(file,"utf8"));
    delete payload.artifactDigest;
    delete payload.artifactDigestSha256;
    payload.deployedAt="20260715T072629Z";
    payload.sourceRef=payload.commit;
    payload.sourceBranch="dev";
    payload.feHost="https://fe.test";
    payload.bffHost="https://bff.test";
    payload.bffCommitSource="bff_version";
    fs.writeFileSync(file,`${JSON.stringify(payload,null,2)}\n`);
  ' "${PREVIOUS_TARGET}/deployment.json"
  run_deploy
  [[ "${RUN_STATUS}" -eq 0 ]] || \
    show_deploy_failure "transitional legacy predecessor BFF fields should not require full modern identity"
  assert_candidate_is_live
  assert_probe_called previous_target_pre_switch
  assert_probe_called candidate_pre_switch
  assert_probe_called post_switch
  assert_summary_outcome accepted
  verify_evidence_pair

  setup_case valid-modern-previous
  upgrade_previous_manifest_to_modern "${PREVIOUS_TARGET}/deployment.json"
  run_deploy
  [[ "${RUN_STATUS}" -eq 0 ]] || \
    show_deploy_failure "candidate with a fully qualified modern predecessor should succeed"
  assert_candidate_is_live
  assert_probe_called previous_target_pre_switch
  assert_probe_called candidate_pre_switch
  assert_probe_called post_switch
  assert_summary_outcome accepted
  verify_evidence_pair
}

test_tampered_candidate_and_digest_rejected() {
  setup_case tampered-asset
  printf 'tampered\n' >> "${CANDIDATE_DIR}/dist/index.html"
  run_deploy
  [[ "${RUN_STATUS}" -ne 0 ]] || die "tampered candidate unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_not_called candidate_pre_switch

  setup_case tampered-digest
  "${REAL_NODE}" -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    value.artifactDigestSha256 = "0".repeat(64);
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  ' "${CANDIDATE_DIR}/candidate.json"
  run_deploy
  [[ "${RUN_STATUS}" -ne 0 ]] || die "tampered digest unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_not_called candidate_pre_switch
}

test_pre_probe_failure_preserves_previous() {
  local corruption
  setup_case pre-probe-failure
  run_deploy MOCK_FAIL_PROBE_PHASES=candidate_pre_switch
  [[ "${RUN_STATUS}" -ne 0 ]] || die "failed candidate pre-probe unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_called candidate_pre_switch
  assert_probe_not_called post_switch
  assert_probe_not_called rollback
  assert_summary_outcome rejected_before_switch
  verify_evidence_pair

  for corruption in gate_url github_digest frontend_sha frontend_repository bff_sha; do
    setup_case "modern-previous-${corruption}"
    upgrade_previous_manifest_to_modern "${PREVIOUS_TARGET}/deployment.json"
    corrupt_modern_previous_manifest \
      "${PREVIOUS_TARGET}/deployment.json" \
      "${corruption}"
    run_deploy
    [[ "${RUN_STATUS}" -ne 0 ]] || \
      die "modern predecessor corruption ${corruption} unexpectedly switched"
    assert_previous_is_live
    assert_probe_not_called previous_target_pre_switch
    assert_probe_not_called candidate_pre_switch
    assert_probe_not_called post_switch
    assert_summary_outcome rejected_before_switch
    verify_evidence_pair
  done
}

test_bff_identity_is_bound_before_and_after_switch() {
  local different_bff_sha="cccccccccccccccccccccccccccccccccccccccc"
  local historical_bff_sha="dddddddddddddddddddddddddddddddddddddddd"

  setup_case bff-unknown-before-candidate
  run_deploy MOCK_BFF_KNOWN_SEQUENCE=false
  [[ "${RUN_STATUS}" -ne 0 ]] || die "unknown BFF identity unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_not_called candidate_pre_switch
  assert_summary_outcome rejected_before_switch

  setup_case bff-alias-mismatch
  run_deploy MOCK_BFF_COMMIT_SEQUENCE="${different_bff_sha}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "inconsistent BFF identity aliases unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_not_called candidate_pre_switch

  setup_case bff-drift-before-switch
  run_deploy MOCK_BFF_SHA_SEQUENCE="${BFF_SHA},${different_bff_sha}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "pre-switch BFF drift unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_called candidate_pre_switch
  assert_probe_not_called post_switch
  assert_probe_not_called rollback
  assert_summary_outcome rejected_before_switch

  setup_case bff-drift-after-switch
  run_deploy MOCK_BFF_SHA_SEQUENCE="${BFF_SHA},${BFF_SHA},${different_bff_sha}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "post-switch BFF drift unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_called candidate_pre_switch
  assert_probe_not_called post_switch
  assert_probe_not_called rollback
  assert_summary_outcome rollback_probe_failed
  verify_evidence_pair

  setup_case bff-drift-during-post-probe
  run_deploy MOCK_BFF_SHA_SEQUENCE="${BFF_SHA},${BFF_SHA},${BFF_SHA},${different_bff_sha},${BFF_SHA}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "BFF drift during the post-switch probe unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_called post_switch
  assert_probe_called rollback
  local exchange_count
  exchange_count="$(grep -Fxc 'atomic-cas:exchange' "${CASE_CALL_LOG}" || true)"
  [[ "${exchange_count}" -ge 2 ]] || \
    show_deploy_failure "rollback did not use atomic symlink exchange CAS"
  assert_summary_outcome rolled_back
  verify_evidence_pair

  setup_case previous-manifest-has-historical-bff
  make_previous_manifest \
    "${PREVIOUS_TARGET}/deployment.json" \
    "${PREVIOUS_SHA}" \
    "$(json_field "${PREVIOUS_TARGET}/deployment.json" artifactDigestSha256)" \
    "${historical_bff_sha}"
  run_deploy
  [[ "${RUN_STATUS}" -eq 0 ]] || \
    show_deploy_failure "historical predecessor BFF identity blocked a compatible release"
  assert_candidate_is_live
  assert_probe_called previous_target_pre_switch
  assert_probe_called candidate_pre_switch
  assert_probe_called post_switch

  setup_case previous-manifest-bff-host-mismatch
  "${REAL_NODE}" -e '
    const fs=require("node:fs");const file=process.argv[1];
    const payload=JSON.parse(fs.readFileSync(file,"utf8"));
    payload.bffHost="https://wrong-bff.test";
    fs.writeFileSync(file,`${JSON.stringify(payload,null,2)}\n`);
  ' "${PREVIOUS_TARGET}/deployment.json"
  run_deploy
  [[ "${RUN_STATUS}" -ne 0 ]] || \
    die "legacy predecessor with mismatched BFF host unexpectedly switched"
  assert_previous_is_live
  assert_probe_not_called candidate_pre_switch
  grep -Fq "deployment manifest BFF identity mismatch" "${RUN_OUTPUT}" || \
    show_deploy_failure "missing transitional BFF host mismatch rejection"
}

test_post_probe_failure_rolls_back_and_reprobes() {
  setup_case post-probe-rollback
  run_deploy MOCK_FAIL_PROBE_PHASES=post_switch
  [[ "${RUN_STATUS}" -ne 0 ]] || die "failed post-switch probe unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_called candidate_pre_switch
  assert_probe_called post_switch
  assert_probe_called rollback
  assert_summary_outcome rolled_back
  verify_evidence_pair

  setup_case historical-bff-post-probe-rollback
  make_previous_manifest \
    "${PREVIOUS_TARGET}/deployment.json" \
    "${PREVIOUS_SHA}" \
    "$(json_field "${PREVIOUS_TARGET}/deployment.json" artifactDigestSha256)" \
    "dddddddddddddddddddddddddddddddddddddddd"
  run_deploy MOCK_FAIL_PROBE_PHASES=post_switch
  [[ "${RUN_STATUS}" -ne 0 ]] || die "historical-BFF rollback failure unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_called previous_target_pre_switch
  assert_probe_called rollback
  assert_summary_outcome rolled_back
  verify_evidence_pair
}

test_github_archive_digest_is_bound_in_public_manifest() {
  setup_case github-digest-readback
  run_deploy MOCK_BAD_GITHUB_DIGEST=true
  [[ "${RUN_STATUS}" -ne 0 ]] || die "wrong public GitHub artifact digest unexpectedly passed"
  assert_previous_is_live
  assert_probe_called candidate_pre_switch
  assert_probe_called rollback
  assert_summary_outcome rolled_back
  grep -Fq "GitHub artifact digest mismatch" "${RUN_OUTPUT}" || \
    show_deploy_failure "missing public GitHub artifact digest rejection"
  verify_evidence_pair
}

test_external_restore_of_previous_is_reprobed() {
  setup_case external-restored-previous
  run_deploy MOCK_EXTERNAL_SWITCH_TARGET="${PREVIOUS_TARGET}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "external predecessor restore unexpectedly accepted candidate"
  assert_previous_is_live
  assert_probe_called candidate_pre_switch
  assert_probe_not_called post_switch
  assert_probe_called rollback
  assert_summary_outcome rolled_back
  grep -Fq '"type":"rollback.external_restore"' "${CASE_AUDIT}/evidence.jsonl" || \
    show_deploy_failure "external predecessor restore was not audited"
  verify_evidence_pair
}

test_durable_evidence_failure_rolls_back_and_refinalizes() {
  setup_case durable-evidence-retry
  run_deploy MOCK_FAIL_DURABLE_RSYNC_ONCE=true
  [[ "${RUN_STATUS}" -ne 0 ]] || die "durable evidence failure unexpectedly accepted candidate"
  assert_previous_is_live
  assert_probe_called post_switch
  assert_probe_called rollback
  assert_summary_outcome rolled_back
  grep -Fq '"type":"release.completed"' "${CASE_AUDIT}/evidence.jsonl" || \
    show_deploy_failure "acceptance terminal was not reached before durable failure"
  grep -Fq '"type":"release.failed"' "${CASE_AUDIT}/evidence.jsonl" || \
    show_deploy_failure "durable failure was not re-finalized as a rollback"
  verify_evidence_pair
}

test_bootstrap_install_and_failed_release_removal_use_cas() {
  setup_case bootstrap-success
  rm "${CASE_LIVE}"
  run_deploy PANTHEON_DEPLOY_ALLOW_BOOTSTRAP=true
  [[ "${RUN_STATUS}" -eq 0 ]] || show_deploy_failure "atomic bootstrap should succeed when live is absent"
  assert_candidate_is_live
  grep -Fxq 'atomic-cas:install-if-absent' "${CASE_CALL_LOG}" || \
    show_deploy_failure "bootstrap did not use atomic NOREPLACE install"

  setup_case bootstrap-post-failure
  rm "${CASE_LIVE}"
  run_deploy PANTHEON_DEPLOY_ALLOW_BOOTSTRAP=true MOCK_FAIL_PROBE_PHASES=post_switch
  [[ "${RUN_STATUS}" -ne 0 ]] || die "failed bootstrap post-probe unexpectedly succeeded"
  [[ ! -e "${CASE_LIVE}" && ! -L "${CASE_LIVE}" ]] || \
    show_deploy_failure "failed bootstrap candidate remained live"
  grep -Fxq 'atomic-cas:install-if-absent' "${CASE_CALL_LOG}" || \
    show_deploy_failure "failed bootstrap did not use atomic NOREPLACE install"
  grep -Fxq 'atomic-cas:remove-if-target' "${CASE_CALL_LOG}" || \
    show_deploy_failure "failed bootstrap did not use atomic CAS removal"
  assert_probe_called post_switch
  assert_probe_not_called rollback
  assert_summary_outcome rollback_probe_failed
  verify_evidence_pair
}

test_manual_rollback_drill_restores_and_reprobes() {
  local drill_reason="approved target dev rollback readback drill"

  setup_case manual-rollback-drill
  run_deploy \
    GITHUB_EVENT_NAME=workflow_dispatch \
    PANTHEON_DEPLOY_ROLLBACK_DRILL=true \
    PANTHEON_DEPLOY_OVERRIDE_ACTOR=test-operator \
    PANTHEON_DEPLOY_OVERRIDE_REASON="${drill_reason}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "controlled rollback drill unexpectedly accepted the candidate"
  assert_previous_is_live
  assert_probe_called candidate_pre_switch
  assert_probe_called post_switch
  assert_probe_called rollback
  assert_summary_outcome rolled_back
  grep -Fq '"type":"rollback.drill"' "${CASE_AUDIT}/evidence.jsonl" || \
    show_deploy_failure "rollback drill evidence event missing"
  verify_evidence_pair

  setup_case nonmanual-rollback-drill
  run_deploy \
    GITHUB_EVENT_NAME=push \
    PANTHEON_DEPLOY_ROLLBACK_DRILL=true \
    PANTHEON_DEPLOY_OVERRIDE_ACTOR=test-operator \
    PANTHEON_DEPLOY_OVERRIDE_REASON="${drill_reason}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "non-manual rollback drill unexpectedly ran"
  assert_previous_is_live
  assert_probe_not_called candidate_pre_switch
  grep -Fq "restricted to an explicit manual workflow dispatch" "${RUN_OUTPUT}" || \
    show_deploy_failure "missing manual-only rollback drill rejection"
}

test_rollback_reprobe_failure_is_explicit() {
  setup_case rollback-reprobe-failure
  run_deploy MOCK_FAIL_PROBE_PHASES=post_switch,rollback
  [[ "${RUN_STATUS}" -ne 0 ]] || die "rollback re-probe failure unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_called rollback
  assert_summary_outcome rollback_probe_failed
  verify_evidence_pair
}

test_external_live_switch_is_never_overwritten() {
  setup_case external-live-switch
  local external_target="${CASE_RELEASES}/external"
  local external_digest
  mkdir -p "${external_target}"
  printf '<!doctype html><html><body>external</body></html>\n' > "${external_target}/index.html"
  external_digest="$(env -i PATH="${SYSTEM_PATH}" HOME="${CASE_HOME}" \
    "${REAL_NODE}" "${CASE_REPO}/scripts/release-candidate.mjs" digest --dist-dir "${external_target}")"
  make_previous_manifest "${external_target}/deployment.json" "${PREVIOUS_SHA}" "${external_digest}"

  run_deploy MOCK_EXTERNAL_SWITCH_TARGET="${external_target}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "externally changed live target unexpectedly succeeded"
  [[ "$(readlink -f "${CASE_LIVE}")" == "${external_target}" ]] || \
    show_deploy_failure "deploy overwrote an externally selected live release"
  assert_probe_called candidate_pre_switch
  assert_probe_not_called post_switch
  assert_probe_not_called rollback
  assert_summary_outcome rollback_failed
  verify_evidence_pair
}

test_out_of_order_and_expected_dev_mismatch_rejected() {
  local advanced_dev_sha nonancestor_sha
  setup_case remote-dev-mismatch
  git --git-dir="${CASE_ORIGIN}" update-ref refs/heads/dev "${PREVIOUS_SHA}"
  run_deploy
  [[ "${RUN_STATUS}" -ne 0 ]] || die "out-of-order remote dev candidate unexpectedly succeeded"
  assert_previous_is_live
  grep -Fq "stale deploy controller" "${RUN_OUTPUT}" || show_deploy_failure "missing stale-controller rejection"

  setup_case expected-dev-mismatch
  run_deploy PANTHEON_DEPLOY_EXPECTED_DEV_SHA="${PREVIOUS_SHA}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "stale expected dev identity unexpectedly succeeded"
  assert_previous_is_live
  grep -Fq "Trusted controller checkout" "${RUN_OUTPUT}" || show_deploy_failure "missing expected-dev rejection"

  setup_case dev-advances-after-candidate-probe
  advanced_dev_sha="$(git -C "${CASE_REPO}" commit-tree "${CANDIDATE_SHA}^{tree}" -p "${CANDIDATE_SHA}" -m "advanced dev after candidate probe")"
  git -C "${CASE_REPO}" push -q origin \
    "${advanced_dev_sha}:refs/heads/dev-advance-candidate" >/dev/null
  run_deploy \
    MOCK_ADVANCE_DEV_AFTER_PROBE=true \
    MOCK_ADVANCED_DEV_SHA="${advanced_dev_sha}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "candidate switched after dev advanced"
  assert_previous_is_live
  assert_probe_called candidate_pre_switch
  assert_probe_not_called post_switch
  grep -Fq "Dev advanced after candidate probe" "${RUN_OUTPUT}" || \
    show_deploy_failure "missing second out-of-order rejection"

  setup_case served-nonancestor
  nonancestor_sha="$(git -C "${CASE_REPO}" commit-tree "${PREVIOUS_SHA}^{tree}" -m "unrelated served release")"
  make_previous_manifest \
    "${PREVIOUS_TARGET}/deployment.json" \
    "${nonancestor_sha}" \
    "$(json_field "${PREVIOUS_TARGET}/deployment.json" artifactDigestSha256)"
  run_deploy
  [[ "${RUN_STATUS}" -ne 0 ]] || die "served non-ancestor unexpectedly switched"
  assert_previous_is_live
  assert_probe_not_called candidate_pre_switch
  grep -Fq "served SHA is not an ancestor" "${RUN_OUTPUT}" || \
    show_deploy_failure "missing served-ancestry rejection"
}

test_concurrent_flock_rejected() {
  setup_case concurrent-lock
  local holder_fd
  exec {holder_fd}>"${CASE_LOCK}"
  flock -n "${holder_fd}" || die "test could not acquire deployment lock"
  run_deploy
  flock -u "${holder_fd}"
  eval "exec ${holder_fd}>&-"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "concurrent deployment unexpectedly succeeded"
  assert_previous_is_live
  grep -Fq "Another dev frontend deployment holds" "${RUN_OUTPUT}" || show_deploy_failure "missing flock rejection"
}

test_same_sha_different_digest_rejected() {
  local different_digest
  setup_case same-sha-different-digest "${CANDIDATE_SHA}" auto
  different_digest="$(json_field "${PREVIOUS_TARGET}/deployment.json" artifactDigestSha256)"
  [[ "${different_digest}" != "${CANDIDATE_DIGEST}" ]] || die "test digest unexpectedly equals candidate digest"
  run_deploy
  [[ "${RUN_STATUS}" -ne 0 ]] || die "same-SHA replacement unexpectedly succeeded"
  assert_previous_is_live
  grep -Fq "Same-SHA artifact replacement rejected" "${RUN_OUTPUT}" || show_deploy_failure "missing reproducibility rejection"
}

test_exact_candidate_noop_revalidates_live_release() {
  setup_case exact-candidate-noop
  rm -rf "${PREVIOUS_TARGET:?}"/*
  cp -a "${CANDIDATE_DIR}/dist/." "${PREVIOUS_TARGET}/"
  "${REAL_NODE}" -e '
    const fs=require("node:fs");const file=process.argv[1];
    const value=JSON.parse(fs.readFileSync(file,"utf8"));
    value.integrationGateRunId="8999";
    value.gate.runId="8999";
    value.gate.runUrl="https://github.com/ajoe734/execute-plans/actions/runs/8999";
    value.githubArtifactDigest=`sha256:${"e".repeat(64)}`;
    value.deploymentState="accepted";
    fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`);
  ' "${PREVIOUS_TARGET}/deployment.json"

  run_deploy
  [[ "${RUN_STATUS}" -eq 0 ]] || show_deploy_failure "exact live candidate no-op should pass revalidation"
  assert_previous_is_live
  assert_probe_called noop
  assert_probe_not_called candidate_pre_switch
  assert_probe_not_called post_switch
  grep -Fxq 'npm' "${CASE_CALL_LOG}" || show_deploy_failure "no-op skipped probe dependency installation"
  grep -Fxq 'npx' "${CASE_CALL_LOG}" || show_deploy_failure "no-op skipped browser dependency installation"
  grep -Fxq 'curl:deployment' "${CASE_CALL_LOG}" || show_deploy_failure "no-op skipped public manifest verification"
  local bff_checks
  bff_checks="$(grep -Fxc 'curl:bff-version' "${CASE_CALL_LOG}" || true)"
  [[ "${bff_checks}" -ge 2 ]] || show_deploy_failure "no-op skipped BFF identity revalidation"
  assert_summary_outcome accepted
  grep -Fq "\"incomingEquivalentGateRunId\":\"${GATE_RUN_ID}\"" \
    "${CASE_AUDIT}/evidence.jsonl" || \
    show_deploy_failure "no-op evidence omitted the incoming equivalent gate"
  verify_evidence_pair
}

test_interrupted_candidate_recovers_or_rolls_back() {
  setup_case interrupted-roll-forward
  select_interrupted_candidate
  run_deploy
  [[ "${RUN_STATUS}" -eq 0 ]] || show_deploy_failure "interrupted candidate did not roll forward"
  [[ "$(readlink -f "${CASE_LIVE}")" == "${INTERRUPTED_TARGET}" ]] || die "recovery changed the valid candidate target"
  [[ "$(json_field "${INTERRUPTED_TARGET}/deployment.json" deploymentState)" == "accepted" ]] || die "recovery did not repair deploymentState"
  grep -Fxq 'atomic-manifest:publish' "${CASE_CALL_LOG}" || \
    show_deploy_failure "interrupted roll-forward did not atomically publish its manifest"
  assert_probe_called noop
  assert_summary_outcome accepted
  verify_evidence_pair

  setup_case interrupted-rollback
  select_interrupted_candidate
  run_deploy MOCK_FAIL_PROBE_PHASES=noop
  [[ "${RUN_STATUS}" -ne 0 ]] || die "failed interrupted candidate probe unexpectedly succeeded"
  assert_previous_is_live
  assert_probe_called noop
  assert_probe_called recovery_rollback
  assert_summary_outcome recovery_rolled_back
  verify_evidence_pair

  setup_case interrupted-before-different-candidate
  select_interrupted_candidate "$(repeat_character 4 40)"
  run_deploy
  [[ "${RUN_STATUS}" -ne 0 ]] || die "different candidate deployed over an interrupted candidate"
  assert_previous_is_live
  assert_probe_not_called candidate_pre_switch
  assert_probe_called recovery_rollback
  "${REAL_NODE}" --input-type=module - "${CASE_CALL_LOG}" <<'NODE'
import fs from "node:fs";
const calls = fs.readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/u);
const probe = calls.indexOf("probe:recovery_rollback");
if (
  probe < 0 ||
  calls.indexOf("npm") < 0 ||
  calls.indexOf("npx") < 0 ||
  calls.indexOf("npm") >= probe ||
  calls.indexOf("npx") >= probe
) {
  throw new Error("recovery dependencies were not installed before re-probe");
}
NODE
  assert_summary_outcome recovery_rolled_back
  grep -Fq "must be restored before a different candidate" "${RUN_OUTPUT}" || \
    show_deploy_failure "missing interrupted predecessor recovery message"
  verify_evidence_pair
}

test_emergency_override_guards() {
  local override_reason="approved emergency regression override"

  setup_case emergency-tampered
  printf 'tampered under emergency override\n' >> "${CANDIDATE_DIR}/dist/index.html"
  run_deploy \
    PANTHEON_DEPLOY_EMERGENCY_OVERRIDE=true \
    PANTHEON_DEPLOY_OVERRIDE_ACTOR=test-operator \
    PANTHEON_DEPLOY_OVERRIDE_REASON="${override_reason}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "emergency override bypassed candidate integrity"
  assert_previous_is_live
  assert_probe_not_called candidate_pre_switch

  setup_case emergency-valid
  run_deploy \
    PANTHEON_DEPLOY_EMERGENCY_OVERRIDE=true \
    PANTHEON_DEPLOY_OVERRIDE_ACTOR=test-operator \
    PANTHEON_DEPLOY_OVERRIDE_REASON="${override_reason}"
  [[ "${RUN_STATUS}" -eq 0 ]] || show_deploy_failure "valid emergency override should compose after all probes"
  assert_candidate_is_live
  assert_probe_called candidate_pre_switch
  assert_probe_called post_switch
  local bff_checks
  bff_checks="$(grep -Fxc 'curl:bff-version' "${CASE_CALL_LOG}" || true)"
  [[ "${bff_checks}" -ge 3 ]] || show_deploy_failure "emergency override skipped BFF identity probes"

  setup_case emergency-skip-probe
  run_deploy \
    PANTHEON_DEPLOY_EMERGENCY_OVERRIDE=true \
    PANTHEON_DEPLOY_OVERRIDE_ACTOR=test-operator \
    PANTHEON_DEPLOY_OVERRIDE_REASON="${override_reason}" \
    PANTHEON_DEPLOY_SKIP_PROBE=true
  [[ "${RUN_STATUS}" -ne 0 ]] || die "emergency override bypassed mandatory probes"
  assert_previous_is_live
}

test_write_token_and_skip_flags_fail_closed() {
  local marker
  marker="private-test-marker-$(repeat_character x 12)"

  setup_case real-writes-rejected
  run_deploy PANTHEON_DEPLOY_REAL_WRITES=true
  [[ "${RUN_STATUS}" -ne 0 ]] || die "real writes unexpectedly enabled"
  assert_previous_is_live

  setup_case stub-writes-rejected
  run_deploy PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES=true
  [[ "${RUN_STATUS}" -ne 0 ]] || die "dev-stub writes unexpectedly enabled"
  assert_previous_is_live

  setup_case skip-probe-rejected
  run_deploy PANTHEON_DEPLOY_SKIP_PROBE=true
  [[ "${RUN_STATUS}" -ne 0 ]] || die "probe skip unexpectedly enabled"
  assert_previous_is_live

  setup_case bearer-rejected
  run_deploy VITE_BFF_DEV_BEARER_TOKEN="${marker}"
  [[ "${RUN_STATUS}" -ne 0 ]] || die "browser bearer unexpectedly accepted"
  assert_previous_is_live
  if grep -Fq "${marker}" "${RUN_OUTPUT}"; then
    die "browser bearer value leaked to deploy output"
  fi
}

run_test() {
  local name="$1"
  shift
  if ("$@"); then
    PASSED=$((PASSED + 1))
    echo "ok - ${name}"
  else
    FAILED=$((FAILED + 1))
    echo "not ok - ${name}" >&2
  fi
}

run_test "valid candidate succeeds and evidence hashes verify" test_valid_candidate_success
run_test "candidate asset and digest tampering reject before switch" test_tampered_candidate_and_digest_rejected
run_test "candidate pre-probe failure preserves exact previous" test_pre_probe_failure_preserves_previous
run_test "BFF identity is exact and stable across the switch" test_bff_identity_is_bound_before_and_after_switch
run_test "post-switch failure rolls back and re-probes" test_post_probe_failure_rolls_back_and_reprobes
run_test "public manifest binds the GitHub archive digest" test_github_archive_digest_is_bound_in_public_manifest
run_test "external predecessor restore is fully re-probed" test_external_restore_of_previous_is_reprobed
run_test "durable evidence failure rolls back and re-finalizes" test_durable_evidence_failure_rolls_back_and_refinalizes
run_test "bootstrap installs only if absent and CAS-removes a failed candidate" test_bootstrap_install_and_failed_release_removal_use_cas
run_test "manual rollback drill restores and re-probes exact previous release" test_manual_rollback_drill_restores_and_reprobes
run_test "rollback re-probe failure stays nonzero with previous live" test_rollback_reprobe_failure_is_explicit
run_test "external live switch is preserved by rollback CAS" test_external_live_switch_is_never_overwritten
run_test "out-of-order and expected-dev mismatches reject" test_out_of_order_and_expected_dev_mismatch_rejected
run_test "concurrent flock rejects" test_concurrent_flock_rejected
run_test "same SHA with a different digest rejects" test_same_sha_different_digest_rejected
run_test "exact same SHA and digest revalidates the live release" test_exact_candidate_noop_revalidates_live_release
run_test "interrupted candidate rolls forward or restores its exact predecessor" test_interrupted_candidate_recovers_or_rolls_back
run_test "emergency override cannot skip integrity or auth probes" test_emergency_override_guards
run_test "write, bearer, and skip-probe inputs fail closed" test_write_token_and_skip_flags_fail_closed

echo "deploy contract harness: ${PASSED} passed, ${FAILED} failed"
if [[ "${FAILED}" -ne 0 ]]; then
  exit 1
fi
