#!/usr/bin/env bash

set -euo pipefail

SYSTEM_PREFIX="${CI_RUNTIME_SYSTEM_PREFIX:-/usr}"
LOCAL_PREFIX="${CI_RUNTIME_LOCAL_PREFIX:-/usr/local}"
PODMAN_BIN="${CI_RUNTIME_PODMAN_BIN:-$SYSTEM_PREFIX/bin/podman}"
CONMON_BIN="${CI_RUNTIME_CONMON_BIN:-$SYSTEM_PREFIX/bin/conmon}"
CRUN_BIN="${CI_RUNTIME_CRUN_BIN:-$SYSTEM_PREFIX/bin/crun}"
QUADLET_GENERATOR="${CI_RUNTIME_QUADLET_GENERATOR:-$SYSTEM_PREFIX/libexec/podman/quadlet}"
DPKG_QUERY_BIN="${CI_RUNTIME_DPKG_QUERY_BIN:-dpkg-query}"
SUDO_BIN="${CI_RUNTIME_SUDO_BIN:-sudo}"
APT_GET_BIN="${CI_RUNTIME_APT_GET_BIN:-apt-get}"
EVIDENCE_DIR="${CI_RUNTIME_EVIDENCE_DIR:-}"
PREFLIGHT_IMAGE='docker.io/library/alpine@sha256:eafc1edb577d2e9b458664a15f23ea1c370214193226069eb22921169fc7e43f'

fail() {
  printf 'ci-container-runtime: %s\n' "$*" >&2
  exit 1
}

canonical_path() {
  realpath -m -- "$1"
}

start_evidence_log() {
  local name="$1"
  [[ -n "$EVIDENCE_DIR" ]] || return 0
  mkdir -p -- "$EVIDENCE_DIR"
  exec > >(tee -a "$EVIDENCE_DIR/$name.log") 2>&1
}

assert_executable() {
  [[ -x "$1" ]] || fail "required executable is unavailable: $1"
}

assert_package_owner() {
  local file="$1" expected_package="$2" ownership
  ownership="$("$DPKG_QUERY_BIN" --search -- "$file" 2>/dev/null)" ||
    fail "runtime component is not package-owned: $file"
  [[ "$ownership" == "$expected_package: "* ]] ||
    fail "runtime component has unexpected package ownership: $ownership"
}

verify_command_resolution() {
  local command_name="$1" expected="$2" resolved
  resolved="$(command -v "$command_name")" ||
    fail "runtime command is unavailable on PATH: $command_name"
  [[ "$(canonical_path "$resolved")" == "$(canonical_path "$expected")" ]] ||
    fail "$command_name resolves outside the package toolchain: $resolved"
}

resolved_generator() {
  local directory name
  local search_path="${CI_RUNTIME_GENERATOR_SEARCH_PATH:-/run/systemd/user-generators:/etc/systemd/user-generators:$LOCAL_PREFIX/lib/systemd/user-generators:$SYSTEM_PREFIX/lib/systemd/user-generators:/lib/systemd/user-generators}"
  IFS=: read -r -a directories <<<"$search_path"
  for directory in "${directories[@]}"; do
    for name in podman-user-generator podman-system-generator; do
      if [[ -x "$directory/$name" ]]; then
        canonical_path "$directory/$name"
        return 0
      fi
    done
  done
  fail 'Podman Quadlet systemd generator is unavailable'
}

verify_toolchain() {
  local generator podman_info selected_conmon selected_runtime
  assert_executable "$PODMAN_BIN"
  assert_executable "$CONMON_BIN"
  assert_executable "$CRUN_BIN"
  assert_executable "$QUADLET_GENERATOR"
  verify_command_resolution podman "$PODMAN_BIN"
  verify_command_resolution conmon "$CONMON_BIN"
  verify_command_resolution crun "$CRUN_BIN"

  generator="$(resolved_generator)"
  [[ "$generator" == "$(canonical_path "$QUADLET_GENERATOR")" ]] ||
    fail "systemd selected unexpected Quadlet generator: $generator"

  podman_info="$("$PODMAN_BIN" info --format json)" ||
    fail 'cannot inspect the selected Podman runtime toolchain'
  selected_conmon="$(jq -er '.host.conmon.path' <<<"$podman_info")" ||
    fail 'Podman info does not identify conmon'
  selected_runtime="$(jq -er '.host.ociRuntime.path' <<<"$podman_info")" ||
    fail 'Podman info does not identify the OCI runtime'
  [[ "$(canonical_path "$selected_conmon")" == "$(canonical_path "$CONMON_BIN")" ]] ||
    fail "Podman selected unexpected conmon: $selected_conmon"
  [[ "$(canonical_path "$selected_runtime")" == "$(canonical_path "$CRUN_BIN")" ]] ||
    fail "Podman selected unexpected OCI runtime: $selected_runtime"

  assert_package_owner "$PODMAN_BIN" podman
  assert_package_owner "$CONMON_BIN" conmon
  assert_package_owner "$CRUN_BIN" crun
  assert_package_owner "$QUADLET_GENERATOR" podman

  "$PODMAN_BIN" --version
  "$CONMON_BIN" --version
  "$CRUN_BIN" --version
  "$QUADLET_GENERATOR" --version
  printf '%s\n' 'coherent package toolchain: verified'
}

