#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/security/prodlike-app.sh start|stop RESULTS_DIR

Starts or stops the local prodlike Next.js server used by security workflows.
The helper writes app.log and app.pgid under RESULTS_DIR.
EOF
}

error() {
  echo "::error::$*" >&2
}

warning() {
  echo "::warning::$*" >&2
}

require_result_dir() {
  if [ -z "${1-}" ]; then
    error "RESULTS_DIR is required."
    usage >&2
    exit 2
  fi
}

start_app() {
  local results_dir="$1"
  local log_file="${results_dir%/}/app.log"
  local pgid_file="${results_dir%/}/app.pgid"
  mkdir -p "${results_dir}"
  rm -f "${pgid_file}"

  if ! command -v setsid > /dev/null 2>&1; then
    error "setsid is required to isolate prodlike app cleanup."
    exit 1
  fi

  # Mirror the `start:prodlike` npm script after the workflow has already
  # built the bundle with `npm run build:local-prod`.
  NODE_ENV=production BUILD_TARGET=local-prod \
    setsid nohup npx dotenv -e .env.prodlike -- \
    npx next start --hostname 127.0.0.1 --port 3001 \
    > "${log_file}" 2>&1 < /dev/null &

  local pgid="$!"
  printf '%s\n' "${pgid}" > "${pgid_file}"
}

stop_app() {
  local results_dir="$1"
  local pgid_file="${results_dir%/}/app.pgid"

  if [ ! -f "${pgid_file}" ]; then
    return 0
  fi

  local pgid
  pgid="$(cat "${pgid_file}")"
  case "${pgid}" in
    ''|0*|*[!0-9]*)
      warning "Ignoring invalid prodlike app process group id."
      return 0
      ;;
  esac

  kill -TERM -- "-${pgid}" 2>/dev/null || true
  for _ in $(seq 1 10); do
    kill -0 -- "-${pgid}" 2>/dev/null || return 0
    sleep 1
  done
  kill -KILL -- "-${pgid}" 2>/dev/null || true
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
results_dir="$2"

case "${action}" in
  start)
    require_result_dir "${results_dir}"
    start_app "${results_dir}"
    ;;
  stop)
    require_result_dir "${results_dir}"
    stop_app "${results_dir}"
    ;;
  *)
    error "Unknown action: ${action}"
    usage >&2
    exit 2
    ;;
esac
