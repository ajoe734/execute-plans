#!/usr/bin/env bash
# Deploy execute-plans to the Pantheon dev VM static FE host.
#
# This script is intended to run on the Pantheon dev VM through the
# execute-plans self-hosted GitHub Actions runner. It builds the Vite bundle,
# installs it as an immutable release under /var/www, switches the Caddy root
# symlink, and then probes the deployed host against the dev BFF.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

FE_HOST="${PANTHEON_DEV_FE_HOST:-https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io}"
BFF_HOST="${PANTHEON_BFF_BASE_URL:-https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io}"
BFF_HOST="${BFF_HOST%/}"
OLD_BFF_HOST="${PANTHEON_OLD_BFF_URL:-https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io}"
DEPLOY_ROOT="${PANTHEON_DEV_FE_ROOT:-/var/www/pantheon-dev-fe}"
RELEASES_DIR="${PANTHEON_DEV_FE_RELEASES_DIR:-/var/www/pantheon-dev-fe-releases}"
AUDIT_DIR="${PANTHEON_AUDIT_OUT_DIR:-.lovable/audits/current-run}"
STRICT_DIR_PREFIX="${PANTHEON_DEV_FE_ROOT_PREFIX:-/var/www/pantheon-dev-fe}"
SOURCE_REF="${PANTHEON_DEPLOY_REF:-${GITHUB_SHA:-}}"
SOURCE_BRANCH="${PANTHEON_DEPLOY_BRANCH:-${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo unknown)}}"
ALLOW_DIRTY="${PANTHEON_DEPLOY_ALLOW_DIRTY:-false}"
SKIP_PROBE="${PANTHEON_DEPLOY_SKIP_PROBE:-false}"
KEEP_RELEASES="${PANTHEON_DEV_FE_KEEP_RELEASES:-8}"
PRESERVE_ASSETS="${PANTHEON_DEV_FE_PRESERVE_ASSETS:-true}"
LOCK_FILE="${PANTHEON_DEPLOY_LOCK_FILE:-/tmp/pantheon-dev-fe-deploy.lock}"
# VITE_* values are embedded in the public browser bundle. The baked fallback
# may therefore be empty or a least-privilege viewer identity only. Operators
# authenticate through an interactive/session credential that is never part of
# the build environment.
DEV_BEARER_TOKEN="${VITE_BFF_DEV_BEARER_TOKEN-pantheon-dev-browser:viewer}"
WRITE_PROBE_AUTH_TOKEN="${PANTHEON_DEPLOY_WRITE_PROBE_AUTH_TOKEN:-}"
unset PANTHEON_DEPLOY_WRITE_PROBE_AUTH_TOKEN
export -n WRITE_PROBE_AUTH_TOKEN 2>/dev/null || true
REAL_WRITES="${PANTHEON_DEPLOY_REAL_WRITES:-false}"
ALLOW_DEV_STUB_WRITES="${PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES:-false}"
RELEASE_IDENTITY_FILE="${PANTHEON_RELEASE_IDENTITY_FILE:-}"
RELEASE_GATE_RUN_ID="${PANTHEON_RELEASE_GATE_RUN_ID:-}"
BFF_VERSION_URL="${BFF_HOST%/}/bff/version"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SHA="$(git rev-parse HEAD)"
SHORT_SHA="${SHA:0:12}"
RELEASE_INSTANCE="${PANTHEON_DEPLOY_RELEASE_INSTANCE:-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${BASHPID}}"
RELEASE_NAME="${TIMESTAMP}-${SHORT_SHA}-${RELEASE_INSTANCE}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/execute-plans-dev-fe.XXXXXX")"
LOCK_ACQUIRED=false
DEPLOY_SWITCHED=false
LEGACY_ROOT_MOVED=false
PREVIOUS_DEPLOY_TARGET=""
EXPECTED_BFF_SHA=""

