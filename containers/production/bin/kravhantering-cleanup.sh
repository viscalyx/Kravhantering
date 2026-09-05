#!/usr/bin/env bash
# Host-owned lifecycle. Installed copies and image selection survive app releases.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
STATE_DIR="${KRAVHANTERING_CLEANUP_STATE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/kravhantering/cleanup}"
QUADLET_DIR="${KRAVHANTERING_QUADLET_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/containers/systemd}"
SYSTEMD_DIR="${KRAVHANTERING_SYSTEMD_USER_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user}"
SERVICE=kravhantering-host-cleanup.service
TIMER=kravhantering-host-cleanup.timer
COMMAND="${1:-help}"
[[ $# == 0 ]] || shift
TOPOLOGY=''
ENV_FILE=/etc/kravhantering/cleanup-release.env
BUNDLE="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
OUTPUT_DIR=''
SOURCE_BUNDLE=''
SOURCE_ARCHIVE=''
fail() { printf 'cleanup: %s\n' "$*" >&2; exit 1; }
while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 ]] || fail 'missing option value'
  case "$1" in
    --topology) TOPOLOGY="$2" ;;
    --env-file) ENV_FILE="$2" ;;
    --bundle) BUNDLE="$2" ;;
    --output-dir) OUTPUT_DIR="$2" ;;
    --source-bundle) SOURCE_BUNDLE="$2" ;;
    --source-archive) SOURCE_ARCHIVE="$2" ;;
    *) fail 'unknown option' ;;
  esac
  shift 2
