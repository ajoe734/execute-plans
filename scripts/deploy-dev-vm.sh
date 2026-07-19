#!/usr/bin/env bash
# Deploy one immutable, successfully gated execute-plans candidate to Pantheon
# dev. Candidate verification and browser/auth probes happen before the atomic
# symlink switch. Any failure after the switch conditionally restores and
# re-probes the exact previous release.
if [[ "$-" == *x* ]]; then
  set +x
fi
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"
SYMLINK_CAS_HELPER="${ROOT_DIR}/scripts/atomic-symlink-cas.py"
ATOMIC_MANIFEST_HELPER="${ROOT_DIR}/scripts/atomic-release-manifest.py"

FE_HOST="${PANTHEON_DEV_FE_HOST:-https://pantheon-lupin-dev-fe.35.201.204.12.sslip.io}"
BFF_HOST="${PANTHEON_BFF_BASE_URL:-https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io}"
BFF_HOST="${BFF_HOST%/}"
OLD_BFF_HOST="${PANTHEON_OLD_BFF_URL:-https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io}"
DEPLOY_ROOT="${PANTHEON_DEV_FE_ROOT:-/var/www/pantheon-dev-fe}"
RELEASES_DIR="${PANTHEON_DEV_FE_RELEASES_DIR:-/var/www/pantheon-dev-fe-releases}"
STRICT_DIR_PREFIX="${PANTHEON_DEV_FE_ROOT_PREFIX:-/var/www/pantheon-dev-fe}"
STRICT_RELEASES_PREFIX="${PANTHEON_DEV_FE_RELEASES_PREFIX:-/var/www/pantheon-dev-fe-releases}"
AUDIT_DIR="${PANTHEON_AUDIT_OUT_DIR:-.lovable/audits/current-run}"
CANDIDATE_INPUT="${PANTHEON_DEPLOY_CANDIDATE_DIR:-}"
SOURCE_BRANCH="${PANTHEON_DEPLOY_BRANCH:-dev}"
GATE_RUN_ID="${PANTHEON_DEPLOY_GATE_RUN_ID:-}"
GITHUB_ARTIFACT_DIGEST="${PANTHEON_DEPLOY_GITHUB_ARTIFACT_DIGEST:-}"
EXPECTED_DEV_SHA="${PANTHEON_DEPLOY_EXPECTED_DEV_SHA:-}"
EMERGENCY_OVERRIDE="${PANTHEON_DEPLOY_EMERGENCY_OVERRIDE:-false}"
ROLLBACK_DRILL="${PANTHEON_DEPLOY_ROLLBACK_DRILL:-false}"
OVERRIDE_REASON="${PANTHEON_DEPLOY_OVERRIDE_REASON:-}"
OVERRIDE_ACTOR="${PANTHEON_DEPLOY_OVERRIDE_ACTOR:-}"
REAL_WRITES="${PANTHEON_DEPLOY_REAL_WRITES:-false}"
ALLOW_DEV_STUB_WRITES="${PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES:-false}"
DEPLOY_PROFILE="${PANTHEON_DEPLOY_PROFILE:-read-only}"
PROOF_WINDOW_ACK="${PANTHEON_DEPLOY_PROOF_WINDOW_ACK:-false}"
EXPECTED_PAIR_ID="${PANTHEON_DEPLOY_EXPECTED_PAIR_ID:-}"
SKIP_PROBE="${PANTHEON_DEPLOY_SKIP_PROBE:-false}"
ALLOW_BOOTSTRAP="${PANTHEON_DEPLOY_ALLOW_BOOTSTRAP:-false}"
KEEP_RELEASES="${PANTHEON_DEV_FE_KEEP_RELEASES:-8}"
LOCK_FILE="${PANTHEON_DEPLOY_LOCK_FILE:-/tmp/pantheon-dev-fe-deploy.lock}"
STRICT_LOCK_PREFIX="${PANTHEON_DEPLOY_LOCK_PREFIX:-/tmp}"
DURABLE_EVIDENCE_ROOT="${PANTHEON_DEPLOY_DURABLE_EVIDENCE_ROOT:-/var/lib/pantheon-dev-fe-deploy-evidence}"
STRICT_DURABLE_EVIDENCE_PREFIX="${PANTHEON_DEPLOY_DURABLE_EVIDENCE_PREFIX:-/var/lib/pantheon-dev-fe-deploy-evidence}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
CONTROLLER_SHA="$(git rev-parse HEAD)"
SHA="${PANTHEON_DEPLOY_CANDIDATE_SHA:-${GITHUB_SHA:-${CONTROLLER_SHA}}}"
SOURCE_REF="${PANTHEON_DEPLOY_REF:-${SHA}}"
SHORT_SHA="${SHA:0:12}"
RELEASE_INSTANCE="${PANTHEON_DEPLOY_RELEASE_INSTANCE:-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${BASHPID}}"
RELEASE_NAME="${TIMESTAMP}-${SHORT_SHA}-gate-${GATE_RUN_ID}-${RELEASE_INSTANCE}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
SAFE_RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}-read-only"
WRITE_RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}-write-proof"
OPERATOR_RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}-operator-live"
SAFE_FALLBACK_LOCATOR_DIR="${RELEASES_DIR}/.pantheon-safe-locators"
DURABLE_EVIDENCE_DIR="${DURABLE_EVIDENCE_ROOT}/run-${GITHUB_RUN_ID:-local}-attempt-${GITHUB_RUN_ATTEMPT:-1}-${RELEASE_INSTANCE}"
NEXT_LINK="${DEPLOY_ROOT}.next-${RELEASE_INSTANCE}"
ROLLBACK_LINK="${DEPLOY_ROOT}.rollback-${RELEASE_INSTANCE}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/execute-plans-dev-fe.XXXXXX")"
EVIDENCE_LOG="${AUDIT_DIR}/evidence.jsonl"
EVIDENCE_SUMMARY="${AUDIT_DIR}/evidence.json"

CANDIDATE_DIR=""
READ_ONLY_CANDIDATE_DIR=""
OPERATOR_LIVE_CANDIDATE_DIR=""
WRITE_PROOF_CANDIDATE_DIR=""
ARTIFACT_DIGEST=""
READ_ONLY_ARTIFACT_DIGEST=""
OPERATOR_LIVE_ARTIFACT_DIGEST=""
WRITE_PROOF_ARTIFACT_DIGEST=""
PAIR_ID=""
BFF_COMMIT=""
PREVIOUS_TARGET=""
LIVE_TARGET_AT_START=""
PREVIOUS_COMMIT=""
PREVIOUS_DIGEST=""
PREVIOUS_MANIFEST_DIGEST=""
PREVIOUS_GATE_RUN_ID=""
PREVIOUS_GITHUB_ARTIFACT_DIGEST=""
PREVIOUS_MANIFEST_BFF_COMMIT=""
PREVIOUS_DEPLOYMENT_STATE=""
PREVIOUS_PROFILE=""
PREVIOUS_PAIR_ID=""
PREVIOUS_READ_ONLY_ARTIFACT_DIGEST=""
PREVIOUS_OPERATOR_LIVE_ARTIFACT_DIGEST=""
PREVIOUS_WRITE_PROOF_ARTIFACT_DIGEST=""
PREVIOUS_RELEASE_NAME=""
RECOVERY_ATTEMPTED=false
RECOVERY_RELEASE_NAME=""
RECOVERY_TARGET=""
RECOVERY_COMMIT=""
RECOVERY_DIGEST=""
RECOVERY_MANIFEST_DIGEST=""
RECOVERY_GATE_RUN_ID=""
RECOVERY_GITHUB_ARTIFACT_DIGEST=""
RECOVERY_MANIFEST_BFF_COMMIT=""
LOCK_ACQUIRED=false
EVIDENCE_INITIALIZED=false
EVIDENCE_FINALIZED=false
SWITCH_ATTEMPTED=false
DEPLOY_ACCEPTED=false
ROLLBACK_RESTORED=false
ROLLBACK_REPROBED=false
NOOP_DEPLOY=false
NEXT_LINK_CREATED=false
ROLLBACK_LINK_CREATED=false
RELEASE_CREATED=false
DURABLE_EVIDENCE_PERSISTED=false
PROBE_DEPENDENCIES_READY=false
SAFE_RELEASE_CREATED=false
SAFE_RELEASE_QUALIFIED=false
SAFE_RESTORE_SELECTED=false
RESTORE_SWITCH_COMPLETED=false

bool_value() {
  local name="$1"
  local value="${!name}"
  if [[ "${value}" != "true" && "${value}" != "false" ]]; then
    echo "${name} must be true or false" >&2
    exit 2
  fi
}

canonical_path() {
  node -e 'const path=require("node:path");process.stdout.write(path.resolve(process.argv[1]))' "$1"
}

assert_scoped_path() {
  local label="$1"
  local candidate="$2"
  local prefix="$3"
  local normalized_candidate
  local normalized_prefix
  normalized_candidate="$(canonical_path "${candidate}")"
  normalized_prefix="$(canonical_path "${prefix}")"
  if [[ "${candidate}" != "${normalized_candidate}" || "${prefix}" != "${normalized_prefix}" || "${normalized_prefix}" == "/" ]]; then
    echo "${label} and its allowed prefix must be canonical absolute paths." >&2
    exit 2
  fi
  if [[ "${normalized_candidate}" != "${normalized_prefix}" && "${normalized_candidate}" != "${normalized_prefix}/"* ]]; then
    echo "${label} is outside its allowed prefix: ${normalized_candidate}" >&2
    exit 2
  fi
}

evidence_append() {
  local type="$1"
  local status="$2"
  shift 2
  if [[ "${EVIDENCE_INITIALIZED}" != "true" ]]; then
    return 0
  fi
  local args=(append --log "${EVIDENCE_LOG}" --type "${type}" --status "${status}")
  local detail
  for detail in "$@"; do
    args+=(--detail "${detail}")
  done
  node scripts/release-evidence.mjs "${args[@]}" >/dev/null
}

finalize_evidence() {
  local outcome="$1"
  if ! node scripts/release-evidence.mjs finalize \
    --log "${EVIDENCE_LOG}" \
    --summary "${EVIDENCE_SUMMARY}" \
    --root "${AUDIT_DIR}" \
    --outcome "${outcome}" >/dev/null; then
    return 1
  fi
  if ! node scripts/release-evidence.mjs verify \
    --log "${EVIDENCE_LOG}" \
    --summary "${EVIDENCE_SUMMARY}" \
    --root "${AUDIT_DIR}" >/dev/null; then
    return 1
  fi
  EVIDENCE_FINALIZED=true
}

persist_durable_evidence() {
  local node_bin
  node_bin="$(command -v node)"
  sudo install -d -o root -g root -m 750 \
    "${DURABLE_EVIDENCE_ROOT}" "${DURABLE_EVIDENCE_DIR}"
  sudo rsync -a --delete \
    --chown=root:root \
    --chmod=Du=rwx,Dg=rx,Do=,Fu=rw,Fg=r,Fo= \
    "${AUDIT_DIR}/" "${DURABLE_EVIDENCE_DIR}/"
  if ! sudo "${node_bin}" "${ROOT_DIR}/scripts/release-evidence.mjs" verify \
    --log "${DURABLE_EVIDENCE_DIR}/evidence.jsonl" \
    --summary "${DURABLE_EVIDENCE_DIR}/evidence.json" \
    --root "${DURABLE_EVIDENCE_DIR}" >/dev/null; then
    return 1
  fi
  DURABLE_EVIDENCE_PERSISTED=true
}

accept_deployment() {
  # Once terminal acceptance starts, do not let INT/TERM split the finalized
  # evidence, durable copy, and in-memory accepted state.
  trap '' INT TERM
  evidence_append release.completed passed "outcome=accepted"
  finalize_evidence accepted
  persist_durable_evidence
  DEPLOY_ACCEPTED=true
}

current_live_target() {
  readlink -f "${DEPLOY_ROOT}" 2>/dev/null || true
}

verify_dist_digest() {
  local release_root="$1"
  local expected_digest="$2"
  node scripts/release-candidate.mjs digest \
    --dist-dir "${release_root}" \
    --expected-artifact-digest "${expected_digest}"
}

