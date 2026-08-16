#!/usr/bin/env bash

set -euo pipefail

SYSTEM_PREFIX="${CI_RUNTIME_SYSTEM_PREFIX:-/usr}"
LOCAL_PREFIX="${CI_RUNTIME_LOCAL_PREFIX:-/usr/local}"
PACKAGE_PODMAN_BIN="$SYSTEM_PREFIX/bin/podman"
PACKAGE_CONMON_BIN="$SYSTEM_PREFIX/bin/conmon"
PACKAGE_CRUN_BIN="$SYSTEM_PREFIX/bin/crun"
PACKAGE_QUADLET_GENERATOR="$SYSTEM_PREFIX/libexec/podman/quadlet"
STATIC_PODMAN_BIN="$LOCAL_PREFIX/bin/podman"
STATIC_BUNDLED_CONMON_BIN="$LOCAL_PREFIX/lib/podman/conmon"
STATIC_CRUN_BIN="$LOCAL_PREFIX/bin/crun"
STATIC_QUADLET_GENERATOR="$LOCAL_PREFIX/libexec/podman/quadlet"
PODMAN_BIN="${CI_RUNTIME_PODMAN_BIN:-$(command -v podman 2>/dev/null || true)}"
PODMAN_BIN="${PODMAN_BIN:-$PACKAGE_PODMAN_BIN}"
CONMON_BIN=''
CRUN_BIN=''
QUADLET_GENERATOR=''
TOOLCHAIN_PROFILE=''
DPKG_QUERY_BIN="${CI_RUNTIME_DPKG_QUERY_BIN:-dpkg-query}"
SUDO_BIN="${CI_RUNTIME_SUDO_BIN:-sudo}"
APT_GET_BIN="${CI_RUNTIME_APT_GET_BIN:-apt-get}"
TIMEOUT_BIN="${CI_RUNTIME_TIMEOUT_BIN:-timeout}"
COMMAND_TIMEOUT_SECONDS="${CI_RUNTIME_COMMAND_TIMEOUT_SECONDS:-30}"
CONTAINERS_CONF="${CI_RUNTIME_CONTAINERS_CONF:-/etc/containers/containers.conf}"
RUNNER_RUNTIME_DROP_IN="${CI_RUNTIME_RUNNER_RUNTIME_DROP_IN:-/etc/containers/containers.conf.d/00-fix-runtime.conf}"
EVIDENCE_DIR="${CI_RUNTIME_EVIDENCE_DIR:-}"
PREFLIGHT_IMAGE='docker.io/library/alpine@sha256:eafc1edb577d2e9b458664a15f23ea1c370214193226069eb22921169fc7e43f'

fail() {
  printf 'ci-container-runtime: %s\n' "$*" >&2
  exit 1
}

canonical_path() {
  realpath -m -- "$1"
}

select_toolchain() {
  local resolved_podman
  resolved_podman="$(canonical_path "$PODMAN_BIN")"
  if [[ "$resolved_podman" == "$(canonical_path "$STATIC_PODMAN_BIN")" ]]; then
    TOOLCHAIN_PROFILE=static
    CONMON_BIN="${CI_RUNTIME_CONMON_BIN:-$PACKAGE_CONMON_BIN}"
    CRUN_BIN="${CI_RUNTIME_CRUN_BIN:-$STATIC_CRUN_BIN}"
    QUADLET_GENERATOR="${CI_RUNTIME_QUADLET_GENERATOR:-$STATIC_QUADLET_GENERATOR}"
  elif [[ "$resolved_podman" == "$(canonical_path "$PACKAGE_PODMAN_BIN")" ]]; then
    TOOLCHAIN_PROFILE=package
    CONMON_BIN="${CI_RUNTIME_CONMON_BIN:-$PACKAGE_CONMON_BIN}"
    CRUN_BIN="${CI_RUNTIME_CRUN_BIN:-$PACKAGE_CRUN_BIN}"
    QUADLET_GENERATOR="${CI_RUNTIME_QUADLET_GENERATOR:-$PACKAGE_QUADLET_GENERATOR}"
  else
    fail "Podman resolves outside the supported runner toolchains: $PODMAN_BIN"
  fi
}

