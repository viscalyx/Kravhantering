#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "$ROOT/compose.yml")

compose() { "${COMPOSE[@]}" "$@"; }
provision() { compose run --rm provisioner "$@"; }

stop_services() {
  compose stop --timeout 1 "$@" >/dev/null
}

remove_services() {
  compose rm --force "$@" >/dev/null
}

start_real_topology() {
  compose up --no-deps -d --wait mock
  compose up --no-deps -d --wait adapter
  compose up --no-deps -d --wait kong
}

stop_real_topology() {
  stop_services kong adapter mock
}

restore_real_topology() {
  stop_services kong adapter mock decoy-kong decoy-adapter decoy-mock
  remove_services decoy-kong decoy-adapter decoy-mock
  provision deploy >/dev/null
  start_real_topology
}

cleanup_on_failure() {
  local status="$?"
  trap - EXIT
  if (( status != 0 )); then
    set +e
    restore_real_topology
  fi
  exit "$status"
}
trap cleanup_on_failure EXIT

mutate_server_bundle() {
  local role="$1" server_name="$2" wrong_name="$3"
  provision deploy >/dev/null
  compose run --rm --entrypoint sh provisioner -eu -c \
    "cp /run/kravhantering/hsa-mtls-runtime/probe/$wrong_name.crt /run/kravhantering/hsa-mtls-runtime/$role/$server_name.crt; cp /run/kravhantering/hsa-mtls-runtime/probe/$wrong_name.key /run/kravhantering/hsa-mtls-runtime/$role/$server_name.key"
}

assert_real_client_rejects() {
  local domain="$1" decoy="$2"
  compose run --rm --no-deps \
    -e HSA_MTLS_EXPECT_SERVER_REJECTION="$domain" test
  local logs
  logs="$(compose logs --no-color "$decoy")"
  grep -q '"event":"hsa_wrong_server_decoy_connection"' <<<"$logs"
  if grep -q '"event":"hsa_wrong_server_decoy_request"' <<<"$logs"; then
    echo "Wrong server identity reached HTTP handling on $domain" >&2
    return 1
  fi
}

verify_restored_topology() {
  restore_real_topology
  compose run --rm --no-deps test
}

run_app_to_kong_case() {
  stop_real_topology
  remove_services kong
  mutate_server_bundle kong kong-server wrong-kong-server
  compose up --no-deps -d --wait decoy-kong
  assert_real_client_rejects app-to-kong decoy-kong
  verify_restored_topology
}

run_kong_to_adapter_case() {
  stop_real_topology
  remove_services adapter
  mutate_server_bundle adapter adapter-server wrong-adapter-server
  compose up --no-deps -d --wait decoy-adapter
  compose up --no-deps -d --wait kong
  assert_real_client_rejects kong-to-adapter decoy-adapter
  verify_restored_topology
}

run_adapter_to_hsa_case() {
  stop_real_topology
  remove_services mock
  mutate_server_bundle mock mock-server wrong-mock-server
  compose up --no-deps -d --wait decoy-mock
  compose up --no-deps -d --wait adapter
  compose up --no-deps -d --wait kong
  assert_real_client_rejects adapter-to-hsa decoy-mock
  verify_restored_topology
}

run_app_to_kong_case
run_kong_to_adapter_case
run_adapter_to_hsa_case
trap - EXIT
printf '%s\n' '{"event":"hsa_deployed_wrong_server_matrix_verified","real_client_rejections":3,"restored_authentications":3}'
