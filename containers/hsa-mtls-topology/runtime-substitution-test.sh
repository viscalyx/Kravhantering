#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "$ROOT/compose.yml")

compose() { "${COMPOSE[@]}" "$@"; }
provision() { compose run --rm provisioner "$@"; }

stop_endpoints() {
  for service in test kong adapter mock; do
    compose stop --timeout 1 "$service"
  done
}

start_endpoints() {
  compose up --no-deps -d --wait mock
  compose up --no-deps -d --wait adapter
  compose up --no-deps -d --wait kong
}

substitute() {
  local target_role="$1" target_name="$2" source_role="$3" source_name="$4"
  stop_endpoints
  provision deploy >/dev/null
  compose run --rm --entrypoint sh provisioner -eu -c \
    "cp /run/kravhantering/hsa-mtls-runtime/$source_role/$source_name.crt /run/kravhantering/hsa-mtls-runtime/$target_role/$target_name.crt; cp /run/kravhantering/hsa-mtls-runtime/$source_role/$source_name.key /run/kravhantering/hsa-mtls-runtime/$target_role/$target_name.key"
  if start_endpoints; then
    if compose run --rm --no-deps test; then
      echo "$source_name was accepted as $target_name" >&2
      exit 1
    fi
  fi
}

while read -r target_role target_name source_role source_name; do
  substitute "$target_role" "$target_name" "$source_role" "$source_name"
done <<'MATRIX'
app app-client kong kong-client
app app-client adapter adapter-client
kong kong-server adapter adapter-server
kong kong-server mock mock-server
kong kong-client app app-client
kong kong-client adapter adapter-client
adapter adapter-server kong kong-server
adapter adapter-server mock mock-server
adapter adapter-client app app-client
adapter adapter-client kong kong-client
mock mock-server kong kong-server
mock mock-server adapter adapter-server
MATRIX

stop_endpoints
provision deploy >/dev/null
start_endpoints
compose run --rm --no-deps test
echo '{"event":"hsa_runtime_substitution_matrix_verified","rejections":12}'
