#!/usr/bin/env bash
set -euo pipefail

FIXTURE_HOST="${HSA_PERSON_LOOKUP_FIXTURE_HOST:-127.0.0.1}"
FIXTURE_PORT="${HSA_PERSON_LOOKUP_FIXTURE_PORT:-8790}"
READY_ATTEMPTS="${HSA_PERSON_LOOKUP_READY_ATTEMPTS:-30}"
LOOKUP_PATH="/hsa/person-records/lookup"
RESULTS_DIR="test-results/hsa-person-lookup"

usage() {
  cat <<'EOF'
Usage: scripts/ci-hsa-person-lookup-fixture.sh start|stop FIXTURE_NAME

Starts or stops the local HSA person lookup fixture used by integration tests.
The helper writes FIXTURE_NAME.log and FIXTURE_NAME.pid under test-results/hsa-person-lookup.
EOF
}

error() {
  echo "::error::$*" >&2
}

warning() {
  echo "::warning::$*" >&2
}

require_fixture_name() {
  local fixture_name="$1"

  case "${fixture_name}" in
    ''|*[!A-Za-z0-9_.-]*)
      error "FIXTURE_NAME must contain only letters, numbers, dots, underscores, and hyphens."
      usage >&2
      exit 2
      ;;
  esac
}

fixture_log_file() {
  printf '%s/%s.log\n' "${RESULTS_DIR}" "$1"
}

fixture_pid_file() {
  printf '%s/%s.pid\n' "${RESULTS_DIR}" "$1"
}

export_lookup_url() {
  if [ -n "${GITHUB_ENV:-}" ]; then
    printf 'HSA_PERSON_LOOKUP_URL=http://%s:%s%s\n' \
      "${FIXTURE_HOST}" \
      "${FIXTURE_PORT}" \
      "${LOOKUP_PATH}" >> "${GITHUB_ENV}"
  fi
}

start_fixture() {
  local fixture_name="$1"
  local log_file
  local pid_file
  log_file="$(fixture_log_file "${fixture_name}")"
  pid_file="$(fixture_pid_file "${fixture_name}")"

  mkdir -p "${RESULTS_DIR}"
  rm -f "${pid_file}"

  node scripts/ci-hsa-person-lookup-fixture.mjs \
    --host "${FIXTURE_HOST}" \
    --port "${FIXTURE_PORT}" \
    > "${log_file}" 2>&1 &
  printf '%s\n' "$!" > "${pid_file}"

  for attempt in $(seq 1 "${READY_ATTEMPTS}"); do
    if curl -sf --max-time 5 -o /dev/null "http://${FIXTURE_HOST}:${FIXTURE_PORT}/health"; then
      export_lookup_url
      echo "HSA lookup fixture is responding."
      return 0
    fi
    echo "Attempt ${attempt}/${READY_ATTEMPTS} - HSA lookup fixture is not ready yet."
    sleep 1
  done

  echo "HSA lookup fixture did not become ready in time."
  cat "${log_file}" || true
  exit 1
}

stop_fixture() {
  local fixture_name="$1"
  local pid_file
  pid_file="$(fixture_pid_file "${fixture_name}")"

  if [ ! -f "${pid_file}" ]; then
    return 0
  fi

  local pid
  pid="$(cat "${pid_file}")"
  case "${pid}" in
    ''|0|*[!0-9]*)
      warning "Ignoring invalid HSA lookup fixture pid."
      return 0
      ;;
  esac

  kill "${pid}" 2>/dev/null || true
}

if [ "$#" -eq 1 ]; then
  case "$1" in
    -h|--help|help)
      usage
      exit 0
      ;;
  esac
fi

if [ "$#" -ne 2 ]; then
  usage >&2
  exit 2
fi

action="$1"
fixture_name="$2"
require_fixture_name "${fixture_name}"

case "${action}" in
  start)
    start_fixture "${fixture_name}"
    ;;
  stop)
    stop_fixture "${fixture_name}"
    ;;
  *)
    error "Unknown action: ${action}"
    usage >&2
    exit 2
    ;;
esac
