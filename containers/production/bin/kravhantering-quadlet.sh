#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BUNDLE_ROOT="${KRAVHANTERING_BUNDLE_ROOT:-$(cd -- "$SCRIPT_DIR/.." && pwd -P)}"
RELEASE_ENV_FILE="${KRAVHANTERING_RELEASE_ENV_FILE:-/etc/kravhantering/release.env}"
TEMPLATE_ROOT="$BUNDLE_ROOT/quadlet/templates"
QUADLET_DIR="${KRAVHANTERING_QUADLET_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/containers/systemd}"
SYSTEMD_USER_DIR="${KRAVHANTERING_SYSTEMD_USER_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user}"

usage() {
  cat <<'USAGE'
Usage:
  kravhantering-quadlet.sh render --topology <app-node-tls|app-node-http|single-node> [--output-dir <path>]
  kravhantering-quadlet.sh install --topology <app-node-tls|app-node-http|single-node>
  kravhantering-quadlet.sh status --topology <app-node-tls|app-node-http|single-node>
  kravhantering-quadlet.sh remove --topology <app-node-tls|app-node-http|single-node>
  kravhantering-quadlet.sh print-network --topology <app-node-tls|app-node-http|single-node>
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
  case "$1" in
    app-node-tls | app-node-http)
      printf '%s\n' 'kravhantering-app-node_kravhantering-internal'
      ;;
    single-node)
      printf '%s\n' 'kravhantering-single-node_kravhantering-internal'
      ;;
    *) fail "unsupported topology: $1" ;;
  esac
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
      printf '%s\n' APP_RUNTIME_IMAGE_REF KEYCLOAK_IMAGE_REF NGINX_IMAGE_REF \
        NGINX_HTTPS_BIND NGINX_RESOLVER PUBLIC_HOSTNAME SQLSERVER_IMAGE_REF
      ;;
    *) fail "unsupported topology: $1" ;;
  esac
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

validate_release_env() {
  local key value
  while IFS= read -r key; do
    value="${!key-}"
    [[ -n "$value" ]] || fail "release.env is missing required value: $key"
  done < <(required_values "$1")
}

managed_unit_names() {
  printf '%s\n' \
    kravhantering-app-node.network \
    kravhantering-app-node.target \
    kravhantering-app-runtime.container \
    kravhantering-keycloak-data.volume \
    kravhantering-keycloak.container \
    kravhantering-nginx.container \
    kravhantering-single-node.network \
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

render_template() {
  local source="$1" destination="$2" content key value
  content="$(<"$source")"
  content="${content//@@BUNDLE_ROOT@@/$BUNDLE_ROOT}"

  while IFS= read -r key; do
    value="${!key}"
    content="${content//@@$key@@/$value}"
  done < <(required_values "$TOPOLOGY")

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
  validate_release_env "$TOPOLOGY"
  mkdir -p -- "$output_dir"
  remove_managed_units "$output_dir"

  while IFS= read -r template; do
    template_name="$(basename -- "$template")"
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
    OUTPUT_DIR="${OUTPUT_DIR:-$PWD/rendered-quadlet/$TOPOLOGY}"
    render_units "$OUTPUT_DIR"
    printf 'Rendered %s Quadlet units in %s\n' "$TOPOLOGY" "$OUTPUT_DIR"
    ;;
  install)
    [[ -z "$OUTPUT_DIR" ]] || fail '--output-dir is only valid with render'
    install_units
    printf 'Installed %s Quadlet resources in %s and target in %s\n' \
      "$TOPOLOGY" "$QUADLET_DIR" "$SYSTEMD_USER_DIR"
    printf '%s\n' 'Run: systemctl --user daemon-reload'
    ;;
  status)
    [[ -z "$OUTPUT_DIR" ]] || fail '--output-dir is only valid with render'
    systemctl --user status "$(topology_target "$TOPOLOGY")"
    ;;
  remove)
    [[ -z "$OUTPUT_DIR" ]] || fail '--output-dir is only valid with render'
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
    topology_network "$TOPOLOGY"
    ;;
  *)
    usage >&2
    fail "unsupported command: $COMMAND"
    ;;
esac
