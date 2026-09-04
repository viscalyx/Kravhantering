#!/usr/bin/env bash
set -euo pipefail

CODEX_INSTALLER="${AZURE_DEV_CODEX_INSTALLER:-/usr/local/share/kravhantering/install-codex.sh}"
CODEX_MODE="${AZURE_DEV_CODEX_MODE:-system-managed}"
CODEX_USER="${AZURE_DEV_CODEX_USER:-vscode}"
CODEX_USER_HOME="${AZURE_DEV_CODEX_USER_HOME:-/home/${CODEX_USER}}"
CODEX_HOME="${CODEX_HOME:-${CODEX_USER_HOME}/.codex}"
CODEX_INSTALL_DIR="${CODEX_INSTALL_DIR:-${CODEX_USER_HOME}/.local/bin}"
CODEX_TEMP_ROOT="${AZURE_DEV_CODEX_TEMP_ROOT:-/var/tmp/krav-vscode/codex-install}"
CODEX_TIMEOUT_SECONDS="${AZURE_DEV_CODEX_TIMEOUT_SECONDS:-900}"
CODEX_LEGACY_LAUNCHER="${AZURE_DEV_CODEX_LEGACY_LAUNCHER:-/usr/local/bin/codex}"
CODEX_STANDALONE_ROOT="${CODEX_HOME}/packages/standalone"
CODEX_RELEASES_DIR="${CODEX_STANDALONE_ROOT}/releases"
CODEX_CURRENT_LINK="${CODEX_STANDALONE_ROOT}/current"
CODEX_LAUNCHER="${CODEX_INSTALL_DIR}/codex"
CODEX_TRANSACTION="${CODEX_STANDALONE_ROOT}/.krav-azure-transaction.json"
CODEX_LOCK_FILE="${CODEX_STANDALONE_ROOT}/install.lock"
CODEX_UID=''
CODEX_GID=''
CODEX_TRUSTED_ROOT_UID=''
CODEX_LOCK_FD=''
transaction_active=0
previous_current_target=''
previous_launcher_target=''
run_temp_dir=''
user_managed_result=''
had_release_state=0

log() {
  printf '[azure-codex-orchestration] %s\n' "$*" >&2
}

validate_result() {
  local installer_result="$1" target_version canonical_result

  if [ "$(printf '%s\n' "${installer_result}" | wc -l)" -ne 1 ] ||
    ! target_version="$(
      printf '%s\n' "${installer_result}" |
        jq -er '
          if type == "object" and
            keys == ["schemaVersion", "targetVersion"] and
            .schemaVersion == 1 and
            (.targetVersion | type == "string") and
            (.targetVersion | test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))
          then .targetVersion
          else error("invalid Codex installer result")
          end
        '
    )"; then
    log 'Codex installer result is invalid'
    return 1
  fi

  canonical_result="$(
    jq -cn \
      --arg targetVersion "${target_version}" \
      '{schemaVersion: 1, targetVersion: $targetVersion}'
  )"
  if [ "${installer_result}" != "${canonical_result}" ]; then
    log 'Codex installer result is invalid'
    return 1
  fi
  printf '%s\n' "${canonical_result}"
}

run_system_managed() {
  bash "${CODEX_INSTALLER}"
}

fail_unsafe_object() {
  log "Unsafe Codex managed object at $1: $2. Remove or repair it as ${CODEX_USER} before rerunning setup."
  return 1
}

require_managed_directory() {
  local path="$1" mode="$2"

  if [ -L "${path}" ]; then
    fail_unsafe_object "${path}" 'symbolic links are not allowed'
    return 1
  fi
  if [ -e "${path}" ] && [ ! -d "${path}" ]; then
    fail_unsafe_object "${path}" 'expected a directory'
    return 1
  fi
  if [ -d "${path}" ]; then
    if [ "$(stat -c '%u:%g' -- "${path}")" != "${CODEX_UID}:${CODEX_GID}" ]; then
      fail_unsafe_object "${path}" "expected ownership ${CODEX_USER}:${CODEX_USER}"
      return 1
    fi
    chmod "${mode}" "${path}"
    return
  fi
  install -d -o "${CODEX_USER}" -g "${CODEX_USER}" -m "${mode}" "${path}"
}