remove_candidate_release() {
  local live_target
  if [[ "${RELEASE_CREATED}" != "true" ]]; then
    return 0
  fi
  live_target="$(current_live_target)"
  if [[ -n "${RELEASE_DIR}" && "${live_target}" != "${RELEASE_DIR}" ]]; then
    case "${RELEASE_DIR}" in
      "${RELEASES_DIR}"/*)
        sudo rm -rf -- "${RELEASE_DIR}"
        if [[ "${DEPLOY_PROFILE}" == "write-proof" ]]; then
          sudo rm -f -- "${SAFE_FALLBACK_LOCATOR_DIR}/$(basename -- "${RELEASE_DIR}").json"
        fi
        ;;
    esac
  fi
}

verify_manifest_file() {
  local manifest_file="$1"
  local expected_sha="$2"
  local expected_digest="${3:-}"
  local expected_gate="${4:-}"
  local expected_bff="${5:-${BFF_COMMIT}}"
  local expected_state="${6:-}"
  local expected_github_digest="${7-${GITHUB_ARTIFACT_DIGEST}}"
  local expected_profile="${8:-}"
  local expected_pair_id="${9:-}"
  local expected_read_only_digest="${10:-${READ_ONLY_ARTIFACT_DIGEST}}"
  local expected_operator_live_digest="${11:-${OPERATOR_LIVE_ARTIFACT_DIGEST}}"
  local expected_write_proof_digest="${12:-${WRITE_PROOF_ARTIFACT_DIGEST}}"
  if ! node --input-type=module - "${manifest_file}" "${expected_sha}" "${expected_digest}" "${expected_gate}" "${expected_bff}" "${expected_state}" "${expected_github_digest}" "${BFF_HOST}" "${expected_profile}" "${expected_pair_id}" "${expected_read_only_digest}" "${expected_operator_live_digest}" "${expected_write_proof_digest}" <<'NODE'
import fs from "node:fs";
const [file, expectedSha, expectedDigest, expectedGate, expectedBff, expectedState, expectedGithubDigest, expectedBffHost, expectedProfile, expectedPairId, expectedReadOnlyDigest, expectedOperatorLiveDigest, expectedWriteProofDigest] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(file, "utf8"));
const digest = String(payload.artifactDigestSha256 || payload.artifactDigest || "").replace(/^sha256:/i, "").toLowerCase();
const modernIdentity = Boolean(expectedGithubDigest);
const expectedBffSha = String(expectedBff || "").toLowerCase();
const observedBffCommit = String(payload.bffCommit || "").toLowerCase();
const observedBffSourceCommit = String(payload.bffSourceCommitSha || "").toLowerCase();
const observedNestedBffSourceCommit = String(payload.bff?.sourceCommitSha || "").toLowerCase();
const partialModernIdentity = !modernIdentity && Boolean(
  payload.schemaVersion != null ||
  payload.repository ||
  payload.frontendSha ||
  payload.frontend ||
  payload.gate ||
  payload.integrationGateRunId ||
  payload.githubArtifactDigest
);
if (partialModernIdentity) {
  throw new Error("deployment manifest has incomplete modern release identity");
}
if (
  payload.app !== "execute-plans" ||
  payload.environment !== "pantheon-dev-fe" ||
  String(payload.commit || "").toLowerCase() !== expectedSha.toLowerCase()
) {
  throw new Error("deployment manifest commit mismatch");
}
if (
  modernIdentity &&
  (payload.schemaVersion !== 1 ||
    payload.repository !== "ajoe734/execute-plans" ||
    String(payload.frontendSha || "").toLowerCase() !== expectedSha.toLowerCase() ||
    payload.frontend?.repository !== "ajoe734/execute-plans" ||
    String(payload.frontend?.commitSha || "").toLowerCase() !== expectedSha.toLowerCase())
) {
  throw new Error("deployment manifest frontend identity mismatch");
}
if (!modernIdentity && payload.repository && payload.repository !== "ajoe734/execute-plans") {
  throw new Error("legacy deployment manifest repository mismatch");
}
if (
  expectedDigest &&
  ((digest && digest !== expectedDigest.toLowerCase()) || (!digest && modernIdentity))
) {
  throw new Error("deployment manifest artifact digest mismatch");
}
if (modernIdentity && !/^[1-9][0-9]*$/u.test(String(expectedGate))) {
  throw new Error("deployment manifest modern gate identity is missing");
}
if (expectedGate) {
  let gateUrl;
  try {
    gateUrl = new URL(String(payload.gate?.runUrl || ""));
  } catch {
    throw new Error("deployment manifest gate URL is invalid");
  }
  if (
    String(payload.integrationGateRunId || "") !== String(expectedGate) ||
    payload.gate?.workflow !== "pantheon-integration-gate.yml" ||
    String(payload.gate?.runId || "") !== String(expectedGate) ||
    gateUrl.protocol !== "https:" ||
    gateUrl.hostname !== "github.com" ||
    gateUrl.username ||
    gateUrl.password ||
    gateUrl.search ||
    gateUrl.hash ||
    gateUrl.pathname.replace(/\/$/u, "") !== `/ajoe734/execute-plans/actions/runs/${expectedGate}`
  ) {
    throw new Error("deployment manifest gate run mismatch");
  }
}
const observedGithubDigest = String(payload.githubArtifactDigest || "").toLowerCase();
if (
  (expectedGithubDigest && observedGithubDigest !== expectedGithubDigest.toLowerCase()) ||
  (!expectedGithubDigest && observedGithubDigest)
) {
  throw new Error("deployment manifest GitHub artifact digest mismatch");
}
if (
  expectedBff &&
  (observedBffCommit !== expectedBffSha ||
    payload.bffCommitEvidence !== true ||
    (observedBffSourceCommit && observedBffSourceCommit !== expectedBffSha) ||
    (payload.bffHost && payload.bffHost !== expectedBffHost) ||
    (payload.bff?.baseUrl && payload.bff.baseUrl !== expectedBffHost) ||
    (observedNestedBffSourceCommit && observedNestedBffSourceCommit !== expectedBffSha) ||
    (payload.bff?.sourceCommitKnown !== undefined &&
      payload.bff.sourceCommitKnown !== true) ||
    (modernIdentity &&
      (!observedBffSourceCommit ||
        !payload.bffHost ||
        !payload.bff?.baseUrl ||
        !observedNestedBffSourceCommit ||
        payload.bff?.sourceCommitKnown !== true)))
) {
  throw new Error("deployment manifest BFF identity mismatch");
}
if (expectedState && String(payload.deploymentState || "") !== expectedState) {
  throw new Error("deployment manifest state mismatch");
}
if (!expectedState && payload.deploymentState && payload.deploymentState !== "accepted") {
  throw new Error("deployment manifest is not an accepted release");
}
if (expectedProfile) {
  if (payload.profile !== expectedProfile || payload.deploymentProfile !== expectedProfile) {
    throw new Error("deployment manifest profile mismatch");
  }
  if (!/^[0-9a-f]{64}$/u.test(expectedPairId) || payload.pairId !== expectedPairId) {
    throw new Error("deployment manifest pair identity mismatch");
  }
  if (
    payload.pair?.pairId !== expectedPairId ||
    payload.pair?.readOnlyArtifactDigestSha256 !== expectedReadOnlyDigest ||
    payload.pair?.operatorLiveArtifactDigestSha256 !== expectedOperatorLiveDigest ||
    payload.pair?.writeProofArtifactDigestSha256 !== expectedWriteProofDigest
  ) {
    throw new Error("deployment manifest paired profile digests mismatch");
  }
}
if (payload.buildMode?.VITE_BFF_MODE !== "live" || payload.buildMode?.VITE_BFF_FALLBACK !== "strict") {
  throw new Error("deployment manifest is not strict live mode");
}
const observedProfile = expectedProfile || String(payload.deploymentProfile || payload.profile || "read-only");
if (!["read-only", "operator-live", "write-proof"].includes(observedProfile)) {
  throw new Error("deployment manifest profile is unknown");
}
const expectedWrites = observedProfile === "read-only" ? "false" : "true";
const expectedStubWrites = observedProfile === "write-proof" ? "true" : "false";
if (payload.buildMode?.VITE_BFF_REAL_WRITES !== expectedWrites || payload.buildMode?.VITE_BFF_ALLOW_DEV_STUB_WRITES !== expectedStubWrites) {
  throw new Error("deployment manifest write posture is unsafe");
}
if (payload.buildMode?.VITE_BFF_EMBEDDED_BEARER_TOKEN !== "false") {
  throw new Error("deployment manifest bearer posture is unsafe");
}
NODE
  then
    return 1
  fi
}

verify_public_manifest() {
  local expected_sha="$1"
  local expected_digest="${2:-}"
  local expected_gate="${3:-}"
  local output_file="$4"
  local expected_bff="${5:-${BFF_COMMIT}}"
  local expected_state="${6:-}"
  local expected_github_digest="${7-${GITHUB_ARTIFACT_DIGEST}}"
  local expected_profile="${8:-}"
  local expected_pair_id="${9:-}"
  if ! curl --fail --silent --show-error --location \
    --retry 3 --retry-all-errors --connect-timeout 5 --max-time 20 \
    "${FE_HOST}/deployment.json?nocache=$(date +%s%N)" > "${output_file}"; then
    return 1
  fi
  verify_manifest_file \
    "${output_file}" \
    "${expected_sha}" \
    "${expected_digest}" \
    "${expected_gate}" \
    "${expected_bff}" \
    "${expected_state}" \
    "${expected_github_digest}" \
    "${expected_profile}" \
    "${expected_pair_id}"
}

ensure_probe_dependencies() {
  if [[ "${PROBE_DEPENDENCIES_READY}" == "true" ]]; then
    return 0
  fi
  echo "=== install probe dependencies ==="
  npm ci
  npx playwright install chromium
  PROBE_DEPENDENCIES_READY=true
}

publish_manifest_atomically() {
  local source_file="$1"
  local release_dir="$2"
  local label="$3"
  sudo python3 "${ATOMIC_MANIFEST_HELPER}" publish \
    --source "${source_file}" \
    --release-store "${RELEASES_DIR}" \
    --release-dir "${release_dir}" \
    --stage-name ".deployment-${RELEASE_INSTANCE}-${label}.tmp"
}

verify_bff_identity() {
  local stage="$1"
  local output_file="${AUDIT_DIR}/bff-version-${stage}.json"
  if ! curl --fail --silent --show-error --location \
    --retry 3 --retry-all-errors --connect-timeout 5 --max-time 20 \
    "${BFF_HOST%/}/bff/version" > "${output_file}"; then
    evidence_append "bff.identity.${stage}" failed "bffCommit=${BFF_COMMIT}"
    return 1
  fi
  if ! node --input-type=module - "${output_file}" "${BFF_COMMIT}" "${DEPLOY_PROFILE}" <<'NODE'
import fs from "node:fs";
const [file, expected, profile] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(file, "utf8"));
const source = String(payload.source_commit_sha || "").toLowerCase();
const alias = String(payload.commit || source).toLowerCase();
if (payload.source_commit_known !== true || !/^[0-9a-f]{40}$/u.test(source)) {
  throw new Error("live BFF does not expose an exact source commit");
}
if (source !== alias || source !== expected.toLowerCase()) {
  throw new Error("live BFF identity differs from gated candidate identity");
}
if (profile === "operator-live") {
  const posture = payload.config_posture || payload.posture || payload.auth || payload;
  const authMode = String(posture.auth_mode ?? posture.authMode ?? posture.mode ?? "").toLowerCase();
  const authStub = posture.auth_stub ?? posture.authStub;
  if (authMode !== "strict" || authStub !== false) {
    throw new Error("operator-live requires BFF auth_mode=strict and auth_stub=false");
  }
}
NODE
  then
    evidence_append "bff.identity.${stage}" failed "bffCommit=${BFF_COMMIT}"
    return 1
  fi
  if [[ "${DEPLOY_PROFILE}" == "operator-live" ]]; then
    local ready_status me_status
    ready_status="$(curl --silent --show-error --output "${AUDIT_DIR}/bff-ready-${stage}.json" \
      --write-out '%{http_code}' --connect-timeout 5 --max-time 20 "${BFF_HOST%/}/readyz" || true)"
    me_status="$(curl --silent --show-error --output "${AUDIT_DIR}/bff-me-anonymous-${stage}.json" \
      --write-out '%{http_code}' --connect-timeout 5 --max-time 20 "${BFF_HOST%/}/bff/me" || true)"
    if [[ "${ready_status}" != "200" || "${me_status}" != "401" ]]; then
      evidence_append "bff.strict_health.${stage}" failed "probeStatus=failed"
      return 1
    fi
    evidence_append "bff.strict_health.${stage}" passed "probeStatus=passed"
  fi
  evidence_append "bff.identity.${stage}" passed "bffCommit=${BFF_COMMIT}"
}

run_release_probe() {
  local phase="$1"
  local candidate_dir="$2"
  local expected_sha="$3"
  local expected_digest="$4"
  local strict="$5"
  local legacy_compat="${6:-false}"
  local candidate_source_scan="${7:-all}"
  local legacy_rollback_target_compat="${8:-false}"
  local json_out="${AUDIT_DIR}/browser-probe-${phase}.json"
  local candidate_env=""
  local strict_env="0"
  local probe_profile_env=()
  if [[ -n "${candidate_dir}" ]]; then
    candidate_env="${candidate_dir}"
  fi
  if [[ "${strict}" == "true" || "${strict}" == "1" ]]; then
    strict_env="1"
  fi
  if [[ ( "${DEPLOY_PROFILE}" == "write-proof" || "${DEPLOY_PROFILE}" == "operator-live" ) &&
    ( "${phase}" == "candidate_pre_switch" || "${phase}" == "post_switch" ) ]]; then
    probe_profile_env+=(
      "PANTHEON_PROBE_EXPECTED_PROFILE=${DEPLOY_PROFILE}"
      "PANTHEON_PROBE_EXPECTED_PAIR_ID=${PAIR_ID}"
      "PANTHEON_PROBE_EXPECTED_READ_ONLY_DIGEST=${READ_ONLY_ARTIFACT_DIGEST}"
      "PANTHEON_PROBE_EXPECTED_OPERATOR_LIVE_DIGEST=${OPERATOR_LIVE_ARTIFACT_DIGEST}"
      "PANTHEON_PROBE_EXPECTED_WRITE_PROOF_DIGEST=${WRITE_PROOF_ARTIFACT_DIGEST}"
    )
  elif [[ ( "${phase}" == "previous_target_pre_switch" || "${phase}" == "rollback" ) &&
    "${PREVIOUS_PROFILE}" == "operator-live" ]]; then
    probe_profile_env+=(
      "PANTHEON_PROBE_EXPECTED_PROFILE=operator-live"
      "PANTHEON_PROBE_EXPECTED_PAIR_ID=${PREVIOUS_PAIR_ID}"
      "PANTHEON_PROBE_EXPECTED_READ_ONLY_DIGEST=${PREVIOUS_READ_ONLY_ARTIFACT_DIGEST}"
      "PANTHEON_PROBE_EXPECTED_OPERATOR_LIVE_DIGEST=${PREVIOUS_OPERATOR_LIVE_ARTIFACT_DIGEST}"
      "PANTHEON_PROBE_EXPECTED_WRITE_PROOF_DIGEST=${PREVIOUS_WRITE_PROOF_ARTIFACT_DIGEST}"
    )
  fi
  if ! env "${probe_profile_env[@]}" \
    PANTHEON_FE_BASE_URL="${FE_HOST}" \
    PANTHEON_BFF_BASE_URL="${BFF_HOST}" \
    PANTHEON_BROWSER_BFF_BASE_URL="${BFF_HOST}" \
    PANTHEON_OLD_BFF_URL="${OLD_BFF_HOST}" \
    PANTHEON_HOSTED_PROBE_PATH="${PANTHEON_HOSTED_PROBE_PATH:-/management/persona-fleet}" \
    PANTHEON_HOSTED_REQUIRED_BFF_PATHS="${PANTHEON_HOSTED_REQUIRED_BFF_PATHS:-/bff/me}" \
    PANTHEON_PROBE_NOCACHE_SHA="${expected_sha}" \
    PANTHEON_EXPECTED_FE_SHA="${expected_sha}" \
    PANTHEON_EXPECTED_ARTIFACT_DIGEST="${expected_digest}" \
    PANTHEON_PROBE_RELEASE_STRICT="${strict_env}" \
    PANTHEON_PROBE_LEGACY_RELEASE_COMPAT="$([[ "${legacy_compat}" == "true" ]] && echo 1 || echo 0)" \
    PANTHEON_PROBE_LEGACY_ROLLBACK_TARGET_COMPAT="$([[ "${legacy_rollback_target_compat}" == "true" ]] && echo 1 || echo 0)" \
    PANTHEON_CANDIDATE_DIR="${candidate_env}" \
    PANTHEON_PROBE_CANDIDATE_SOURCE_SCAN="${candidate_source_scan}" \
    PANTHEON_PROBE_JSON_OUT="${json_out}" \
    PANTHEON_AUDIT_OUT_DIR="${AUDIT_DIR}" \
    node scripts/probe-hosted-browser-bff.mjs; then
    evidence_append "browser.probe.${phase}" failed "frontendSha=${expected_sha}" "artifactDigestSha256=${expected_digest:-legacy}"
    return 1
  fi
  evidence_append "browser.probe.${phase}" passed "frontendSha=${expected_sha}" "artifactDigestSha256=${expected_digest:-legacy}"
}

prequalify_rollback_target() {
  local phase="$1"
  local release_root="$2"
  local release_commit="$3"
  local release_digest="$4"
  local manifest_digest="$5"
  local gate_run_id="$6"
  local manifest_bff_commit="$7"
  local github_artifact_digest="$8"
  local legacy_compat=true
  if [[ "${manifest_digest}" =~ ^[0-9a-f]{64}$ && "${gate_run_id}" =~ ^[1-9][0-9]*$ ]]; then
    legacy_compat=false
  fi
  local probe_strict=true
  local rollback_compat=false
  if [[ "${legacy_compat}" == "true" ]]; then
    probe_strict=false
    rollback_compat=true
  fi
  if ! verify_manifest_file \
    "${release_root}/deployment.json" \
    "${release_commit}" \
    "${manifest_digest:-${release_digest}}" \
    "${gate_run_id}" \
    "${manifest_bff_commit}" \
    "" \
    "${github_artifact_digest}"; then
    evidence_append "rollback_target.manifest.${phase}" failed "frontendSha=${release_commit}"
    return 1
  fi
  evidence_append "rollback_target.manifest.${phase}" passed "frontendSha=${release_commit}"
  if ! run_release_probe "${phase}" "${release_root}" "${release_commit}" "${release_digest}" "${probe_strict}" "${legacy_compat}" loaded "${rollback_compat}"; then
    evidence_append "rollback_target.${phase}" failed "frontendSha=${release_commit}"
    return 1
  fi
  evidence_append "rollback_target.${phase}" passed \
    "frontendSha=${release_commit}" \
    "runtimeBffCommit=${BFF_COMMIT}"
}

verify_restored_previous() {
  local rollback_legacy=true
  if [[ "$(current_live_target)" != "${PREVIOUS_TARGET}" ]]; then
    evidence_append rollback.switch failed
    return 1
  fi
  if ! verify_dist_digest "${PREVIOUS_TARGET}" "${PREVIOUS_DIGEST}" >/dev/null; then
    evidence_append rollback.assets failed "previousCommit=${PREVIOUS_COMMIT}"
    return 1
  fi
  evidence_append rollback.assets passed "previousCommit=${PREVIOUS_COMMIT}"
  if ! verify_public_manifest "${PREVIOUS_COMMIT}" "${PREVIOUS_MANIFEST_DIGEST}" "${PREVIOUS_GATE_RUN_ID}" "${AUDIT_DIR}/rollback-deployment.json" "${PREVIOUS_MANIFEST_BFF_COMMIT}" "${PREVIOUS_DEPLOYMENT_STATE}" "${PREVIOUS_GITHUB_ARTIFACT_DIGEST}" "${PREVIOUS_PROFILE}" "${PREVIOUS_PAIR_ID}"; then
    evidence_append rollback.manifest failed "previousCommit=${PREVIOUS_COMMIT}"
    return 1
  fi
  evidence_append rollback.manifest passed "previousCommit=${PREVIOUS_COMMIT}"
  if ! verify_bff_identity rollback; then
    evidence_append rollback.bff failed "previousCommit=${PREVIOUS_COMMIT}"
    return 1
  fi
  if [[ "${PREVIOUS_MANIFEST_DIGEST}" =~ ^[0-9a-f]{64}$ && "${PREVIOUS_GATE_RUN_ID}" =~ ^[1-9][0-9]*$ ]]; then
    rollback_legacy=false
  fi
  local rollback_probe_strict=true
  local rollback_compat=false
  if [[ "${rollback_legacy}" == "true" ]]; then
    rollback_probe_strict=false
    rollback_compat=true
  fi
  if ! run_release_probe rollback "" "${PREVIOUS_COMMIT}" "${PREVIOUS_DIGEST}" "${rollback_probe_strict}" "${rollback_legacy}" all "${rollback_compat}"; then
    evidence_append rollback.reprobe failed "previousCommit=${PREVIOUS_COMMIT}"
    return 1
  fi
  ROLLBACK_REPROBED=true
  evidence_append rollback.reprobe passed "previousCommit=${PREVIOUS_COMMIT}"
}

rollback_release() {
  local current_target
  evidence_append rollback.started pending "previousCommit=${PREVIOUS_COMMIT:-unknown}"
  current_target="$(current_live_target)"
  if [[ "${current_target}" != "${RELEASE_DIR}" ]]; then
    evidence_append rollback.cas_rejected failed "observedTarget=${current_target:-missing}"
    echo "Rollback refused: live target changed outside this deployment." >&2
    return 1
  fi
  if [[ -z "${PREVIOUS_TARGET}" || ! -d "${PREVIOUS_TARGET}" ]]; then
    if ! sudo python3 "${SYMLINK_CAS_HELPER}" remove-if-target \
      --live-link "${DEPLOY_ROOT}" \
      --staged-link "${ROLLBACK_LINK}" \
      --expected-live-target "${RELEASE_DIR}" >/dev/null; then
      evidence_append rollback.bootstrap_remove failed
      echo "Rollback failed: bootstrap candidate CAS removal was rejected." >&2
      return 1
    fi
    if [[ -e "${DEPLOY_ROOT}" || -L "${DEPLOY_ROOT}" ]]; then
      evidence_append rollback.bootstrap_remove failed
      echo "Rollback failed: bootstrap candidate could not be removed." >&2
      return 1
    fi
    ROLLBACK_RESTORED=true
    evidence_append rollback.bootstrap_remove passed
    echo "Bootstrap candidate failed post-switch and was removed; no prior release exists to re-probe." >&2
    return 1
  fi

  if ! verify_dist_digest "${PREVIOUS_TARGET}" "${PREVIOUS_DIGEST}" >/dev/null; then
    evidence_append rollback.assets_pre_switch failed "previousCommit=${PREVIOUS_COMMIT}"
    echo "Rollback refused: previous release assets no longer match their qualified digest." >&2
    return 1
  fi
  evidence_append rollback.assets_pre_switch passed "previousCommit=${PREVIOUS_COMMIT}"

  sudo ln -s -- "${PREVIOUS_TARGET}" "${ROLLBACK_LINK}"
  ROLLBACK_LINK_CREATED=true
  if ! sudo python3 "${SYMLINK_CAS_HELPER}" exchange \
    --live-link "${DEPLOY_ROOT}" \
    --staged-link "${ROLLBACK_LINK}" \
    --expected-live-target "${RELEASE_DIR}" \
    --expected-staged-target "${PREVIOUS_TARGET}" >/dev/null; then
    sudo rm -f -- "${ROLLBACK_LINK}"
    ROLLBACK_LINK_CREATED=false
    evidence_append rollback.cas_rejected failed "observedTarget=$(current_live_target)"
    echo "Rollback refused: atomic symlink CAS rejected the live predecessor." >&2
    return 1
  fi
  ROLLBACK_LINK_CREATED=false
  ROLLBACK_RESTORED=true
  evidence_append rollback.switch passed "previousCommit=${PREVIOUS_COMMIT}"
  verify_restored_previous
}

restore_interrupted_release() {
  local legacy_compat=true
  local observed_target
  observed_target="$(current_live_target)"
  if ! verify_dist_digest "${RECOVERY_TARGET}" "${RECOVERY_DIGEST}" >/dev/null; then
    evidence_append recovery.rollback_assets failed "previousCommit=${RECOVERY_COMMIT}"
    return 1
  fi

  if [[ "${observed_target}" == "${RECOVERY_TARGET}" ]]; then
    evidence_append recovery.rollback_external passed "previousCommit=${RECOVERY_COMMIT}"
  elif [[ "${observed_target}" == "${PREVIOUS_TARGET}" ]]; then
    sudo ln -s -- "${RECOVERY_TARGET}" "${ROLLBACK_LINK}"
    ROLLBACK_LINK_CREATED=true
    if ! sudo python3 "${SYMLINK_CAS_HELPER}" exchange \
      --live-link "${DEPLOY_ROOT}" \
      --staged-link "${ROLLBACK_LINK}" \
      --expected-live-target "${PREVIOUS_TARGET}" \
      --expected-staged-target "${RECOVERY_TARGET}" >/dev/null; then
      sudo rm -f -- "${ROLLBACK_LINK}"
      ROLLBACK_LINK_CREATED=false
      evidence_append recovery.rollback_cas failed "observedTarget=$(current_live_target)"
      return 1
    fi
    ROLLBACK_LINK_CREATED=false
  else
    evidence_append recovery.rollback_cas failed "observedTarget=${observed_target:-missing}"
    return 1
  fi
  if [[ "$(current_live_target)" != "${RECOVERY_TARGET}" ]]; then
    evidence_append recovery.rollback_switch failed
    return 1
  fi
  ROLLBACK_RESTORED=true
  evidence_append recovery.rollback_switch passed "previousCommit=${RECOVERY_COMMIT}"

  if ! verify_dist_digest "${RECOVERY_TARGET}" "${RECOVERY_DIGEST}" >/dev/null; then
    evidence_append recovery.rollback_assets failed "previousCommit=${RECOVERY_COMMIT}"
    return 1
  fi
  evidence_append recovery.rollback_assets passed "previousCommit=${RECOVERY_COMMIT}"

  if ! verify_public_manifest "${RECOVERY_COMMIT}" "${RECOVERY_MANIFEST_DIGEST}" "${RECOVERY_GATE_RUN_ID}" "${AUDIT_DIR}/recovery-rollback-deployment.json" "${RECOVERY_MANIFEST_BFF_COMMIT}" "" "${RECOVERY_GITHUB_ARTIFACT_DIGEST}"; then
    evidence_append recovery.rollback_manifest failed "previousCommit=${RECOVERY_COMMIT}"
    return 1
  fi
  if ! verify_bff_identity recovery_rollback; then
    evidence_append recovery.rollback_bff failed "previousCommit=${RECOVERY_COMMIT}"
    return 1
  fi
  if [[ "${RECOVERY_MANIFEST_DIGEST}" =~ ^[0-9a-f]{64}$ && "${RECOVERY_GATE_RUN_ID}" =~ ^[1-9][0-9]*$ ]]; then
    legacy_compat=false
  fi
  if ! run_release_probe recovery_rollback "" "${RECOVERY_COMMIT}" "${RECOVERY_DIGEST}" true "${legacy_compat}"; then
    evidence_append recovery.rollback_reprobe failed "previousCommit=${RECOVERY_COMMIT}"
    return 1
  fi
  ROLLBACK_REPROBED=true
  evidence_append recovery.rollback_reprobe passed "previousCommit=${RECOVERY_COMMIT}"
}

prepare_interrupted_recovery() {
  local interrupted_manifest="${PREVIOUS_TARGET}/deployment.json"
  RECOVERY_RELEASE_NAME="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.previousReleaseName||"");if(!/^[A-Za-z0-9._-]+$/.test(s))process.exit(1);process.stdout.write(s)' "${interrupted_manifest}")"
  RECOVERY_COMMIT="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.previousCommit||"").toLowerCase();if(!/^[0-9a-f]{40}$/.test(s))process.exit(1);process.stdout.write(s)' "${interrupted_manifest}")"
  RECOVERY_DIGEST="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.previousArtifactDigest||"").toLowerCase();if(!/^[0-9a-f]{64}$/.test(s))process.exit(1);process.stdout.write(s)' "${interrupted_manifest}")"
  RECOVERY_TARGET="$(readlink -f "${RELEASES_DIR}/${RECOVERY_RELEASE_NAME}" 2>/dev/null || true)"
  if [[ "${RECOVERY_TARGET}" != "${RELEASES_DIR}/${RECOVERY_RELEASE_NAME}" || "${RECOVERY_TARGET}" == "${PREVIOUS_TARGET}" || ! -f "${RECOVERY_TARGET}/deployment.json" ]]; then
    echo "Interrupted candidate does not name a qualified previous release." >&2
    return 1
  fi
  RECOVERY_MANIFEST_DIGEST="$(node -e '
    const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const expectedCommit=process.argv[2],manifestBff=String(p.bffCommit||"").toLowerCase();
    const digest=String(p.artifactDigestSha256||p.artifactDigest||"").replace(/^sha256:/i,"").toLowerCase();
    const safe=String(p.commit||"").toLowerCase()===expectedCommit&&p.app==="execute-plans"&&p.environment==="pantheon-dev-fe"&&
      p.buildMode?.VITE_BFF_MODE==="live"&&p.buildMode?.VITE_BFF_FALLBACK==="strict"&&
      ["", "read-only", "operator-live"].includes(String(p.deploymentProfile||p.profile||""))&&
      p.buildMode?.VITE_BFF_REAL_WRITES===(String(p.deploymentProfile||p.profile||"")==="operator-live"?"true":"false")&&
      p.buildMode?.VITE_BFF_ALLOW_DEV_STUB_WRITES==="false"&&
      p.buildMode?.VITE_BFF_EMBEDDED_BEARER_TOKEN==="false"&&/^[0-9a-f]{40}$/.test(manifestBff)&&
      p.bffCommitEvidence===true&&["","accepted"].includes(String(p.deploymentState||""));
    if(!safe||(digest&&!/^[0-9a-f]{64}$/.test(digest)))process.exit(1);process.stdout.write(digest);
  ' "${RECOVERY_TARGET}/deployment.json" "${RECOVERY_COMMIT}")"
  RECOVERY_MANIFEST_BFF_COMMIT="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.bffCommit||"").toLowerCase();if(!/^[0-9a-f]{40}$/.test(s)||p.bffCommitEvidence!==true)process.exit(1);process.stdout.write(s)' "${RECOVERY_TARGET}/deployment.json")"
  RECOVERY_GATE_RUN_ID="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.integrationGateRunId||"");if(s&&!/^[1-9][0-9]*$/.test(s))process.exit(1);process.stdout.write(s)' "${RECOVERY_TARGET}/deployment.json")"
  RECOVERY_GITHUB_ARTIFACT_DIGEST="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.githubArtifactDigest||"").toLowerCase();if(s&&!/^sha256:[0-9a-f]{64}$/.test(s))process.exit(1);process.stdout.write(s)' "${RECOVERY_TARGET}/deployment.json")"
  verify_dist_digest "${RECOVERY_TARGET}" "${RECOVERY_DIGEST}" >/dev/null
  if [[ -n "${RECOVERY_MANIFEST_DIGEST}" && "${RECOVERY_MANIFEST_DIGEST}" != "${RECOVERY_DIGEST}" ]]; then
    echo "Interrupted candidate previous-release digest evidence disagrees." >&2
    return 1
  fi
  RECOVERY_ATTEMPTED=true
  evidence_append recovery.prepared passed "previousCommit=${RECOVERY_COMMIT}" "previousArtifactDigest=${RECOVERY_DIGEST}"
}

restore_paired_safe_release() {
  local write_target write_manifest locator_file safe_release_name safe_target
  local locator_mode observed_write_digest current_profile current_state current_pair

  # Cancellation must not interrupt the only fail-closed local state change.
  # Network, package installation, and hosted probes are intentionally absent
  # until the read-only sibling has been selected by CAS.
  trap '' INT TERM
  write_target="$(current_live_target)"
  case "${write_target}" in
    "${RELEASES_DIR}"/*) ;;
    *) echo "Read-only restore requires a managed live write-proof release." >&2; return 2 ;;
  esac
  write_manifest="${write_target}/deployment.json"
  if [[ ! -f "${write_manifest}" ]]; then
    echo "Managed live release is missing deployment identity." >&2
    return 2
  fi
  read -r current_profile current_state current_pair < <(node -e '
    const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    process.stdout.write(`${String(p.deploymentProfile||p.profile||"")} ${String(p.deploymentState||"")} ${String(p.pairId||"")}\n`);
  ' "${write_manifest}")
  if [[ "${current_profile}" == "read-only" ]]; then
    if [[ "${current_pair}" != "${PAIR_ID}" ||
      ( "${current_state}" != "accepted" && "${current_state}" != "standby" ) ]]; then
      echo "Already-safe live release does not match the requested pair identity." >&2
      return 2
    fi
    verify_dist_digest "${write_target}" "${READ_ONLY_ARTIFACT_DIGEST}" >/dev/null
    verify_manifest_file \
      "${write_manifest}" "${SHA}" "${READ_ONLY_ARTIFACT_DIGEST}" "${GATE_RUN_ID}" \
      "${BFF_COMMIT}" "${current_state}" "${GITHUB_ARTIFACT_DIGEST}" "read-only" "${PAIR_ID}"
    safe_target="${write_target}"
    SAFE_RESTORE_SELECTED=true
    RESTORE_SWITCH_COMPLETED=true
    RELEASE_DIR="${safe_target}"
    evidence_append restore.safe_already_live passed "releaseDir=${safe_target}"
  elif [[ "${current_profile}" != "write-proof" ||
    "${current_pair}" != "${PAIR_ID}" ||
    ( "${current_state}" != "accepted" && "${current_state}" != "candidate" ) ]]; then
    echo "Read-only restore refuses a write or unknown predecessor from another pair." >&2
    return 2
  else
  locator_file="${SAFE_FALLBACK_LOCATOR_DIR}/$(basename -- "${write_target}").json"
  if [[ ! -f "${write_manifest}" ]] ||
    ! sudo test -f "${locator_file}" || sudo test -L "${locator_file}"; then
    echo "Write-proof release is missing its private safe-fallback locator." >&2
    return 2
  fi
  locator_mode="$(sudo stat -c '%a' "${locator_file}")"
  if [[ "${locator_mode}" != "600" ]]; then
    echo "Safe-fallback locator must be mode 0600." >&2
    return 2
  fi
  observed_write_digest="$(verify_dist_digest "${write_target}" "${WRITE_PROOF_ARTIFACT_DIGEST}")"
  verify_manifest_file \
    "${write_manifest}" "${SHA}" "${observed_write_digest}" "${GATE_RUN_ID}" \
    "${BFF_COMMIT}" "${current_state}" "${GITHUB_ARTIFACT_DIGEST}" "write-proof" "${PAIR_ID}"
  safe_release_name="$(sudo node --input-type=module - "${locator_file}" "${PAIR_ID}" "${SHA}" "${READ_ONLY_ARTIFACT_DIGEST}" "${WRITE_PROOF_ARTIFACT_DIGEST}" <<'NODE'
import fs from "node:fs";
const [file, pairId, frontendSha, readOnlyDigest, writeProofDigest] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(file, "utf8"));
if (
  payload.schemaVersion !== 1 ||
  payload.pairId !== pairId ||
  payload.frontendSha !== frontendSha ||
  payload.readOnlyArtifactDigestSha256 !== readOnlyDigest ||
  payload.writeProofArtifactDigestSha256 !== writeProofDigest ||
  !/^[A-Za-z0-9._-]+$/u.test(String(payload.safeReleaseName || ""))
) throw new Error("private safe-fallback locator identity mismatch");
process.stdout.write(payload.safeReleaseName);
NODE
)"
  safe_target="$(readlink -f "${RELEASES_DIR}/${safe_release_name}" 2>/dev/null || true)"
  if [[ "${safe_target}" != "${RELEASES_DIR}/${safe_release_name}" || ! -d "${safe_target}" ]]; then
    echo "Private locator does not resolve to an immutable safe sibling." >&2
    return 2
  fi
  verify_dist_digest "${safe_target}" "${READ_ONLY_ARTIFACT_DIGEST}" >/dev/null
  verify_manifest_file \
    "${safe_target}/deployment.json" "${SHA}" "${READ_ONLY_ARTIFACT_DIGEST}" "${GATE_RUN_ID}" \
    "${BFF_COMMIT}" "standby" "${GITHUB_ARTIFACT_DIGEST}" "read-only" "${PAIR_ID}"

  sudo ln -s -- "${safe_target}" "${ROLLBACK_LINK}"
  ROLLBACK_LINK_CREATED=true
  SWITCH_ATTEMPTED=true
  if ! sudo python3 "${SYMLINK_CAS_HELPER}" exchange \
    --live-link "${DEPLOY_ROOT}" \
    --staged-link "${ROLLBACK_LINK}" \
    --expected-live-target "${write_target}" \
    --expected-staged-target "${safe_target}" >/dev/null; then
    sudo rm -f -- "${ROLLBACK_LINK}"
    ROLLBACK_LINK_CREATED=false
    echo "Read-only restore CAS rejected a changed live target." >&2
    return 2
  fi
  ROLLBACK_LINK_CREATED=false
  SAFE_RESTORE_SELECTED=true
  RESTORE_SWITCH_COMPLETED=true
  RELEASE_DIR="${safe_target}"
  evidence_append restore.safe_switch passed "releaseDir=${safe_target}"
  fi
  trap 'exit 130' INT
  trap 'exit 143' TERM

  # The local safe switch above is the first external-state mutation. Hosted
  # identity and network-dependent probes may now run without any path that
  # rolls back to the write-proof predecessor.
  ensure_probe_dependencies
  verify_bff_identity restore_after_safe_switch
  verify_public_manifest \
    "${SHA}" "${READ_ONLY_ARTIFACT_DIGEST}" "${GATE_RUN_ID}" \
    "${AUDIT_DIR}/restore-standby-deployment.json" "${BFF_COMMIT}" "standby" \
    "${GITHUB_ARTIFACT_DIGEST}" "read-only" "${PAIR_ID}"
  run_release_probe restore_after_safe_switch "" "${SHA}" "${READ_ONLY_ARTIFACT_DIGEST}" true
  node --input-type=module - "${safe_target}/deployment.json" "${TMP_DIR}/restored-deployment.json" <<'NODE'
import fs from "node:fs";
const [source, output] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(source, "utf8"));
manifest.deploymentState = "accepted";
manifest.acceptedAt = new Date().toISOString();
manifest.probes = { ...(manifest.probes || {}), safeRestore: "passed", rollbackRequired: false };
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE
  publish_manifest_atomically "${TMP_DIR}/restored-deployment.json" "${safe_target}" restored
  verify_public_manifest \
    "${SHA}" "${READ_ONLY_ARTIFACT_DIGEST}" "${GATE_RUN_ID}" \
    "${AUDIT_DIR}/restored-deployment.json" "${BFF_COMMIT}" "accepted" \
    "${GITHUB_ARTIFACT_DIGEST}" "read-only" "${PAIR_ID}"
  evidence_append restore.completed passed "releaseDir=${safe_target}"
  accept_deployment
  echo "OK: restored paired read-only release ${SHA} (${PAIR_ID}) before hosted verification."
}

cleanup() {
  local status=$?
  local outcome=accepted
  local observed_target=""
  set +e
  trap - EXIT
  trap '' INT TERM

  if [[ "${NEXT_LINK_CREATED}" == "true" ]]; then
    sudo rm -f -- "${NEXT_LINK}" 2>/dev/null || true
    NEXT_LINK_CREATED=false
  fi
  if [[ "${ROLLBACK_LINK_CREATED}" == "true" ]]; then
    sudo rm -f -- "${ROLLBACK_LINK}" 2>/dev/null || true
    ROLLBACK_LINK_CREATED=false
  fi

  if [[ "${status}" -ne 0 && "${DEPLOY_ACCEPTED}" == "true" ]]; then
    echo "Deployment was already durably accepted; preserving accepted live state and terminal evidence." >&2
    rm -rf "${TMP_DIR}"
    exit "${status}"
  fi

  if [[ "${status}" -ne 0 && "${SAFE_RESTORE_SELECTED}" == "true" && "${DEPLOY_ACCEPTED}" != "true" ]]; then
    # A restore never reselects its write-proof predecessor. The safe sibling
    # remains live even when later network-dependent verification is cancelled
    # or fails.
    outcome=rollback_probe_failed
    ROLLBACK_RESTORED=true
    evidence_append restore.safe_preserved passed "releaseDir=$(current_live_target)"
  elif [[ "${status}" -ne 0 && "${RECOVERY_ATTEMPTED}" == "true" && "${DEPLOY_ACCEPTED}" != "true" ]]; then
    if restore_interrupted_release; then
      outcome=recovery_rolled_back
    elif [[ "${ROLLBACK_RESTORED}" == "true" ]]; then
      outcome=recovery_rollback_probe_failed
    else
      outcome=recovery_rollback_failed
    fi
  elif [[ "${status}" -ne 0 && "${SWITCH_ATTEMPTED}" == "true" && "${DEPLOY_ACCEPTED}" != "true" ]]; then
    observed_target="$(current_live_target)"
    if [[ "${observed_target}" == "${RELEASE_DIR}" ]]; then
      if rollback_release; then
        outcome=rolled_back
      elif [[ "${ROLLBACK_RESTORED}" == "true" ]]; then
        outcome=rollback_probe_failed
      else
        outcome=rollback_failed
      fi
    elif [[ -n "${PREVIOUS_TARGET}" && "${observed_target}" == "${PREVIOUS_TARGET}" ]]; then
      ROLLBACK_RESTORED=true
      evidence_append rollback.external_restore pending "previousCommit=${PREVIOUS_COMMIT}"
      if verify_restored_previous; then
        evidence_append rollback.external_restore passed "previousCommit=${PREVIOUS_COMMIT}"
        outcome=rolled_back
      else
        evidence_append rollback.external_restore failed "previousCommit=${PREVIOUS_COMMIT}"
        outcome=rollback_probe_failed
      fi
    elif [[ -z "${PREVIOUS_TARGET}" && -z "${observed_target}" ]]; then
      ROLLBACK_RESTORED=true
      evidence_append rollback.bootstrap_remove passed
      outcome=rollback_probe_failed
    else
      outcome=rollback_failed
      evidence_append rollback.cas_rejected failed "observedTarget=${observed_target:-missing}"
    fi
  elif [[ "${status}" -ne 0 ]]; then
    outcome=rejected_before_switch
  fi

  if [[ "${status}" -ne 0 ]]; then
    if [[ "${ROLLBACK_DRILL}" == "true" ]]; then
      if [[ "${outcome}" == "rolled_back" ]]; then
        evidence_append rollback.drill passed "outcome=${outcome}"
      else
        evidence_append rollback.drill failed "outcome=${outcome}"
      fi
    fi
    evidence_append release.failed failed "outcome=${outcome}"
    remove_candidate_release
    if [[ "${EVIDENCE_INITIALIZED}" == "true" ]]; then
      EVIDENCE_FINALIZED=false
      DURABLE_EVIDENCE_PERSISTED=false
      if finalize_evidence "${outcome}"; then
        persist_durable_evidence || status=1
      else
        status=1
      fi
    fi
  elif [[ "${EVIDENCE_FINALIZED}" != "true" || "${DURABLE_EVIDENCE_PERSISTED}" != "true" ]]; then
    echo "Deployment reached a success exit without finalized, durable evidence." >&2
    status=1
  fi
  rm -rf "${TMP_DIR}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for boolean_name in EMERGENCY_OVERRIDE ROLLBACK_DRILL REAL_WRITES ALLOW_DEV_STUB_WRITES PROOF_WINDOW_ACK SKIP_PROBE ALLOW_BOOTSTRAP; do
  bool_value "${boolean_name}"
done

case "${DEPLOY_PROFILE}" in
  read-only)
    if [[ "${REAL_WRITES}" != "false" || "${ALLOW_DEV_STUB_WRITES}" != "false" || "${PROOF_WINDOW_ACK}" != "false" ]]; then
      echo "Read-only deployment requires false write flags and no proof-window acknowledgement." >&2
      exit 2
    fi
    ;;
  write-proof)
    if [[ "${GITHUB_EVENT_NAME:-}" != "workflow_dispatch" ||
      "${PROOF_WINDOW_ACK}" != "true" ||
      "${REAL_WRITES}" != "true" ||
      "${ALLOW_DEV_STUB_WRITES}" != "true" ||
      "${EMERGENCY_OVERRIDE}" != "false" ||
      "${ROLLBACK_DRILL}" != "false" ]]; then
      echo "Write-proof deployment requires a manual acknowledged proof window, both write flags true, and no emergency or rollback mode." >&2
      exit 2
    fi
    ;;
  operator-live)
    if [[ "${GITHUB_EVENT_NAME:-}" != "workflow_dispatch" ||
      "${PROOF_WINDOW_ACK}" != "false" ||
      "${REAL_WRITES}" != "true" ||
      "${ALLOW_DEV_STUB_WRITES}" != "false" ||
      "${EMERGENCY_OVERRIDE}" != "false" ||
      "${ROLLBACK_DRILL}" != "false" ]]; then
      echo "Operator-live deployment requires a manual strict session profile, real writes true, stub writes false, and no proof/emergency/rollback mode." >&2
      exit 2
    fi
    ;;
  read-only-restore)
    if [[ "${GITHUB_EVENT_NAME:-}" != "workflow_dispatch" ||
      "${PROOF_WINDOW_ACK}" != "false" ||
      "${REAL_WRITES}" != "false" ||
      "${ALLOW_DEV_STUB_WRITES}" != "false" ||
      "${EMERGENCY_OVERRIDE}" != "false" ||
      "${ROLLBACK_DRILL}" != "false" ]]; then
      echo "Read-only restore requires a manual dispatch, false write flags, and no emergency or rollback mode." >&2
      exit 2
    fi
    ;;
  *)
    echo "PANTHEON_DEPLOY_PROFILE must be read-only, operator-live, write-proof, or read-only-restore." >&2
    exit 2
    ;;
esac
if [[ "${SKIP_PROBE}" != "false" ]]; then
  echo "Candidate, auth, post-switch, and rollback probes cannot be skipped." >&2
  exit 2
fi
if [[ -n "${VITE_BFF_DEV_BEARER_TOKEN:-}" ]]; then
  echo "Refusing any browser bearer token in a public frontend release." >&2
  exit 2
fi
while IFS= read -r variable_name; do
  case "${variable_name}" in
    VITE_*CLIENT_SECRET*|VITE_*PRIVATE_KEY*|VITE_*SERVICE_ROLE*|VITE_*BEARER_TOKEN*)
      if [[ -n "${!variable_name:-}" ]]; then
        echo "Refusing non-public Vite credential variable: ${variable_name}" >&2
        exit 2
      fi
      ;;
  esac
done < <(compgen -e)

assert_scoped_path "Deploy root" "${DEPLOY_ROOT}" "${STRICT_DIR_PREFIX}"
assert_scoped_path "Release store" "${RELEASES_DIR}" "${STRICT_RELEASES_PREFIX}"
assert_scoped_path "Safe-fallback locator store" "${SAFE_FALLBACK_LOCATOR_DIR}" "${RELEASES_DIR}"
assert_scoped_path "Deployment lock" "${LOCK_FILE}" "${STRICT_LOCK_PREFIX}"
assert_scoped_path "Durable evidence root" "${DURABLE_EVIDENCE_ROOT}" "${STRICT_DURABLE_EVIDENCE_PREFIX}"
assert_scoped_path "Durable evidence run" "${DURABLE_EVIDENCE_DIR}" "${DURABLE_EVIDENCE_ROOT}"
if [[ ! "${SHA}" =~ ^[0-9a-f]{40}$ || "${SOURCE_REF}" != "${SHA}" ]]; then
  echo "Deployment source ref must equal the exact candidate SHA." >&2
  exit 2
fi
if [[ ! "${CONTROLLER_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Deployment controller must be an exact trusted commit SHA." >&2
  exit 2
fi
if ! git cat-file -e "${SHA}^{commit}" 2>/dev/null; then
  echo "Candidate SHA is not available as a commit in the trusted controller checkout." >&2
  exit 2
fi
if [[ ! "${GATE_RUN_ID}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Deployment requires an exact successful integration gate run id." >&2
  exit 2
fi
if [[ ! "${GITHUB_ARTIFACT_DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Deployment requires GitHub's immutable artifact SHA-256 digest." >&2
  exit 2
fi
if [[ ! "${EXPECTED_DEV_SHA}" =~ ^[0-9a-f]{40}$ || "${CONTROLLER_SHA}" != "${EXPECTED_DEV_SHA}" ]]; then
  echo "Trusted controller checkout must equal the exact validated dev SHA." >&2
  exit 2
fi
if [[ ( "${EMERGENCY_OVERRIDE}" == "true" || "${ROLLBACK_DRILL}" == "true" ) && ( ${#OVERRIDE_REASON} -lt 20 || -z "${OVERRIDE_ACTOR}" ) ]]; then
  echo "Emergency override and rollback drill require an actor and an audited reason." >&2
  exit 2
fi
if [[ "${EMERGENCY_OVERRIDE}" != "true" && "${ROLLBACK_DRILL}" != "true" && ( -n "${OVERRIDE_REASON}" || -n "${OVERRIDE_ACTOR}" ) ]]; then
  echo "Override metadata is invalid without emergency_override=true or rollback_drill=true." >&2
  exit 2
fi
if [[ "${ROLLBACK_DRILL}" == "true" && "${GITHUB_EVENT_NAME:-}" != "workflow_dispatch" ]]; then
  echo "Rollback drill is restricted to an explicit manual workflow dispatch." >&2
  exit 2
fi
if [[ ! "${RELEASE_INSTANCE}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Release instance contains unsafe path characters." >&2
  exit 2
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Refusing to deploy from a checkout with tracked changes." >&2
  git status -sb --untracked-files=no >&2
  exit 2
fi

if [[ ! -f "${SYMLINK_CAS_HELPER}" || ! -f "${ATOMIC_MANIFEST_HELPER}" ]]; then
  echo "Missing atomic deployment helper." >&2
  exit 2
fi

for command_name in npm node python3 rsync sudo curl flock git readlink stat; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 2
  fi
done

mkdir -p "${AUDIT_DIR}"
if [[ "${CANDIDATE_INPUT}" == /* ]]; then
  CANDIDATE_DIR="${CANDIDATE_INPUT}"
else
  CANDIDATE_DIR="${ROOT_DIR}/${CANDIDATE_INPUT}"
fi
if [[ ! -d "${CANDIDATE_DIR}/dist" || ! -f "${CANDIDATE_DIR}/candidate.json" ||
  ! -d "${CANDIDATE_DIR}/write-proof/dist" ||
  ! -f "${CANDIDATE_DIR}/write-proof/candidate.json" ||
  ! -d "${CANDIDATE_DIR}/operator-live/dist" ||
  ! -f "${CANDIDATE_DIR}/operator-live/candidate.json" ||
  ! -f "${CANDIDATE_DIR}/pair.json" ]]; then
  echo "Downloaded paired release candidate is incomplete." >&2
  exit 2
fi

READ_ONLY_CANDIDATE_DIR="${CANDIDATE_DIR}"
OPERATOR_LIVE_CANDIDATE_DIR="${CANDIDATE_DIR}/operator-live"
WRITE_PROOF_CANDIDATE_DIR="${CANDIDATE_DIR}/write-proof"
pair_verify_args=(
  --candidate-dir "${CANDIDATE_DIR}"
  --expected-frontend-sha "${SHA}"
  --expected-gate-run-id "${GATE_RUN_ID}"
  --expected-bff-base-url "${BFF_HOST}"
)
if [[ -n "${EXPECTED_PAIR_ID}" ]]; then
  pair_verify_args+=(--expected-pair-id "${EXPECTED_PAIR_ID}")
fi
READ_ONLY_ARTIFACT_DIGEST="$(node scripts/release-candidate.mjs verify-pair \
  "${pair_verify_args[@]}" --profile read-only)"
WRITE_PROOF_ARTIFACT_DIGEST="$(node scripts/release-candidate.mjs verify-pair \
  "${pair_verify_args[@]}" --profile write-proof)"
OPERATOR_LIVE_ARTIFACT_DIGEST="$(node scripts/release-candidate.mjs verify-pair \
  "${pair_verify_args[@]}" --profile operator-live)"
if [[ ! "${READ_ONLY_ARTIFACT_DIGEST}" =~ ^[0-9a-f]{64}$ ||
  ! "${OPERATOR_LIVE_ARTIFACT_DIGEST}" =~ ^[0-9a-f]{64}$ ||
  ! "${WRITE_PROOF_ARTIFACT_DIGEST}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Pair verifier did not return all three exact artifact digests." >&2
  exit 2
fi
read -r PAIR_ID BFF_COMMIT < <(node -e '
  const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const pair=String(p.pairId||"").toLowerCase(),bff=String(p.bffSha||"").toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(pair)||!/^[0-9a-f]{40}$/.test(bff))process.exit(1);
  process.stdout.write(`${pair} ${bff}\n`);
' "${CANDIDATE_DIR}/pair.json")
if [[ ( "${DEPLOY_PROFILE}" == "operator-live" || "${DEPLOY_PROFILE}" == "write-proof" || "${DEPLOY_PROFILE}" == "read-only-restore" ) &&
  ! "${EXPECTED_PAIR_ID}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Operator-live, write-proof, and restore dispatches require the exact expected pair ID." >&2
  exit 2
fi
if [[ -n "${EXPECTED_PAIR_ID}" && "${EXPECTED_PAIR_ID,,}" != "${PAIR_ID}" ]]; then
  echo "Paired candidate ID differs from the expected pair ID." >&2
  exit 2
fi
case "${DEPLOY_PROFILE}" in
  operator-live)
    ARTIFACT_DIGEST="${OPERATOR_LIVE_ARTIFACT_DIGEST}"
    CANDIDATE_DIR="${OPERATOR_LIVE_CANDIDATE_DIR}"
    RELEASE_DIR="${OPERATOR_RELEASE_DIR}"
    ;;
  write-proof)
    ARTIFACT_DIGEST="${WRITE_PROOF_ARTIFACT_DIGEST}"
    CANDIDATE_DIR="${WRITE_PROOF_CANDIDATE_DIR}"
    RELEASE_DIR="${WRITE_RELEASE_DIR}"
    ;;
  read-only|read-only-restore)
    ARTIFACT_DIGEST="${READ_ONLY_ARTIFACT_DIGEST}"
    CANDIDATE_DIR="${READ_ONLY_CANDIDATE_DIR}"
    if [[ "${DEPLOY_PROFILE}" == "read-only-restore" ]]; then
      RELEASE_DIR="${SAFE_RELEASE_DIR}"
    fi
    ;;
esac

OVERRIDE_REASON_SHA256=""
if [[ -n "${OVERRIDE_REASON}" ]]; then
  OVERRIDE_REASON_SHA256="$(node -e 'const crypto=require("node:crypto");process.stdout.write(crypto.createHash("sha256").update(process.argv[1]).digest("hex"))' "${OVERRIDE_REASON}")"
fi
node scripts/release-evidence.mjs init \
  --log "${EVIDENCE_LOG}" \
  --detail "controllerSha=${CONTROLLER_SHA}" \
  --detail "candidateSha=${SHA}" \
  --detail "integrationGateRunId=${GATE_RUN_ID}" \
  --detail "artifactDigestSha256=${ARTIFACT_DIGEST}" \
  --detail "githubArtifactDigest=${GITHUB_ARTIFACT_DIGEST}" \
  --detail "emergencyOverride=${EMERGENCY_OVERRIDE}" \
  --detail "rollbackDrill=${ROLLBACK_DRILL}" \
  --detail "overrideActor=${OVERRIDE_ACTOR:-none}" \
  --detail "overrideReasonSha256=${OVERRIDE_REASON_SHA256:-none}" >/dev/null
EVIDENCE_INITIALIZED=true
evidence_append candidate.integrity passed "frontendSha=${SHA}" "bffCommit=${BFF_COMMIT}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another dev frontend deployment holds ${LOCK_FILE}." >&2
  evidence_append deployment.lock failed
  exit 2
fi
LOCK_ACQUIRED=true
evidence_append deployment.lock passed "lockFile=${LOCK_FILE}"

if [[ "${DEPLOY_PROFILE}" == "read-only-restore" ]]; then
  restore_paired_safe_release
  exit 0
fi

REMOTE_DEV_SHA="$(git ls-remote --exit-code origin refs/heads/dev | awk '{print $1}')"
if [[ ! "${REMOTE_DEV_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Unable to resolve current origin/dev." >&2
  exit 2
fi
if [[ "${CONTROLLER_SHA}" != "${REMOTE_DEV_SHA}" ]]; then
  echo "Dev advanced after controller validation; refusing to run a stale deploy controller." >&2
  evidence_append controller.order failed "currentDevSha=${REMOTE_DEV_SHA}" "validatedDevSha=${CONTROLLER_SHA}"
  exit 2
fi
if [[ "${SHA}" != "${REMOTE_DEV_SHA}" && "${EMERGENCY_OVERRIDE}" != "true" ]]; then
  echo "Out-of-order candidate rejected: dev=${REMOTE_DEV_SHA} candidate=${SHA}." >&2
  evidence_append candidate.order failed "currentDevSha=${REMOTE_DEV_SHA}"
  exit 2
fi
if [[ "${SHA}" != "${REMOTE_DEV_SHA}" ]]; then
  evidence_append candidate.order overridden "currentDevSha=${REMOTE_DEV_SHA}"
else
  evidence_append candidate.order passed "currentDevSha=${REMOTE_DEV_SHA}"
fi

if [[ -L "${DEPLOY_ROOT}" ]]; then
  PREVIOUS_TARGET="$(current_live_target)"
  case "${PREVIOUS_TARGET}" in
    "${RELEASES_DIR}"/*) ;;
    *) echo "Current deploy symlink is outside the release store." >&2; exit 2 ;;
  esac
  PREVIOUS_RELEASE_NAME="$(basename -- "${PREVIOUS_TARGET}")"
  if [[ ! "${PREVIOUS_RELEASE_NAME}" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "Current release name contains unsafe path characters." >&2
    exit 2
  fi
  if [[ ! -d "${PREVIOUS_TARGET}" || ! -f "${PREVIOUS_TARGET}/deployment.json" ]]; then
    echo "Current deploy target is not a qualified release." >&2
    exit 2
  fi
  PREVIOUS_COMMIT="$(node -e '
    const fs=require("node:fs");
    const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const commit=String(p.commit||"").toLowerCase();
    const manifestBff=String(p.bffCommit||"").toLowerCase();
    const state=String(p.deploymentState||"");
    const profile=String(p.deploymentProfile||p.profile||"");
    const writes=profile==="read-only"||profile===""?"false":"true";
    const stubWrites=profile==="write-proof"?"true":"false";
    const safe=p.app==="execute-plans"&&p.environment==="pantheon-dev-fe"&&
      p.buildMode?.VITE_BFF_MODE==="live"&&p.buildMode?.VITE_BFF_FALLBACK==="strict"&&
      p.buildMode?.VITE_BFF_REAL_WRITES===writes&&
      p.buildMode?.VITE_BFF_ALLOW_DEV_STUB_WRITES===stubWrites&&
      p.buildMode?.VITE_BFF_EMBEDDED_BEARER_TOKEN==="false"&&
      /^[0-9a-f]{40}$/.test(manifestBff)&&p.bffCommitEvidence===true&&
      ["","read-only","operator-live","write-proof"].includes(profile)&&
      (!profile||/^[0-9a-f]{64}$/.test(String(p.pairId||"")))&&
      ["","accepted","candidate"].includes(state);
    if(!/^[0-9a-f]{40}$/.test(commit)||!safe)process.exit(1);
    process.stdout.write(commit);
  ' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_MANIFEST_BFF_COMMIT="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.bffCommit||"").toLowerCase();if(!/^[0-9a-f]{40}$/.test(s)||p.bffCommitEvidence!==true)process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_MANIFEST_DIGEST="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.artifactDigestSha256||p.artifactDigest||"").replace(/^sha256:/i,"").toLowerCase();if(s&&!/^[0-9a-f]{64}$/.test(s))process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_GATE_RUN_ID="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.integrationGateRunId||"");if(s&&!/^[1-9][0-9]*$/.test(s))process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_GITHUB_ARTIFACT_DIGEST="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.githubArtifactDigest||"").toLowerCase();if(s&&!/^sha256:[0-9a-f]{64}$/.test(s))process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_DEPLOYMENT_STATE="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(p.deploymentState||""))' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_PROFILE="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.deploymentProfile||p.profile||"");if(!["","read-only","operator-live","write-proof"].includes(s))process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_PAIR_ID="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.pairId||"").toLowerCase();if(s&&!/^[0-9a-f]{64}$/.test(s))process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_READ_ONLY_ARTIFACT_DIGEST="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.pair?.readOnlyArtifactDigestSha256||"").toLowerCase();if(s&&!/^[0-9a-f]{64}$/.test(s))process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_OPERATOR_LIVE_ARTIFACT_DIGEST="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.pair?.operatorLiveArtifactDigestSha256||"").toLowerCase();if(s&&!/^[0-9a-f]{64}$/.test(s))process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_WRITE_PROOF_ARTIFACT_DIGEST="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.pair?.writeProofArtifactDigestSha256||"").toLowerCase();if(s&&!/^[0-9a-f]{64}$/.test(s))process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
  if [[ "${PREVIOUS_PROFILE}" == "operator-live" &&
    ( ! "${PREVIOUS_PAIR_ID}" =~ ^[0-9a-f]{64}$ ||
      ! "${PREVIOUS_READ_ONLY_ARTIFACT_DIGEST}" =~ ^[0-9a-f]{64}$ ||
      ! "${PREVIOUS_OPERATOR_LIVE_ARTIFACT_DIGEST}" =~ ^[0-9a-f]{64}$ ||
      ! "${PREVIOUS_WRITE_PROOF_ARTIFACT_DIGEST}" =~ ^[0-9a-f]{64}$ ) ]]; then
    echo "Accepted operator-live rollback target has incomplete paired identity." >&2
    exit 2
  fi
  PREVIOUS_DIGEST="$(verify_dist_digest "${PREVIOUS_TARGET}" "${PREVIOUS_MANIFEST_DIGEST}")"
  evidence_append previous_release qualified \
    "previousCommit=${PREVIOUS_COMMIT}" \
    "previousArtifactDigest=${PREVIOUS_DIGEST}" \
    "previousManifestBffCommit=${PREVIOUS_MANIFEST_BFF_COMMIT}"
elif [[ ! -e "${DEPLOY_ROOT}" && "${ALLOW_BOOTSTRAP}" == "true" ]]; then
  evidence_append previous_release bootstrap "deployRoot=${DEPLOY_ROOT}"
elif [[ ! -e "${DEPLOY_ROOT}" ]]; then
  echo "No rollback target exists; bootstrap requires explicit PANTHEON_DEPLOY_ALLOW_BOOTSTRAP=true." >&2
  exit 2
else
  echo "Deploy root must be a managed symlink; manual legacy conversion is required." >&2
  exit 2
fi
LIVE_TARGET_AT_START="${PREVIOUS_TARGET}"

if [[ -n "${PREVIOUS_COMMIT}" ]]; then
  if [[ "${PREVIOUS_PROFILE}" == "write-proof" ]]; then
    echo "A live write-proof release may only transition through read-only-restore." >&2
    evidence_append candidate.write_predecessor_rejected failed "previousCommit=${PREVIOUS_COMMIT}"
    exit 2
  fi
  if [[ "${PREVIOUS_DEPLOYMENT_STATE}" == "candidate" && "${PREVIOUS_COMMIT}" != "${SHA}" ]]; then
    prepare_interrupted_recovery
    ensure_probe_dependencies
    evidence_append recovery.new_candidate rejected "previousCommit=${PREVIOUS_COMMIT}"
    echo "An interrupted candidate must be restored before a different candidate can deploy." >&2
    exit 2
  fi
  if [[ "${PREVIOUS_COMMIT}" == "${SHA}" ]]; then
    if [[ "${PREVIOUS_PROFILE:-read-only}" == "${DEPLOY_PROFILE}" &&
      ( -z "${PREVIOUS_DIGEST}" || "${PREVIOUS_DIGEST}" != "${ARTIFACT_DIGEST}" ) ]]; then
      echo "Same-SHA/profile artifact replacement rejected because the served digest differs or is unproven." >&2
      evidence_append candidate.reproducibility failed "previousCommit=${PREVIOUS_COMMIT}"
      exit 2
    elif [[ "${PREVIOUS_MANIFEST_BFF_COMMIT}" == "${BFF_COMMIT}" &&
      "${PREVIOUS_PROFILE}" == "${DEPLOY_PROFILE}" &&
      "${PREVIOUS_PAIR_ID}" == "${PAIR_ID}" &&
      "${PREVIOUS_MANIFEST_DIGEST}" == "${ARTIFACT_DIGEST}" &&
      "${PREVIOUS_GATE_RUN_ID}" =~ ^[1-9][0-9]*$ &&
      "${PREVIOUS_GITHUB_ARTIFACT_DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
      NOOP_DEPLOY=true
      if [[ "${PREVIOUS_DEPLOYMENT_STATE}" == "candidate" ]]; then
        prepare_interrupted_recovery
      fi
      evidence_append candidate.noop pending "previousCommit=${PREVIOUS_COMMIT}"
      if [[ "${ROLLBACK_DRILL}" == "true" ]]; then
        evidence_append rollback.drill rejected "previousCommit=${PREVIOUS_COMMIT}"
        echo "Rollback drill requires a candidate switch; the exact candidate is already live." >&2
        exit 2
      fi
    elif [[ "${PREVIOUS_DEPLOYMENT_STATE}" == "candidate" ]]; then
      prepare_interrupted_recovery
      evidence_append recovery.bff_requalification rejected \
        "previousManifestBffCommit=${PREVIOUS_MANIFEST_BFF_COMMIT}" \
        "runtimeBffCommit=${BFF_COMMIT}"
      echo "An interrupted candidate must be restored before BFF pair requalification." >&2
      exit 2
    else
      evidence_append candidate.identity_requalification pending \
        "previousManifestBffCommit=${PREVIOUS_MANIFEST_BFF_COMMIT}" \
        "runtimeBffCommit=${BFF_COMMIT}" \
        "previousGateRunId=${PREVIOUS_GATE_RUN_ID:-legacy}" \
        "incomingGateRunId=${GATE_RUN_ID}"
    fi
  elif ! git merge-base --is-ancestor "${PREVIOUS_COMMIT}" "${SHA}"; then
    if [[ "${EMERGENCY_OVERRIDE}" != "true" ]]; then
      echo "Out-of-order deployment rejected: served SHA is not an ancestor of candidate." >&2
      evidence_append candidate.ancestry failed "previousCommit=${PREVIOUS_COMMIT}"
      exit 2
    fi
    evidence_append candidate.ancestry overridden "previousCommit=${PREVIOUS_COMMIT}"
  else
    evidence_append candidate.ancestry passed "previousCommit=${PREVIOUS_COMMIT}"
  fi
fi

ensure_probe_dependencies

verify_bff_identity pre_candidate

if [[ "${RECOVERY_ATTEMPTED}" == "true" ]]; then
  prequalify_rollback_target \
    recovery_target_pre_switch \
    "${RECOVERY_TARGET}" \
    "${RECOVERY_COMMIT}" \
    "${RECOVERY_DIGEST}" \
    "${RECOVERY_MANIFEST_DIGEST}" \
    "${RECOVERY_GATE_RUN_ID}" \
    "${RECOVERY_MANIFEST_BFF_COMMIT}" \
    "${RECOVERY_GITHUB_ARTIFACT_DIGEST}"
elif [[ -n "${PREVIOUS_TARGET}" && "${NOOP_DEPLOY}" != "true" ]]; then
  prequalify_rollback_target \
    previous_target_pre_switch \
    "${PREVIOUS_TARGET}" \
    "${PREVIOUS_COMMIT}" \
    "${PREVIOUS_DIGEST}" \
    "${PREVIOUS_MANIFEST_DIGEST}" \
    "${PREVIOUS_GATE_RUN_ID}" \
    "${PREVIOUS_MANIFEST_BFF_COMMIT}" \
    "${PREVIOUS_GITHUB_ARTIFACT_DIGEST}"
fi

if [[ "${DEPLOY_PROFILE}" == "write-proof" ]]; then
  echo "=== install and qualify paired read-only safe sibling ==="
  if [[ -e "${SAFE_RELEASE_DIR}" || -L "${SAFE_RELEASE_DIR}" ]]; then
    echo "Immutable safe sibling already exists: ${SAFE_RELEASE_DIR}" >&2
    exit 2
  fi
  mkdir -p "${TMP_DIR}/safe-release"
  rsync -a --delete "${READ_ONLY_CANDIDATE_DIR}/dist/" "${TMP_DIR}/safe-release/"
  PANTHEON_RUNTIME_MANIFEST="${TMP_DIR}/safe-release/deployment.json" \
  PANTHEON_RUNTIME_RELEASE_NAME="$(basename -- "${SAFE_RELEASE_DIR}")" \
  PANTHEON_RUNTIME_GITHUB_DIGEST="${GITHUB_ARTIFACT_DIGEST}" \
  PANTHEON_RUNTIME_PAIR_ID="${PAIR_ID}" \
  PANTHEON_RUNTIME_READ_ONLY_DIGEST="${READ_ONLY_ARTIFACT_DIGEST}" \
  PANTHEON_RUNTIME_OPERATOR_LIVE_DIGEST="${OPERATOR_LIVE_ARTIFACT_DIGEST}" \
  PANTHEON_RUNTIME_WRITE_PROOF_DIGEST="${WRITE_PROOF_ARTIFACT_DIGEST}" \
    node --input-type=module <<'NODE'
import fs from "node:fs";
const file = process.env.PANTHEON_RUNTIME_MANIFEST;
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.profile = "read-only";
manifest.deploymentProfile = "read-only";
manifest.pairId = process.env.PANTHEON_RUNTIME_PAIR_ID;
manifest.pair = {
  pairId: process.env.PANTHEON_RUNTIME_PAIR_ID,
  readOnlyArtifactDigestSha256: process.env.PANTHEON_RUNTIME_READ_ONLY_DIGEST,
  operatorLiveArtifactDigestSha256: process.env.PANTHEON_RUNTIME_OPERATOR_LIVE_DIGEST,
  writeProofArtifactDigestSha256: process.env.PANTHEON_RUNTIME_WRITE_PROOF_DIGEST,
};
manifest.deploymentState = "standby";
manifest.releaseName = process.env.PANTHEON_RUNTIME_RELEASE_NAME;
manifest.githubArtifactDigest = process.env.PANTHEON_RUNTIME_GITHUB_DIGEST;
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE
  verify_dist_digest "${TMP_DIR}/safe-release" "${READ_ONLY_ARTIFACT_DIGEST}" >/dev/null
  sudo install -d -o root -g root -m 775 "${SAFE_RELEASE_DIR}"
  SAFE_RELEASE_CREATED=true
  sudo rsync -a --delete --chown=root:root --chmod=Du=rwx,Dg=rwx,Do=rx,Fu=rw,Fg=rw,Fo=r \
    "${TMP_DIR}/safe-release/" "${SAFE_RELEASE_DIR}/"
  verify_dist_digest "${SAFE_RELEASE_DIR}" "${READ_ONLY_ARTIFACT_DIGEST}" >/dev/null
  verify_manifest_file \
    "${SAFE_RELEASE_DIR}/deployment.json" "${SHA}" "${READ_ONLY_ARTIFACT_DIGEST}" \
    "${GATE_RUN_ID}" "${BFF_COMMIT}" "standby" "${GITHUB_ARTIFACT_DIGEST}" \
    "read-only" "${PAIR_ID}"
  run_release_probe safe_sibling_pre_switch "${SAFE_RELEASE_DIR}" "${SHA}" "${READ_ONLY_ARTIFACT_DIGEST}" true
  SAFE_RELEASE_QUALIFIED=true
  evidence_append safe_sibling.qualified passed \
    "artifactDigestSha256=${READ_ONLY_ARTIFACT_DIGEST}"

  # A failed write switch must restore the qualified safe sibling, never the
  # live predecessor (which may be stale or may later become write-capable).
  PREVIOUS_TARGET="${SAFE_RELEASE_DIR}"
  PREVIOUS_RELEASE_NAME="$(basename -- "${SAFE_RELEASE_DIR}")"
  PREVIOUS_COMMIT="${SHA}"
  PREVIOUS_DIGEST="${READ_ONLY_ARTIFACT_DIGEST}"
  PREVIOUS_MANIFEST_DIGEST="${READ_ONLY_ARTIFACT_DIGEST}"
  PREVIOUS_GATE_RUN_ID="${GATE_RUN_ID}"
  PREVIOUS_GITHUB_ARTIFACT_DIGEST="${GITHUB_ARTIFACT_DIGEST}"
  PREVIOUS_MANIFEST_BFF_COMMIT="${BFF_COMMIT}"
  PREVIOUS_DEPLOYMENT_STATE="standby"
  PREVIOUS_PROFILE="read-only"
  PREVIOUS_PAIR_ID="${PAIR_ID}"
fi

if [[ "${NOOP_DEPLOY}" == "true" ]]; then
  echo "=== exact live candidate no-op revalidation ==="
  verify_dist_digest "${PREVIOUS_TARGET}" "${ARTIFACT_DIGEST}" >/dev/null
  if [[ "${RECOVERY_ATTEMPTED}" == "true" ]]; then
    verify_public_manifest "${SHA}" "${ARTIFACT_DIGEST}" "${PREVIOUS_GATE_RUN_ID}" "${AUDIT_DIR}/noop-deployment.json" "${PREVIOUS_MANIFEST_BFF_COMMIT}" candidate "${PREVIOUS_GITHUB_ARTIFACT_DIGEST}" "${DEPLOY_PROFILE}" "${PAIR_ID}"
  else
    verify_public_manifest "${SHA}" "${ARTIFACT_DIGEST}" "${PREVIOUS_GATE_RUN_ID}" "${AUDIT_DIR}/noop-deployment.json" "${PREVIOUS_MANIFEST_BFF_COMMIT}" "${PREVIOUS_DEPLOYMENT_STATE}" "${PREVIOUS_GITHUB_ARTIFACT_DIGEST}" "${DEPLOY_PROFILE}" "${PAIR_ID}"
  fi
  run_release_probe noop "" "${SHA}" "${ARTIFACT_DIGEST}" true
  verify_bff_identity noop_final
  if [[ "${RECOVERY_ATTEMPTED}" == "true" ]]; then
    node --input-type=module - "${PREVIOUS_TARGET}/deployment.json" "${TMP_DIR}/recovered-deployment.json" <<'NODE'
import fs from "node:fs";
const [source, output] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(source, "utf8"));
manifest.deploymentState = "accepted";
manifest.acceptedAt = new Date().toISOString();
manifest.probes = {
  ...(manifest.probes || {}),
  candidatePreSwitch: "passed-before-interruption",
  postSwitch: "passed-during-recovery",
  rollbackRequired: false,
  recoveredAfterInterruption: true,
};
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE
    publish_manifest_atomically \
      "${TMP_DIR}/recovered-deployment.json" \
      "${PREVIOUS_TARGET}" \
      recovered
    verify_public_manifest "${SHA}" "${ARTIFACT_DIGEST}" "${PREVIOUS_GATE_RUN_ID}" "${AUDIT_DIR}/recovered-deployment.json" "${PREVIOUS_MANIFEST_BFF_COMMIT}" accepted "${PREVIOUS_GITHUB_ARTIFACT_DIGEST}" "${DEPLOY_PROFILE}" "${PAIR_ID}"
    evidence_append recovery.roll_forward passed "previousCommit=${RECOVERY_COMMIT}"
  fi
  evidence_append candidate.noop passed \
    "previousCommit=${PREVIOUS_COMMIT}" \
    "acceptedGateRunId=${PREVIOUS_GATE_RUN_ID:-legacy}" \
    "incomingEquivalentGateRunId=${GATE_RUN_ID}" \
    "acceptedGithubArtifactDigest=${PREVIOUS_GITHUB_ARTIFACT_DIGEST:-legacy}" \
    "incomingGithubArtifactDigest=${GITHUB_ARTIFACT_DIGEST}"
  cat > "${AUDIT_DIR}/dev-fe-deploy-${TIMESTAMP}.md" <<EOF
# Pantheon Dev FE Deploy

- outcome: accepted_noop
- verified_at: ${TIMESTAMP}
- commit: ${SHA}
- artifact_digest_sha256: ${ARTIFACT_DIGEST}
- pair_id: ${PAIR_ID}
- deployment_profile: ${DEPLOY_PROFILE}
- github_artifact_digest: ${GITHUB_ARTIFACT_DIGEST}
- integration_gate_run_id: ${GATE_RUN_ID}
- bff_commit: ${BFF_COMMIT}
- release_dir: ${PREVIOUS_TARGET}
- real_writes: ${REAL_WRITES}
- allow_dev_stub_writes: ${ALLOW_DEV_STUB_WRITES}
- embedded_bearer_token: false
- live_manifest_probe: passed
- browser_auth_probe: passed
- evidence_log: evidence.jsonl
- evidence_summary: evidence.json
EOF
  accept_deployment
  echo "OK: exact candidate ${SHA} (${ARTIFACT_DIGEST}) was already live and passed full revalidation."
  exit 0
fi

sudo install -d -o root -g root -m 775 "${RELEASES_DIR}"
if [[ -e "${RELEASE_DIR}" || -L "${RELEASE_DIR}" ]]; then
  echo "Immutable release directory already exists: ${RELEASE_DIR}" >&2
  exit 2
fi
mkdir -p "${TMP_DIR}/release"
rsync -a --delete "${CANDIDATE_DIR}/dist/" "${TMP_DIR}/release/"

PANTHEON_RUNTIME_MANIFEST="${TMP_DIR}/release/deployment.json" \
PANTHEON_RUNTIME_DEPLOYED_AT="${TIMESTAMP}" \
PANTHEON_RUNTIME_RELEASE_NAME="${RELEASE_NAME}" \
PANTHEON_RUNTIME_PREVIOUS_COMMIT="${PREVIOUS_COMMIT}" \
PANTHEON_RUNTIME_PREVIOUS_DIGEST="${PREVIOUS_DIGEST}" \
PANTHEON_RUNTIME_PREVIOUS_RELEASE_NAME="${PREVIOUS_RELEASE_NAME}" \
PANTHEON_RUNTIME_GITHUB_DIGEST="${GITHUB_ARTIFACT_DIGEST}" \
PANTHEON_RUNTIME_EMERGENCY_OVERRIDE="${EMERGENCY_OVERRIDE}" \
PANTHEON_RUNTIME_OVERRIDE_ACTOR="${OVERRIDE_ACTOR}" \
PANTHEON_RUNTIME_OVERRIDE_REASON_SHA256="${OVERRIDE_REASON_SHA256}" \
PANTHEON_RUNTIME_PROFILE="${DEPLOY_PROFILE}" \
PANTHEON_RUNTIME_PAIR_ID="${PAIR_ID}" \
PANTHEON_RUNTIME_READ_ONLY_DIGEST="${READ_ONLY_ARTIFACT_DIGEST}" \
PANTHEON_RUNTIME_OPERATOR_LIVE_DIGEST="${OPERATOR_LIVE_ARTIFACT_DIGEST}" \
PANTHEON_RUNTIME_WRITE_PROOF_DIGEST="${WRITE_PROOF_ARTIFACT_DIGEST}" \
  node --input-type=module <<'NODE'
import fs from "node:fs";
const file = process.env.PANTHEON_RUNTIME_MANIFEST;
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.deploymentState = "candidate";
manifest.releaseName = process.env.PANTHEON_RUNTIME_RELEASE_NAME;
manifest.deployedAt = process.env.PANTHEON_RUNTIME_DEPLOYED_AT;
manifest.previousCommit = process.env.PANTHEON_RUNTIME_PREVIOUS_COMMIT || null;
manifest.previousArtifactDigest = process.env.PANTHEON_RUNTIME_PREVIOUS_DIGEST || null;
manifest.previousReleaseName = process.env.PANTHEON_RUNTIME_PREVIOUS_RELEASE_NAME || null;
manifest.githubArtifactDigest = process.env.PANTHEON_RUNTIME_GITHUB_DIGEST;
manifest.profile = process.env.PANTHEON_RUNTIME_PROFILE;
manifest.deploymentProfile = process.env.PANTHEON_RUNTIME_PROFILE;
manifest.pairId = process.env.PANTHEON_RUNTIME_PAIR_ID;
manifest.pair = {
  pairId: process.env.PANTHEON_RUNTIME_PAIR_ID,
  readOnlyArtifactDigestSha256: process.env.PANTHEON_RUNTIME_READ_ONLY_DIGEST,
  operatorLiveArtifactDigestSha256: process.env.PANTHEON_RUNTIME_OPERATOR_LIVE_DIGEST,
  writeProofArtifactDigestSha256: process.env.PANTHEON_RUNTIME_WRITE_PROOF_DIGEST,
};
manifest.emergencyOverride = {
  enabled: process.env.PANTHEON_RUNTIME_EMERGENCY_OVERRIDE === "true",
  actor: process.env.PANTHEON_RUNTIME_OVERRIDE_ACTOR || null,
  reasonSha256: process.env.PANTHEON_RUNTIME_OVERRIDE_REASON_SHA256 || null,
};
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE
verify_dist_digest "${TMP_DIR}/release" "${ARTIFACT_DIGEST}" >/dev/null
evidence_append candidate.staged_assets passed "artifactDigestSha256=${ARTIFACT_DIGEST}"
RELEASE_CREATED=true
sudo install -d -o root -g root -m 775 "${RELEASE_DIR}"
sudo rsync -a --delete --chown=root:root --chmod=Du=rwx,Dg=rwx,Do=rx,Fu=rw,Fg=rw,Fo=r \
  "${TMP_DIR}/release/" "${RELEASE_DIR}/"
verify_dist_digest "${RELEASE_DIR}" "${ARTIFACT_DIGEST}" >/dev/null
evidence_append candidate.installed_assets passed "artifactDigestSha256=${ARTIFACT_DIGEST}"

if [[ "${DEPLOY_PROFILE}" == "write-proof" ]]; then
  if [[ "${SAFE_RELEASE_QUALIFIED}" != "true" ]]; then
    echo "Write-proof release cannot proceed without a qualified safe sibling." >&2
    exit 2
  fi
  node --input-type=module - \
    "${TMP_DIR}/safe-fallback-locator.json" \
    "$(basename -- "${SAFE_RELEASE_DIR}")" \
    "${PAIR_ID}" "${SHA}" \
    "${READ_ONLY_ARTIFACT_DIGEST}" "${WRITE_PROOF_ARTIFACT_DIGEST}" <<'NODE'
import fs from "node:fs";
const [file, safeReleaseName, pairId, frontendSha, readOnlyDigest, writeProofDigest] = process.argv.slice(2);
const payload = {
  schemaVersion: 1,
  safeReleaseName,
  pairId,
  frontendSha,
  readOnlyArtifactDigestSha256: readOnlyDigest,
  writeProofArtifactDigestSha256: writeProofDigest,
};
fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
NODE
  sudo install -d -o root -g root -m 700 "${SAFE_FALLBACK_LOCATOR_DIR}"
  sudo install -o root -g root -m 600 \
    "${TMP_DIR}/safe-fallback-locator.json" \
    "${SAFE_FALLBACK_LOCATOR_DIR}/$(basename -- "${RELEASE_DIR}").json"
  if [[ "$(sudo stat -c '%a' "${SAFE_FALLBACK_LOCATOR_DIR}/$(basename -- "${RELEASE_DIR}").json")" != "600" ]]; then
    echo "Private safe-fallback locator did not retain mode 0600." >&2
    exit 2
  fi
  evidence_append safe_sibling.locator passed "releaseDir=${RELEASE_DIR}"
fi

echo "=== candidate pre-switch browser/auth probe ==="
run_release_probe candidate_pre_switch "${RELEASE_DIR}" "${SHA}" "${ARTIFACT_DIGEST}" true
evidence_append candidate.pre_switch passed "releaseDir=${RELEASE_DIR}"

verify_bff_identity pre_switch
REMOTE_DEV_SHA_AT_SWITCH="$(git ls-remote --exit-code origin refs/heads/dev | awk '{print $1}')"
if [[ "${CONTROLLER_SHA}" != "${REMOTE_DEV_SHA_AT_SWITCH}" ]]; then
  echo "Dev advanced after candidate probe; refusing a switch from a stale controller." >&2
  evidence_append controller.order_at_switch failed "currentDevSha=${REMOTE_DEV_SHA_AT_SWITCH}"
  exit 2
fi
if [[ "${SHA}" != "${REMOTE_DEV_SHA_AT_SWITCH}" && "${EMERGENCY_OVERRIDE}" != "true" ]]; then
  echo "Dev advanced after candidate probe; refusing stale switch." >&2
  evidence_append candidate.order_at_switch failed "currentDevSha=${REMOTE_DEV_SHA_AT_SWITCH}"
  exit 2
fi
if [[ "${SHA}" != "${REMOTE_DEV_SHA_AT_SWITCH}" ]]; then
  evidence_append candidate.order_at_switch overridden "currentDevSha=${REMOTE_DEV_SHA_AT_SWITCH}"
else
  evidence_append candidate.order_at_switch passed "currentDevSha=${REMOTE_DEV_SHA_AT_SWITCH}"
fi
if [[ -n "${LIVE_TARGET_AT_START}" && "$(current_live_target)" != "${LIVE_TARGET_AT_START}" ]]; then
  echo "Live release changed during candidate probe; refusing to overwrite it." >&2
  evidence_append switch.cas failed "observedTarget=$(current_live_target)"
  exit 2
fi

echo "=== atomic live switch ==="
sudo ln -s -- "${RELEASE_DIR}" "${NEXT_LINK}"
NEXT_LINK_CREATED=true
SWITCH_ATTEMPTED=true
if [[ -n "${LIVE_TARGET_AT_START}" ]]; then
  if ! sudo python3 "${SYMLINK_CAS_HELPER}" exchange \
    --live-link "${DEPLOY_ROOT}" \
    --staged-link "${NEXT_LINK}" \
    --expected-live-target "${LIVE_TARGET_AT_START}" \
    --expected-staged-target "${RELEASE_DIR}" >/dev/null; then
    echo "Atomic switch rejected: the exchanged live predecessor did not match." >&2
    evidence_append switch.cas failed "observedTarget=$(current_live_target)"
    exit 2
  fi
else
  if ! sudo python3 "${SYMLINK_CAS_HELPER}" install-if-absent \
    --live-link "${DEPLOY_ROOT}" \
    --staged-link "${NEXT_LINK}" \
    --expected-staged-target "${RELEASE_DIR}" >/dev/null; then
    echo "Atomic bootstrap rejected: the live path was not absent." >&2
    evidence_append switch.cas failed "observedTarget=$(current_live_target)"
    exit 2
  fi
fi
NEXT_LINK_CREATED=false
if [[ "$(current_live_target)" != "${RELEASE_DIR}" ]]; then
  echo "Atomic switch did not select the candidate release." >&2
  evidence_append switch.commit failed
  exit 2
fi
evidence_append switch.commit passed "previousCommit=${PREVIOUS_COMMIT:-bootstrap}"

echo "=== post-switch manifest, BFF, and browser/auth probe ==="
verify_public_manifest "${SHA}" "${ARTIFACT_DIGEST}" "${GATE_RUN_ID}" "${AUDIT_DIR}/post-switch-deployment.json" "${BFF_COMMIT}" candidate "${GITHUB_ARTIFACT_DIGEST}" "${DEPLOY_PROFILE}" "${PAIR_ID}"
verify_bff_identity post_switch
run_release_probe post_switch "" "${SHA}" "${ARTIFACT_DIGEST}" true
verify_bff_identity accepted_final

if [[ "${ROLLBACK_DRILL}" == "true" ]]; then
  evidence_append rollback.drill pending "previousCommit=${PREVIOUS_COMMIT:-bootstrap}"
  echo "Controlled rollback drill: verified candidate switch complete; restoring and re-probing the exact previous release." >&2
  exit 86
fi

PANTHEON_RUNTIME_MANIFEST="${TMP_DIR}/release/deployment.json" \
PANTHEON_RUNTIME_ACCEPTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
node --input-type=module <<'NODE'
import fs from "node:fs";
const file = process.env.PANTHEON_RUNTIME_MANIFEST;
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.deploymentState = "accepted";
manifest.acceptedAt = process.env.PANTHEON_RUNTIME_ACCEPTED_AT;
manifest.probes = {
  candidatePreSwitch: "passed",
  postSwitch: "passed",
  rollbackRequired: false,
};
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE
publish_manifest_atomically \
  "${TMP_DIR}/release/deployment.json" \
  "${RELEASE_DIR}" \
  accepted
verify_public_manifest "${SHA}" "${ARTIFACT_DIGEST}" "${GATE_RUN_ID}" "${AUDIT_DIR}/accepted-deployment.json" "${BFF_COMMIT}" accepted "${GITHUB_ARTIFACT_DIGEST}" "${DEPLOY_PROFILE}" "${PAIR_ID}"
evidence_append release.accepted passed "releaseDir=${RELEASE_DIR}" "previousCommit=${PREVIOUS_COMMIT:-bootstrap}"

cat > "${AUDIT_DIR}/dev-fe-deploy-${TIMESTAMP}.md" <<EOF
# Pantheon Dev FE Deploy

- outcome: accepted
- deployed_at: ${TIMESTAMP}
- commit: ${SHA}
- artifact_digest_sha256: ${ARTIFACT_DIGEST}
- read_only_artifact_digest_sha256: ${READ_ONLY_ARTIFACT_DIGEST}
- operator_live_artifact_digest_sha256: ${OPERATOR_LIVE_ARTIFACT_DIGEST}
- write_proof_artifact_digest_sha256: ${WRITE_PROOF_ARTIFACT_DIGEST}
- pair_id: ${PAIR_ID}
- deployment_profile: ${DEPLOY_PROFILE}
- github_artifact_digest: ${GITHUB_ARTIFACT_DIGEST}
- integration_gate_run_id: ${GATE_RUN_ID}
- bff_commit: ${BFF_COMMIT}
- source_ref: ${SOURCE_REF}
- source_branch: ${SOURCE_BRANCH}
- release_dir: ${RELEASE_DIR}
- previous_commit: ${PREVIOUS_COMMIT:-bootstrap}
- emergency_override: ${EMERGENCY_OVERRIDE}
- real_writes: ${REAL_WRITES}
- allow_dev_stub_writes: ${ALLOW_DEV_STUB_WRITES}
- embedded_bearer_token: false
- candidate_pre_switch_probe: passed
- post_switch_probe: passed
- evidence_log: evidence.jsonl
- evidence_summary: evidence.json
EOF

accept_deployment

if [[ "${KEEP_RELEASES}" =~ ^[0-9]+$ && "${KEEP_RELEASES}" -gt 1 ]]; then
  mapfile -d '' release_entries < <(
    sudo find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d \
      ! -name '.pantheon-safe-locators' -printf '%T@ %p\0' | sort -z -n || true
  )
  remove_count=$((${#release_entries[@]} - KEEP_RELEASES))
  if [[ "${remove_count}" -gt 0 ]]; then
    for ((release_index = 0; release_index < remove_count; release_index += 1)); do
      old_release="${release_entries[${release_index}]#* }"
      if [[ "${old_release}" == "${RELEASE_DIR}" || "${old_release}" == "${PREVIOUS_TARGET}" ]]; then
        continue
      fi
      case "${old_release}" in
        "${RELEASES_DIR}"/*)
          sudo rm -rf -- "${old_release}" || echo "Warning: unable to prune ${old_release}." >&2
          ;;
      esac
    done
  fi
fi

echo "OK: deployed gated candidate ${SHA} (${ARTIFACT_DIGEST}) to ${FE_HOST}"
