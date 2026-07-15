#!/usr/bin/env bash
# Deploy execute-plans to the Pantheon dev VM static FE host.
#
# This script is intended to run on the Pantheon dev VM through the
# execute-plans self-hosted GitHub Actions runner. It builds the Vite bundle,
# installs it as an immutable release under /var/www, switches the Caddy root
# symlink, and then probes the deployed host against the dev BFF.
if [[ "$-" == *x* ]]; then
  set +x
fi
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
DEV_BEARER_TOKEN="${VITE_BFF_DEV_BEARER_TOKEN:-}"
SUPABASE_URL="${VITE_SUPABASE_URL:-}"
SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"
DEPLOY_PROFILE="${PANTHEON_DEPLOY_PROFILE:-read-only}"
PROOF_WINDOW_ACK="${PANTHEON_DEPLOY_PROOF_WINDOW_ACK:-false}"
REQUESTED_REAL_WRITES="${PANTHEON_DEPLOY_REAL_WRITES:-false}"
REQUESTED_ALLOW_DEV_STUB_WRITES="${PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES:-false}"
REAL_WRITES="false"
ALLOW_DEV_STUB_WRITES="false"
EXPECTED_BFF_COMMIT="${PANTHEON_DEPLOY_EXPECTED_BFF_COMMIT:-}"
BFF_COMMIT=""
BFF_COMMIT_SOURCE="bff_version"
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

