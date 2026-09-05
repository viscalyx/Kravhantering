#!/usr/bin/env bash
# Release validation against a disposable target or exact rollback-source schema.
set -euo pipefail
[[ $# == 5 ]] || { printf '%s\n' 'Usage: cleanup-evidence.sh <bundle> <cleanup-release.env> <runtime.env> <topology> <output.json>' >&2; exit 2; }
BUNDLE="$1"; IMAGE_ENV="$2"; RUNTIME_ENV="$3"; TOPOLOGY="$4"; OUTPUT="$5"
case "$TOPOLOGY" in
  app-node-tls|app-node-http) NETWORK=kravhantering-app-node_egress ;;
  single-node) NETWORK=kravhantering-single-node_database ;;
  *) printf '%s\n' 'unsupported cleanup evidence topology' >&2; exit 2 ;;
esac
"$BUNDLE/bin/kravhantering-images.sh" --topology cleanup --lock-file "$BUNDLE/container-stack.lock.json" --env-file "$IMAGE_ENV" verify >/dev/null
IMAGE_ID="$(jq -er '.services[] | select(.name == "db-job") | .imageId' "$BUNDLE/container-stack.lock.json")"
RUN_ARGS=(--rm --pull=never --network "$NETWORK" --read-only --cap-drop=all --security-opt=no-new-privileges --pids-limit=128 --memory=512m --cpus=1 --env-file "$RUNTIME_ENV" --entrypoint /usr/local/bin/node)
if [[ "$TOPOLOGY" == single-node ]]; then
  RUN_ARGS+=(--env NODE_EXTRA_CA_CERTS=/run/kravhantering/tls/ca.crt --volume /etc/kravhantering/tls/ca.crt:/run/kravhantering/tls/ca.crt:ro)
fi
TEMP_FILE="$(mktemp)"
trap 'rm -f -- "$TEMP_FILE"' EXIT
if ! timeout 300 podman run "${RUN_ARGS[@]}" "$IMAGE_ID" /workspace/transient-cleanup/lib/transient-cleanup/cli.js --compatibility-evidence >"$TEMP_FILE" 2>/dev/null; then
  printf '%s\n' 'cleanup schema verification failed' >&2
  exit 1
fi
jq -se --arg image "$IMAGE_ID" '
  map(select(.event == "transient_cleanup.schema.verified")) |
  if length != 1 or .[0].outcome != "success" then error("cleanup evidence failed")
  else .[0] | {schemaVersion, schemaFingerprint, imageId: $image, outcome, targets} end
' "$TEMP_FILE" > "$OUTPUT"
