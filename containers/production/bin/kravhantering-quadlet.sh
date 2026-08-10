#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BUNDLE_ROOT="${KRAVHANTERING_BUNDLE_ROOT:-$(cd -- "$SCRIPT_DIR/.." && pwd -P)}"
RELEASE_ENV_FILE="${KRAVHANTERING_RELEASE_ENV_FILE:-/etc/kravhantering/release.env}"
KEYCLOAK_ENV_FILE="${KRAVHANTERING_KEYCLOAK_ENV_FILE:-/etc/kravhantering/keycloak.env}"
TEMPLATE_ROOT="$BUNDLE_ROOT/quadlet/templates"
QUADLET_DIR="${KRAVHANTERING_QUADLET_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/containers/systemd}"
SYSTEMD_USER_DIR="${KRAVHANTERING_SYSTEMD_USER_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user}"

usage() {
  cat <<'USAGE'
Usage:
  kravhantering-quadlet.sh render --topology <app-node-tls|app-node-http|single-node> [--output-dir <path>]
  kravhantering-quadlet.sh install --topology <app-node-tls|app-node-http|single-node>
  kravhantering-quadlet.sh verify-host --topology <app-node-tls|app-node-http|single-node>
  kravhantering-quadlet.sh status --topology <app-node-tls|app-node-http|single-node>
  kravhantering-quadlet.sh remove --topology <app-node-tls|app-node-http|single-node>
  kravhantering-quadlet.sh print-network --topology <app-node-tls|app-node-http|single-node> --purpose <edge|identity|database|egress>
  kravhantering-quadlet.sh print-resolver --topology <app-node-tls|app-node-http|single-node> --purpose <edge|identity|database|egress>
USAGE
}

fail() {
  printf 'kravhantering-quadlet: %s\n' "$*" >&2
  exit 1
}

topology_target() {
  case "$1" in
    app-node-tls | app-node-http) printf '%s\n' 'kravhantering-app-node.target' ;;
    single-node) printf '%s\n' 'kravhantering-single-node.target' ;;
    *) fail "unsupported topology: $1" ;;
  esac
}

topology_network() {
  local topology="$1" purpose="$2"
  case "$topology:$purpose" in
    app-node-tls:edge | app-node-http:edge)
      printf '%s\n' 'kravhantering-app-node_edge'
      ;;
    app-node-tls:egress | app-node-http:egress)
      printf '%s\n' 'kravhantering-app-node_egress'
      ;;
    single-node:edge | single-node:identity | single-node:database | single-node:egress)
      printf 'kravhantering-single-node_%s\n' "$purpose"
      ;;
    app-node-tls:* | app-node-http:*)
      fail "network purpose $purpose is unavailable for topology $topology"
      ;;
    single-node:*) fail "unsupported network purpose: $purpose" ;;
    *) fail "unsupported topology: $topology" ;;
  esac
}

network_resolver() {
  local topology="$1" purpose="$2" network resolver
  local podman_bin="${KRAVHANTERING_PODMAN_BIN:-podman}"
  network="$(topology_network "$topology" "$purpose")"
  read_release_env
  [[ -n "${NGINX_IMAGE_REF-}" ]] || \
    fail 'release.env is missing required value: NGINX_IMAGE_REF'
  resolver="$(
    "$podman_bin" run --rm --pull=never --network "$network" \
      --entrypoint /bin/sh "$NGINX_IMAGE_REF" -c \
      "awk '/^nameserver / { print \$2; exit }' /etc/resolv.conf"
  )" || fail "cannot discover the resolver for network: $network"
  [[ "$resolver" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || \
    fail "network returned an invalid IPv4 resolver: $network"
  printf '%s\n' "$resolver"
}

required_values() {
  case "$1" in
    app-node-tls)
      printf '%s\n' APP_RUNTIME_IMAGE_REF NGINX_IMAGE_REF NGINX_HTTPS_BIND \
        NGINX_RESOLVER
      ;;
    app-node-http)
      printf '%s\n' APP_RUNTIME_IMAGE_REF NGINX_IMAGE_REF NGINX_HTTP_BIND \
        NGINX_RESOLVER
      ;;
    single-node)
      printf '%s\n' APP_RUNTIME_IMAGE_REF NGINX_IMAGE_REF NGINX_HTTPS_BIND \
        NGINX_RESOLVER PUBLIC_HOSTNAME SQLSERVER_IMAGE_REF
      if [[ "$IDENTITY_PROVIDER_MODE" != external ]]; then
        printf '%s\n' KEYCLOAK_IMAGE_REF NGINX_IDENTITY_RESOLVER
      fi
      if [[ "$IDENTITY_PROVIDER_MODE" == hardened-bundled ]]; then
        printf '%s\n' KEYCLOAK_MANAGEMENT_HTTPS_BIND
      fi
      ;;
    *) fail "unsupported topology: $1" ;;
  esac
}

