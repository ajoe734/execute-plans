#!/usr/bin/env bash
# Bounded, reversible runtime window for SRCM-P1 hosted acceptance.
# Run as root on the Pantheon dev VM. No credential values are printed.
if [[ "$-" == *x* ]]; then
  set +x
fi
set -Eeuo pipefail

ACTION="${1:-}"
RUN_ID="${2:-}"
EXPECTED_FE_SHA="${3:-}"
EXPECTED_BFF_SHA="${4:-}"

DEPLOY_LINK="/var/www/pantheon-dev-fe"
RELEASES_DIR="/var/www/pantheon-dev-fe-releases"
NETWORK="pantheon_default"
SOURCE_CONTAINER="pantheon-source-ingest-1"
BFF_CONTAINER="pantheon-operator-bff-1"
SCHEDULER_CONTAINER="pantheon-source-ingest-scheduler-1"
PROOF_CONNECTOR="tw-twse-tpex-official-market"
PROOF_HOSTS="openapi.twse.com.tw,www.tpex.org.tw"

if [[ ! "${RUN_ID}" =~ ^[1-9][0-9]*$ ]]; then
  echo "run id must be a positive integer" >&2
  exit 2
fi
STATE_DIR="/run/pantheon-srcm-proof-${RUN_ID}"
SOURCE_PROOF="pantheon-srcm-proof-source-${RUN_ID}"
BFF_PROOF="pantheon-srcm-proof-bff-${RUN_ID}"
WATCHDOG_UNIT="pantheon-srcm-proof-restore-${RUN_ID}"

sha40() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

json_field() {
  python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1], ""))' "$1"
}

wait_http() {
  local url="$1"
  local attempts="${2:-60}"
  local index
  for ((index=1; index<=attempts; index++)); do
    if curl -fsS --max-time 3 "${url}" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "timed out waiting for ${url}" >&2
  return 1
}

write_state_value() {
  local name="$1"
  local value="$2"
  printf '%s' "${value}" > "${STATE_DIR}/${name}"
  chmod 600 "${STATE_DIR}/${name}"
}

read_state_value() {
  local name="$1"
  [[ -f "${STATE_DIR}/${name}" ]] || return 1
  cat "${STATE_DIR}/${name}"
}

atomic_link() {
  local target="$1"
  local next="${DEPLOY_LINK}.srcm-next-${RUN_ID}"
  [[ -d "${target}" ]]
  ln -s "${target}" "${next}"
  mv -Tf "${next}" "${DEPLOY_LINK}"
}

disconnect_if_connected() {
  local container="$1"
  if docker inspect -f '{{json .NetworkSettings.Networks}}' "${container}" | grep -q "\"${NETWORK}\""; then
    docker network disconnect "${NETWORK}" "${container}"
  fi
}

connect_if_disconnected() {
  local container="$1"
  local alias="$2"
  if ! docker inspect -f '{{json .NetworkSettings.Networks}}' "${container}" | grep -q "\"${NETWORK}\""; then
    docker network connect --alias "${alias}" "${NETWORK}" "${container}"
  fi
}

capture_env() {
  local container="$1"
  local destination="$2"
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "${container}" > "${destination}"
  chmod 600 "${destination}"
}

assert_live_pair() {
  local expected_profile="$1"
  local deployment
  deployment="$(curl -fsS --max-time 10 'https://pantheon-lupin-dev-fe.35.201.204.12.sslip.io/deployment.json')"
  local live_fe live_bff profile writes
  live_fe="$(printf '%s' "${deployment}" | json_field commit)"
  live_bff="$(printf '%s' "${deployment}" | json_field bffCommit)"
  profile="$(printf '%s' "${deployment}" | json_field deploymentProfile)"
  writes="$(python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("buildMode",{}).get("VITE_BFF_REAL_WRITES", "")).lower())' <<<"${deployment}")"
  [[ "${live_fe}" == "${EXPECTED_FE_SHA}" ]]
  [[ "${live_bff}" == "${EXPECTED_BFF_SHA}" ]]
  [[ "${profile}" == "${expected_profile}" ]]
  if [[ "${expected_profile}" == "read-only" ]]; then
    [[ "${writes}" == "false" ]]
  else
    [[ "${writes}" == "true" ]]
  fi
  local version live_version
  version="$(curl -fsS --max-time 10 'https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io/bff/version')"
  live_version="$(printf '%s' "${version}" | json_field source_commit_sha)"
  [[ "${live_version}" == "${EXPECTED_BFF_SHA}" ]]
}

