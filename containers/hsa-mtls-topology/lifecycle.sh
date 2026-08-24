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
  local -a recreate=()
  if [[ "${1:-}" == force-recreate ]]; then
    recreate=(--force-recreate)
  fi
  compose up --no-deps -d --wait "${recreate[@]}" mock || return 1
  compose up --no-deps -d --wait "${recreate[@]}" adapter || return 1
  compose up --no-deps -d --wait "${recreate[@]}" kong || return 1
}

authenticate() {
  local normalized_config rendered_config writable_material_count
  compose run --rm --no-deps test || return 1
  rendered_config="$(compose config)" || return 1
  if grep -Eq '(:rw|ca-signing|HSA_MOCK_AUTH_MODE|NODE_TLS_REJECT_UNAUTHORIZED)' \
    <<<"$rendered_config"; then
    echo 'Unsafe HSA topology configuration detected' >&2
    return 1
  fi
  normalized_config="$(compose --profile '*' config --format json)" || return 1
  writable_material_count="$(jq -er '
    [
      .services | to_entries[] |
      select(.key != "provisioner") |
      .value.volumes[]? |
      select((.source // "") | endswith("-material")) |
      select(.read_only != true)
    ] | length
  ' <<<"$normalized_config")" || return 1
  if (( writable_material_count > 0 )); then
    echo 'Writable HSA runtime material mount detected' >&2
    return 1
  fi
  provision inspect || return 1
}

inspect_finalization_previous() {
  local expected_generation="$1" inspection current
  if ! inspection="$(provision inspect)"; then
    echo 'HSA mTLS finalization state could not be inspected' >&2
    return 1
  fi
  current="$(
    jq -er '.result.selection.current | strings | select(length > 0)' \
      <<<"$inspection"
  )"
  if [[ "$current" != "$expected_generation" ]]; then
    echo 'HSA mTLS selection changed while reconciling finalization' >&2
    return 1
  fi
  jq -r '
    .result.selection |
    if has("previous") and
      (.previous == null or
        ((.previous | type) == "string" and (.previous | length) > 0))
    then if .previous == null then "" else .previous end
    else error("invalid selection")
    end
  ' <<<"$inspection"
}

finalize_authenticated_promotion() {
  local expected_generation="$1" previous finalize_failed=false inspect_ok=false retry_failed=false
  if ! provision finalize "$expected_generation"; then
    finalize_failed=true
  fi
  if previous="$(inspect_finalization_previous "$expected_generation")"; then
    inspect_ok=true
  fi
  if [[ "$inspect_ok" == true && -z "$previous" ]]; then
    if [[ "$finalize_failed" == true ]]; then
      echo 'HSA mTLS finalization reported failure after the promotion was reconciled' >&2
    fi
    return
  fi

  if ! provision finalize "$expected_generation"; then
    retry_failed=true
  fi
  if ! previous="$(inspect_finalization_previous "$expected_generation")"; then
    return 1
  fi
  if [[ -z "$previous" ]]; then
    if [[ "$retry_failed" == true ]]; then
      echo 'HSA mTLS finalization retry reported failure after the promotion was reconciled' >&2
    fi
    return
  fi
  echo 'HSA mTLS promotion remains pending after finalization retry' >&2
  return 1
}

verify() {
  start_endpoints
  authenticate
}

require_domain() {
  case "$DOMAIN" in
    app-to-kong | kong-to-adapter | adapter-to-hsa) ;;
    *) echo 'Expected app-to-kong, kong-to-adapter, or adapter-to-hsa' >&2; exit 2 ;;
  esac
}

ensure() {
  local action ensured previous
  compose build provisioner mock adapter test
  stop_endpoints
  if ! ensured="$(provision ensure --lifetime "$LIFETIME")"; then
    start_endpoints
    authenticate
    return 1
  fi
  action="$(jq -er '.result.action' <<<"$ensured")"
  if [[ "$action" == reused ]]; then
    start_endpoints
    authenticate
    return
  fi
  if [[ "$action" != promoted ]]; then
    echo 'HSA mTLS provisioner ensure returned an unknown action' >&2
    start_endpoints
    authenticate
    return 1
  fi

  previous="$(jq -r '.result.previousGenerationId // empty' <<<"$ensured")"
  if provision deploy && start_endpoints force-recreate && authenticate; then
    finalize_authenticated_promotion "$(jq -er '.result.generationId' <<<"$ensured")"
    return
  fi

  stop_endpoints
  if [[ -z "$previous" ]]; then
    return 1
  fi
  provision rollback
  provision deploy
  start_endpoints force-recreate
  authenticate
  return 1
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
  compose run --rm --no-TTY --no-deps test tar -C "$source" -cf - "${files[@]}" |
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
    finalize_authenticated_promotion \
      "$(jq -er '.result.selection.current' <<<"$after")"
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