template_values() {
  required_values "$1"
  printf '%s\n' \
    APP_RUNTIME_CPU_QUOTA_PERCENT \
    APP_RUNTIME_EXPORT_MOUNT \
    APP_RUNTIME_MEMORY_LIMIT_MIB \
    APP_RUNTIME_PIDS_LIMIT \
    APP_RUNTIME_TASKS_MAX \
    KEYCLOAK_CPU_QUOTA_PERCENT \
    KEYCLOAK_MEMORY_LIMIT_MIB \
    KEYCLOAK_PIDS_LIMIT \
    KEYCLOAK_QUARKUS_TMPFS_MIB \
    KEYCLOAK_TASKS_MAX \
    KEYCLOAK_TMPFS_MIB \
    KEYCLOAK_MANAGEMENT_MTLS_VOLUMES \
    KEYCLOAK_APP_DEPENDENCIES \
    KEYCLOAK_NGINX_DEPENDENCIES \
    KEYCLOAK_NGINX_ENVIRONMENT \
    KEYCLOAK_NGINX_NETWORK \
    KEYCLOAK_TARGET_DEPENDENCIES \
    NGINX_CACHE_TMPFS_MIB \
    NGINX_CPU_QUOTA_PERCENT \
    NGINX_HTTPS_PUBLISH \
    NGINX_MEMORY_LIMIT_MIB \
    NGINX_KEYCLOAK_MANAGEMENT_PUBLISH \
    NGINX_PIDS_LIMIT \
    NGINX_SINGLE_NODE_TEMPLATE \
    NGINX_TASKS_MAX \
    PUBLIC_ISSUER_HOST_MAPPING \
    SQLSERVER_CPU_QUOTA_PERCENT \
    SQLSERVER_MEMORY_LIMIT_MIB \
    SQLSERVER_PIDS_LIMIT \
    SQLSERVER_TASKS_MAX \
    SQLSERVER_TMPFS_MIB
}

read_release_env() {
  [[ -r "$RELEASE_ENV_FILE" ]] || fail "cannot read release env: $RELEASE_ENV_FILE"

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == *=* ]] || fail "invalid release.env line: $line"
    key="${line%%=*}"
    value="${line#*=}"
    [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || fail "invalid release.env key: $key"
    printf -v "$key" '%s' "$value"
  done <"$RELEASE_ENV_FILE"
}

read_env_value() {
  local file="$1" requested_key="$2" line value=''
  [[ -r "$file" ]] || fail "cannot read env file: $file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" == "$requested_key="* ]] || continue
    value="${line#*=}"
  done <"$file"
  printf '%s\n' "$value"
}

configure_identity_provider() {
  default_release_value IDENTITY_PROVIDER_MODE bundled
  case "$IDENTITY_PROVIDER_MODE" in
    bundled)
      KEYCLOAK_APP_DEPENDENCIES='kravhantering-keycloak.service'
      KEYCLOAK_NGINX_DEPENDENCIES='kravhantering-keycloak.service'
      KEYCLOAK_NGINX_ENVIRONMENT="Environment=NGINX_IDENTITY_RESOLVER=${NGINX_IDENTITY_RESOLVER-}"
      KEYCLOAK_NGINX_NETWORK='Network=kravhantering-single-node-identity.network'
      KEYCLOAK_TARGET_DEPENDENCIES='kravhantering-keycloak.service'
      KEYCLOAK_MANAGEMENT_MTLS_VOLUMES=''
      NGINX_KEYCLOAK_MANAGEMENT_PUBLISH=''
      NGINX_SINGLE_NODE_TEMPLATE='single-node-tls.conf.template'
      PUBLIC_ISSUER_HOST_MAPPING="PodmanArgs=--add-host=${PUBLIC_HOSTNAME-}:host-gateway"
      ;;
    external)
      NGINX_IDENTITY_RESOLVER=''
      KEYCLOAK_APP_DEPENDENCIES=''
      KEYCLOAK_NGINX_DEPENDENCIES=''
      KEYCLOAK_NGINX_ENVIRONMENT=''
      KEYCLOAK_NGINX_NETWORK=''
      KEYCLOAK_TARGET_DEPENDENCIES=''
      KEYCLOAK_MANAGEMENT_MTLS_VOLUMES=''
      NGINX_KEYCLOAK_MANAGEMENT_PUBLISH=''
      NGINX_SINGLE_NODE_TEMPLATE='single-node-external-oidc-tls.conf.template'
      PUBLIC_ISSUER_HOST_MAPPING=''
      ;;
    hardened-bundled)
      KEYCLOAK_APP_DEPENDENCIES='kravhantering-keycloak.service'
      KEYCLOAK_NGINX_DEPENDENCIES='kravhantering-keycloak.service'
      KEYCLOAK_NGINX_ENVIRONMENT="Environment=NGINX_IDENTITY_RESOLVER=${NGINX_IDENTITY_RESOLVER-}"
      KEYCLOAK_NGINX_NETWORK='Network=kravhantering-single-node-identity.network'
      KEYCLOAK_TARGET_DEPENDENCIES='kravhantering-keycloak.service'
      KEYCLOAK_MANAGEMENT_MTLS_VOLUMES=$'Volume=/etc/kravhantering/keycloak-management-tls/client-ca.crt:/etc/nginx/keycloak-management-tls/client-ca.crt:ro\nVolume=/etc/kravhantering/keycloak-management-tls/fullchain.pem:/etc/nginx/keycloak-management-tls/fullchain.pem:ro\nVolume=/etc/kravhantering/keycloak-management-tls/privkey.pem:/etc/nginx/keycloak-management-tls/privkey.pem:ro'
      NGINX_KEYCLOAK_MANAGEMENT_PUBLISH="PublishPort=${KEYCLOAK_MANAGEMENT_HTTPS_BIND-}"
      NGINX_SINGLE_NODE_TEMPLATE='single-node-hardened-keycloak-tls.conf.template'
      PUBLIC_ISSUER_HOST_MAPPING="PodmanArgs=--add-host=${PUBLIC_HOSTNAME-}:host-gateway"
      ;;
    *)
      fail 'invalid IDENTITY_PROVIDER_MODE: expected bundled, external, or hardened-bundled'
      ;;
  esac
}