bootstrap_toolchain() {
  local profile="$1"
  local -a packages=(conmon crun jq libnss3-tools podman)
  [[ "$profile" == pr || "$profile" == release ]] ||
    fail 'bootstrap expects the pr or release profile'
  [[ "$profile" == release ]] && packages+=(skopeo)

  "$SUDO_BIN" rm -rf -- \
    "$LOCAL_PREFIX/lib/podman" \
    "$LOCAL_PREFIX/libexec/podman"
  "$SUDO_BIN" rm -f -- \
    "$LOCAL_PREFIX/bin/conmon" \
    "$LOCAL_PREFIX/bin/crun" \
    "$LOCAL_PREFIX/bin/podman" \
    "$LOCAL_PREFIX/lib/systemd/system-generators/podman-system-generator" \
    "$LOCAL_PREFIX/lib/systemd/user-generators/podman-user-generator"
  hash -r
  "$SUDO_BIN" "$APT_GET_BIN" update
  "$SUDO_BIN" "$APT_GET_BIN" install -y --no-install-recommends \
    --reinstall "${packages[@]}"
  verify_toolchain
}

runtime_preflight() {
  local name
  name="kravhantering-runtime-preflight-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
  cleanup_preflight() {
    "$PODMAN_BIN" rm --force "$name" >/dev/null 2>&1 || true
    "$PODMAN_BIN" image rm --force "$PREFLIGHT_IMAGE" >/dev/null 2>&1 || true
  }
  trap cleanup_preflight EXIT
  cleanup_preflight
  "$PODMAN_BIN" run --pull=always --name "$name" --log-driver=journald \
    "$PREFLIGHT_IMAGE" /bin/true
  cleanup_preflight
  trap - EXIT
  printf '%s\n' 'rootless journald preflight: passed'
}

write_runner_metadata() {
  local output="$1"
  jq -n \
    --arg image_os "${ImageOS:-unknown}" \
    --arg image_release "${ImageRelease:-unknown}" \
    --arg image_version "${ImageVersion:-unknown}" \
    --arg runner_arch "${RUNNER_ARCH:-unknown}" \
    --arg runner_os "${RUNNER_OS:-unknown}" \
    '{image: {os: $image_os, release: $image_release, version: $image_version}, runner: {architecture: $runner_arch, os: $runner_os}}' \
    >"$output"
}

collect_github_runner_metadata() {
  local job_id log_file
  local output="$EVIDENCE_DIR/github-runner-metadata.txt"
  if [[ -z "${GH_TOKEN:-}" || -z "${GITHUB_REPOSITORY:-}" || \
    -z "${GITHUB_RUN_ID:-}" ]] || ! command -v gh >/dev/null 2>&1; then
    printf '%s\n' 'GitHub job metadata unavailable to the collector.' >"$output"
    return 0
  fi
  job_id="$(
    gh api "/repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/jobs?filter=latest" \
      --jq '.jobs[] | select(.status == "in_progress") | .id' \
      2>/dev/null | head -n 1
  )" || true
  if [[ -z "$job_id" ]]; then
    printf '%s\n' 'GitHub in-progress job metadata unavailable.' >"$output"
    return 0
  fi
  log_file="$(mktemp)"
  if ! gh api "/repos/$GITHUB_REPOSITORY/actions/jobs/$job_id/logs" \
    >"$log_file" 2>/dev/null; then
    printf '%s\n' 'GitHub in-progress job log unavailable.' >"$output"
    rm -f -- "$log_file"
    return 0
  fi
  head -n 120 "$log_file" |
    grep -E 'Current runner version:|Runner Image Provisioner|Hosted Compute Agent|Version: 20[0-9]{6}|Commit: [a-f0-9]{40}|Build Date:|Azure Region:|Runner Image$|Image: ubuntu-24\.04|Included Software: https://github\.com/actions/runner-images|Image Release: https://github\.com/actions/runner-images' \
      >"$output" || true
  rm -f -- "$log_file"
  [[ -s "$output" ]] ||
    printf '%s\n' 'GitHub runner metadata was absent from the current job log.' \
      >"$output"
}

collect_component_evidence() {
  local file owner resolved
  : >"$EVIDENCE_DIR/runtime-components.txt"
  for file in "$PODMAN_BIN" "$CONMON_BIN" "$CRUN_BIN" "$QUADLET_GENERATOR"; do
    resolved="$(canonical_path "$file")"
    owner="$("$DPKG_QUERY_BIN" --search -- "$resolved" 2>&1 || true)"
    {
      printf 'path=%s\nresolved=%s\npackage=%s\n' "$file" "$resolved" "$owner"
      if [[ -f "$resolved" ]]; then
        sha256sum -- "$resolved"
      fi
      "$resolved" --version 2>&1 || true
      printf '\n'
    } >>"$EVIDENCE_DIR/runtime-components.txt"
  done
  {
    printf 'podman_command=%s\n' "$(command -v podman 2>/dev/null || true)"
    printf 'conmon_command=%s\n' "$(command -v conmon 2>/dev/null || true)"
    printf 'crun_command=%s\n' "$(command -v crun 2>/dev/null || true)"
    printf 'quadlet_generator=%s\n' "$(resolved_generator 2>/dev/null || true)"
  } >>"$EVIDENCE_DIR/runtime-components.txt"
  "$PODMAN_BIN" info --format json >"$EVIDENCE_DIR/podman-info.json" 2>&1 || true
}