validate_managed_file() {
  local path="$1"

  if [ -L "${path}" ] || [ ! -f "${path}" ]; then
    fail_unsafe_object "${path}" 'expected a regular file'
    return 1
  fi
  if [ "$(stat -c '%u:%g' -- "${path}")" != "${CODEX_UID}:${CODEX_GID}" ]; then
    fail_unsafe_object "${path}" "expected ownership ${CODEX_USER}:${CODEX_USER}"
    return 1
  fi
}

validate_safe_parent_chain() {
  local path="$1" parent owner mode mode_value

  parent="$(dirname -- "${path}")"
  while [ "${parent}" != '/' ]; do
    if [ -L "${parent}" ]; then
      fail_unsafe_object "${parent}" 'parent symbolic links are not allowed'
      return 1
    fi
    if [ -e "${parent}" ] && [ ! -d "${parent}" ]; then
      fail_unsafe_object "${parent}" 'parent must be a directory'
      return 1
    fi
    if [ ! -d "${parent}" ]; then
      parent="$(dirname -- "${parent}")"
      continue
    fi
    owner="$(stat -c '%u' -- "${parent}")"
    mode="$(stat -c '%a' -- "${parent}")"
    mode_value=$((8#${mode}))
    if [ "${owner}" != "${CODEX_TRUSTED_ROOT_UID}" ] &&
      [ "${owner}" != "${CODEX_UID}" ]; then
      fail_unsafe_object "${parent}" 'parent is owned by an unexpected account'
      return 1
    fi
    if (( (mode_value & 8#022) != 0 && (mode_value & 8#1000) == 0 )); then
      fail_unsafe_object "${parent}" 'parent is writable by an untrusted group or account'
      return 1
    fi
    parent="$(dirname -- "${parent}")"
  done
}

is_recognized_release_name() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta)(\.[0-9]+){0,2})?-(x86_64|aarch64)-unknown-linux-musl$ ]]
}

is_recognized_staging_name() {
  local candidate suffix

  case "$1" in
    .staging.*.*) candidate="${1#.staging.}" ;;
    *) return 1 ;;
  esac
  suffix="${candidate##*.}"
  [[ "${suffix}" =~ ^[0-9]+$ ]] || return 1
  candidate="${candidate%.*}"
  is_recognized_release_name "${candidate}"
}

is_recognized_release_target() {
  local target="$1" name

  case "${target}" in
    "${CODEX_RELEASES_DIR}"/*) name="${target#"${CODEX_RELEASES_DIR}/"}" ;;
    *) return 1 ;;
  esac
  [[ "${name}" != */* ]] && is_recognized_release_name "${name}"
}

is_recognized_launcher_target() {
  [ "$1" = "${CODEX_CURRENT_LINK}/bin/codex" ] ||
    [ "$1" = "${CODEX_CURRENT_LINK}/codex" ]
}

release_version_from_target() {
  local name="${1##*/}"

  case "${name}" in
    *-x86_64-unknown-linux-musl) printf '%s\n' "${name%-x86_64-unknown-linux-musl}" ;;
    *-aarch64-unknown-linux-musl) printf '%s\n' "${name%-aarch64-unknown-linux-musl}" ;;
    *) return 1 ;;
  esac
}