validate_release_env() {
  local key value
  while IFS= read -r key; do
    value="${!key-}"
    [[ -n "$value" ]] || fail "release.env is missing required value: $key"
  done < <(required_values "$1")
}

validate_identity_provider() {
  local bind_address container_port host_port host_port_value octet octet_value
  local -a bind_octets=() bind_octet_values=()
  [[ "$IDENTITY_PROVIDER_MODE" == hardened-bundled ]] || return 0
  KC_HOSTNAME_ADMIN="$(read_env_value "$KEYCLOAK_ENV_FILE" KC_HOSTNAME_ADMIN)"
  [[ -n "$KC_HOSTNAME_ADMIN" ]] || \
    fail 'keycloak.env is missing required value: KC_HOSTNAME_ADMIN for IDENTITY_PROVIDER_MODE=hardened-bundled'
  [[ -n "${KEYCLOAK_MANAGEMENT_HTTPS_BIND-}" ]] || \
    fail 'release.env is missing required value: KEYCLOAK_MANAGEMENT_HTTPS_BIND'
  [[ "$KEYCLOAK_MANAGEMENT_HTTPS_BIND" =~ ^([0-9]+\.){3}[0-9]+:[0-9]{1,5}:[0-9]{1,5}$ ]] || \
    fail 'invalid KEYCLOAK_MANAGEMENT_HTTPS_BIND: expected an explicit IPv4 bind'
  IFS=: read -r bind_address host_port container_port <<<"$KEYCLOAK_MANAGEMENT_HTTPS_BIND"
  IFS=. read -r -a bind_octets <<<"$bind_address"
  for octet in "${bind_octets[@]}"; do
    [[ "$octet" =~ ^(0|[1-9][0-9]{0,2})$ ]] || \
      fail 'invalid KEYCLOAK_MANAGEMENT_HTTPS_BIND: expected canonical decimal IPv4 octets'
    octet_value=$((10#$octet))
    (( octet_value <= 255 )) || \
      fail 'invalid KEYCLOAK_MANAGEMENT_HTTPS_BIND: expected an explicit IPv4 bind'
    bind_octet_values+=("$octet_value")
  done
  (( bind_octet_values[0] != 0 || bind_octet_values[1] != 0 || \
    bind_octet_values[2] != 0 || bind_octet_values[3] != 0 )) || \
    fail 'invalid KEYCLOAK_MANAGEMENT_HTTPS_BIND: must not use a wildcard address'
  host_port_value=$((10#$host_port))
  (( host_port_value >= 1 && host_port_value <= 65535 )) || \
    fail 'invalid KEYCLOAK_MANAGEMENT_HTTPS_BIND: expected host port 1-65535'
  [[ "$container_port" == 9443 ]] || \
    fail 'invalid KEYCLOAK_MANAGEMENT_HTTPS_BIND: must target container port 9443'
}

default_release_value() {
  local key="$1" value="$2"
  [[ -n "${!key-}" ]] || printf -v "$key" '%s' "$value"
}

validate_integer_range() {
  local key="$1" minimum="$2" maximum="$3" value="${!1-}"
  [[ "$value" =~ ^[0-9]+$ ]] || fail "invalid $key: expected a decimal integer"
  (( value >= minimum && value <= maximum )) || \
    fail "invalid $key: expected $minimum-$maximum"
}

configure_containment() {
  local topology_cpu_capacity
  default_release_value APP_RUNTIME_MEMORY_LIMIT_MIB 4096
  default_release_value APP_RUNTIME_CPU_QUOTA_PERCENT 300
  default_release_value APP_RUNTIME_PIDS_LIMIT 512
  default_release_value APP_RUNTIME_EXPORT_STORAGE tmpfs
  default_release_value APP_RUNTIME_EXPORT_TMPFS_MIB 1024
  default_release_value NGINX_MEMORY_LIMIT_MIB 512
  default_release_value NGINX_CPU_QUOTA_PERCENT 100
  default_release_value NGINX_PIDS_LIMIT 128
  default_release_value NGINX_CACHE_TMPFS_MIB 64
  default_release_value SQLSERVER_MEMORY_LIMIT_MIB 4096
  default_release_value SQLSERVER_CPU_QUOTA_PERCENT 200
  default_release_value SQLSERVER_PIDS_LIMIT 1024
  default_release_value SQLSERVER_TMPFS_MIB 512
  default_release_value KEYCLOAK_MEMORY_LIMIT_MIB 3072
  default_release_value KEYCLOAK_CPU_QUOTA_PERCENT 100
  default_release_value KEYCLOAK_PIDS_LIMIT 512
  default_release_value KEYCLOAK_QUARKUS_TMPFS_MIB 64
  default_release_value KEYCLOAK_TMPFS_MIB 512

  validate_integer_range APP_RUNTIME_MEMORY_LIMIT_MIB 4096 8192
  validate_integer_range APP_RUNTIME_CPU_QUOTA_PERCENT 50 "$(( $(nproc) * 100 ))"
  validate_integer_range APP_RUNTIME_PIDS_LIMIT 128 1024
  validate_integer_range APP_RUNTIME_EXPORT_TMPFS_MIB 1024 4096
  validate_integer_range NGINX_MEMORY_LIMIT_MIB 256 1024
  validate_integer_range NGINX_CPU_QUOTA_PERCENT 25 "$(( $(nproc) * 100 ))"
  validate_integer_range NGINX_PIDS_LIMIT 32 512
  validate_integer_range NGINX_CACHE_TMPFS_MIB 16 256
  if [[ "$TOPOLOGY" == single-node ]]; then
    validate_integer_range SQLSERVER_MEMORY_LIMIT_MIB 2048 8192
    validate_integer_range SQLSERVER_CPU_QUOTA_PERCENT 50 "$(( $(nproc) * 100 ))"
    validate_integer_range SQLSERVER_PIDS_LIMIT 128 2048
    validate_integer_range SQLSERVER_TMPFS_MIB 128 2048
    if [[ "$IDENTITY_PROVIDER_MODE" != external ]]; then
      validate_integer_range KEYCLOAK_MEMORY_LIMIT_MIB 512 4096
      validate_integer_range KEYCLOAK_CPU_QUOTA_PERCENT 25 "$(( $(nproc) * 100 ))"
      validate_integer_range KEYCLOAK_PIDS_LIMIT 64 1024
      validate_integer_range KEYCLOAK_QUARKUS_TMPFS_MIB 32 256
      validate_integer_range KEYCLOAK_TMPFS_MIB 128 2048
    fi
  fi

  (( APP_RUNTIME_EXPORT_TMPFS_MIB * 2 <= APP_RUNTIME_MEMORY_LIMIT_MIB )) || \
    fail 'invalid APP_RUNTIME_EXPORT_TMPFS_MIB: must not exceed half APP_RUNTIME_MEMORY_LIMIT_MIB'
  (( NGINX_CACHE_TMPFS_MIB * 2 <= NGINX_MEMORY_LIMIT_MIB )) || \
    fail 'invalid NGINX_CACHE_TMPFS_MIB: must not exceed half NGINX_MEMORY_LIMIT_MIB'
  if [[ "$TOPOLOGY" == single-node ]]; then
    (( SQLSERVER_TMPFS_MIB * 2 <= SQLSERVER_MEMORY_LIMIT_MIB )) || \
      fail 'invalid SQLSERVER_TMPFS_MIB: must not exceed half SQLSERVER_MEMORY_LIMIT_MIB'
    if [[ "$IDENTITY_PROVIDER_MODE" != external ]]; then
      (( (KEYCLOAK_TMPFS_MIB + KEYCLOAK_QUARKUS_TMPFS_MIB) * 2 <= KEYCLOAK_MEMORY_LIMIT_MIB )) || \
        fail 'invalid Keycloak tmpfs combination: must not exceed half KEYCLOAK_MEMORY_LIMIT_MIB'
    fi
    topology_cpu_capacity="$(( $(nproc) * 200 ))"
    (( topology_cpu_capacity <= 800 )) || topology_cpu_capacity=800
    local identity_cpu_quota=0
    [[ "$IDENTITY_PROVIDER_MODE" == external ]] || identity_cpu_quota="$KEYCLOAK_CPU_QUOTA_PERCENT"
    (( APP_RUNTIME_CPU_QUOTA_PERCENT + NGINX_CPU_QUOTA_PERCENT + SQLSERVER_CPU_QUOTA_PERCENT + identity_cpu_quota <= topology_cpu_capacity )) || \
      fail 'invalid CPU quota combination: exceeds single-node CPU capacity'
  else
    topology_cpu_capacity="$(( $(nproc) * 100 ))"
    (( topology_cpu_capacity <= 400 )) || topology_cpu_capacity=400
    (( APP_RUNTIME_CPU_QUOTA_PERCENT + NGINX_CPU_QUOTA_PERCENT <= topology_cpu_capacity )) || \
      fail 'invalid CPU quota combination: exceeds topology CPU capacity'
  fi

  APP_RUNTIME_TASKS_MAX="$(( APP_RUNTIME_PIDS_LIMIT + 32 ))"
  NGINX_TASKS_MAX="$(( NGINX_PIDS_LIMIT + 32 ))"
  SQLSERVER_TASKS_MAX="$(( SQLSERVER_PIDS_LIMIT + 32 ))"
  KEYCLOAK_TASKS_MAX="$(( KEYCLOAK_PIDS_LIMIT + 32 ))"
  if [[ -n "${NGINX_HTTPS_BIND-}" ]]; then
    NGINX_HTTPS_PUBLISH="${NGINX_HTTPS_BIND%:*}:8443"
  else
    NGINX_HTTPS_PUBLISH=''
  fi

  case "$APP_RUNTIME_EXPORT_STORAGE" in
    tmpfs)
      [[ -z "${APP_RUNTIME_EXPORT_HOST_PATH-}" ]] || \
        fail 'invalid APP_RUNTIME_EXPORT_HOST_PATH: only valid with bind storage'
      APP_RUNTIME_EXPORT_MOUNT="Tmpfs=/run/kravhantering/export:rw,size=${APP_RUNTIME_EXPORT_TMPFS_MIB}M,mode=0700,U,nosuid,nodev,noexec"
      ;;
    bind)
      local export_path="${APP_RUNTIME_EXPORT_HOST_PATH-}" export_mode
      local export_available_bytes
      local podman_bin="${KRAVHANTERING_PODMAN_BIN:-podman}"
      [[ "$export_path" == /* ]] || \
        fail 'invalid APP_RUNTIME_EXPORT_HOST_PATH: expected an absolute path'
      [[ -d "$export_path" && ! -L "$export_path" ]] || \
        fail 'invalid APP_RUNTIME_EXPORT_HOST_PATH: expected an existing nonsymlink directory'
      export_mode="$(stat -c '%a' -- "$export_path")"
      [[ "$export_mode" == 700 ]] || \
        fail 'invalid APP_RUNTIME_EXPORT_HOST_PATH: expected mode 0700'
      "$podman_bin" unshare setpriv --reuid=1000 --regid=1000 \
        --clear-groups sh -c \
        'test -r "$1" && test -w "$1" && test -x "$1"' sh \
        "$export_path" >/dev/null 2>&1 || \
        fail 'invalid APP_RUNTIME_EXPORT_HOST_PATH: container UID 1000 lacks read, write, or search access'
      export_available_bytes="$(df --output=avail -B1 -- "$export_path" | tail -n 1 | tr -d ' ')"
      (( export_available_bytes >= 1073741824 )) || \
        fail 'invalid APP_RUNTIME_EXPORT_HOST_PATH: less than 1 GiB is available'
      APP_RUNTIME_EXPORT_MOUNT="Volume=$export_path:/run/kravhantering/export:rw,Z,nosuid,nodev,noexec"
      ;;
    *) fail 'invalid APP_RUNTIME_EXPORT_STORAGE: expected tmpfs or bind' ;;
  esac
}

managed_unit_names() {
  printf '%s\n' \
    kravhantering-app-node.network \
    kravhantering-app-node-edge.network \
    kravhantering-app-node-egress.network \
    kravhantering-app-node.target \
    kravhantering-app-runtime.container \
    kravhantering-keycloak-data.volume \
    kravhantering-keycloak.container \
    kravhantering-nginx.container \
    kravhantering-single-node.network \
    kravhantering-single-node-database.network \
    kravhantering-single-node-edge.network \
    kravhantering-single-node-egress.network \
    kravhantering-single-node-identity.network \
    kravhantering-single-node.target \
    kravhantering-sqlserver-data.volume \
    kravhantering-sqlserver.container
}

remove_managed_units() {
  local destination="$1" unit
  while IFS= read -r unit; do
    rm -f -- "$destination/$unit"
  done < <(managed_unit_names)
}

remove_stale_managed_units() {
  local destination="$1" unit expected_unit keep
  shift

  while IFS= read -r unit; do
    keep=false
    for expected_unit in "$@"; do
      if [[ "$unit" == "$expected_unit" ]]; then
        keep=true
        break
      fi
    done
    [[ "$keep" == true ]] || rm -f -- "$destination/$unit"
  done < <(managed_unit_names)
}

quadlet_generator() {
  local candidate
  if [[ -n "${KRAVHANTERING_QUADLET_GENERATOR-}" ]]; then
    printf '%s\n' "$KRAVHANTERING_QUADLET_GENERATOR"
    return
  fi
  for candidate in \
    /usr/lib/systemd/user-generators/podman-user-generator \
    /usr/lib/systemd/system-generators/podman-system-generator; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  fail 'compatible Podman Quadlet generator is unavailable'
}

verify_journal_retention() {
  local configured=false config file key line section='' storage value
  local systemd_analyze_bin="${KRAVHANTERING_SYSTEMD_ANALYZE_BIN:-systemd-analyze}"
  local -a retention_keys=()
  declare -A effective=()
  if [[ -n "${KRAVHANTERING_JOURNAL_CONFIG_DIR-}" ]]; then
    config="$(
      while IFS= read -r file; do
        cat -- "$file"
        printf '\n'
      done < <(
        find "$KRAVHANTERING_JOURNAL_CONFIG_DIR" -maxdepth 1 \
          -type f -name '*.conf' -print 2>/dev/null | sort
      )
    )"
  else
    config="$("$systemd_analyze_bin" cat-config systemd/journald.conf 2>/dev/null)" || \
      fail 'cannot evaluate effective journald configuration'
  fi

  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" == \#* || "$line" == \;* ]] && continue
    if [[ "$line" == \[*\] ]]; then
      section="${line:1:${#line}-2}"
      continue
    fi
    [[ "$section" == Journal && "$line" == *=* ]] || continue
    key="${line%%=*}"
    key="${key//[[:space:]]/}"
    case "$key" in
      Storage | SystemMaxUse | SystemKeepFree | RuntimeMaxUse | RuntimeKeepFree)
        value="${line#*=}"
        effective["$key"]="${value//[[:space:]]/}"
        ;;
    esac
  done <<<"$config"

  storage="${effective[Storage]:-auto}"
  if [[ "$storage" == persistent || "$storage" == auto ]]; then
    retention_keys=(SystemMaxUse SystemKeepFree)
  else
    retention_keys=(RuntimeMaxUse RuntimeKeepFree)
  fi
  for key in "${retention_keys[@]}"; do
    value="${effective[$key]-}"
    if [[ "$value" =~ ^[1-9][0-9]*(K|M|G|T|P|E)?$ ]]; then
      configured=true
    fi
  done
  [[ "$configured" == true ]] || \
    fail 'finite journald retention is not configured'
}

verify_rootless_networking() {
  local podman_bin="$1" network_name network_internal probe_name
  network_name="kravhantering-preflight-$(id -u)-$$"
  probe_name="${network_name}-host-route"
  "$podman_bin" network create --internal "$network_name" >/dev/null 2>&1 || \
    fail 'rootless Podman cannot create the required bridge networks'
  network_internal="$(
    "$podman_bin" network inspect "$network_name" \
      --format '{{.Internal}}' 2>/dev/null
  )" || {
    "$podman_bin" network rm "$network_name" >/dev/null 2>&1 || true
    fail 'rootless Podman cannot inspect the required bridge networks'
  }
  if [[ "$TOPOLOGY" == single-node ]] &&
    [[ "$IDENTITY_PROVIDER_MODE" == bundled || \
      "$IDENTITY_PROVIDER_MODE" == hardened-bundled ]]; then
    "$podman_bin" create --name "$probe_name" --pull=never \
      --network "$network_name" \
      --add-host "${PUBLIC_HOSTNAME}:host-gateway" \
      "$APP_RUNTIME_IMAGE_REF" true >/dev/null 2>&1 || {
      "$podman_bin" rm --force "$probe_name" >/dev/null 2>&1 || true
      "$podman_bin" network rm "$network_name" >/dev/null 2>&1 || true
      fail 'rootless Podman cannot map the public issuer through its host gateway'
    }
    "$podman_bin" rm "$probe_name" >/dev/null 2>&1 || {
      "$podman_bin" network rm "$network_name" >/dev/null 2>&1 || true
      fail 'rootless Podman cannot remove the host-gateway preflight container'
    }
  fi
  "$podman_bin" network rm "$network_name" >/dev/null 2>&1 || \
    fail 'rootless Podman cannot remove a temporary bridge network'
  [[ "$network_internal" == true ]] || \
    fail 'rootless Podman did not enforce an internal bridge network'
}

verify_host_enforcement() {
  local rendered_dir="$1" controller controllers missing='' podman_info generator
  local generator_output
  local controllers_file="${KRAVHANTERING_CGROUP_CONTROLLERS_FILE:-/sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/cgroup.controllers}"
  local meminfo_file="${KRAVHANTERING_MEMINFO_FILE:-/proc/meminfo}"
  local podman_bin="${KRAVHANTERING_PODMAN_BIN:-podman}"
  local systemctl_bin="${KRAVHANTERING_SYSTEMCTL_BIN:-systemctl}"
  local total_memory_mib

  [[ -r "$controllers_file" ]] || \
    fail "cannot read delegated cgroup controllers: $controllers_file"
  controllers="$(<"$controllers_file")"
  for controller in cpu memory pids; do
    if [[ " $controllers " != *" $controller "* ]]; then
      missing="${missing:+$missing }$controller"
    fi
  done
  [[ -z "$missing" ]] || \
    fail "delegated cgroup controllers are missing: $missing"

  "$systemctl_bin" --user show-environment >/dev/null 2>&1 || \
    fail 'user systemd manager is unavailable'
  local podman_cgroups podman_rootless podman_runtime
  podman_info="$("$podman_bin" info --format '{{.Host.Security.Rootless}} {{.Host.CgroupsVersion}} {{.Host.OCIRuntime.Name}}' 2>/dev/null)" || \
    fail 'rootless Podman is unavailable'
  read -r podman_rootless podman_cgroups podman_runtime <<<"$podman_info"
  [[ "$podman_rootless $podman_cgroups" == 'true v2' ]] || \
    fail "rootless Podman with cgroup v2 is required (reported: $podman_info)"
  if [[ "$TOPOLOGY" != app-node-http && "$podman_runtime" != crun ]]; then
    fail "TLS topology requires the crun OCI runtime (reported: ${podman_runtime:-unknown})"
  fi
  verify_rootless_networking "$podman_bin"
  total_memory_mib="$(awk '/^MemTotal:/ { print int($2 / 1024) }' "$meminfo_file")"
  [[ "$total_memory_mib" =~ ^[0-9]+$ ]] || \
    fail "cannot determine host memory capacity from $meminfo_file"
  if [[ "$TOPOLOGY" == app-node-* ]]; then
    (( (APP_RUNTIME_MEMORY_LIMIT_MIB + NGINX_MEMORY_LIMIT_MIB) * 4 <= total_memory_mib * 3 )) || \
      fail 'stateless service memory limits exceed 75% of app-node host memory'
  elif [[ "$TOPOLOGY" == single-node && "$IDENTITY_PROVIDER_MODE" == external ]]; then
    (( (APP_RUNTIME_MEMORY_LIMIT_MIB + NGINX_MEMORY_LIMIT_MIB + SQLSERVER_MEMORY_LIMIT_MIB) * 4 <= total_memory_mib * 3 )) || \
      fail 'single-node service memory limits exceed 75% of host memory'
  else
    (( (APP_RUNTIME_MEMORY_LIMIT_MIB + NGINX_MEMORY_LIMIT_MIB + SQLSERVER_MEMORY_LIMIT_MIB + KEYCLOAK_MEMORY_LIMIT_MIB) * 4 <= total_memory_mib * 3 )) || \
      fail 'single-node service memory limits exceed 75% of host memory'
  fi
  verify_journal_retention

  generator="$(quadlet_generator)"
  generator_output="$(
    env QUADLET_UNIT_DIRS="$rendered_dir" \
      "$generator" --user --dryrun 2>&1
  )" || fail "Quadlet generator rejected the rendered production units: ${generator_output:-no output}"
}

render_template() {
  local source="$1" destination="$2" content key value
  content="$(<"$source")"
  content="${content//@@BUNDLE_ROOT@@/$BUNDLE_ROOT}"

  while IFS= read -r key; do
    value="${!key}"
    content="${content//@@$key@@/$value}"
  done < <(template_values "$TOPOLOGY")

  if grep -Eq '(@@[A-Z0-9_]+@@|\$\{[^}]+\})' <<<"$content"; then
    fail "template contains an unresolved value: $source"
  fi
  printf '%s\n' "$content" >"$destination"
  chmod 0644 "$destination"
}

render_units() {
  local output_dir="$1" template template_name output_name
  local template_dir="$TEMPLATE_ROOT/$TOPOLOGY"
  [[ -d "$template_dir" ]] || fail "template directory is missing: $template_dir"

  read_release_env
  configure_identity_provider
  validate_release_env "$TOPOLOGY"
  validate_identity_provider
  configure_containment
  mkdir -p -- "$output_dir"
  remove_managed_units "$output_dir"

  while IFS= read -r template; do
    template_name="$(basename -- "$template")"
    if [[ "$TOPOLOGY" == single-node && "$IDENTITY_PROVIDER_MODE" == external ]]; then
      case "$template_name" in
        kravhantering-keycloak-data.volume.template | \
          kravhantering-keycloak.container.template | \
          kravhantering-single-node-identity.network.template)
          continue
          ;;
      esac
    fi
    output_name="${template_name%.template}"
    render_template "$template" "$output_dir/$output_name"
  done < <(find "$template_dir" -maxdepth 1 -type f -name '*.template' | sort)
}

install_units() {
  local temporary_dir quadlet_stage='' systemd_stage=''
  local cleanup_command file staging_dir
  local -a quadlet_files=() systemd_files=()
  temporary_dir="$(mktemp -d)"
  printf -v cleanup_command 'rm -rf -- %q' "$temporary_dir"
  trap "$cleanup_command" EXIT
  render_units "$temporary_dir"
  verify_host_enforcement "$temporary_dir"

  mkdir -p -- "$QUADLET_DIR" "$SYSTEMD_USER_DIR"
  quadlet_stage="$(mktemp -d -- "$QUADLET_DIR/.kravhantering-stage.XXXXXX")"
  printf -v cleanup_command 'rm -rf -- %q %q' \
    "$temporary_dir" "$quadlet_stage"
  trap "$cleanup_command" EXIT
  systemd_stage="$(mktemp -d -- "$SYSTEMD_USER_DIR/.kravhantering-stage.XXXXXX")"
  printf -v cleanup_command 'rm -rf -- %q %q %q' \
    "$temporary_dir" "$quadlet_stage" "$systemd_stage"
  trap "$cleanup_command" EXIT

  while IFS= read -r file; do
    staging_dir="$quadlet_stage"
    if [[ "$file" == *.target ]]; then
      staging_dir="$systemd_stage"
      systemd_files+=("$file")
    else
      quadlet_files+=("$file")
    fi
    cp -- "$temporary_dir/$file" "$staging_dir/$file"
    chmod 0644 "$staging_dir/$file"
    cmp -s -- "$temporary_dir/$file" "$staging_dir/$file" || \
      fail "staged unit does not match rendered unit: $file"
  done < <(find "$temporary_dir" -maxdepth 1 -type f -printf '%f\n' | sort)

  for file in "${quadlet_files[@]}"; do
    mv -f -- "$quadlet_stage/$file" "$QUADLET_DIR/$file"
  done
  for file in "${systemd_files[@]}"; do
    mv -f -- "$systemd_stage/$file" "$SYSTEMD_USER_DIR/$file"
  done
  remove_stale_managed_units "$QUADLET_DIR" "${quadlet_files[@]}"
  remove_stale_managed_units "$SYSTEMD_USER_DIR" "${systemd_files[@]}"

  rm -rf -- "$temporary_dir" "$quadlet_stage" "$systemd_stage"
  trap - EXIT
}

COMMAND="${1-}"
[[ -n "$COMMAND" ]] || {
  usage >&2
  exit 2
}
shift

TOPOLOGY=''
OUTPUT_DIR=''
PURPOSE=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --topology)
      [[ $# -ge 2 ]] || fail 'missing value for --topology'
      TOPOLOGY="$2"
      shift 2
      ;;
    --output-dir)
      [[ $# -ge 2 ]] || fail 'missing value for --output-dir'
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --purpose)
      [[ $# -ge 2 ]] || fail 'missing value for --purpose'
      PURPOSE="$2"
      shift 2
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *) fail "unexpected argument: $1" ;;
  esac
done

[[ -n "$TOPOLOGY" ]] || fail '--topology is required'
topology_target "$TOPOLOGY" >/dev/null

case "$COMMAND" in
  render)
    [[ -z "$PURPOSE" ]] || fail '--purpose is only valid with print-network'
    OUTPUT_DIR="${OUTPUT_DIR:-$PWD/rendered-quadlet/$TOPOLOGY}"
    render_units "$OUTPUT_DIR"
    printf 'Rendered %s Quadlet units in %s\n' "$TOPOLOGY" "$OUTPUT_DIR"
    ;;
  install)
    [[ -z "$OUTPUT_DIR" ]] || fail '--output-dir is only valid with render'
    [[ -z "$PURPOSE" ]] || fail '--purpose is only valid with print-network'
    install_units
    printf 'Installed %s Quadlet resources in %s and target in %s\n' \
      "$TOPOLOGY" "$QUADLET_DIR" "$SYSTEMD_USER_DIR"
    printf '%s\n' 'Run: systemctl --user daemon-reload'
    ;;
  verify-host)
    [[ -z "$OUTPUT_DIR" ]] || fail '--output-dir is only valid with render'
    [[ -z "$PURPOSE" ]] || fail '--purpose is only valid with print-network'
    temporary_dir="$(mktemp -d)"
    trap 'rm -rf -- "$temporary_dir"' EXIT
    render_units "$temporary_dir"
    verify_host_enforcement "$temporary_dir"
    printf '%s\n' 'Host can enforce the rendered Quadlet contract.'
    ;;
  status)
    [[ -z "$OUTPUT_DIR" ]] || fail '--output-dir is only valid with render'
    [[ -z "$PURPOSE" ]] || fail '--purpose is only valid with print-network'
    systemctl --user status "$(topology_target "$TOPOLOGY")"
    ;;
  remove)
    [[ -z "$OUTPUT_DIR" ]] || fail '--output-dir is only valid with render'
    [[ -z "$PURPOSE" ]] || fail '--purpose is only valid with print-network'
    target="$(topology_target "$TOPOLOGY")"
    systemctl --user stop "$target"
    systemctl --user disable "$target"
    remove_managed_units "$QUADLET_DIR"
    remove_managed_units "$SYSTEMD_USER_DIR"
    systemctl --user daemon-reload
    printf 'Removed managed unit files from %s and %s; named volumes remain.\n' \
      "$QUADLET_DIR" "$SYSTEMD_USER_DIR"
    printf '%s\n' 'Reloaded the user systemd manager.'
    ;;
  print-network)
    [[ -z "$OUTPUT_DIR" ]] || fail '--output-dir is only valid with render'
    [[ -n "$PURPOSE" ]] || fail '--purpose is required with print-network'
    topology_network "$TOPOLOGY" "$PURPOSE"
    ;;
  print-resolver)
    [[ -z "$OUTPUT_DIR" ]] || fail '--output-dir is only valid with render'
    [[ -n "$PURPOSE" ]] || fail '--purpose is required with print-resolver'
    network_resolver "$TOPOLOGY" "$PURPOSE"
    ;;
  *)
    usage >&2
    fail "unsupported command: $COMMAND"
    ;;
esac