cleanup() {
  local status=$?
  local current_target=""
  local rollback_status=0
  set +e

  if [[ "${status}" -ne 0 && "${LOCK_ACQUIRED}" == "true" ]]; then
    if [[ "${DEPLOY_SWITCHED}" == "true" ]]; then
      current_target="$(readlink -f "${DEPLOY_ROOT}" 2>/dev/null || true)"
      if [[ "${current_target}" == "${RELEASE_DIR}" && -n "${PREVIOUS_DEPLOY_TARGET}" && -d "${PREVIOUS_DEPLOY_TARGET}" ]]; then
        echo "Deploy failed after the host switch; rolling back to ${PREVIOUS_DEPLOY_TARGET}." >&2
        sudo ln -sfn "${PREVIOUS_DEPLOY_TARGET}" "${DEPLOY_ROOT}.rollback" || rollback_status=$?
        if [[ "${rollback_status}" -eq 0 ]]; then
          current_target="$(readlink -f "${DEPLOY_ROOT}" 2>/dev/null || true)"
          if [[ "${current_target}" == "${RELEASE_DIR}" ]]; then
            sudo mv -Tf "${DEPLOY_ROOT}.rollback" "${DEPLOY_ROOT}" || rollback_status=$?
          else
            echo "Live target changed during rollback; refusing to overwrite ${current_target:-<unresolved>}." >&2
            sudo rm -f -- "${DEPLOY_ROOT}.rollback"
            rollback_status=1
          fi
        fi
        if [[ "${rollback_status}" -eq 0 && "$(readlink -f "${DEPLOY_ROOT}" 2>/dev/null || true)" == "${PREVIOUS_DEPLOY_TARGET}" ]]; then
          echo "Rollback restored ${PREVIOUS_DEPLOY_TARGET}." >&2
        else
          echo "Rollback failed; inspect ${DEPLOY_ROOT} before another deployment." >&2
        fi
      elif [[ "${current_target}" == "${RELEASE_DIR}" ]]; then
        echo "Deploy failed after the host switch and no prior release is available; removing the candidate symlink." >&2
        sudo rm -f -- "${DEPLOY_ROOT}" || rollback_status=$?
      elif [[ "${LEGACY_ROOT_MOVED}" == "true" && ! -e "${DEPLOY_ROOT}" && ! -L "${DEPLOY_ROOT}" && -d "${PREVIOUS_DEPLOY_TARGET}" ]]; then
        echo "Deploy failed during the legacy-root transition; restoring ${DEPLOY_ROOT}." >&2
        sudo mv "${PREVIOUS_DEPLOY_TARGET}" "${DEPLOY_ROOT}" || rollback_status=$?
      elif [[ -n "${PREVIOUS_DEPLOY_TARGET}" && "${current_target}" == "${PREVIOUS_DEPLOY_TARGET}" ]]; then
        echo "Deploy failed before the live switch completed; keeping ${PREVIOUS_DEPLOY_TARGET}." >&2
      elif [[ -z "${PREVIOUS_DEPLOY_TARGET}" && -z "${current_target}" ]]; then
        echo "Deploy failed before the first live switch completed; no live target was changed." >&2
      else
        echo "Deploy failed, but the live target changed externally; refusing to overwrite ${current_target:-<unresolved>}." >&2
      fi
    fi

    sudo rm -f -- "${DEPLOY_ROOT}.next" "${DEPLOY_ROOT}.rollback"
    if [[ "$(readlink -f "${DEPLOY_ROOT}" 2>/dev/null || true)" != "${RELEASE_DIR}" ]]; then
      case "${RELEASE_DIR}" in
        "${RELEASES_DIR}"/*) sudo rm -rf -- "${RELEASE_DIR}" ;;
      esac
    fi
  fi

  rm -rf "${TMP_DIR}"
  trap - EXIT
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

verify_live_bff_identity() {
  local phase="$1"
  local version_file="${TMP_DIR}/bff-version-${phase}.json"
  local actual_bff_sha

  curl --fail --silent --show-error --location \
    --retry 3 --retry-all-errors --connect-timeout 5 --max-time 20 \
    "${BFF_VERSION_URL}" > "${version_file}"
  cp "${version_file}" "${AUDIT_DIR}/bff-version-${phase}.json"
  actual_bff_sha="$(node scripts/release-identity.mjs verify-version \
    --identity-file "${RELEASE_IDENTITY_FILE}" \
    --version-file "${version_file}" \
    --frontend-sha "${SHA}" \
    --bff-base-url "${BFF_HOST}" \
    --gate-run-id "${RELEASE_GATE_RUN_ID}")"
  echo "BFF identity ${phase}: ${actual_bff_sha}"
}

if [[ "${DEPLOY_ROOT}" != "${STRICT_DIR_PREFIX}" && "${DEPLOY_ROOT}" != "${STRICT_DIR_PREFIX}/"* ]]; then
  echo "Refusing to deploy outside allowed root prefix: ${DEPLOY_ROOT}" >&2
  exit 2
fi

for boolean_name in REAL_WRITES ALLOW_DEV_STUB_WRITES SKIP_PROBE; do
  boolean_value="${!boolean_name}"
  if [[ "${boolean_value}" != "true" && "${boolean_value}" != "false" ]]; then
    echo "${boolean_name} must be true or false; got ${boolean_value}" >&2
    exit 2
  fi
done

if [[ -n "${DEV_BEARER_TOKEN}" && "${DEV_BEARER_TOKEN}" != "pantheon-dev-browser:viewer" ]]; then
  echo "Refusing to embed a non-canonical VITE_BFF_DEV_BEARER_TOKEN in the public frontend bundle." >&2
  exit 2
fi

if [[ "${REAL_WRITES}" == "true" && "${SKIP_PROBE}" != "true" && -z "${WRITE_PROBE_AUTH_TOKEN}" ]]; then
  echo "PANTHEON_DEPLOY_WRITE_PROBE_AUTH_TOKEN is required for an explicitly enabled write probe." >&2
  exit 2
fi

if [[ ! "${RELEASE_INSTANCE}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "PANTHEON_DEPLOY_RELEASE_INSTANCE contains unsafe path characters: ${RELEASE_INSTANCE}" >&2
  exit 2
fi

if [[ "${ALLOW_DEV_STUB_WRITES}" == "true" && "${REAL_WRITES}" != "true" ]]; then
  echo "Refusing PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES=true unless real writes are explicitly enabled." >&2
  exit 2
fi

if [[ "${REAL_WRITES}" == "true" && "${SKIP_PROBE}" == "true" ]]; then
  echo "Refusing real-write deployment with PANTHEON_DEPLOY_SKIP_PROBE=true." >&2
  exit 2
fi

if [[ -z "${RELEASE_IDENTITY_FILE}" || ! -f "${RELEASE_IDENTITY_FILE}" ]]; then
  echo "PANTHEON_RELEASE_IDENTITY_FILE must name the exact integration-gate identity artifact." >&2
  exit 2
fi

if [[ -z "${RELEASE_GATE_RUN_ID}" ]]; then
  echo "PANTHEON_RELEASE_GATE_RUN_ID is required to bind the downloaded identity to its gate run." >&2
  exit 2
fi

mkdir -p "${AUDIT_DIR}"

if [[ "${ALLOW_DIRTY}" != "true" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Refusing to deploy from a dirty checkout. Set PANTHEON_DEPLOY_ALLOW_DIRTY=true only for emergency VM repair." >&2
    git status -sb >&2
    exit 2
  fi
fi

for command_name in npm node rsync sudo curl flock; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 2
  fi
done

EXPECTED_BFF_SHA="$(node scripts/release-identity.mjs validate \
  --identity-file "${RELEASE_IDENTITY_FILE}" \
  --frontend-sha "${SHA}" \
  --bff-base-url "${BFF_HOST}" \
  --gate-run-id "${RELEASE_GATE_RUN_ID}")"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another dev frontend deployment holds ${LOCK_FILE}; refusing a concurrent deploy." >&2
  exit 2
fi
LOCK_ACQUIRED=true
cp "${RELEASE_IDENTITY_FILE}" "${AUDIT_DIR}/gated-release-identity.json"

echo "=== execute-plans dev FE deploy ==="
echo "commit: ${SHA}"
echo "source ref: ${SOURCE_REF:-${SHA}}"
echo "source branch: ${SOURCE_BRANCH}"
echo "FE host: ${FE_HOST}"
echo "BFF host: ${BFF_HOST}"
echo "gated BFF commit: ${EXPECTED_BFF_SHA}"
echo "integration gate run: ${RELEASE_GATE_RUN_ID}"
echo "release: ${RELEASE_DIR}"

echo "=== install dependencies ==="
npm ci

if [[ "${SKIP_PROBE}" != "true" ]]; then
  echo "=== ensure Playwright Chromium for deployed-host probe ==="
  npx playwright install chromium
fi

echo "=== build strict live dev bundle ==="
VITE_BFF_MODE=live \
VITE_BFF_BASE_URL="${BFF_HOST}" \
VITE_BFF_FALLBACK=strict \
VITE_BFF_REAL_WRITES="${REAL_WRITES}" \
VITE_BFF_ALLOW_DEV_STUB_WRITES="${ALLOW_DEV_STUB_WRITES}" \
VITE_BFF_DEV_BEARER_TOKEN="${DEV_BEARER_TOKEN}" \
npm run build

export PANTHEON_DEPLOYED_AT="${TIMESTAMP}"
export PANTHEON_DEPLOY_COMMIT="${SHA}"
export PANTHEON_DEPLOY_SOURCE_REF="${SOURCE_REF:-${SHA}}"
export PANTHEON_DEPLOY_SOURCE_BRANCH="${SOURCE_BRANCH}"
export PANTHEON_DEPLOY_FE_HOST="${FE_HOST}"
export PANTHEON_DEPLOY_BFF_HOST="${BFF_HOST}"
export PANTHEON_DEPLOY_BFF_SHA="${EXPECTED_BFF_SHA}"
export PANTHEON_DEPLOY_IDENTITY_FILE="${RELEASE_IDENTITY_FILE}"
export PANTHEON_DEPLOY_REAL_WRITES="${REAL_WRITES}"
export PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES="${ALLOW_DEV_STUB_WRITES}"

node --input-type=module <<'NODE'
import fs from "node:fs";

const releaseIdentity = JSON.parse(
  fs.readFileSync(process.env.PANTHEON_DEPLOY_IDENTITY_FILE, "utf8"),
);

const metadata = {
  app: "execute-plans",
  environment: "pantheon-dev-fe",
  deployedAt: process.env.PANTHEON_DEPLOYED_AT,
  commit: process.env.PANTHEON_DEPLOY_COMMIT,
  sourceRef: process.env.PANTHEON_DEPLOY_SOURCE_REF,
  sourceBranch: process.env.PANTHEON_DEPLOY_SOURCE_BRANCH,
  feHost: process.env.PANTHEON_DEPLOY_FE_HOST,
  bffHost: process.env.PANTHEON_DEPLOY_BFF_HOST,
  bffSourceCommitSha: process.env.PANTHEON_DEPLOY_BFF_SHA,
  releaseIdentity,
  buildMode: {
    VITE_BFF_MODE: "live",
    VITE_BFF_FALLBACK: "strict",
    VITE_BFF_REAL_WRITES: process.env.PANTHEON_DEPLOY_REAL_WRITES,
    VITE_BFF_ALLOW_DEV_STUB_WRITES: process.env.PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES,
  },
};

fs.writeFileSync("dist/deployment.json", `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
NODE

echo "=== install release ==="
rsync -a --delete dist/ "${TMP_DIR}/"
sudo install -d -o root -g root -m 775 "${RELEASES_DIR}"
sudo install -d -o root -g root -m 775 "${RELEASE_DIR}"

if [[ "${PRESERVE_ASSETS}" == "true" ]]; then
  echo "=== preserve retained hashed assets ==="
  # Old browser tabs may still request prior Vite chunks after the symlink switch.
  mkdir -p "${TMP_DIR}/assets"
  mapfile -t retained_asset_dirs < <(sudo find "${RELEASES_DIR}" -mindepth 2 -maxdepth 2 -type d -name assets -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2- || true)
  preserved_asset_dirs=0
  for retained_asset_dir in "${retained_asset_dirs[@]}"; do
    case "${retained_asset_dir}" in
      "${RELEASE_DIR}/assets") continue ;;
      "${RELEASES_DIR}"/*/assets) ;;
      *) continue ;;
    esac

    rsync -rt --ignore-existing "${retained_asset_dir}/" "${TMP_DIR}/assets/"
    preserved_asset_dirs=$((preserved_asset_dirs + 1))
  done
  echo "preserved hashed assets from ${preserved_asset_dirs} retained release(s)"