version_core_is_greater() {
  local left="${1%%-*}" right="${2%%-*}"
  local left_major left_minor left_patch right_major right_minor right_patch

  IFS=. read -r left_major left_minor left_patch <<< "${left}"
  IFS=. read -r right_major right_minor right_patch <<< "${right}"
  if ((10#${left_major} != 10#${right_major})); then
    ((10#${left_major} > 10#${right_major}))
  elif ((10#${left_minor} != 10#${right_minor})); then
    ((10#${left_minor} > 10#${right_minor}))
  else
    ((10#${left_patch} > 10#${right_patch}))
  fi
}

select_convergence_action() {
  local previous_version="$1" target_version="$2"

  case "${previous_version}" in
    missing)
      if [ "${had_release_state}" -eq 1 ]; then
        printf 'repair\n'
      else
        printf 'install\n'
      fi
      ;;
    incomplete) printf 'repair\n' ;;
    *)
      if [ -z "${target_version}" ]; then
        printf 'resolve\n'
      elif [ "${previous_version}" = "${target_version}" ]; then
        printf 'revalidate\n'
      elif version_core_is_greater "${previous_version}" "${target_version}"; then
        printf 'downgrade\n'
      else
        printf 'upgrade\n'
      fi
      ;;
  esac
}

validate_release_objects() {
  local entry name

  if [ ! -d "${CODEX_RELEASES_DIR}" ]; then
    return
  fi
  while IFS= read -r -d '' entry; do
    name="${entry##*/}"
    if [ -L "${entry}" ]; then
      fail_unsafe_object "${entry}" 'release entries cannot be symbolic links'
      return 1
    fi
    if [ ! -d "${entry}" ]; then
      fail_unsafe_object "${entry}" 'release entries must be directories'
      return 1
    fi
    if ! is_recognized_release_name "${name}" &&
      ! is_recognized_staging_name "${name}"; then
      fail_unsafe_object "${entry}" 'unrecognized release entry'
      return 1
    fi
    if [ "$(stat -c '%u:%g' -- "${entry}")" != "${CODEX_UID}:${CODEX_GID}" ]; then
      fail_unsafe_object "${entry}" "expected ownership ${CODEX_USER}:${CODEX_USER}"
      return 1
    fi
    if find "${entry}" -xdev \( ! -uid "${CODEX_UID}" -o ! -gid "${CODEX_GID}" \) \
      -print -quit | grep -q .; then
      fail_unsafe_object "${entry}" "package content must be owned by ${CODEX_USER}:${CODEX_USER}"
      return 1
    fi
    find "${entry}" -xdev -type d -exec chmod 0700 {} +
  done < <(find "${CODEX_RELEASES_DIR}" -mindepth 1 -maxdepth 1 -print0)
}

validate_standalone_objects() {
  local entry name

  while IFS= read -r -d '' entry; do
    name="${entry##*/}"
    case "${name}" in
      releases)
        [ ! -L "${entry}" ] && [ -d "${entry}" ] || {
          fail_unsafe_object "${entry}" 'expected the release directory'
          return 1
        }
        ;;
      current)
        [ -L "${entry}" ] || {
          fail_unsafe_object "${entry}" 'expected the managed current link'
          return 1
        }
        ;;
      install.lock)
        [ ! -L "${entry}" ] && [ -f "${entry}" ] || {
          fail_unsafe_object "${entry}" 'expected the upstream lock file'
          return 1
        }
        validate_managed_file "${entry}" || return 1
        ;;
      install.lock.d)
        [ ! -L "${entry}" ] && [ -d "${entry}" ] || {
          fail_unsafe_object "${entry}" 'expected the upstream lock directory'
          return 1
        }
        if [ "$(stat -c '%u:%g' -- "${entry}")" != "${CODEX_UID}:${CODEX_GID}" ]; then
          fail_unsafe_object "${entry}" "expected ownership ${CODEX_USER}:${CODEX_USER}"
          return 1
        fi
        ;;
      .krav-azure-transaction.json)
        validate_managed_file "${entry}" || return 1
        ;;
      *)
        fail_unsafe_object "${entry}" 'unrecognized standalone package state'
        return 1
        ;;
    esac
  done < <(find "${CODEX_STANDALONE_ROOT}" -mindepth 1 -maxdepth 1 -print0)
}

read_recognized_link() {
  local path="$1" kind="$2" target

  if [ ! -e "${path}" ] && [ ! -L "${path}" ]; then
    return
  fi
  if [ ! -L "${path}" ]; then
    fail_unsafe_object "${path}" "expected the managed ${kind} symbolic link"
    return 1
  fi
  target="$(readlink -- "${path}")"
  case "${kind}" in
    current)
      is_recognized_release_target "${target}" || {
        fail_unsafe_object "${path}" "unrecognized current target ${target}"
        return 1
      }
      ;;
    launcher)
      if ! is_recognized_launcher_target "${target}"; then
        fail_unsafe_object "${path}" "unrecognized launcher target ${target}"
        return 1
      fi
      ;;
  esac
  printf '%s\n' "${target}"
}

