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

FE_HOST="${PANTHEON_DEV_FE_HOST:-https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io}"
BFF_HOST="${PANTHEON_BFF_BASE_URL:-https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io}"
OLD_BFF_HOST="${PANTHEON_OLD_BFF_URL:-https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io}"
DEPLOY_ROOT="${PANTHEON_DEV_FE_ROOT:-/var/www/pantheon-dev-fe}"
RELEASES_DIR="${PANTHEON_DEV_FE_RELEASES_DIR:-/var/www/pantheon-dev-fe-releases}"
STRICT_DIR_PREFIX="${PANTHEON_DEV_FE_ROOT_PREFIX:-/var/www/pantheon-dev-fe}"
AUDIT_DIR="${PANTHEON_AUDIT_OUT_DIR:-.lovable/audits/current-run}"
CANDIDATE_INPUT="${PANTHEON_DEPLOY_CANDIDATE_DIR:-}"
SOURCE_REF="${PANTHEON_DEPLOY_REF:-${GITHUB_SHA:-}}"
SOURCE_BRANCH="${PANTHEON_DEPLOY_BRANCH:-dev}"
GATE_RUN_ID="${PANTHEON_DEPLOY_GATE_RUN_ID:-}"
GITHUB_ARTIFACT_DIGEST="${PANTHEON_DEPLOY_GITHUB_ARTIFACT_DIGEST:-}"
EXPECTED_DEV_SHA="${PANTHEON_DEPLOY_EXPECTED_DEV_SHA:-}"
EMERGENCY_OVERRIDE="${PANTHEON_DEPLOY_EMERGENCY_OVERRIDE:-false}"
OVERRIDE_REASON="${PANTHEON_DEPLOY_OVERRIDE_REASON:-}"
OVERRIDE_ACTOR="${PANTHEON_DEPLOY_OVERRIDE_ACTOR:-}"
REAL_WRITES="${PANTHEON_DEPLOY_REAL_WRITES:-false}"
ALLOW_DEV_STUB_WRITES="${PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES:-false}"
SKIP_PROBE="${PANTHEON_DEPLOY_SKIP_PROBE:-false}"
ALLOW_BOOTSTRAP="${PANTHEON_DEPLOY_ALLOW_BOOTSTRAP:-false}"
KEEP_RELEASES="${PANTHEON_DEV_FE_KEEP_RELEASES:-8}"
LOCK_FILE="${PANTHEON_DEPLOY_LOCK_FILE:-/tmp/pantheon-dev-fe-deploy.lock}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SHA="$(git rev-parse HEAD)"
SHORT_SHA="${SHA:0:12}"
RELEASE_INSTANCE="${PANTHEON_DEPLOY_RELEASE_INSTANCE:-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${BASHPID}}"
RELEASE_NAME="${TIMESTAMP}-${SHORT_SHA}-gate-${GATE_RUN_ID}-${RELEASE_INSTANCE}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/execute-plans-dev-fe.XXXXXX")"
EVIDENCE_LOG="${AUDIT_DIR}/evidence.jsonl"
EVIDENCE_SUMMARY="${AUDIT_DIR}/evidence.json"

CANDIDATE_DIR=""
ARTIFACT_DIGEST=""
BFF_COMMIT=""
PREVIOUS_TARGET=""
PREVIOUS_COMMIT=""
PREVIOUS_DIGEST=""
LOCK_ACQUIRED=false
EVIDENCE_INITIALIZED=false
DEPLOY_SWITCHED=false
DEPLOY_ACCEPTED=false
ROLLBACK_RESTORED=false
ROLLBACK_REPROBED=false
NOOP_DEPLOY=false