done
read_selection() {
  [[ -r "$ENV_FILE" ]] || fail 'cleanup image configuration is missing'
  IMAGE_REF="$(sed -n 's/^TRANSIENT_CLEANUP_IMAGE_REF=//p' "$ENV_FILE")"
  [[ "$IMAGE_REF" =~ ^[a-zA-Z0-9][a-zA-Z0-9./_:@-]+$ ]] || fail 'invalid cleanup image reference'
  case "$TOPOLOGY" in
    app-node-tls|app-node-http|single-node) ;;
    *) fail 'a supported --topology is required' ;;
  esac
}
render() {
  read_selection
  [[ -n "$OUTPUT_DIR" ]] || fail '--output-dir is required'
  mkdir -p -- "$OUTPUT_DIR"
  cat > "$OUTPUT_DIR/kravhantering-host-cleanup.container" <<UNIT
[Unit]
Description=Kravhantering release-independent transient-state cleanup

[Container]
ContainerName=kravhantering-host-cleanup
Image=${LOCKED_IMAGE_ID:-$IMAGE_REF}
Pull=never
EnvironmentFile=/etc/kravhantering/cleanup.env
Exec=/workspace/transient-cleanup/lib/transient-cleanup/cli.js${GENERATION:+ --contract /run/kravhantering/cleanup-compatibility.json}
PodmanArgs=--entrypoint=/usr/local/bin/node
DropCapability=all
NoNewPrivileges=true
ReadOnly=true
ReadOnlyTmpfs=false
PidsLimit=128
LogDriver=journald
UNIT
  if [[ -n "${GENERATION:-}" ]]; then
    printf 'Volume=%s/cleanup-compatibility.json:/run/kravhantering/cleanup-compatibility.json:ro\n' "$GENERATION" >> "$OUTPUT_DIR/kravhantering-host-cleanup.container"
  fi
  if [[ "$TOPOLOGY" == single-node ]]; then
    cat >> "$OUTPUT_DIR/kravhantering-host-cleanup.container" <<'UNIT'
Network=kravhantering-single-node_database
Network=kravhantering-single-node_egress
Environment=NODE_EXTRA_CA_CERTS=/run/kravhantering/tls/ca.crt
Volume=/etc/kravhantering/tls/ca.crt:/run/kravhantering/tls/ca.crt:ro
UNIT
  else
    printf '%s\n' 'Network=kravhantering-app-node_egress' >> "$OUTPUT_DIR/kravhantering-host-cleanup.container"
  fi
  cat >> "$OUTPUT_DIR/kravhantering-host-cleanup.container" <<'UNIT'

[Service]
Type=oneshot
TimeoutStartSec=300
MemoryMax=512M
CPUQuota=100%
TasksMax=160
StandardOutput=journal
StandardError=journal
UNIT
  cat > "$OUTPUT_DIR/kravhantering-host-cleanup.timer" <<'UNIT'
[Unit]
Description=Run host-owned transient-state cleanup every five minutes

[Timer]
OnCalendar=*:0/5
AccuracySec=30s
RandomizedDelaySec=60s
Persistent=true
Unit=kravhantering-host-cleanup.service

[Install]
WantedBy=timers.target
UNIT
}
install_service() {
  if [[ "$COMMAND" == install && -L "$STATE_DIR/current" ]]; then
    printf '%s\n' 'Cleanup is installed; use update to change its release.'
    return
  fi
  read_selection
  [[ -r "$BUNDLE/cleanup-compatibility.json" ]] || fail 'released cleanup compatibility evidence is required'
  "$BUNDLE/bin/kravhantering-images.sh" --topology cleanup \
    --lock-file "$BUNDLE/container-stack.lock.json" --env-file "$ENV_FILE" verify
  LOCKED_IMAGE_ID="$(jq -er '.services[] | select(.name == "db-job") | .imageId' "$BUNDLE/container-stack.lock.json")"
  local manifest_digest
  manifest_digest="$(jq -er '.services[] | select(.name == "db-job") | .manifestDigest' "$BUNDLE/container-stack.lock.json")"
  jq -e --arg image "$LOCKED_IMAGE_ID" --arg digest "$manifest_digest" \
    '.schemaVersion == 1 and .imageId == $image and .manifestDigest == $digest' \
    "$BUNDLE/cleanup-compatibility.json" >/dev/null || fail 'cleanup contract does not match the image lock'
  podman run --rm --pull=never --network=none --read-only --cap-drop=all \
    --security-opt=no-new-privileges --pids-limit=128 --memory=512m --cpus=1 \
    --entrypoint /usr/local/bin/node \
    --volume "$BUNDLE/cleanup-compatibility.json:/run/cleanup-contract.json:ro" \
    "$LOCKED_IMAGE_ID" /workspace/transient-cleanup/lib/transient-cleanup/cli.js \
    --validate-contract /run/cleanup-contract.json || fail 'cleanup image rejected compatibility evidence'
  GENERATION="$(mktemp -d -- "$STATE_DIR/generation.XXXXXXXX")"
  cp -- "$BUNDLE/bin/kravhantering-cleanup.sh" "$GENERATION/manager.sh"
  cp -- "$BUNDLE/bin/kravhantering-images.sh" "$GENERATION/kravhantering-images.sh"
  cp -- "$BUNDLE/container-stack.lock.json" "$GENERATION/container-stack.lock.json"
  cp -- "$BUNDLE/cleanup-compatibility.json" "$GENERATION/cleanup-compatibility.json"
  cp -- "$ENV_FILE" "$GENERATION/cleanup-release.env"
  printf '%s\n' "$TOPOLOGY" > "$GENERATION/topology"
  OUTPUT_DIR="$GENERATION/units"
  render
  "$BUNDLE/bin/kravhantering-quadlet.sh" verify-host --topology "$TOPOLOGY" --additional-units "$OUTPUT_DIR"
  mkdir -p -- "$QUADLET_DIR" "$SYSTEMD_DIR"
  # Stop and wait for the old run before changing units. Failure leaves recovery
  # generations intact; traffic stays quiesced until resume verifies a run.
  if [[ -L "$STATE_DIR/current" ]]; then
    systemctl --user disable --now "$TIMER"
    systemctl --user stop "$SERVICE"
  fi
  install -m 0644 "$OUTPUT_DIR/kravhantering-host-cleanup.container" "$QUADLET_DIR/kravhantering-host-cleanup.container"
  install -m 0644 "$OUTPUT_DIR/kravhantering-host-cleanup.timer" "$SYSTEMD_DIR/$TIMER"
  ln -s -- "$GENERATION" "$STATE_DIR/current.next"
  mv -Tf -- "$STATE_DIR/current.next" "$STATE_DIR/current"
  systemctl --user daemon-reload
  # Installation does not open traffic or mutate the database. Resume after
  # migration/restore performs the required first run and enables the timer.
  printf '%s\n' 'Cleanup installed. Run the retained manager resume before operational handoff.'
}
verify_installed() {
  [[ -L "$STATE_DIR/current" ]] || fail 'cleanup is not installed'
  local generation
  generation="$(readlink -f -- "$STATE_DIR/current")"
  "$generation/kravhantering-images.sh" --topology cleanup \
    --lock-file "$generation/container-stack.lock.json" \
    --env-file "$generation/cleanup-release.env" verify
}
pause_legacy_cleanup() {
  if [[ "$(systemctl --user show kravhantering-transient-cleanup.timer --property=LoadState --value)" == loaded ]]; then
    systemctl --user disable --now kravhantering-transient-cleanup.timer
  fi
  if [[ "$(systemctl --user show kravhantering-transient-cleanup.service --property=LoadState --value)" == loaded ]]; then
    systemctl --user stop kravhantering-transient-cleanup.service
  fi
}
verify_transition() {
  verify_installed
  [[ -r "$SOURCE_ARCHIVE" && -r "$SOURCE_BUNDLE/DEPLOYMENT-MANIFEST.json" && -r "$SOURCE_BUNDLE/container-stack.lock.json" ]] || fail 'authenticated source bundle and archive are required'
  local archive_digest lock_digest source_release source_schema
  archive_digest="$(sha256sum -- "$SOURCE_ARCHIVE")"; archive_digest="${archive_digest%% *}"
  lock_digest="$(sha256sum -- "$SOURCE_BUNDLE/container-stack.lock.json")"; lock_digest="${lock_digest%% *}"
  source_release="$(jq -er '.version' "$SOURCE_BUNDLE/DEPLOYMENT-MANIFEST.json")"
  source_schema="$(jq -er '.database.expectedSchemaVersion' "$SOURCE_BUNDLE/DEPLOYMENT-MANIFEST.json")"
  jq -e --arg archive "$archive_digest" --arg lock "$lock_digest" --arg release "$source_release" --arg schema "$source_schema" \
    '.sources | any(.archiveSha256 == $archive and .stackLockSha256 == $lock and .release == $release and .schemaVersion == $schema)' \
    "$STATE_DIR/current/cleanup-compatibility.json" >/dev/null || fail 'source release is not eligible for this cleanup transition'
  printf '%s\n' 'Exact source release and cleanup compatibility verified.'
}
case "$COMMAND" in
  render|help|--help) ;;
  *)
    mkdir -p -- "$STATE_DIR"
    exec 9>"$STATE_DIR/lifecycle.lock"
    flock -x 9
    ;;
