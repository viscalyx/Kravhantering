#!/usr/bin/env bash
set -euo pipefail

if ! command -v socat >/dev/null; then
  echo "[codex-keycloak-forwarder] socat is not installed in the Codex app container" >&2
  exit 0
fi

if pgrep -f "socat .*TCP-LISTEN:8080.*idp:8080" >/dev/null; then
  echo "[codex-keycloak-forwarder] :8080 -> idp:8080 already running" >&2
  exit 0
fi

setsid nohup socat \
  "TCP-LISTEN:8080,fork,reuseaddr,bind=127.0.0.1" \
  "TCP:idp:8080" \
  >/tmp/codex-socat-keycloak-http.log 2>&1 </dev/null &

echo "[codex-keycloak-forwarder] :8080 -> idp:8080 started" >&2
