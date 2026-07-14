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
CANONICAL_PUBLIC_VIEWER_TOKEN="pantheon-dev-browser:viewer"
DEV_BEARER_TOKEN="${VITE_BFF_DEV_BEARER_TOKEN:-${CANONICAL_PUBLIC_VIEWER_TOKEN}}"
REAL_WRITES="${PANTHEON_DEPLOY_REAL_WRITES:-false}"
ALLOW_DEV_STUB_WRITES="${PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES:-false}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SHA="$(git rev-parse HEAD)"
SHORT_SHA="${SHA:0:12}"
RELEASE_NAME="${TIMESTAMP}-${SHORT_SHA}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/execute-plans-dev-fe.XXXXXX")"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

if [[ "${DEV_BEARER_TOKEN}" != "${CANONICAL_PUBLIC_VIEWER_TOKEN}" ]]; then
  echo "Refusing to embed a non-canonical browser bearer token in the public frontend bundle." >&2
  exit 2
fi

if [[ "${REAL_WRITES}" != "false" || "${ALLOW_DEV_STUB_WRITES}" != "false" ]]; then
  echo "Automated dev frontend deployment is read-only; real and dev-stub writes must remain disabled." >&2
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

for command_name in npm node rsync sudo curl; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 2
  fi
done

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
VITE_BFF_DEV_BEARER_TOKEN="${DEV_BEARER_TOKEN}" \
npm run build

export PANTHEON_DEPLOYED_AT="${TIMESTAMP}"
export PANTHEON_DEPLOY_COMMIT="${SHA}"
export PANTHEON_DEPLOY_SOURCE_REF="${SOURCE_REF:-${SHA}}"
export PANTHEON_DEPLOY_SOURCE_BRANCH="${SOURCE_BRANCH}"
export PANTHEON_DEPLOY_FE_HOST="${FE_HOST}"
export PANTHEON_DEPLOY_BFF_HOST="${BFF_HOST}"
export PANTHEON_DEPLOY_REAL_WRITES="${REAL_WRITES}"
export PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES="${ALLOW_DEV_STUB_WRITES}"
export PANTHEON_DEPLOY_BFF_COMMIT="${PANTHEON_DEPLOY_BFF_COMMIT:-27cd46529c29801db02818aafe4df723cc0f8666}"

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
  buildMode: {
    VITE_BFF_MODE: "live",
    VITE_BFF_FALLBACK: "strict",
    VITE_BFF_REAL_WRITES: process.env.PANTHEON_DEPLOY_REAL_WRITES || "false",
    VITE_BFF_ALLOW_DEV_STUB_WRITES: process.env.PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES || "false",
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

if [[ -e "${DEPLOY_ROOT}" && ! -L "${DEPLOY_ROOT}" ]]; then
  LEGACY_RELEASE_DIR="${RELEASES_DIR}/legacy-pre-symlink-${TIMESTAMP}"
  echo "Converting existing deploy root directory to release: ${LEGACY_RELEASE_DIR}"
  sudo mv "${DEPLOY_ROOT}" "${LEGACY_RELEASE_DIR}"
fi

sudo ln -sfn "${RELEASE_DIR}" "${DEPLOY_ROOT}.next"
sudo mv -Tf "${DEPLOY_ROOT}.next" "${DEPLOY_ROOT}"

if [[ "${KEEP_RELEASES}" =~ ^[0-9]+$ && "${KEEP_RELEASES}" -gt 0 ]]; then
  mapfile -t old_releases < <(sudo find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -n | awk '{print $2}' | head -n "-${KEEP_RELEASES}" || true)
  for old_release in "${old_releases[@]}"; do
    case "${old_release}" in
      "${RELEASES_DIR}"/*) sudo rm -rf -- "${old_release}" ;;
    esac
  done
fi

echo "=== verify deployed host ==="
curl -fsS "${FE_HOST}/" >/dev/null
DEPLOYED_JSON="$(curl -fsS "${FE_HOST}/deployment.json")"
node --input-type=module -e '
const expected = process.argv[1];
const payload = JSON.parse(process.argv[2]);
if (payload.commit !== expected) {
  console.error(`deployment.json commit mismatch: expected ${expected}, got ${payload.commit}`);
  process.exit(1);
}
' "${SHA}" "${DEPLOYED_JSON}"

if [[ "${SKIP_PROBE}" != "true" ]]; then
  echo "=== run browser/BFF deployed-host probe ==="
  PANTHEON_FE_BASE_URL="${FE_HOST}" \
  PANTHEON_BFF_BASE_URL="${BFF_HOST}" \
  PANTHEON_BROWSER_BFF_BASE_URL="${BFF_HOST}" \
  PANTHEON_OLD_BFF_URL="${OLD_BFF_HOST}" \
  PANTHEON_HOSTED_PROBE_PATH="${PANTHEON_HOSTED_PROBE_PATH:-/management/persona-fleet}" \
  PANTHEON_HOSTED_REQUIRED_BFF_PATHS="${PANTHEON_HOSTED_REQUIRED_BFF_PATHS:-/bff/management/persona-fleet}" \
  PANTHEON_HOSTED_ACCEPT_AUTH_CHALLENGE="true" \
  PANTHEON_PROBE_NOCACHE_SHA="${SHA}" \
  PANTHEON_AUDIT_OUT_DIR="${AUDIT_DIR}" \
  node scripts/probe-hosted-browser-bff.mjs

  # The full Persona linked-page traversal belongs to the integration E2E gate:
  # it depends on mutable row/UI state and must not invalidate an otherwise
  # healthy atomic deploy after the hosted read-only BFF contract has passed.
  echo "=== read-only hosted browser/BFF probe passed; mutation probes are disabled ==="
fi

cat > "${AUDIT_DIR}/dev-fe-deploy-${TIMESTAMP}.md" <<EOF
# Pantheon Dev FE Deploy

- deployed_at: ${TIMESTAMP}
- commit: ${SHA}
- source_ref: ${SOURCE_REF:-${SHA}}
- source_branch: ${SOURCE_BRANCH}
- fe_host: ${FE_HOST}
- bff_host: ${BFF_HOST}
- release_dir: ${RELEASE_DIR}
- deploy_root: ${DEPLOY_ROOT}
- preserve_assets: ${PRESERVE_ASSETS}
- real_writes: ${REAL_WRITES}
- allow_dev_stub_writes: ${ALLOW_DEV_STUB_WRITES}
- probe: $([[ "${SKIP_PROBE}" == "true" ]] && echo "skipped" || echo "passed")
EOF

echo "OK: deployed ${SHA} to ${FE_HOST}"