replace_link() {
  local path="$1" target="$2" temporary_link="${path}.krav.$$"

  rm -f -- "${temporary_link}"
  ln -s -- "${target}" "${temporary_link}"
  mv -Tf -- "${temporary_link}" "${path}"
}

restore_link() {
  local path="$1" target="$2" kind="$3"

  read_recognized_link "${path}" "${kind}" >/dev/null || return 1
  if [ -n "${target}" ]; then
    replace_link "${path}" "${target}"
  else
    rm -f -- "${path}"
  fi
}

rollback_links() {
  local reason="$1" rollback_failed=0

  if [ "${transaction_active}" -ne 1 ]; then
    return
  fi
  log "rollback=${reason}"
  restore_link "${CODEX_CURRENT_LINK}" "${previous_current_target}" current || rollback_failed=1
  restore_link "${CODEX_LAUNCHER}" "${previous_launcher_target}" launcher || rollback_failed=1
  transaction_active=0
  if [ "${rollback_failed}" -ne 0 ]; then
    log "Rollback could not safely restore every managed link; recovery record retained at ${CODEX_TRANSACTION}"
    return 1
  fi
  rm -f -- "${CODEX_TRANSACTION}"
}

is_recognized_run_scratch_name() {
  [[ "$1" =~ ^run\.[A-Za-z0-9]+$ ]]
}

remove_managed_scratch_directory() {
  local path="$1" description="$2" missing_policy="$3"

  if [ ! -e "${path}" ] && [ ! -L "${path}" ]; then
    if [ "${missing_policy}" = 'allow' ]; then
      return
    fi
    log "Refusing missing ${description} at ${path}"
    return 1
  fi
  if [ -L "${path}" ] || [ ! -d "${path}" ] ||
    [ "$(stat -c '%u:%g' -- "${path}")" != "${CODEX_UID}:${CODEX_GID}" ]; then
    log "Refusing unsafe ${description} at ${path}"
    return 1
  fi
  rm -rf -- "${path}"
}

cleanup_run_temp() {
  if [ -z "${run_temp_dir}" ]; then
    return
  fi
  remove_managed_scratch_directory \
    "${run_temp_dir}" 'Azure Codex scratch cleanup' allow || return 1
  run_temp_dir=''
}

cleanup_stale_scratch() {
  local entry name

  while IFS= read -r -d '' entry; do
    name="${entry##*/}"
    is_recognized_run_scratch_name "${name}" || continue
    remove_managed_scratch_directory \
      "${entry}" 'stale Azure Codex scratch' reject || return 1
  done < <(find "${CODEX_TEMP_ROOT}" -mindepth 1 -maxdepth 1 -name 'run.*' -print0)
}