run_reconcile_only() {
  local scheduler_image scheduler_env operation_key
  scheduler_image="$(read_state_value scheduler-image)"
  scheduler_env="${STATE_DIR}/scheduler.env"
  operation_key="srcm-${RUN_ID}-restore-reconcile-only"
  docker run --rm \
    --name "pantheon-srcm-proof-restore-once-${RUN_ID}" \
    --network "${NETWORK}" \
    --volumes-from "${SCHEDULER_CONTAINER}" \
    --env-file "${scheduler_env}" \
    -e SOURCE_INGEST_CONTROLLER_MODE=reconcile_only \
    -e SOURCE_INGEST_CONTROLLER_MAX_TICKS=1 \
    -e SOURCE_INGEST_CONTROLLER_FORCE_CONNECTOR_IDS= \
    -e SOURCE_INGEST_CONTROLLER_EXCLUSIVE_CONNECTOR_IDS= \
    -e SOURCE_INGEST_SCHEDULER_MAX_CONCURRENCY=1 \
    "${scheduler_image}" \
    python -m scripts.source_ingest_scheduler_once \
      --mode reconcile_only \
      --max-concurrency 1 \
      --operation-key "${operation_key}" \
      > "${STATE_DIR}/restore-reconcile-only.json"
}

prepare() {
  sha40 "${EXPECTED_FE_SHA}" || { echo "expected FE SHA is invalid" >&2; exit 2; }
  sha40 "${EXPECTED_BFF_SHA}" || { echo "expected BFF SHA is invalid" >&2; exit 2; }
  [[ ! -e "${STATE_DIR}" ]] || { echo "proof state already exists: ${STATE_DIR}" >&2; exit 2; }
  install -d -m 700 "${STATE_DIR}"
  cp "$0" "${STATE_DIR}/runtime.sh"
  chmod 700 "${STATE_DIR}/runtime.sh"

  local live_target write_target read_target source_image bff_image scheduler_image
  live_target="$(readlink -f "${DEPLOY_LINK}")"
  [[ "${live_target}" == "${RELEASES_DIR}/"*"-read-only" ]]
  read_target="${live_target}"
  write_target="${live_target%-read-only}-write-proof"
  [[ -d "${write_target}" ]]
  write_state_value read-target "${read_target}"
  write_state_value write-target "${write_target}"
  write_state_value expected-fe-sha "${EXPECTED_FE_SHA}"
  write_state_value expected-bff-sha "${EXPECTED_BFF_SHA}"

  assert_live_pair read-only

  # Arm recovery before touching a container or the served symlink. The
  # restore path is idempotent and the workflow also invokes it in always().
  systemd-run \
    --unit "${WATCHDOG_UNIT}" \
    --on-active=25m \
    --property=Type=oneshot \
    "${STATE_DIR}/runtime.sh" restore "${RUN_ID}" "${EXPECTED_FE_SHA}" "${EXPECTED_BFF_SHA}" \
    >/dev/null

  capture_env "${SOURCE_CONTAINER}" "${STATE_DIR}/source.env"
  capture_env "${BFF_CONTAINER}" "${STATE_DIR}/bff.env"
  capture_env "${SCHEDULER_CONTAINER}" "${STATE_DIR}/scheduler.env"
  source_image="$(docker inspect -f '{{.Config.Image}}' "${SOURCE_CONTAINER}")"
  bff_image="$(docker inspect -f '{{.Config.Image}}' "${BFF_CONTAINER}")"
  scheduler_image="$(docker inspect -f '{{.Config.Image}}' "${SCHEDULER_CONTAINER}")"
  write_state_value source-image "${source_image}"
  write_state_value bff-image "${bff_image}"
  write_state_value scheduler-image "${scheduler_image}"

  docker update --restart=no "${SOURCE_CONTAINER}" "${BFF_CONTAINER}" "${SCHEDULER_CONTAINER}" >/dev/null
  docker stop -t 30 "${SCHEDULER_CONTAINER}" "${BFF_CONTAINER}" "${SOURCE_CONTAINER}" >/dev/null
  disconnect_if_connected "${BFF_CONTAINER}"
  disconnect_if_connected "${SOURCE_CONTAINER}"

  docker run -d \
    --name "${SOURCE_PROOF}" \
    --restart=no \
    --network "${NETWORK}" \
    --network-alias source-ingest \
    --volumes-from "${SOURCE_CONTAINER}" \
    --env-file "${STATE_DIR}/source.env" \
    -e SOURCE_MANAGEMENT_COMMANDS_ENABLED=1 \
    -e PANTHEON_EXTERNAL_EGRESS=allowlist \
    -e PANTHEON_EXTERNAL_EGRESS_ALLOWED_HOSTS="${PROOF_HOSTS}" \
    -p 18097:8097 \
    "${source_image}" >/dev/null
  wait_http http://127.0.0.1:18097/readyz

  docker run --rm \
    --name "pantheon-srcm-proof-pull-once-${RUN_ID}" \
    --network "${NETWORK}" \
    --volumes-from "${SCHEDULER_CONTAINER}" \
    --env-file "${STATE_DIR}/scheduler.env" \
    -e SOURCE_INGEST_CONTROLLER_MODE=reconcile_and_pull \
    -e SOURCE_INGEST_CONTROLLER_MAX_TICKS=1 \
    -e SOURCE_INGEST_CONTROLLER_FORCE_CONNECTOR_IDS="${PROOF_CONNECTOR}" \
    -e SOURCE_INGEST_CONTROLLER_EXCLUSIVE_CONNECTOR_IDS="${PROOF_CONNECTOR}" \
    -e SOURCE_INGEST_SCHEDULER_MAX_CONCURRENCY=1 \
    "${scheduler_image}" \
    python -m scripts.source_ingest_scheduler_once \
      --mode reconcile_and_pull \
      --connector "${PROOF_CONNECTOR}" \
      --force-connector "${PROOF_CONNECTOR}" \
      --max-concurrency 1 \
      --operation-key "srcm-${RUN_ID}-tw-official-one-tick" \
      > "${STATE_DIR}/bounded-provider-tick.json"

  docker run -d \
    --name "${BFF_PROOF}" \
    --restart=no \
    --network "${NETWORK}" \
    --network-alias operator-bff \
    --volumes-from "${BFF_CONTAINER}" \
    --env-file "${STATE_DIR}/bff.env" \
    -e SOURCE_MANAGEMENT_API_URL=http://source-ingest:8097 \
    -e PANTHEON_BFF_SOURCE_MANAGEMENT_COMMANDS_ENABLED=1 \
    -e SOURCE_MANAGEMENT_COMMANDS_ENABLED=1 \
    -p 18001:8001 \
    "${bff_image}" >/dev/null
  wait_http http://127.0.0.1:18001/readyz

  atomic_link "${write_target}"
  assert_live_pair write-proof
  touch "${STATE_DIR}/prepared"
  echo "bounded SRCM proof window prepared"
}

