#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "$ROOT/compose.yml")
DOMAIN="${2:-}"

compose() { "${COMPOSE[@]}" "$@"; }
provision() { compose run --rm provisioner "$@"; }

stop_endpoints() {
  for service in test app kong adapter mock; do
    compose stop --timeout 1 "$service"
  done
}

start_endpoints() {
  compose up --no-deps -d --wait mock
  compose up --no-deps -d --wait adapter
  compose up --no-deps -d --wait kong
  compose up --no-deps -d --wait app
}

verify() {
  start_endpoints
  compose run --rm --no-deps test
  if compose config | grep -Eq '(:rw|ca-signing|HSA_MOCK_AUTH_MODE|NODE_TLS_REJECT_UNAUTHORIZED)'; then
    echo 'Unsafe HSA topology configuration detected' >&2
    return 1
  fi
  provision inspect
}

require_domain() {
  case "$DOMAIN" in
    app-to-kong | kong-to-adapter | adapter-to-hsa) ;;
    *) echo 'Expected app-to-kong, kong-to-adapter, or adapter-to-hsa' >&2; exit 2 ;;
  esac
}

ensure() {
  compose build provisioner mock adapter app
  provision ensure --lifetime persistent
  provision deploy
  verify
}

rotate() {
  require_domain
  stop_endpoints
  provision rotate "$DOMAIN" --lifetime persistent
  provision deploy
  if start_endpoints && compose run --rm --no-deps test; then
    provision finalize
    provision inspect
    return
  fi
  stop_endpoints
  provision rollback
  provision deploy
  verify
  return 1
}

rollback_verify() {
  require_domain
  local prior restored
  prior="$(provision inspect | jq -er '.result.selection.current')"
  stop_endpoints
  provision rotate "$DOMAIN" --lifetime persistent
  provision deploy
  start_endpoints
  if compose run --rm --no-deps -e HSA_MTLS_FORCE_VERIFY_FAILURE=true test; then
    echo 'Injected verification failure unexpectedly passed' >&2
    exit 1
  fi
  stop_endpoints
  provision rollback
  provision deploy
  verify
  restored="$(provision inspect | jq -er '.result.selection.current')"
  [[ "$restored" == "$prior" ]]
}

case "${1:-}" in
  ensure) ensure ;;
  verify) verify ;;
  inspect) provision inspect ;;
  rotate) rotate ;;
  rollback-verification) rollback_verify ;;
  *)
    echo "Usage: $0 <ensure|verify|inspect|rotate|rollback-verification> [trust-domain]" >&2
    exit 2
    ;;
esac