acquire_install_lock() {
  if [ ! -e "${CODEX_LOCK_FILE}" ] && [ ! -L "${CODEX_LOCK_FILE}" ]; then
    runuser -u "${CODEX_USER}" -- \
      /usr/bin/env -i PATH=/usr/bin:/bin \
      /bin/bash -c 'umask 077; set -o noclobber; : > "$1"' bash \
      "${CODEX_LOCK_FILE}" 2>/dev/null || true
  fi
  validate_managed_file "${CODEX_LOCK_FILE}" || return 1
  chmod 0600 "${CODEX_LOCK_FILE}"
  exec {CODEX_LOCK_FD}<> "${CODEX_LOCK_FILE}"
  if [ "$(readlink -- "/proc/self/fd/${CODEX_LOCK_FD}" 2>/dev/null)" != "${CODEX_LOCK_FILE}" ] ||
    [ ! -f "/proc/self/fd/${CODEX_LOCK_FD}" ] ||
    [ "$(stat -Lc '%u:%g' -- "/proc/self/fd/${CODEX_LOCK_FD}")" != "${CODEX_UID}:${CODEX_GID}" ]; then
    log 'Codex install lock changed during validation'
    exec {CODEX_LOCK_FD}>&-
    return 1
  fi
  if ! /usr/bin/flock --timeout "${CODEX_TIMEOUT_SECONDS}" "${CODEX_LOCK_FD}"; then
    log 'Timed out waiting for the Codex install lock'
    exec {CODEX_LOCK_FD}>&-
    return 1
  fi
}

release_install_lock() {
  if [ -n "${CODEX_LOCK_FD}" ]; then
    exec {CODEX_LOCK_FD}>&-
  fi
}

handle_failure() {
  local status=$?
  rollback_links "installer failure (exit ${status})"
  cleanup_run_temp || true
  exit "${status}"
}

handle_signal() {
  local signal="$1" status="$2"
  rollback_links "signal ${signal}"
  cleanup_run_temp || true
  trap - EXIT
  exit "${status}"
}

write_transaction() {
  local temporary_transaction="${CODEX_TRANSACTION}.$$"

  jq -cn \
    --arg currentTarget "${previous_current_target}" \
    --arg launcherTarget "${previous_launcher_target}" \
    --arg scratchPath "${run_temp_dir}" \
    '{schemaVersion: 1,
      previousCurrentTarget: (if $currentTarget == "" then null else $currentTarget end),
      previousLauncherTarget: (if $launcherTarget == "" then null else $launcherTarget end),
      scratchPath: $scratchPath}' \
    > "${temporary_transaction}"
  chown "${CODEX_USER}:${CODEX_USER}" "${temporary_transaction}"
  chmod 0600 "${temporary_transaction}"
  mv -f -- "${temporary_transaction}" "${CODEX_TRANSACTION}"
}

recover_interrupted_transaction() {
  local recovered_current recovered_launcher recovered_scratch

  if [ ! -e "${CODEX_TRANSACTION}" ] && [ ! -L "${CODEX_TRANSACTION}" ]; then
    return
  fi
  validate_managed_file "${CODEX_TRANSACTION}" || return 1
  if ! recovered_current="$(
    jq -er '
      if type == "object" and
        keys == ["previousCurrentTarget", "previousLauncherTarget", "schemaVersion", "scratchPath"] and
        .schemaVersion == 1 and
        (.previousCurrentTarget == null or (.previousCurrentTarget | type == "string")) and
        (.previousLauncherTarget == null or (.previousLauncherTarget | type == "string")) and
        (.scratchPath | type == "string")
      then .previousCurrentTarget // ""
      else error("invalid transaction")
      end
    ' "${CODEX_TRANSACTION}"
  )" || ! recovered_launcher="$(
    jq -er '.previousLauncherTarget // ""' "${CODEX_TRANSACTION}"
  )" || ! recovered_scratch="$(
    jq -er '.scratchPath' "${CODEX_TRANSACTION}"
  )"; then
    fail_unsafe_object "${CODEX_TRANSACTION}" 'invalid interrupted transaction record'
    return 1
  fi
  if [ -n "${recovered_current}" ] && ! is_recognized_release_target "${recovered_current}"; then
    fail_unsafe_object "${CODEX_TRANSACTION}" 'unrecognized previous current target'
    return 1
  fi
  if [ -n "${recovered_current}" ] &&
    ! release_target_is_complete "${recovered_current}"; then
    fail_unsafe_object "${CODEX_TRANSACTION}" 'previous active release is incomplete'
    return 1
  fi
  if [ -n "${recovered_launcher}" ] &&
    ! is_recognized_launcher_target "${recovered_launcher}"; then
    fail_unsafe_object "${CODEX_TRANSACTION}" 'unrecognized previous launcher target'
    return 1
  fi
  case "${recovered_scratch}" in
    "${CODEX_TEMP_ROOT}"/run.*) ;;
    *)
      fail_unsafe_object "${CODEX_TRANSACTION}" 'unrecognized Azure scratch path'
      return 1
      ;;
  esac
  if ! is_recognized_run_scratch_name "${recovered_scratch##*/}"; then
    fail_unsafe_object "${CODEX_TRANSACTION}" 'unrecognized Azure scratch path'
    return 1
  fi
  previous_current_target="${recovered_current}"
  previous_launcher_target="${recovered_launcher}"
  transaction_active=1
  log 'rollback=recovering interrupted prior installation'
  restore_link "${CODEX_CURRENT_LINK}" "${previous_current_target}" current || return 1
  restore_link "${CODEX_LAUNCHER}" "${previous_launcher_target}" launcher || return 1
  run_temp_dir="${recovered_scratch}"
  cleanup_run_temp || return 1
  rm -f -- "${CODEX_TRANSACTION}"
  transaction_active=0
}

