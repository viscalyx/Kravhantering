#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "$ROOT/compose.yml")

container_id() {
  "${COMPOSE[@]}" ps -q "$1"
}

assert_hsa_mount() {
  local service="$1" destination="$2" id
  id="$(container_id "$service")"
  [[ -n "$id" ]]
  docker inspect "$id" | jq -e --arg destination "$destination" '
    any(.[0].Mounts[]; .Destination == $destination and .RW == false) and
    ([.[0].Mounts[] | select(.Destination | contains("hsa-mtls"))] | length) == 1
  ' >/dev/null
}

assert_bundle() {
  local service="$1" uid="$2" gid="$3"; shift 3
  local filename expected mode
  for filename in "$@"; do
    case "$filename" in
      *.key) mode=400 ;;
      *) mode=444 ;;
    esac
    expected="$mode:$uid:$gid"
    [[ "$("${COMPOSE[@]}" exec -T "$service" stat -c '%a:%u:%g' "/run/kravhantering/hsa-mtls/$filename")" == "$expected" ]]
  done
  ! "${COMPOSE[@]}" exec -T "$service" sh -c \
    "find /run/kravhantering/hsa-mtls -type f \( -name '*ca*.key' -o -name '*signing*' \) -print -quit" | grep -q .
}

assert_hsa_mount kong /run/kravhantering/hsa-mtls
assert_hsa_mount adapter /run/kravhantering/hsa-mtls
assert_hsa_mount mock /run/kravhantering/hsa-mtls

assert_bundle kong 1001 1001 \
  kong-server.crt kong-server.key app-client-ca.crt \
  kong-client.crt kong-client.key adapter-server-ca.crt
assert_bundle adapter 1000 1000 \
  adapter-server.crt adapter-server.key kong-client-ca.crt \
  adapter-client.crt adapter-client.key hsa-server-ca.crt
assert_bundle mock 1000 1000 \
  mock-server.crt mock-server.key adapter-client-ca.crt

for service in kong adapter mock; do
  id="$(container_id "$service")"
  if docker inspect "$id" |
    jq -e '.[0].Mounts[] | select(.Destination | contains("issuer"))' >/dev/null; then
    echo "Issuer material is mounted into $service" >&2
    exit 1
  fi
done

printf '%s\n' '{"event":"hsa_runtime_inspection_verified","read_only_role_bundles":3,"file_modes_verified":15,"ca_signing_keys":0}'