esac
case "$COMMAND" in
  render) render ;;
  install|update) install_service ;;
  status)
    verify_installed
    systemctl --user status "$TIMER" --no-pager
    systemctl --user show "$SERVICE" --property=Result,ExecMainStatus
    systemctl --user list-timers "$TIMER" --all --no-pager
    ;;
  verify-transition) verify_transition ;;
  pause)
    pause_legacy_cleanup
    systemctl --user disable --now "$TIMER"
    systemctl --user stop "$SERVICE"
    ;;
  resume|retry)
    verify_installed
    # A fresh inactive unit may not be loaded yet; reset-failed cannot load it.
    if systemctl --user is-failed --quiet "$SERVICE"; then
      systemctl --user reset-failed "$SERVICE"
    fi
    systemctl --user start "$SERVICE"
    [[ "$(systemctl --user show "$SERVICE" --property=Result --value)" == success ]] || fail 'cleanup verification failed; keep traffic quiesced'
    if [[ "$COMMAND" == resume ]]; then
      systemctl --user enable --now "$TIMER"
      systemctl --user is-active --quiet "$TIMER"
    fi
    ;;
  uninstall)
    systemctl --user disable --now "$TIMER"
    systemctl --user stop "$SERVICE"
    rm -f -- "$QUADLET_DIR/kravhantering-host-cleanup.container" "$SYSTEMD_DIR/$TIMER"
    systemctl --user daemon-reload
    rm -f -- "$STATE_DIR/current"
    rm -rf -- "$STATE_DIR"/generation.*
    printf '%s\n' 'Cleanup uninstalled; application data and shared images remain.'
    ;;
  help|--help)
    printf '%s\n' 'Usage: kravhantering-cleanup.sh render|install|update --topology <app-node-tls|app-node-http|single-node> [--env-file <path>] [--bundle <path>] [--output-dir <path>]' \
      '       manager.sh status|pause|resume|retry|uninstall|verify-transition [--source-bundle <path> --source-archive <path>]'
    ;;
  *) fail 'unsupported cleanup command' ;;
esac