run_launcher_version() {
  runuser -u "${CODEX_USER}" -- \
    env -i \
    HOME="${CODEX_USER_HOME}" \
    CODEX_HOME="${CODEX_HOME}" \
    PATH="${CODEX_INSTALL_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    "${CODEX_LAUNCHER}" --version
}

release_target_is_complete() {
  local release="$1" version binary reported_version

  [ ! -L "${release}" ] && [ -d "${release}" ] || return 1
  version="$(release_version_from_target "${release}")" || return 1
  if [ -f "${release}/codex-package.json" ]; then
    [ -x "${release}/bin/codex" ] &&
      [ -x "${release}/bin/codex-code-mode-host" ] &&
      [ -x "${release}/codex-path/rg" ] &&
      [ -x "${release}/codex-resources/bwrap" ] &&
      [ -x "${release}/codex" ] || return 1
    binary="${release}/bin/codex"
  else
    [ -x "${release}/codex" ] &&
      [ -x "${release}/codex-resources/rg" ] &&
      [ -x "${release}/codex-resources/bwrap" ] || return 1
    binary="${release}/codex"
  fi
  reported_version="$(
    runuser -u "${CODEX_USER}" -- \
      env -i HOME="${CODEX_USER_HOME}" CODEX_HOME="${CODEX_HOME}" \
      PATH="${CODEX_INSTALL_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
      "${binary}" --version
  )" || return 1
  [ "${reported_version}" = "codex-cli ${version}" ]
}

validate_final_installation() {
  local target_version="$1" current_target launcher_target final_version

  current_target="$(read_recognized_link "${CODEX_CURRENT_LINK}" current)" || return 1
  launcher_target="$(read_recognized_link "${CODEX_LAUNCHER}" launcher)" || return 1
  if [ -z "${current_target}" ] || [ -z "${launcher_target}" ] ||
    [[ "${current_target}" != "${CODEX_RELEASES_DIR}/${target_version}-"* ]]; then
    log "Codex target ${target_version} was not activated through recognized managed links"
    return 1
  fi
  if ! release_target_is_complete "${current_target}"; then
    log "Codex target ${target_version} is incomplete after installation"
    return 1
  fi
  if ! final_version="$(run_launcher_version)" ||
    [ "${final_version}" != "codex-cli ${target_version}" ]; then
    log "Codex target ${target_version} did not pass exact-version validation"
    return 1
  fi
  log "finalVersion=${target_version}"
}