fi

sudo rsync -a --delete --chown=root:root --chmod=Du=rwx,Dg=rwx,Do=rx,Fu=rw,Fg=rw,Fo=r "${TMP_DIR}/" "${RELEASE_DIR}/"

echo "=== verify exact BFF identity before live switch ==="
verify_live_bff_identity "before-switch"

if [[ -L "${DEPLOY_ROOT}" ]]; then
  PREVIOUS_DEPLOY_TARGET="$(readlink -f "${DEPLOY_ROOT}" || true)"
  case "${PREVIOUS_DEPLOY_TARGET}" in
    "${RELEASES_DIR}"/*)
      if [[ ! -d "${PREVIOUS_DEPLOY_TARGET}" ]]; then
        echo "Refusing to replace a deploy symlink whose target is missing: ${PREVIOUS_DEPLOY_TARGET}" >&2
        exit 2
      fi
      ;;
    *)
      echo "Refusing to replace a deploy symlink outside the release store: ${PREVIOUS_DEPLOY_TARGET:-<unresolved>}" >&2
      exit 2
      ;;
  esac
elif [[ -e "${DEPLOY_ROOT}" ]]; then
  LEGACY_RELEASE_DIR="${RELEASES_DIR}/legacy-pre-symlink-${TIMESTAMP}"
  echo "Converting existing deploy root directory to release: ${LEGACY_RELEASE_DIR}"
  PREVIOUS_DEPLOY_TARGET="${LEGACY_RELEASE_DIR}"
  LEGACY_ROOT_MOVED=true
  DEPLOY_SWITCHED=true
  sudo mv "${DEPLOY_ROOT}" "${LEGACY_RELEASE_DIR}"
fi

sudo ln -sfn "${RELEASE_DIR}" "${DEPLOY_ROOT}.next"
DEPLOY_SWITCHED=true
sudo mv -Tf "${DEPLOY_ROOT}.next" "${DEPLOY_ROOT}"
LEGACY_ROOT_MOVED=false

echo "=== verify exact BFF identity after live switch ==="
verify_live_bff_identity "after-switch"

echo "=== verify deployed host ==="
curl -fsS "${FE_HOST}/" >/dev/null
DEPLOYED_JSON="$(curl -fsS "${FE_HOST}/deployment.json")"
node --input-type=module -e '
const expectedFrontend = process.argv[1];
const expectedBff = process.argv[2];
const expectedBffHost = process.argv[3];
const expectedGateRun = process.argv[4];
const expectedRealWrites = process.argv[5];
const expectedStubWrites = process.argv[6];
const payload = JSON.parse(process.argv[7]);
if (payload.commit !== expectedFrontend) {
  console.error(`deployment.json commit mismatch: expected ${expectedFrontend}, got ${payload.commit}`);
  process.exit(1);
}
if (payload.bffSourceCommitSha !== expectedBff) {
  console.error(`deployment.json BFF commit mismatch: expected ${expectedBff}, got ${payload.bffSourceCommitSha}`);
  process.exit(1);
}
if (payload.bffHost !== expectedBffHost) {
  console.error(`deployment.json BFF host mismatch: expected ${expectedBffHost}, got ${payload.bffHost}`);
  process.exit(1);
}
if (payload.releaseIdentity?.frontend?.commitSha !== expectedFrontend ||
    payload.releaseIdentity?.bff?.sourceCommitSha !== expectedBff ||
    payload.releaseIdentity?.bff?.baseUrl !== expectedBffHost ||
    payload.releaseIdentity?.gate?.runId !== expectedGateRun) {
  console.error("deployment.json releaseIdentity does not bind the expected FE/BFF pair");
  process.exit(1);
}
if (payload.buildMode?.VITE_BFF_MODE !== "live" || payload.buildMode?.VITE_BFF_FALLBACK !== "strict") {
  console.error("deployment.json does not record strict-live build mode");
  process.exit(1);
}
if (payload.buildMode?.VITE_BFF_REAL_WRITES !== expectedRealWrites ||
    payload.buildMode?.VITE_BFF_ALLOW_DEV_STUB_WRITES !== expectedStubWrites) {
  console.error("deployment.json write-safety flags do not match the authorized deployment inputs");
  process.exit(1);
}
' "${SHA}" "${EXPECTED_BFF_SHA}" "${BFF_HOST}" "${RELEASE_GATE_RUN_ID}" "${REAL_WRITES}" "${ALLOW_DEV_STUB_WRITES}" "${DEPLOYED_JSON}"

if [[ "${SKIP_PROBE}" != "true" ]]; then
  echo "=== run browser/BFF deployed-host probe ==="
  PANTHEON_FE_BASE_URL="${FE_HOST}" \
  PANTHEON_BFF_BASE_URL="${BFF_HOST}" \
  PANTHEON_BROWSER_BFF_BASE_URL="${BFF_HOST}" \
  PANTHEON_OLD_BFF_URL="${OLD_BFF_HOST}" \
  PANTHEON_HOSTED_PROBE_PATH="${PANTHEON_HOSTED_PROBE_PATH:-/management/persona-fleet}" \
  PANTHEON_HOSTED_REQUIRED_BFF_PATHS="${PANTHEON_HOSTED_REQUIRED_BFF_PATHS:-/bff/management/persona-fleet}" \
  PANTHEON_PROBE_NOCACHE_SHA="${SHA}" \
  PANTHEON_AUDIT_OUT_DIR="${AUDIT_DIR}" \
  node scripts/probe-hosted-browser-bff.mjs

  echo "=== run Persona Fleet live linked-page contract ==="
  PANTHEON_FE_BASE_URL="${FE_HOST}" \
  PANTHEON_BFF_BASE_URL="${BFF_HOST}" \
  npx playwright test e2e/25-persona-fleet-live-linked-pages.spec.ts --project=chromium

  if [[ "${REAL_WRITES}" == "true" ]]; then
    echo "=== run explicitly enabled governed management write/read-back probe ==="
    PANTHEON_BFF_BASE_URL="${BFF_HOST}" \
    PANTHEON_BFF_AUTH_TOKEN="${WRITE_PROBE_AUTH_TOKEN}" \
    node scripts/probe-hosted-management-writes.mjs
    WRITE_PROBE_AUTH_TOKEN=""
  else
    echo "=== skip governed management write/read-back probe (safe write defaults active) ==="
  fi
fi

if [[ "${KEEP_RELEASES}" =~ ^[0-9]+$ && "${KEEP_RELEASES}" -gt 0 ]]; then
  mapfile -t old_releases < <(sudo find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -n | awk '{print $2}' | head -n "-${KEEP_RELEASES}" || true)
  for old_release in "${old_releases[@]}"; do
    if [[ "${old_release}" == "${RELEASE_DIR}" || "${old_release}" == "${PREVIOUS_DEPLOY_TARGET}" ]]; then
      continue
    fi
    case "${old_release}" in
      "${RELEASES_DIR}"/*) sudo rm -rf -- "${old_release}" ;;
    esac
  done
fi

cat > "${AUDIT_DIR}/dev-fe-deploy-${TIMESTAMP}.md" <<EOF
# Pantheon Dev FE Deploy

- deployed_at: ${TIMESTAMP}
- commit: ${SHA}
- source_ref: ${SOURCE_REF:-${SHA}}
- source_branch: ${SOURCE_BRANCH}
- fe_host: ${FE_HOST}
- bff_host: ${BFF_HOST}
- bff_source_commit_sha: ${EXPECTED_BFF_SHA}
- integration_gate_run_id: ${RELEASE_GATE_RUN_ID}
- release_dir: ${RELEASE_DIR}
- deploy_root: ${DEPLOY_ROOT}
- preserve_assets: ${PRESERVE_ASSETS}
- real_writes: ${REAL_WRITES}
- allow_dev_stub_writes: ${ALLOW_DEV_STUB_WRITES}
- bff_identity_before_switch: passed
- bff_identity_after_switch: passed
- probe: $([[ "${SKIP_PROBE}" == "true" ]] && echo "skipped" || echo "passed")
EOF

echo "OK: deployed FE ${SHA} with BFF ${EXPECTED_BFF_SHA} to ${FE_HOST}"
