#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "$ROOT/compose.yml")
DOMAIN="${2:-}"
LIFETIME="${HSA_MTLS_LIFETIME:-persistent}"
PROFILE="$ROOT/../hsa-mtls/certificate-profile.json"

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
  compose build provisioner mock adapter test
  provision ensure --lifetime "$LIFETIME"
  provision deploy
  verify
}

capture_stale_probe() {
  local target="$1" source
  local -a files
  case "$DOMAIN" in
    app-to-kong)
      source=/runtime/app
      files=(app-client.crt app-client.key kong-server-ca.crt)
      ;;
    kong-to-adapter)
      source=/runtime/kong
      files=(kong-client.crt kong-client.key adapter-server-ca.crt)
      ;;
    adapter-to-hsa)
      source=/runtime/adapter
      files=(adapter-client.crt adapter-client.key hsa-server-ca.crt)
      ;;
  esac
  compose run --rm --no-deps test tar -C "$source" -cf - "${files[@]}" |
    tar -C "$target" -xf -
}

reject_stale_probe() {
  local target="$1" host servername cert key ca path
  case "$DOMAIN" in
    app-to-kong)
      host=kong; servername=kong; cert=app-client.crt; key=app-client.key
      ca=kong-server-ca.crt; path=/hsa/person-records/lookup
      ;;
    kong-to-adapter)
      host=adapter; servername=hsa-person-lookup-adapter; cert=kong-client.crt
      key=kong-client.key; ca=adapter-server-ca.crt; path=/hsa/person-records/lookup
      ;;
    adapter-to-hsa)
      host=mock; servername=hsa-directory-mock; cert=adapter-client.crt
      key=adapter-client.key; ca=hsa-server-ca.crt; path=/svr-hsaws2/hsaws
      ;;
  esac
  compose run --rm --no-deps --volume "$target:/runtime/stale:ro" \
    -e STALE_HOST="$host" -e STALE_SERVER_NAME="$servername" \
    -e STALE_CERT="$cert" -e STALE_KEY="$key" -e STALE_CA="$ca" \
    -e STALE_PATH="$path" test node --input-type=module -e '
      const fs = await import("node:fs")
      const https = await import("node:https")
      const request = https.request({
        ca: fs.readFileSync(`/runtime/stale/${process.env.STALE_CA}`),
        cert: fs.readFileSync(`/runtime/stale/${process.env.STALE_CERT}`),
        host: process.env.STALE_HOST,
        key: fs.readFileSync(`/runtime/stale/${process.env.STALE_KEY}`),
        method: "POST",
        minVersion: "TLSv1.2",
        path: process.env.STALE_PATH,
        port: 8443,
        rejectUnauthorized: true,
        servername: process.env.STALE_SERVER_NAME,
      })
      request.on("response", () => process.exit(1))
      request.on("error", () => process.exit(0))
      request.end("{}")
    '
}

assert_rotation_metadata() {
  local before="$1" after="$2" part
  for part in ca client server; do
    [[ "$(jq -r --arg domain "$DOMAIN" --arg part "$part" '.result.current.trustDomains[$domain][$part].digestSha256' <<<"$before")" != \
       "$(jq -r --arg domain "$DOMAIN" --arg part "$part" '.result.current.trustDomains[$domain][$part].digestSha256' <<<"$after")" ]]
    [[ "$(jq -r --arg domain "$DOMAIN" --arg part "$part" '.result.current.trustDomains[$domain][$part].subjectRfc2253' <<<"$before")" == \
       "$(jq -r --arg domain "$DOMAIN" --arg part "$part" '.result.current.trustDomains[$domain][$part].subjectRfc2253' <<<"$after")" ]]
  done
  jq -e --arg domain "$DOMAIN" \
    '.trustDomains[$domain].client.authorization.value | strings | length > 0' \
    "$PROFILE" >/dev/null
  jq -e --arg domain "$DOMAIN" \
    '.trustDomains[$domain].server.authorization.value | strings | length > 0' \
    "$PROFILE" >/dev/null
}

rotate() {
  local before after stale
  require_domain
  before="$(provision inspect)"
  stale="$(mktemp -d)"
  trap 'rm -rf -- "$stale"' RETURN
  capture_stale_probe "$stale"
  stop_endpoints
  provision rotate "$DOMAIN" --lifetime "$LIFETIME"
  provision deploy
  if start_endpoints && compose run --rm --no-deps test; then
    after="$(provision inspect)"
    assert_rotation_metadata "$before" "$after"
    reject_stale_probe "$stale"
    provision finalize
    after="$(provision inspect)"
    [[ "$(jq -r '.result.selection.previous' <<<"$after")" == null ]]
    printf '%s\n' \
      "{\"event\":\"hsa_rotation_verified\",\"trust_domain\":\"$DOMAIN\",\"ca_and_both_leaves_changed\":true,\"stable_identities_preserved\":true,\"stale_material_rejected\":true,\"prior_deleted\":true}"
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
  local failed prior restored rollback
  prior="$(provision inspect | jq -er '.result.selection.current')"
  stop_endpoints
  provision rotate "$DOMAIN" --lifetime "$LIFETIME"
  provision deploy
  failed="$(provision inspect | jq -er '.result.selection.current')"
  start_endpoints
  if compose run --rm --no-deps -e HSA_MTLS_FORCE_VERIFY_FAILURE=true test; then
    echo 'Injected verification failure unexpectedly passed' >&2
    exit 1
  fi
  stop_endpoints
  rollback="$(provision rollback)"
  [[ "$(jq -r '.result.deletedGenerationId' <<<"$rollback")" == "$failed" ]]
  provision deploy
  verify
  restored="$(provision inspect | jq -er '.result.selection.current')"
  [[ "$restored" == "$prior" ]]
  printf '%s\n' \
    "{\"event\":\"hsa_rollback_verified\",\"trust_domain\":\"$DOMAIN\",\"failed_generation_deleted\":true,\"prior_authenticated\":true}"
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