prepare_user_managed_roots() {
  local local_root="${CODEX_USER_HOME}/.local" packages_root="${CODEX_HOME}/packages"

  if [ "${CODEX_HOME}" != "${CODEX_USER_HOME}/.codex" ] ||
    [ "${CODEX_INSTALL_DIR}" != "${CODEX_USER_HOME}/.local/bin" ]; then
    log 'User-managed Codex paths must use the upstream vscode user layout'
    return 1
  fi
  CODEX_UID="$(id -u "${CODEX_USER}")"
  CODEX_GID="$(id -g "${CODEX_USER}")"
  CODEX_TRUSTED_ROOT_UID="$(stat -c '%u' /)"
  validate_safe_parent_chain "${CODEX_USER_HOME}" || return 1
  validate_safe_parent_chain "${CODEX_TEMP_ROOT}" || return 1
  require_managed_directory "${CODEX_USER_HOME}" 0750 || return 1
  require_managed_directory "${local_root}" 0700 || return 1
  require_managed_directory "${CODEX_INSTALL_DIR}" 0700 || return 1
  require_managed_directory "${CODEX_HOME}" 0700 || return 1
  require_managed_directory "${packages_root}" 0700 || return 1
  require_managed_directory "${CODEX_STANDALONE_ROOT}" 0700 || return 1
  require_managed_directory "${CODEX_TEMP_ROOT}" 0700 || return 1
}

prepare_locked_managed_state() {
  require_managed_directory "${CODEX_RELEASES_DIR}" 0700 || return 1
  if [ -e "${CODEX_HOME}/config.toml" ] || [ -L "${CODEX_HOME}/config.toml" ]; then
    validate_managed_file "${CODEX_HOME}/config.toml" || return 1
    chmod 0600 "${CODEX_HOME}/config.toml"
  fi
  validate_standalone_objects || return 1
  validate_release_objects || return 1
}