bool_value() {
  local name="$1"
  local value="${!name}"
  if [[ "${value}" != "true" && "${value}" != "false" ]]; then
    echo "${name} must be true or false" >&2
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

current_live_target() {
  readlink -f "${DEPLOY_ROOT}" 2>/dev/null || true
}

remove_candidate_release() {
  local live_target
  live_target="$(current_live_target)"
  if [[ -n "${RELEASE_DIR}" && "${live_target}" != "${RELEASE_DIR}" ]]; then
    case "${RELEASE_DIR}" in
      "${RELEASES_DIR}"/*) sudo rm -rf -- "${RELEASE_DIR}" ;;
    esac
  fi
}

verify_public_manifest() {
  local expected_sha="$1"
  local expected_digest="${2:-}"
  local expected_gate="${3:-}"
  local output_file="$4"
  curl --fail --silent --show-error --location \
    --retry 3 --retry-all-errors --connect-timeout 5 --max-time 20 \
    "${FE_HOST}/deployment.json?nocache=$(date +%s%N)" > "${output_file}"
  node --input-type=module - "${output_file}" "${expected_sha}" "${expected_digest}" "${expected_gate}" <<'NODE'
import fs from "node:fs";
const [file, expectedSha, expectedDigest, expectedGate] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(file, "utf8"));
const digest = String(payload.artifactDigestSha256 || payload.artifactDigest || "").replace(/^sha256:/i, "").toLowerCase();
if (String(payload.commit || "").toLowerCase() !== expectedSha.toLowerCase()) {
  throw new Error("deployment manifest commit mismatch");
}
if (expectedDigest && digest !== expectedDigest.toLowerCase()) {
  throw new Error("deployment manifest artifact digest mismatch");
}
if (expectedGate && String(payload.integrationGateRunId || "") !== String(expectedGate)) {
  throw new Error("deployment manifest gate run mismatch");
}
if (payload.buildMode?.VITE_BFF_MODE !== "live" || payload.buildMode?.VITE_BFF_FALLBACK !== "strict") {
  throw new Error("deployment manifest is not strict live mode");
}
if (payload.buildMode?.VITE_BFF_REAL_WRITES !== "false" || payload.buildMode?.VITE_BFF_ALLOW_DEV_STUB_WRITES !== "false") {
  throw new Error("deployment manifest write posture is unsafe");
}
if (payload.buildMode?.VITE_BFF_EMBEDDED_BEARER_TOKEN !== "false") {
  throw new Error("deployment manifest bearer posture is unsafe");
}
NODE
}

verify_bff_identity() {
  local stage="$1"
  local output_file="${AUDIT_DIR}/bff-version-${stage}.json"
  curl --fail --silent --show-error --location \
    --retry 3 --retry-all-errors --connect-timeout 5 --max-time 20 \
    "${BFF_HOST%/}/bff/version" > "${output_file}"
  node --input-type=module - "${output_file}" "${BFF_COMMIT}" <<'NODE'
import fs from "node:fs";
const [file, expected] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(file, "utf8"));
const source = String(payload.source_commit_sha || "").toLowerCase();
const alias = String(payload.commit || source).toLowerCase();
if (payload.source_commit_known !== true || !/^[0-9a-f]{40}$/u.test(source)) {
  throw new Error("live BFF does not expose an exact source commit");
}
if (source !== alias || source !== expected.toLowerCase()) {
  throw new Error("live BFF identity differs from gated candidate identity");
}
NODE
  evidence_append "bff.identity.${stage}" passed "bffCommit=${BFF_COMMIT}"
}

run_release_probe() {
  local phase="$1"
  local candidate_dir="$2"
  local expected_sha="$3"
  local expected_digest="$4"
  local strict="$5"
  local json_out="${AUDIT_DIR}/browser-probe-${phase}.json"
  local candidate_env=""
  if [[ -n "${candidate_dir}" ]]; then
    candidate_env="${candidate_dir}"
  fi
  if ! PANTHEON_FE_BASE_URL="${FE_HOST}" \
    PANTHEON_BFF_BASE_URL="${BFF_HOST}" \
    PANTHEON_BROWSER_BFF_BASE_URL="${BFF_HOST}" \
    PANTHEON_OLD_BFF_URL="${OLD_BFF_HOST}" \
    PANTHEON_HOSTED_PROBE_PATH="${PANTHEON_HOSTED_PROBE_PATH:-/management/persona-fleet}" \
    PANTHEON_HOSTED_REQUIRED_BFF_PATHS="${PANTHEON_HOSTED_REQUIRED_BFF_PATHS:-/bff/me}" \
    PANTHEON_PROBE_NOCACHE_SHA="${expected_sha}" \
    PANTHEON_EXPECTED_FE_SHA="${expected_sha}" \
    PANTHEON_EXPECTED_ARTIFACT_DIGEST="${expected_digest}" \
    PANTHEON_PROBE_RELEASE_STRICT="${strict}" \
    PANTHEON_CANDIDATE_DIR="${candidate_env}" \
    PANTHEON_PROBE_JSON_OUT="${json_out}" \
    PANTHEON_AUDIT_OUT_DIR="${AUDIT_DIR}" \
    node scripts/probe-hosted-browser-bff.mjs; then
    evidence_append "browser.probe.${phase}" failed "frontendSha=${expected_sha}" "artifactDigestSha256=${expected_digest:-legacy}"
    return 1
  fi
  evidence_append "browser.probe.${phase}" passed "frontendSha=${expected_sha}" "artifactDigestSha256=${expected_digest:-legacy}"
}

rollback_release() {
  local current_target
  local rollback_strict=false
  evidence_append rollback.started pending "previousCommit=${PREVIOUS_COMMIT:-unknown}"
  current_target="$(current_live_target)"
  if [[ "${current_target}" != "${RELEASE_DIR}" ]]; then
    evidence_append rollback.cas_rejected failed "observedTarget=${current_target:-missing}"
    echo "Rollback refused: live target changed outside this deployment." >&2
    return 1
  fi
  if [[ -z "${PREVIOUS_TARGET}" || ! -d "${PREVIOUS_TARGET}" ]]; then
    sudo rm -f -- "${DEPLOY_ROOT}"
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

  sudo ln -sfn "${PREVIOUS_TARGET}" "${DEPLOY_ROOT}.rollback"
  if [[ "$(current_live_target)" != "${RELEASE_DIR}" ]]; then
    sudo rm -f -- "${DEPLOY_ROOT}.rollback"
    evidence_append rollback.cas_rejected failed "observedTarget=$(current_live_target)"
    echo "Rollback refused: live target changed before rollback commit." >&2
    return 1
  fi
  sudo mv -Tf "${DEPLOY_ROOT}.rollback" "${DEPLOY_ROOT}"
  if [[ "$(current_live_target)" != "${PREVIOUS_TARGET}" ]]; then
    evidence_append rollback.switch failed
    return 1
  fi
  ROLLBACK_RESTORED=true
  evidence_append rollback.switch passed "previousCommit=${PREVIOUS_COMMIT}"

  if ! verify_public_manifest "${PREVIOUS_COMMIT}" "${PREVIOUS_DIGEST}" "" "${AUDIT_DIR}/rollback-deployment.json"; then
    evidence_append rollback.manifest failed "previousCommit=${PREVIOUS_COMMIT}"
    return 1
  fi
  evidence_append rollback.manifest passed "previousCommit=${PREVIOUS_COMMIT}"
  if [[ "${PREVIOUS_DIGEST}" =~ ^[0-9a-f]{64}$ ]]; then
    rollback_strict=true
  fi
  if ! run_release_probe rollback "" "${PREVIOUS_COMMIT}" "${PREVIOUS_DIGEST}" "${rollback_strict}"; then
    evidence_append rollback.reprobe failed "previousCommit=${PREVIOUS_COMMIT}"
    return 1
  fi
  ROLLBACK_REPROBED=true
  evidence_append rollback.reprobe passed "previousCommit=${PREVIOUS_COMMIT}"
}

cleanup() {
  local status=$?
  local outcome=accepted
  set +e
  trap - EXIT INT TERM

  sudo rm -f -- "${DEPLOY_ROOT}.next" "${DEPLOY_ROOT}.rollback" 2>/dev/null || true

  if [[ "${status}" -ne 0 && "${DEPLOY_SWITCHED}" == "true" && "${DEPLOY_ACCEPTED}" != "true" ]]; then
    if rollback_release; then
      outcome=rolled_back
    elif [[ "${ROLLBACK_RESTORED}" == "true" ]]; then
      outcome=rollback_probe_failed
    else
      outcome=rollback_failed
    fi
  elif [[ "${status}" -ne 0 ]]; then
    outcome=rejected_before_switch
  fi

  if [[ "${status}" -ne 0 ]]; then
    evidence_append release.failed failed "outcome=${outcome}"
    remove_candidate_release
  else
    evidence_append release.completed passed "outcome=accepted"
  fi

  if [[ "${EVIDENCE_INITIALIZED}" == "true" ]]; then
    node scripts/release-evidence.mjs finalize \
      --log "${EVIDENCE_LOG}" \
      --summary "${EVIDENCE_SUMMARY}" \
      --outcome "${outcome}" >/dev/null || status=1
  fi
  rm -rf "${TMP_DIR}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for boolean_name in EMERGENCY_OVERRIDE REAL_WRITES ALLOW_DEV_STUB_WRITES SKIP_PROBE ALLOW_BOOTSTRAP; do
  bool_value "${boolean_name}"
done

if [[ "${REAL_WRITES}" != "false" || "${ALLOW_DEV_STUB_WRITES}" != "false" ]]; then
  echo "Automated dev deployment is read-only; real and dev-stub writes must remain false." >&2
  exit 2
fi
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

if [[ "${DEPLOY_ROOT}" != "${STRICT_DIR_PREFIX}" && "${DEPLOY_ROOT}" != "${STRICT_DIR_PREFIX}/"* ]]; then
  echo "Refusing to deploy outside allowed root prefix: ${DEPLOY_ROOT}" >&2
  exit 2
fi
if [[ ! "${SHA}" =~ ^[0-9a-f]{40}$ || "${SOURCE_REF}" != "${SHA}" ]]; then
  echo "Deployment checkout must equal the exact candidate SHA." >&2
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
if [[ -n "${EXPECTED_DEV_SHA}" && ! "${EXPECTED_DEV_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected dev identity must be an exact SHA." >&2
  exit 2
fi
if [[ "${EMERGENCY_OVERRIDE}" == "true" && ( ${#OVERRIDE_REASON} -lt 20 || -z "${OVERRIDE_ACTOR}" ) ]]; then
  echo "Emergency override requires an actor and an audited reason." >&2
  exit 2
fi
if [[ "${EMERGENCY_OVERRIDE}" != "true" && ( -n "${OVERRIDE_REASON}" || -n "${OVERRIDE_ACTOR}" ) ]]; then
  echo "Override metadata is invalid without emergency_override=true." >&2
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

for command_name in npm node rsync sudo curl flock git readlink; do
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
if [[ ! -d "${CANDIDATE_DIR}/dist" || ! -f "${CANDIDATE_DIR}/candidate.json" ]]; then
  echo "Downloaded release candidate is incomplete." >&2
  exit 2
fi

ARTIFACT_DIGEST="$(node scripts/release-candidate.mjs verify \
  --candidate-dir "${CANDIDATE_DIR}" \
  --expected-frontend-sha "${SHA}" \
  --expected-gate-run-id "${GATE_RUN_ID}")"
if [[ ! "${ARTIFACT_DIGEST}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Candidate verifier did not return one exact artifact digest." >&2
  exit 2
fi
BFF_COMMIT="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.bffSha||p.bffCommit||"").toLowerCase();if(!/^[0-9a-f]{40}$/.test(s))process.exit(1);process.stdout.write(s)' "${CANDIDATE_DIR}/candidate.json")"

OVERRIDE_REASON_SHA256=""
if [[ -n "${OVERRIDE_REASON}" ]]; then
  OVERRIDE_REASON_SHA256="$(node -e 'const crypto=require("node:crypto");process.stdout.write(crypto.createHash("sha256").update(process.argv[1]).digest("hex"))' "${OVERRIDE_REASON}")"
fi
node scripts/release-evidence.mjs init \
  --log "${EVIDENCE_LOG}" \
  --detail "candidateSha=${SHA}" \
  --detail "integrationGateRunId=${GATE_RUN_ID}" \
  --detail "artifactDigestSha256=${ARTIFACT_DIGEST}" \
  --detail "githubArtifactDigest=${GITHUB_ARTIFACT_DIGEST}" \
  --detail "emergencyOverride=${EMERGENCY_OVERRIDE}" \
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

REMOTE_DEV_SHA="$(git ls-remote --exit-code origin refs/heads/dev | awk '{print $1}')"
if [[ ! "${REMOTE_DEV_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Unable to resolve current origin/dev." >&2
  exit 2
fi
if [[ "${SHA}" != "${REMOTE_DEV_SHA}" && "${EMERGENCY_OVERRIDE}" != "true" ]]; then
  echo "Out-of-order candidate rejected: dev=${REMOTE_DEV_SHA} candidate=${SHA}." >&2
  evidence_append candidate.order failed "currentDevSha=${REMOTE_DEV_SHA}"
  exit 2
fi
if [[ -n "${EXPECTED_DEV_SHA}" && "${EXPECTED_DEV_SHA}" != "${REMOTE_DEV_SHA}" && "${EMERGENCY_OVERRIDE}" != "true" ]]; then
  echo "Dev advanced after workflow validation; refusing stale deployment." >&2
  evidence_append candidate.order failed "currentDevSha=${REMOTE_DEV_SHA}" "validatedDevSha=${EXPECTED_DEV_SHA}"
  exit 2
fi
evidence_append candidate.order passed "currentDevSha=${REMOTE_DEV_SHA}"

if [[ -L "${DEPLOY_ROOT}" ]]; then
  PREVIOUS_TARGET="$(current_live_target)"
  case "${PREVIOUS_TARGET}" in
    "${RELEASES_DIR}"/*) ;;
    *) echo "Current deploy symlink is outside the release store." >&2; exit 2 ;;
  esac
  if [[ ! -d "${PREVIOUS_TARGET}" || ! -f "${PREVIOUS_TARGET}/deployment.json" ]]; then
    echo "Current deploy target is not a qualified release." >&2
    exit 2
  fi
  PREVIOUS_COMMIT="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.commit||"").toLowerCase();if(!/^[0-9a-f]{40}$/.test(s))process.exit(1);if(p.buildMode?.VITE_BFF_REAL_WRITES!=="false"||p.buildMode?.VITE_BFF_ALLOW_DEV_STUB_WRITES!=="false"||p.buildMode?.VITE_BFF_EMBEDDED_BEARER_TOKEN!=="false")process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
  PREVIOUS_DIGEST="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=String(p.artifactDigestSha256||p.artifactDigest||"").replace(/^sha256:/i,"").toLowerCase();if(s&&!/^[0-9a-f]{64}$/.test(s))process.exit(1);process.stdout.write(s)' "${PREVIOUS_TARGET}/deployment.json")"
elif [[ ! -e "${DEPLOY_ROOT}" && "${ALLOW_BOOTSTRAP}" == "true" ]]; then
  evidence_append previous_release bootstrap "deployRoot=${DEPLOY_ROOT}"
elif [[ ! -e "${DEPLOY_ROOT}" ]]; then
  echo "No rollback target exists; bootstrap requires explicit PANTHEON_DEPLOY_ALLOW_BOOTSTRAP=true." >&2
  exit 2
else
  echo "Deploy root must be a managed symlink; manual legacy conversion is required." >&2
  exit 2
fi

if [[ -n "${PREVIOUS_COMMIT}" ]]; then
  if [[ "${PREVIOUS_COMMIT}" == "${SHA}" ]]; then
    if [[ -n "${PREVIOUS_DIGEST}" && "${PREVIOUS_DIGEST}" == "${ARTIFACT_DIGEST}" ]]; then
      NOOP_DEPLOY=true
      evidence_append candidate.noop pending "previousCommit=${PREVIOUS_COMMIT}"
    else
      echo "Same-SHA artifact replacement rejected because the served digest differs or is unproven." >&2
      evidence_append candidate.reproducibility failed "previousCommit=${PREVIOUS_COMMIT}"
      exit 2
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

echo "=== install probe dependencies ==="
npm ci
npx playwright install chromium

verify_bff_identity pre_candidate

if [[ "${NOOP_DEPLOY}" == "true" ]]; then
  echo "=== exact live candidate no-op revalidation ==="
  verify_public_manifest "${SHA}" "${ARTIFACT_DIGEST}" "${GATE_RUN_ID}" "${AUDIT_DIR}/noop-deployment.json"
  run_release_probe noop "" "${SHA}" "${ARTIFACT_DIGEST}" true
  verify_bff_identity noop_final
  evidence_append candidate.noop passed "previousCommit=${PREVIOUS_COMMIT}"
  cat > "${AUDIT_DIR}/dev-fe-deploy-${TIMESTAMP}.md" <<EOF
# Pantheon Dev FE Deploy

- outcome: accepted_noop
- verified_at: ${TIMESTAMP}
- commit: ${SHA}
- artifact_digest_sha256: ${ARTIFACT_DIGEST}
- github_artifact_digest: ${GITHUB_ARTIFACT_DIGEST}
- integration_gate_run_id: ${GATE_RUN_ID}
- bff_commit: ${BFF_COMMIT}
- release_dir: ${PREVIOUS_TARGET}
- real_writes: false
- allow_dev_stub_writes: false
- embedded_bearer_token: false
- live_manifest_probe: passed
- browser_auth_probe: passed
- evidence_log: evidence.jsonl
- evidence_summary: evidence.json
EOF
  DEPLOY_ACCEPTED=true
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
PANTHEON_RUNTIME_GITHUB_DIGEST="${GITHUB_ARTIFACT_DIGEST}" \
PANTHEON_RUNTIME_EMERGENCY_OVERRIDE="${EMERGENCY_OVERRIDE}" \
PANTHEON_RUNTIME_OVERRIDE_ACTOR="${OVERRIDE_ACTOR}" \
PANTHEON_RUNTIME_OVERRIDE_REASON_SHA256="${OVERRIDE_REASON_SHA256}" \
  node --input-type=module <<'NODE'
import fs from "node:fs";
const file = process.env.PANTHEON_RUNTIME_MANIFEST;
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.deploymentState = "candidate";
manifest.releaseName = process.env.PANTHEON_RUNTIME_RELEASE_NAME;
manifest.deployedAt = process.env.PANTHEON_RUNTIME_DEPLOYED_AT;
manifest.previousCommit = process.env.PANTHEON_RUNTIME_PREVIOUS_COMMIT || null;
manifest.previousArtifactDigest = process.env.PANTHEON_RUNTIME_PREVIOUS_DIGEST || null;
manifest.githubArtifactDigest = process.env.PANTHEON_RUNTIME_GITHUB_DIGEST;
manifest.emergencyOverride = {
  enabled: process.env.PANTHEON_RUNTIME_EMERGENCY_OVERRIDE === "true",
  actor: process.env.PANTHEON_RUNTIME_OVERRIDE_ACTOR || null,
  reasonSha256: process.env.PANTHEON_RUNTIME_OVERRIDE_REASON_SHA256 || null,
};
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE
sudo install -d -o root -g root -m 775 "${RELEASE_DIR}"
sudo rsync -a --delete --chown=root:root --chmod=Du=rwx,Dg=rwx,Do=rx,Fu=rw,Fg=rw,Fo=r \
  "${TMP_DIR}/release/" "${RELEASE_DIR}/"

echo "=== candidate pre-switch browser/auth probe ==="
run_release_probe candidate_pre_switch "${RELEASE_DIR}" "${SHA}" "${ARTIFACT_DIGEST}" true
evidence_append candidate.pre_switch passed "releaseDir=${RELEASE_DIR}"

verify_bff_identity pre_switch
REMOTE_DEV_SHA_AT_SWITCH="$(git ls-remote --exit-code origin refs/heads/dev | awk '{print $1}')"
if [[ "${SHA}" != "${REMOTE_DEV_SHA_AT_SWITCH}" && "${EMERGENCY_OVERRIDE}" != "true" ]]; then
  echo "Dev advanced after candidate probe; refusing stale switch." >&2
  evidence_append candidate.order_at_switch failed "currentDevSha=${REMOTE_DEV_SHA_AT_SWITCH}"
  exit 2
fi
if [[ -n "${PREVIOUS_TARGET}" && "$(current_live_target)" != "${PREVIOUS_TARGET}" ]]; then
  echo "Live release changed during candidate probe; refusing to overwrite it." >&2
  evidence_append switch.cas failed "observedTarget=$(current_live_target)"
  exit 2
fi

echo "=== atomic live switch ==="
sudo ln -sfn "${RELEASE_DIR}" "${DEPLOY_ROOT}.next"
if [[ -n "${PREVIOUS_TARGET}" && "$(current_live_target)" != "${PREVIOUS_TARGET}" ]]; then
  sudo rm -f -- "${DEPLOY_ROOT}.next"
  echo "Live release changed before switch commit; refusing to overwrite it." >&2
  evidence_append switch.cas failed "observedTarget=$(current_live_target)"
  exit 2
fi
sudo mv -Tf "${DEPLOY_ROOT}.next" "${DEPLOY_ROOT}"
DEPLOY_SWITCHED=true
if [[ "$(current_live_target)" != "${RELEASE_DIR}" ]]; then
  echo "Atomic switch did not select the candidate release." >&2
  evidence_append switch.commit failed
  exit 2
fi
evidence_append switch.commit passed "previousCommit=${PREVIOUS_COMMIT:-bootstrap}"

echo "=== post-switch manifest, BFF, and browser/auth probe ==="
verify_public_manifest "${SHA}" "${ARTIFACT_DIGEST}" "${GATE_RUN_ID}" "${AUDIT_DIR}/post-switch-deployment.json"
verify_bff_identity post_switch
run_release_probe post_switch "" "${SHA}" "${ARTIFACT_DIGEST}" true

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
sudo install -o root -g root -m 664 "${TMP_DIR}/release/deployment.json" "${RELEASE_DIR}/deployment.json"
verify_public_manifest "${SHA}" "${ARTIFACT_DIGEST}" "${GATE_RUN_ID}" "${AUDIT_DIR}/accepted-deployment.json"
evidence_append release.accepted passed "releaseDir=${RELEASE_DIR}" "previousCommit=${PREVIOUS_COMMIT:-bootstrap}"

if [[ "${KEEP_RELEASES}" =~ ^[0-9]+$ && "${KEEP_RELEASES}" -gt 1 ]]; then
  mapfile -t old_releases < <(sudo find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -n | awk '{print $2}' | head -n "-${KEEP_RELEASES}" || true)
  for old_release in "${old_releases[@]}"; do
    if [[ "${old_release}" == "${RELEASE_DIR}" || "${old_release}" == "${PREVIOUS_TARGET}" ]]; then
      continue
    fi
    case "${old_release}" in
      "${RELEASES_DIR}"/*) sudo rm -rf -- "${old_release}" ;;
    esac
  done
fi

cat > "${AUDIT_DIR}/dev-fe-deploy-${TIMESTAMP}.md" <<EOF
# Pantheon Dev FE Deploy

- outcome: accepted
- deployed_at: ${TIMESTAMP}
- commit: ${SHA}
- artifact_digest_sha256: ${ARTIFACT_DIGEST}
- github_artifact_digest: ${GITHUB_ARTIFACT_DIGEST}
- integration_gate_run_id: ${GATE_RUN_ID}
- bff_commit: ${BFF_COMMIT}
- source_ref: ${SOURCE_REF}
- source_branch: ${SOURCE_BRANCH}
- release_dir: ${RELEASE_DIR}
- previous_commit: ${PREVIOUS_COMMIT:-bootstrap}
- emergency_override: ${EMERGENCY_OVERRIDE}
- real_writes: false
- allow_dev_stub_writes: false
- embedded_bearer_token: false
- candidate_pre_switch_probe: passed
- post_switch_probe: passed
- evidence_log: evidence.jsonl
- evidence_summary: evidence.json
EOF

DEPLOY_ACCEPTED=true
echo "OK: deployed gated candidate ${SHA} (${ARTIFACT_DIGEST}) to ${FE_HOST}"