cleanup() {
  local status=$?
  local current_target=""
  local rollback_status=0
  set +e

  if [[ "${status}" -ne 0 && "${LOCK_ACQUIRED}" == "true" ]]; then
    current_target="$(readlink -f "${DEPLOY_ROOT}" 2>/dev/null || true)"
    if [[ "${DEPLOY_SWITCHED}" == "true" ]]; then
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
      elif [[ "${current_target}" == "${RELEASE_DIR}" ]]; then
        echo "Deploy failed after the first host switch; removing the candidate symlink." >&2
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
    current_target="$(readlink -f "${DEPLOY_ROOT}" 2>/dev/null || true)"
    if [[ "${current_target}" != "${RELEASE_DIR}" ]]; then
      case "${RELEASE_DIR}" in
        "${RELEASES_DIR}"/*) sudo rm -rf -- "${RELEASE_DIR}" ;;
      esac
    fi
    if [[ "${rollback_status}" -ne 0 ]]; then
      echo "Rollback did not complete cleanly; inspect ${DEPLOY_ROOT} before another deployment." >&2
    fi
  fi

  rm -rf "${TMP_DIR}"
  trap - EXIT
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

resolve_live_bff_commit() {
  local phase="$1"
  local version_file="${TMP_DIR}/bff-version-${phase}.json"

  curl --fail --silent --show-error --location \
    --retry 3 --retry-all-errors --connect-timeout 5 --max-time 20 \
    "${BFF_HOST}/bff/version" > "${version_file}"
  cp "${version_file}" "${AUDIT_DIR}/bff-version-${phase}.json"
  node scripts/release-identity.mjs source-version --version-file "${version_file}"
}

verify_live_bff_identity() {
  local phase="$1"
  local actual_bff_commit

  actual_bff_commit="$(resolve_live_bff_commit "${phase}")"
  if [[ -n "${EXPECTED_BFF_COMMIT}" && "${EXPECTED_BFF_COMMIT,,}" != "${actual_bff_commit,,}" ]]; then
    echo "Pantheon BFF commit mismatch during ${phase}: expected ${EXPECTED_BFF_COMMIT}, active runtime reports ${actual_bff_commit}." >&2
    return 2
  fi
  if [[ -n "${BFF_COMMIT}" && "${BFF_COMMIT,,}" != "${actual_bff_commit,,}" ]]; then
    echo "Pantheon BFF commit changed during deployment: bound ${BFF_COMMIT}, ${phase} reports ${actual_bff_commit}." >&2
    return 2
  fi
  BFF_COMMIT="${actual_bff_commit,,}"
  export BFF_COMMIT
  echo "BFF identity ${phase}: ${BFF_COMMIT}"
}

if [[ -n "${DEV_BEARER_TOKEN}" ]]; then
  echo "Refusing to embed any browser bearer token in the public frontend bundle." >&2
  exit 2
fi

if [[ "${REQUESTED_REAL_WRITES}" != "false" || "${REQUESTED_ALLOW_DEV_STUB_WRITES}" != "false" ]]; then
  echo "Direct write-flag overrides are prohibited; select the guarded deployment profile instead." >&2
  exit 2
fi

case "${DEPLOY_PROFILE}" in
  read-only)
    ;;
  persona-interaction-write-proof|persona-interaction-read-only-restore)
    if [[ "${GITHUB_EVENT_NAME:-}" != "workflow_dispatch" ]]; then
      echo "Persona proof-window profiles are allowed only for an explicit workflow_dispatch." >&2
      exit 2
    fi
    if [[ "${FE_HOST}" != "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io" || \
          "${BFF_HOST}" != "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io" ]]; then
      echo "Persona proof-window profiles are restricted to the canonical Pantheon dev FE/BFF hosts." >&2
      exit 2
    fi
    if [[ ! "${SOURCE_REF}" =~ ^[0-9a-fA-F]{40}$ || "${SOURCE_REF,,}" != "${SHA,,}" ]]; then
      echo "Persona proof-window profile requires an exact 40-character frontend SHA matching the checkout." >&2
      exit 2
    fi
    if [[ "${DEPLOY_PROFILE}" == "persona-interaction-write-proof" ]]; then
      if [[ "${PROOF_WINDOW_ACK}" != "true" ]]; then
        echo "Persona write-proof profile requires explicit proof-window acknowledgement." >&2
        exit 2
      fi
      if [[ "${SKIP_PROBE}" == "true" ]]; then
        echo "Persona write-proof profile cannot skip the deployed-host browser/BFF probe." >&2
        exit 2
      fi
      REAL_WRITES="true"
      ALLOW_DEV_STUB_WRITES="true"
      echo "WARNING: activating bounded Pantheon dev Persona write-proof profile; dispatch the full pinned proof, then immediately redeploy this exact FE/BFF pair with profile persona-interaction-read-only-restore." >&2
    else
      echo "Restoring the exact Pantheon dev Persona proof pair to the read-only profile." >&2
    fi
    ;;
  *)
    echo "Unknown deployment profile: ${DEPLOY_PROFILE}. Expected read-only, persona-interaction-write-proof, or persona-interaction-read-only-restore." >&2
    exit 2
    ;;
esac

if [[ -z "${SUPABASE_URL}" || -z "${SUPABASE_PUBLISHABLE_KEY}" ]]; then
  echo "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required public browser configuration." >&2
  exit 2
fi

if [[ "${GITHUB_EVENT_NAME:-}" == "workflow_dispatch" && -z "${EXPECTED_BFF_COMMIT}" ]]; then
  echo "Manual final-proof deployment requires an exact Pantheon BFF commit SHA." >&2
  exit 2
fi

if [[ -n "${EXPECTED_BFF_COMMIT}" && ! "${EXPECTED_BFF_COMMIT}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Pantheon BFF commit provenance must be an exact 40-character SHA." >&2
  exit 2
fi

if [[ ! "${RELEASE_INSTANCE}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "PANTHEON_DEPLOY_RELEASE_INSTANCE contains unsafe path characters: ${RELEASE_INSTANCE}" >&2
  exit 2
fi

if [[ "${DEPLOY_ROOT}" != "${STRICT_DIR_PREFIX}" && "${DEPLOY_ROOT}" != "${STRICT_DIR_PREFIX}/"* ]]; then
  echo "Refusing to deploy outside allowed root prefix: ${DEPLOY_ROOT}" >&2
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

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another dev frontend deployment holds ${LOCK_FILE}; refusing a concurrent deploy." >&2
  exit 2
fi
LOCK_ACQUIRED=true

echo "Resolving active BFF commit from ${BFF_HOST}/bff/version..."
verify_live_bff_identity "initial"

echo "=== execute-plans dev FE deploy ==="
echo "commit: ${SHA}"
echo "source ref: ${SOURCE_REF:-${SHA}}"
echo "source branch: ${SOURCE_BRANCH}"
echo "FE host: ${FE_HOST}"
echo "BFF host: ${BFF_HOST}"
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
VITE_BFF_DEV_BEARER_TOKEN="" \
VITE_SUPABASE_URL="${SUPABASE_URL}" \
VITE_SUPABASE_PUBLISHABLE_KEY="${SUPABASE_PUBLISHABLE_KEY}" \
npm run build

export PANTHEON_DEPLOYED_AT="${TIMESTAMP}"
export PANTHEON_DEPLOY_COMMIT="${SHA}"
export PANTHEON_DEPLOY_SOURCE_REF="${SOURCE_REF:-${SHA}}"
export PANTHEON_DEPLOY_SOURCE_BRANCH="${SOURCE_BRANCH}"
export PANTHEON_DEPLOY_FE_HOST="${FE_HOST}"
export PANTHEON_DEPLOY_BFF_HOST="${BFF_HOST}"
export PANTHEON_DEPLOY_PROFILE="${DEPLOY_PROFILE}"
export PANTHEON_DEPLOY_REAL_WRITES="${REAL_WRITES}"
export PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES="${ALLOW_DEV_STUB_WRITES}"

export PANTHEON_DEPLOY_BFF_COMMIT="${BFF_COMMIT}"
export PANTHEON_DEPLOY_BFF_COMMIT_SOURCE="${BFF_COMMIT_SOURCE}"

node --input-type=module <<'NODE'
import fs from "node:fs";

const metadata = {
  app: "execute-plans",
  environment: "pantheon-dev-fe",
  deployedAt: process.env.PANTHEON_DEPLOYED_AT,
  commit: process.env.PANTHEON_DEPLOY_COMMIT,
  sourceRef: process.env.PANTHEON_DEPLOY_SOURCE_REF,
  sourceBranch: process.env.PANTHEON_DEPLOY_SOURCE_BRANCH,
  feHost: process.env.PANTHEON_DEPLOY_FE_HOST,
  bffHost: process.env.PANTHEON_DEPLOY_BFF_HOST,
  bffCommit: process.env.PANTHEON_DEPLOY_BFF_COMMIT,
  bffCommitEvidence: true,
  bffCommitSource: process.env.PANTHEON_DEPLOY_BFF_COMMIT_SOURCE,
  deploymentProfile: process.env.PANTHEON_DEPLOY_PROFILE || "read-only",
  buildMode: {
    VITE_BFF_MODE: "live",
    VITE_BFF_FALLBACK: "strict",
    VITE_BFF_REAL_WRITES: process.env.PANTHEON_DEPLOY_REAL_WRITES || "false",
    VITE_BFF_ALLOW_DEV_STUB_WRITES: process.env.PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES || "false",
    VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
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
const expectedProfile = process.argv[3];
const expectedRealWrites = process.argv[4];
const expectedDevStubWrites = process.argv[5];
const payload = JSON.parse(process.argv[6]);
if (payload.commit !== expectedFrontend) {
  console.error(`deployment.json commit mismatch: expected ${expectedFrontend}, got ${payload.commit}`);
  process.exit(1);
}
if (
  payload.bffCommit !== expectedBff ||
  payload.bffCommitEvidence !== true ||
  payload.bffCommitSource !== "bff_version"
) {
  console.error(`deployment.json BFF identity mismatch: expected ${expectedBff}`);
  process.exit(1);
}
if (
  payload.deploymentProfile !== expectedProfile ||
  payload.buildMode?.VITE_BFF_REAL_WRITES !== expectedRealWrites ||
  payload.buildMode?.VITE_BFF_ALLOW_DEV_STUB_WRITES !== expectedDevStubWrites ||
  payload.buildMode?.VITE_BFF_EMBEDDED_BEARER_TOKEN !== "false"
) {
  console.error("deployment.json does not match the selected deployment profile/token boundary");
  process.exit(1);
}
' "${SHA}" "${BFF_COMMIT}" "${DEPLOY_PROFILE}" "${REAL_WRITES}" "${ALLOW_DEV_STUB_WRITES}" "${DEPLOYED_JSON}"

if [[ "${SKIP_PROBE}" != "true" ]]; then
  echo "=== run browser/BFF deployed-host probe ==="
  PANTHEON_FE_BASE_URL="${FE_HOST}" \
  PANTHEON_BFF_BASE_URL="${BFF_HOST}" \
  PANTHEON_BROWSER_BFF_BASE_URL="${BFF_HOST}" \
  PANTHEON_OLD_BFF_URL="${OLD_BFF_HOST}" \
  PANTHEON_HOSTED_PROBE_PATH="${PANTHEON_HOSTED_PROBE_PATH:-/management/persona-fleet}" \
  PANTHEON_HOSTED_REQUIRED_BFF_PATHS="${PANTHEON_HOSTED_REQUIRED_BFF_PATHS:-/bff/me}" \
  PANTHEON_PROBE_NOCACHE_SHA="${SHA}" \
  PANTHEON_AUDIT_OUT_DIR="${AUDIT_DIR}" \
  node scripts/probe-hosted-browser-bff.mjs

  # The full Persona linked-page traversal belongs to the integration E2E gate:
  # it depends on mutable row/UI state and must not invalidate an otherwise
  # healthy atomic deploy after the hosted read-only BFF contract has passed.
  echo "=== unauthenticated strict browser/BFF probe passed; token injection and mutation probes are disabled ==="
fi

cat > "${AUDIT_DIR}/dev-fe-deploy-${TIMESTAMP}.md" <<EOF
# Pantheon Dev FE Deploy

- deployed_at: ${TIMESTAMP}
- commit: ${SHA}
- source_ref: ${SOURCE_REF:-${SHA}}
- source_branch: ${SOURCE_BRANCH}
- fe_host: ${FE_HOST}
- bff_host: ${BFF_HOST}
- bff_commit: ${BFF_COMMIT}
- bff_commit_source: ${BFF_COMMIT_SOURCE}
- deployment_profile: ${DEPLOY_PROFILE}
- release_dir: ${RELEASE_DIR}
- deploy_root: ${DEPLOY_ROOT}
- preserve_assets: ${PRESERVE_ASSETS}
- real_writes: ${REAL_WRITES}
- allow_dev_stub_writes: ${ALLOW_DEV_STUB_WRITES}
- embedded_bearer_token: false
- probe: $([[ "${SKIP_PROBE}" == "true" ]] && echo "skipped" || echo "passed")
EOF

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "bff_commit=${BFF_COMMIT}"
    echo "bff_commit_source=${BFF_COMMIT_SOURCE}"
  } >> "${GITHUB_OUTPUT}"
fi

if [[ "${KEEP_RELEASES}" =~ ^[0-9]+$ && "${KEEP_RELEASES}" -gt 0 ]]; then
  mapfile -t old_releases < <(sudo find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -n | awk '{print $2}' | head -n "-${KEEP_RELEASES}" || true)
  for old_release in "${old_releases[@]}"; do
    case "${old_release}" in
      "${RELEASE_DIR}"|"${PREVIOUS_DEPLOY_TARGET}") continue ;;
      "${RELEASES_DIR}"/*) sudo rm -rf -- "${old_release}" ;;
    esac
  done
fi

echo "OK: deployed ${SHA} to ${FE_HOST}"
