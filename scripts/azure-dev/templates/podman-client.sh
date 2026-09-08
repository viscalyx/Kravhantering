#!/usr/bin/env bash
set -euo pipefail

if [ -z "${CONTAINER_HOST:-}" ]; then
  exec /usr/bin/podman "$@"
fi

# Podman 4.9 initializes local defaults even when using the remote API. Keep
# that scratch state separate from the host engine's read-only runtime mount.
client_runtime="$(mktemp -d "${TMPDIR:-/tmp}/krav-podman-client.XXXXXX")"
trap 'rm -rf -- "${client_runtime}"' EXIT
XDG_RUNTIME_DIR="${client_runtime}" /usr/bin/podman "$@"