restore() {
  [[ -d "${STATE_DIR}" ]] || { echo "proof state does not exist: ${STATE_DIR}" >&2; exit 2; }
  EXPECTED_FE_SHA="$(read_state_value expected-fe-sha)"
  EXPECTED_BFF_SHA="$(read_state_value expected-bff-sha)"
  local read_target
  read_target="$(read_state_value read-target)"

  # Restore the externally served frontend first, then remove proof write owners.
  atomic_link "${read_target}"
  docker stop -t 30 "${BFF_PROOF}" "${SOURCE_PROOF}" >/dev/null 2>&1 || true
  docker rm -f "${BFF_PROOF}" "${SOURCE_PROOF}" >/dev/null 2>&1 || true

  connect_if_disconnected "${SOURCE_CONTAINER}" source-ingest
  connect_if_disconnected "${BFF_CONTAINER}" operator-bff
  docker start "${SOURCE_CONTAINER}" >/dev/null
  wait_http http://127.0.0.1:18097/readyz
  docker start "${BFF_CONTAINER}" >/dev/null
  wait_http http://127.0.0.1:18001/readyz

  docker update --restart=no "${SCHEDULER_CONTAINER}" >/dev/null
  docker stop -t 30 "${SCHEDULER_CONTAINER}" >/dev/null 2>&1 || true
  if [[ -f "${STATE_DIR}/scheduler-image" && -f "${STATE_DIR}/scheduler.env" ]]; then
    run_reconcile_only
  fi
  assert_live_pair read-only

  local source_commands bff_commands egress
  source_commands="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "${SOURCE_CONTAINER}" | sed -n 's/^SOURCE_MANAGEMENT_COMMANDS_ENABLED=//p' | tail -1)"
  bff_commands="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "${BFF_CONTAINER}" | sed -n 's/^PANTHEON_BFF_SOURCE_MANAGEMENT_COMMANDS_ENABLED=//p' | tail -1)"
  egress="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "${SOURCE_CONTAINER}" | sed -n 's/^PANTHEON_EXTERNAL_EGRESS=//p' | tail -1)"
  source_commands="${source_commands:-0}"
  bff_commands="${bff_commands:-0}"
  [[ "${source_commands}" == "0" ]]
  [[ "${bff_commands}" == "0" ]]
  [[ "${egress}" == "deny" ]]
  [[ "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "${SCHEDULER_CONTAINER}")" == "no" ]]
  [[ "$(docker inspect -f '{{.State.Running}}' "${SCHEDULER_CONTAINER}")" == "false" ]]

  touch "${STATE_DIR}/restored"
  systemctl stop "${WATCHDOG_UNIT}.timer" >/dev/null 2>&1 || true
  echo "read-only SRCM posture restored"
}

status() {
  EXPECTED_FE_SHA="$(read_state_value expected-fe-sha)"
  EXPECTED_BFF_SHA="$(read_state_value expected-bff-sha)"
  assert_live_pair read-only
  [[ -f "${STATE_DIR}/restored" ]]
  echo "read-only SRCM posture verified"
}

case "${ACTION}" in
  prepare) prepare ;;
  restore) restore ;;
  status) status ;;
  *) echo "usage: $0 {prepare|restore|status} RUN_ID EXPECTED_FE_SHA EXPECTED_BFF_SHA" >&2; exit 2 ;;
esac