run_bounded() {
  [[ "$COMMAND_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] ||
    fail 'CI_RUNTIME_COMMAND_TIMEOUT_SECONDS must be a positive integer'
  "$TIMEOUT_BIN" --kill-after=5s \
    "${COMMAND_TIMEOUT_SECONDS}s" "$@"
}

active_config_lines() {
  sed -E \
    -e 's/[[:space:]]*#.*$//' \
    -e '/^[[:space:]]*$/d' \
    -e 's/[[:space:]]//g' \
    -- "$1"
}

remove_runner_static_configuration() {
  local active
  if [[ -f "$CONTAINERS_CONF" ]]; then
    active="$(active_config_lines "$CONTAINERS_CONF")"
    if [[ "$active" == $'[engine]\ncgroup_manager="cgroupfs"\nevents_logger="file"' ]]; then
      "$SUDO_BIN" rm -f -- "$CONTAINERS_CONF"
    fi
  fi
  if [[ -f "$RUNNER_RUNTIME_DROP_IN" ]]; then
    active="$(active_config_lines "$RUNNER_RUNTIME_DROP_IN")"
    if [[ "$active" == $'[engine.runtimes]\ncrun=["/usr/local/bin/crun"]' ]]; then
      "$SUDO_BIN" rm -f -- "$RUNNER_RUNTIME_DROP_IN"
    elif grep -Fq -- '/usr/local/bin/crun' "$RUNNER_RUNTIME_DROP_IN"; then
      fail "runner runtime drop-in still selects the static crun path: $RUNNER_RUNTIME_DROP_IN"
    fi
  fi
}

reset_existing_rootless_runtime() {
  local existing_podman status
  existing_podman="$(command -v podman 2>/dev/null || true)"
  [[ -n "$existing_podman" ]] || return 0
  [[ "${GITHUB_ACTIONS:-}" == true ]] ||
    fail 'refusing to reset rootless Podman state outside GitHub Actions'
  printf '%s\n' 'Resetting existing rootless Podman runtime state before replacing the toolchain.'
  # Hosted runners are disposable and have no workflow-owned Podman resources yet.
  # A migration writes state for the preinstalled version, which can be newer than
  # Ubuntu's package version and therefore unsafe to reuse after the downgrade.
  if run_bounded "$existing_podman" system reset --force; then
    printf '%s\n' 'existing rootless Podman runtime state: reset'
  else
    status="$?"
    fail "cannot reset the existing rootless Podman runtime state (exit $status)"
  fi
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
  local generator podman_info selected_conmon selected_runtime status
  select_toolchain
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

  if podman_info="$(
    run_bounded "$PODMAN_BIN" --log-level=debug info --format json
  )"; then
    :
  else
    status="$?"
    fail "cannot inspect the selected Podman runtime toolchain (exit $status)"
  fi
  selected_conmon="$(jq -er '.host.conmon.path' <<<"$podman_info")" ||
    fail 'Podman info does not identify conmon'
  selected_runtime="$(jq -er '.host.ociRuntime.path' <<<"$podman_info")" ||
    fail 'Podman info does not identify the OCI runtime'
  [[ "$(canonical_path "$selected_conmon")" == "$(canonical_path "$CONMON_BIN")" ]] ||
    fail "Podman selected unexpected conmon: $selected_conmon"
  [[ "$(canonical_path "$selected_runtime")" == "$(canonical_path "$CRUN_BIN")" ]] ||
    fail "Podman selected unexpected OCI runtime: $selected_runtime"

  assert_package_owner "$CONMON_BIN" conmon
  if [[ "$TOOLCHAIN_PROFILE" == package ]]; then
    assert_package_owner "$PODMAN_BIN" podman
    assert_package_owner "$CRUN_BIN" crun
    assert_package_owner "$QUADLET_GENERATOR" podman
  fi

  "$PODMAN_BIN" --version
  "$CONMON_BIN" --version
  "$CRUN_BIN" --version
  "$QUADLET_GENERATOR" --version
  printf 'coherent %s toolchain: verified\n' "$TOOLCHAIN_PROFILE"
}

bootstrap_toolchain() {
  local profile="$1"
  local -a packages=(conmon crun jq libnss3-tools podman)
  [[ "$profile" == pr || "$profile" == release ]] ||
    fail 'bootstrap expects the pr or release profile'
  [[ "$profile" == release ]] && packages+=(skopeo)

  # Keep runtime selection local to this process. Publishing an entire system
  # prefix through GITHUB_PATH can shadow the Node and npm selected by
  # actions/setup-node in every later workflow step.

  select_toolchain
  if [[ "$TOOLCHAIN_PROFILE" == static ]]; then
    # Newer hosted images provide a current static Podman, crun, and Quadlet,
    # but their bundled conmon omits journald support. Keep the current runtime
    # and replace only conmon with Ubuntu's journald-capable package. This also
    # avoids migrating rootless state from Podman 5.x back to Podman 4.x.
    packages=(conmon jq libnss3-tools)
    [[ "$profile" == release ]] && packages+=(skopeo)
    "$SUDO_BIN" "$APT_GET_BIN" update
    "$SUDO_BIN" "$APT_GET_BIN" install -y --no-install-recommends \
      --reinstall "${packages[@]}"
    "$SUDO_BIN" rm -f -- "$STATIC_BUNDLED_CONMON_BIN"
    "$SUDO_BIN" ln -s -- "$PACKAGE_CONMON_BIN" "$STATIC_BUNDLED_CONMON_BIN"
    hash -r
    verify_toolchain
    return 0
  fi

  # Older hosted images use Ubuntu's package-owned runtime. Reset its disposable
  # rootless state and reinstall the complete package toolchain coherently.
  reset_existing_rootless_runtime
  remove_runner_static_configuration
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
  PODMAN_BIN="$PACKAGE_PODMAN_BIN"
  PATH="$SYSTEM_PREFIX/bin:$PATH"
  export PATH
  "$SUDO_BIN" "$APT_GET_BIN" update
  "$SUDO_BIN" "$APT_GET_BIN" install -y --no-install-recommends \
    --reinstall "${packages[@]}"
  verify_toolchain
}

runtime_preflight() {
  local name status
  name="kravhantering-runtime-preflight-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
  cleanup_preflight() {
    "$PODMAN_BIN" rm --force "$name" >/dev/null 2>&1 || true
    "$PODMAN_BIN" image rm --force "$PREFLIGHT_IMAGE" >/dev/null 2>&1 || true
  }
  trap cleanup_preflight EXIT
  cleanup_preflight
  if "$PODMAN_BIN" run --pull=always --name "$name" --log-driver=journald \
    "$PREFLIGHT_IMAGE" /bin/true; then
    :
  else
    status="$?"
    cleanup_preflight
    trap - EXIT
    return "$status"
  fi
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
  local required="${1:-false}"
  local api_error_file api_help gh_version job_id jobs_file log_file message
  local request_error target_job
  local -a gh_log_api_args=(api)
  local output="$EVIDENCE_DIR/github-runner-metadata.txt"
  target_job="${CI_RUNTIME_TARGET_JOB:-}"
  metadata_unavailable() {
    message="$1"
    printf '%s\n' "$message" >"$output"
    printf 'ci-container-runtime: %s\n' "$message" >&2
    [[ "$required" != true ]]
  }
  format_api_error() {
    request_error="$(
      LC_ALL=C tr -cd '[:print:]\n' <"$1" |
        tr '\n' ' ' |
        cut -c1-500
    )"
    printf '%s\n' "${request_error:-no GitHub CLI diagnostic was returned}"
  }
  if [[ -z "${GH_TOKEN:-}" || -z "${GITHUB_REPOSITORY:-}" || \
    -z "${GITHUB_RUN_ID:-}" ]] || ! command -v gh >/dev/null 2>&1; then
    metadata_unavailable 'GitHub job metadata unavailable to the collector.'
    return
  fi
  gh_version="$(gh --version 2>/dev/null || true)"
  gh_version="${gh_version%%$'\n'*}"
  gh_version="${gh_version:-gh version unavailable}"
  jobs_file="$(mktemp)"
  api_error_file="$(mktemp)"
  if ! gh api "/repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/jobs?filter=latest" \
    >"$jobs_file" 2>"$api_error_file"; then
    request_error="$(format_api_error "$api_error_file")"
    rm -f -- "$api_error_file" "$jobs_file"
    metadata_unavailable \
      "GitHub job metadata request failed for run $GITHUB_RUN_ID ($gh_version; $request_error)."
    return
  fi
  rm -f -- "$api_error_file"
  if [[ -n "$target_job" ]]; then
    job_id="$(
      jq -r --arg target "$target_job" \
        '[.jobs[] | select(.name == $target and .status == "completed")] | last | .id // empty' \
        "$jobs_file"
    )"
  else
    job_id="$(
      jq -r '[.jobs[] | select(.status == "in_progress")] | first | .id // empty' \
        "$jobs_file"
    )"
  fi
  rm -f -- "$jobs_file"
  if [[ -z "$job_id" ]]; then
    metadata_unavailable \
      "GitHub target job metadata unavailable for '$target_job' in run $GITHUB_RUN_ID."
    return
  fi
  log_file="$(mktemp)"
  api_error_file="$(mktemp)"
  api_help="$(gh api --help 2>&1 || true)"
  if [[ "$api_help" == *'--allow-escape-sequences'* ]]; then
    gh_log_api_args+=(--allow-escape-sequences)
  fi
  if ! gh "${gh_log_api_args[@]}" \
    "/repos/$GITHUB_REPOSITORY/actions/jobs/$job_id/logs" \
    >"$log_file" 2>"$api_error_file"; then
    request_error="$(format_api_error "$api_error_file")"
    rm -f -- "$api_error_file" "$log_file"
    metadata_unavailable \
      "GitHub target job log request failed for job $job_id ($gh_version; $request_error)."
    return
  fi
  rm -f -- "$api_error_file"
  head -n 120 "$log_file" |
    sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z //' |
    awk '
      {
        sub(/^[[:space:]]+/, "")
        sub(/^##\[group\]/, "")
      }
      $0 == "##[endgroup]" { section = ""; next }
      /^Current runner version: '\''?[0-9]+(\.[0-9]+){2}'\''?$/ { print; next }
      $0 == "Runner Image Provisioner" { section = "provisioner"; print; next }
      $0 == "Runner Image" { section = "image"; print; next }
      section == "provisioner" && /^Hosted Compute Agent$/ { print; next }
      section == "provisioner" && /^2\.0\.[0-9]+(\.[0-9]+)?$/ { print; next }
      section == "provisioner" && /^Version: 20[0-9]{6}(\.[0-9]+)+$/ { print; next }
      section == "provisioner" && /^Commit: [a-f0-9]{40}$/ { print; next }
      section == "provisioner" && /^Build Date: [0-9TZ:.+-]+$/ { print; next }
      section == "provisioner" && /^Azure Region: [-A-Za-z0-9 ]+$/ { print; next }
      section == "image" && /^Image: ubuntu-24\.04$/ { print; next }
      section == "image" && /^Version: 20[0-9]{6}(\.[0-9]+)+$/ { print; next }
      section == "image" && /^Included Software: https:\/\/github\.com\/actions\/runner-images\/[-A-Za-z0-9._~:/?#%]+$/ { print; next }
      section == "image" && /^Image Release: https:\/\/github\.com\/actions\/runner-images\/[-A-Za-z0-9._~:/?#%]+$/ { print; next }
    ' >"$output"
  rm -f -- "$log_file"
  if [[ ! -s "$output" ]]; then
    metadata_unavailable 'GitHub runner metadata was absent from the target job log.'
    return
  fi
  if ! awk '
    $0 == "Runner Image Provisioner" { section = "provisioner"; next }
    $0 == "Runner Image" { section = "image"; next }
    section == "provisioner" && /^Hosted Compute Agent$/ { hosted = 1 }
    section == "provisioner" && /^2\.0\.[0-9]+(\.[0-9]+)?$/ { legacy = 1 }
    section == "provisioner" && /^Version: / { provisioner_version = 1 }
    section == "image" && /^Image: ubuntu-24\.04$/ { image = 1 }
    END { exit !(image && (legacy || (hosted && provisioner_version))) }
  ' "$output"; then
    metadata_unavailable 'GitHub runner metadata was incomplete.'
  fi
}

append_component_evidence() {
  local label="$1" file="$2" owner resolved
  [[ -n "$file" ]] || return 0
  resolved="$(canonical_path "$file")"
  owner="$("$DPKG_QUERY_BIN" --search -- "$resolved" 2>&1 || true)"
  {
    printf 'source=%s\npath=%s\nresolved=%s\npackage=%s\n' \
      "$label" "$file" "$resolved" "$owner"
    if [[ -f "$resolved" ]]; then
      sha256sum -- "$resolved"
    fi
    if [[ -x "$resolved" ]]; then
      "$resolved" --version 2>&1 || true
    fi
    printf '\n'
  } >>"$EVIDENCE_DIR/runtime-components.txt"
}

collect_component_evidence() {
  local directory name podman_command podman_info selected_conmon selected_runtime
  local -a directories
  local search_path="${CI_RUNTIME_GENERATOR_SEARCH_PATH:-/run/systemd/user-generators:/etc/systemd/user-generators:$LOCAL_PREFIX/lib/systemd/user-generators:$SYSTEM_PREFIX/lib/systemd/user-generators:/lib/systemd/user-generators}"
  select_toolchain
  : >"$EVIDENCE_DIR/runtime-components.txt"

  append_component_evidence expected-podman "$PODMAN_BIN"
  append_component_evidence expected-conmon "$CONMON_BIN"
  append_component_evidence expected-crun "$CRUN_BIN"
  append_component_evidence expected-quadlet "$QUADLET_GENERATOR"
  append_component_evidence path-podman "$(command -v podman 2>/dev/null || true)"
  append_component_evidence path-conmon "$(command -v conmon 2>/dev/null || true)"
  append_component_evidence path-crun "$(command -v crun 2>/dev/null || true)"

  IFS=: read -r -a directories <<<"$search_path"
  for directory in "${directories[@]}"; do
    for name in podman-user-generator podman-system-generator; do
      if [[ -x "$directory/$name" ]]; then
        append_component_evidence systemd-generator "$directory/$name"
      fi
    done
  done

  podman_command="$(command -v podman 2>/dev/null || true)"
  [[ -n "$podman_command" ]] || podman_command="$PODMAN_BIN"
  run_bounded "$podman_command" --log-level=debug info --format json \
    >"$EVIDENCE_DIR/podman-info.json" 2>&1 || true
  podman_info="$(<"$EVIDENCE_DIR/podman-info.json")"
  selected_conmon="$(jq -er '.host.conmon.path' <<<"$podman_info" 2>/dev/null || true)"
  selected_runtime="$(jq -er '.host.ociRuntime.path' <<<"$podman_info" 2>/dev/null || true)"
  append_component_evidence podman-selected-conmon "$selected_conmon"
  append_component_evidence podman-selected-runtime "$selected_runtime"
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
  printf '%s\n' 'Usage: ci-container-runtime.sh <bootstrap pr|bootstrap release|verify|preflight|collect|collect-runner-metadata>'
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
  collect-runner-metadata)
    [[ -n "$EVIDENCE_DIR" ]] || fail 'collect-runner-metadata requires CI_RUNTIME_EVIDENCE_DIR'
    [[ -n "${CI_RUNTIME_TARGET_JOB:-}" ]] || fail 'collect-runner-metadata requires CI_RUNTIME_TARGET_JOB'
    mkdir -p -- "$EVIDENCE_DIR"
    collect_github_runner_metadata true
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