collect_cgroup_evidence() {
  local control_group service service_user uid
  service_user="${PRODUCTION_SMOKE_SERVICE_USER:-kravhantering}"
  id "$service_user" >/dev/null 2>&1 || {
    printf '%s\n' 'service-user-unavailable' >"$EVIDENCE_DIR/service-cgroups.txt"
    return 0
  }
  uid="$(id -u "$service_user")"
  : >"$EVIDENCE_DIR/service-cgroups.txt"
  for service in kravhantering-app-runtime.service kravhantering-keycloak.service \
    kravhantering-nginx.service kravhantering-sqlserver.service; do
    control_group="$(
      "$SUDO_BIN" -u "$service_user" env \
        XDG_RUNTIME_DIR="/run/user/$uid" \
        DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" \
        systemctl --user show "$service" --property=ControlGroup --value \
        2>/dev/null || true
    )"
    [[ -n "$control_group" && -d "/sys/fs/cgroup$control_group" ]] || continue
    printf '## %s\n' "$service" >>"$EVIDENCE_DIR/service-cgroups.txt"
    for file in memory.events memory.current memory.peak pids.current cpu.stat; do
      if [[ -r "/sys/fs/cgroup$control_group/$file" ]]; then
        printf '### %s\n' "$file" >>"$EVIDENCE_DIR/service-cgroups.txt"
        cat "/sys/fs/cgroup$control_group/$file" \
          >>"$EVIDENCE_DIR/service-cgroups.txt"
      fi
    done
  done
}

collect_diagnostics() {
  local -a classify_args
  [[ -n "$EVIDENCE_DIR" ]] || fail 'collect requires CI_RUNTIME_EVIDENCE_DIR'
  mkdir -p -- "$EVIDENCE_DIR"
  write_runner_metadata "$EVIDENCE_DIR/runner.json"
  collect_github_runner_metadata
  {
    uname -a
    cat /etc/os-release
    systemd-detect-virt 2>/dev/null || true
    for file in /sys/class/dmi/id/sys_vendor /sys/class/dmi/id/product_name \
      /sys/class/dmi/id/product_version; do
      [[ -r "$file" ]] && printf '%s=%s\n' "$file" "$(<"$file")"
    done
  } >"$EVIDENCE_DIR/runner-platform.txt"
  collect_component_evidence
  cp /proc/meminfo "$EVIDENCE_DIR/meminfo.txt"
  free -h >"$EVIDENCE_DIR/free.txt"
  for resource in cpu memory io; do
    if [[ -r "/proc/pressure/$resource" ]]; then
      cp "/proc/pressure/$resource" "$EVIDENCE_DIR/pressure-$resource.txt"
    fi
  done
  df -hT >"$EVIDENCE_DIR/filesystems.txt"
  df -ihT >"$EVIDENCE_DIR/filesystem-inodes.txt"
  ps -eo pid=,ppid=,user=,comm=,rss= --sort=-rss | sed -n '1,51p' \
    >"$EVIDENCE_DIR/top-process-rss.txt"
  (
    "$SUDO_BIN" journalctl --dmesg --no-pager --output=short-monotonic \
      2>/dev/null || dmesg 2>/dev/null || true
  ) | grep -Ei 'out of memory|oom-kill|killed process' \
    >"$EVIDENCE_DIR/kernel-oom.txt" || true
  collect_cgroup_evidence

  classify_args=(--evidence-dir "$EVIDENCE_DIR")
  if [[ -n "${CI_RUNTIME_RELATED_EVIDENCE_DIR:-}" ]]; then
    classify_args+=(--evidence-dir "$CI_RUNTIME_RELATED_EVIDENCE_DIR")
  fi
  classify_args+=(--output "$EVIDENCE_DIR/classification.txt")
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    classify_args+=(--summary "$GITHUB_STEP_SUMMARY")
  fi
  node scripts/containers/classify-ci-runtime-evidence.mjs "${classify_args[@]}"
}

usage() {
  printf '%s\n' 'Usage: ci-container-runtime.sh <bootstrap pr|bootstrap release|verify|preflight|collect>'
}

command="${1:-}"
case "$command" in
  bootstrap)
    start_evidence_log bootstrap
    bootstrap_toolchain "${2:-}"
    ;;
  verify)
    start_evidence_log verify
    verify_toolchain
    ;;
  preflight)
    start_evidence_log preflight
    runtime_preflight
    ;;
  collect)
    collect_diagnostics
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
