#!/usr/bin/env bash
# Convenience wrapper: log in (or reuse a cached session) as a dev user
# at the local Keycloak IdP and run curl against the dev server with the
# resulting session cookies attached.
#
# Usage:
#   scripts/dev-curl.sh [curl args ...]
#   DEV_LOGIN_USER=rita.reviewer scripts/dev-curl.sh -I /sv/requirements
#   DEV_LOGIN_BASE_URL=http://localhost:3000 scripts/dev-curl.sh /api/auth/me
#
# Relative paths are resolved against $DEV_LOGIN_BASE_URL (default
# http://localhost:3000) so you can write `scripts/dev-curl.sh /sv/...`.

set -euo pipefail

USER_NAME="${DEV_LOGIN_USER:-ada.admin}"
BASE_URL="${DEV_LOGIN_BASE_URL:-http://localhost:3000}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JAR_PATH="$(node "$REPO_ROOT/scripts/dev-login.mjs" --user "$USER_NAME" --base "$BASE_URL")"

# Rewrite any bare-path arguments (starting with /) to absolute URLs so
# `scripts/dev-curl.sh /sv/foo` works without repeating the host.
args=()
for arg in "$@"; do
  case "$arg" in
    /*)
      args+=("${BASE_URL%/}${arg}")
      ;;
    *)
      args+=("$arg")
      ;;
  esac
done

exec curl -b "$JAR_PATH" "${args[@]}"
