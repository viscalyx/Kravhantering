#!/usr/bin/env bash
# Forward 127.0.0.1:8080 (HTTP, OIDC issuer) inside this devcontainer to
# the sibling Keycloak container (idp:8080) so that:
#
#   * Server-side OIDC calls from Next.js can use the same
#     `http://localhost:8080` issuer URL the host browser uses (without
#     this, /api/auth/* fails with ECONNREFUSED 127.0.0.1:8080), and
#
#   * The host browser can reach the Keycloak admin console at
#     `http://localhost:8080/` via VS Code's port-forwarder.
#
# Keycloak's `master` realm defaults to `sslRequired=external`, which
# refuses HTTP from non-loopback clients (the socat hop makes Keycloak
# see requests coming from the app container's docker IP, not loopback).
# Since `start-dev` does not enable HTTPS in Keycloak 26 and we don't
# want to ship dev certs, we relax `sslRequired=NONE` on the master
# realm via the admin REST API once Keycloak is up. Dev only.
#
# Idempotent: does nothing if a matching socat is already running, and
# the sslRequired patch is a no-op once already applied.
set -euo pipefail

if ! command -v socat >/dev/null; then
  echo "[keycloak-forwarder] socat not installed; rebuild the devcontainer" >&2
  exit 0
fi

# Forward one port. Args: <local-port> <remote-port> <log-file>
forward_port() {
  local local_port="$1"
  local remote_port="$2"
  local log="$3"
  local pattern="socat .*TCP-LISTEN:${local_port}.*idp:${remote_port}"

  if pgrep -f "${pattern}" >/dev/null; then
    echo "[keycloak-forwarder] :${local_port} -> idp:${remote_port} already running" >&2
    return 0
  fi

  # `setsid` fully detaches socat from the postStartCommand shell so it
  # survives that shell exiting. `nohup`+`&`+`disown` alone is unreliable
  # inside `bash -lc '... & ...'` chains.
  setsid nohup socat \
    "TCP-LISTEN:${local_port},fork,reuseaddr,bind=127.0.0.1" \
    "TCP:idp:${remote_port}" \
    >"${log}" 2>&1 </dev/null &

  echo "[keycloak-forwarder] :${local_port} -> idp:${remote_port} started (log: ${log})" >&2
}

# Relax sslRequired on the master realm so the admin console works over
# HTTP from the host browser. Runs in the background so it doesn't block
# the postStartCommand if Keycloak is still booting; the script polls a
# few times and gives up quietly on failure.
relax_master_ssl_required() {
  local admin_user="${KEYCLOAK_ADMIN:-admin}"
  local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
  local base="http://127.0.0.1:8080"

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 3
    local token
    token=$(
      curl -fsS -X POST \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=${admin_user}" \
        -d "password=${admin_pass}" \
        "${base}/realms/master/protocol/openid-connect/token" \
        2>/dev/null \
        | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
    ) || continue
    if [[ -z "${token}" ]]; then
      continue
    fi
    if curl -fsS -X PUT \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d '{"sslRequired":"NONE"}' \
        "${base}/admin/realms/master" \
        >/dev/null 2>&1; then
      echo "[keycloak-forwarder] master realm sslRequired=NONE applied" >&2
      return 0
    fi
  done
  echo "[keycloak-forwarder] could not relax master realm sslRequired (Keycloak not ready?)" >&2
  return 0
}

forward_port 8080 8080 /tmp/socat-keycloak-http.log

# Detach the relax step so the postStartCommand doesn't wait on it.
# `setsid` matches what we do for socat — without it the background
# subshell is killed when the `bash -lc` postStartCommand exits.
export -f relax_master_ssl_required
export KEYCLOAK_ADMIN KEYCLOAK_ADMIN_PASSWORD
setsid nohup bash -c relax_master_ssl_required \
  >>/tmp/keycloak-relax-ssl.log 2>&1 </dev/null &
disown 2>/dev/null || true