run_user_managed() {
  local installer_result canonical_result target_version previous_version='missing'
  local convergence_action='resolve' install_started_at_ns remaining_nanoseconds
  local remaining_seconds

  case "${CODEX_TIMEOUT_SECONDS}" in
    '' | *[!0-9]* | 0)
      log 'Codex installer timeout must be a positive number of seconds'
      return 1
      ;;
  esac
  if [ "${CODEX_TIMEOUT_SECONDS}" -gt 900 ]; then
    log 'Codex installer timeout must be at most 900 seconds'
    return 1
  fi

  if [ -e "${CODEX_LEGACY_LAUNCHER}" ] || [ -L "${CODEX_LEGACY_LAUNCHER}" ]; then
    log "Legacy global Codex launcher detected at ${CODEX_LEGACY_LAUNCHER}. In-place migration is unsupported; preserve remote-only work, run remove, then setup -Yes on a replacement VM."
    return 1
  fi
  prepare_user_managed_roots || return 1
  install_started_at_ns="$(/usr/bin/date +%s%N)"
  acquire_install_lock || return 1
  prepare_locked_managed_state || return 1
  recover_interrupted_transaction || return 1
  cleanup_stale_scratch || return 1
  if find "${CODEX_RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -print -quit |
    grep -q .; then
    had_release_state=1
  fi
  previous_current_target="$(read_recognized_link "${CODEX_CURRENT_LINK}" current)" || return 1
  previous_launcher_target="$(read_recognized_link "${CODEX_LAUNCHER}" launcher)" || return 1
  if [ -n "${previous_current_target}" ] &&
    ! release_target_is_complete "${previous_current_target}"; then
    previous_version='incomplete'
    restore_link "${CODEX_CURRENT_LINK}" '' current || return 1
    restore_link "${CODEX_LAUNCHER}" '' launcher || return 1
    previous_current_target=''
    previous_launcher_target=''
  elif [ -z "${previous_current_target}" ] && [ -n "${previous_launcher_target}" ]; then
    previous_version='incomplete'
    restore_link "${CODEX_LAUNCHER}" '' launcher || return 1
    previous_launcher_target=''
  elif [ -n "${previous_current_target}" ]; then
    previous_version="$(release_version_from_target "${previous_current_target}")" || return 1
  fi
  convergence_action="$(select_convergence_action "${previous_version}" '')"
  log "previousState=${previous_version} action=${convergence_action}"
  run_temp_dir="$(mktemp -d "${CODEX_TEMP_ROOT}/run.XXXXXX")"
  chown "${CODEX_USER}:${CODEX_USER}" "${run_temp_dir}"
  chmod 0700 "${run_temp_dir}"
  write_transaction
  transaction_active=1
  trap handle_failure EXIT
  trap 'handle_signal INT 130' INT
  trap 'handle_signal TERM 143' TERM

  remaining_nanoseconds=$((
    CODEX_TIMEOUT_SECONDS * 1000000000 -
      ($(/usr/bin/date +%s%N) - install_started_at_ns)
  ))
  if [ "${remaining_nanoseconds}" -le 0 ]; then
    log 'Codex install lock consumed the complete installer timeout'
    return 1
  fi
  printf -v remaining_seconds '%d.%09d' \
    "$((remaining_nanoseconds / 1000000000))" \
    "$((remaining_nanoseconds % 1000000000))"

  if ! installer_result="$(
    timeout --signal=KILL \
      "${remaining_seconds}" \
      runuser -u "${CODEX_USER}" -- \
      /bin/bash -c '
        github_token=${GH_TOKEN-}
        copilot_token=${COPILOT_GITHUB_TOKEN-}
        for variable in $(compgen -e); do unset "$variable"; done
        if [ "$(/usr/bin/id -u)" != "$7" ] || [ "$(/usr/bin/id -g)" != "$8" ]; then
          printf "[azure-codex-orchestration] Codex installer identity mismatch\n" >&2
          exit 1
        fi
        export HOME="$1" CODEX_HOME="$2" CODEX_INSTALL_DIR="$3"
        export TMPDIR="$4" TMP="$4" TEMP="$4"
        export CODEX_NON_INTERACTIVE=1
        export CODEX_MANAGED_DIRECTORY_MODE=0700
        export CODEX_INSTALL_LOCK_FD="$9"
        export PATH="$3:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
        export USER="$5" LOGNAME="$5" GH_TOKEN="$github_token"
        export COPILOT_GITHUB_TOKEN="$copilot_token"
        umask 077
        exec /bin/bash "$6"
      ' bash \
      "${CODEX_USER_HOME}" \
      "${CODEX_HOME}" \
      "${CODEX_INSTALL_DIR}" \
      "${run_temp_dir}" \
      "${CODEX_USER}" \
      "${CODEX_INSTALLER}" \
      "${CODEX_UID}" \
      "${CODEX_GID}" \
      "${CODEX_LOCK_FD}"
  )"; then
    return 1
  fi
  canonical_result="$(validate_result "${installer_result}")" || return 1
  target_version="$(printf '%s\n' "${canonical_result}" | jq -r '.targetVersion')"
  convergence_action="$(select_convergence_action "${previous_version}" "${target_version}")"
  log "targetVersion=${target_version} previousState=${previous_version} action=${convergence_action}"
  validate_final_installation "${target_version}" || return 1
  cleanup_run_temp || return 1
  rm -f -- "${CODEX_TRANSACTION}"
  transaction_active=0
  trap - EXIT INT TERM
  release_install_lock
  user_managed_result="${canonical_result}"
}

if [ ! -f "${CODEX_INSTALLER}" ]; then
  log "Shared Codex installer is missing: ${CODEX_INSTALLER}"
  exit 1
fi

case "${CODEX_MODE}" in
  system-managed)
    installer_result="$(run_system_managed)" || exit 1
    ;;
  user-managed)
    run_user_managed
    installer_result="${user_managed_result}"
    ;;
  *)
    log "Unsupported Codex installation mode: ${CODEX_MODE}"
    exit 1
    ;;
esac

canonical_result="$(validate_result "${installer_result}")" || exit 1
printf 'KRAV_AZURE_CODEX_RESULT=%s\n' "${canonical_result}"
