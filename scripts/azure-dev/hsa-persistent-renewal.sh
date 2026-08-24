#!/usr/bin/env bash

# Reconcile a provisioner promotion after callers have started the HSA chain.
# Callers provide the environment-specific operations as hsa_renewal_* shell
# functions so this state machine remains behaviorally testable without Podman.
hsa_renewal_valid_selection() {
  jq -cer '
    .result.selection |
    if type == "object" and
      has("current") and
      ((.current | type) == "string" and (.current | length) > 0) and
      has("previous") and
      (.previous == null or
        ((.previous | type) == "string" and (.previous | length) > 0))
    then .
    else error("invalid HSA mTLS selection")
    end
  ' <<<"$1"
}

hsa_renewal_finalization_previous() {
  local authenticated_generation_id="$1"
  local finalization_inspection finalization_previous selected_generation_id selection
  finalization_inspection="$(hsa_renewal_inspect)" || {
    printf '%s\n' \
      'HSA mTLS startup renewal finalization state could not be inspected.' \
      >&2
    return 1
  }
  selection="$(hsa_renewal_valid_selection "$finalization_inspection")" || return
  selected_generation_id="$(jq -r '.current' <<<"$selection")" || return
  finalization_previous="$(
    jq -r 'if .previous == null then "" else .previous end' <<<"$selection"
  )" || return
  if [[ "$selected_generation_id" != "$authenticated_generation_id" ]]; then
    printf '%s\n' \
      'HSA mTLS startup renewal finalization selected a generation other than the authenticated generation.' \
      >&2
    return 1
  fi
  printf '%s\n' "$finalization_previous"
}

hsa_finalize_authenticated_renewal() {
  local authenticated_generation_id="$1" finalization_previous
  # Finalize may complete state changes before its command outcome is observed.
  hsa_renewal_finalize "$authenticated_generation_id" || true
  finalization_previous="$(
    hsa_renewal_finalization_previous "$authenticated_generation_id"
  )" || return
  if [[ -z "$finalization_previous" ]]; then
    return
  fi

  hsa_renewal_finalize "$authenticated_generation_id" || true
  finalization_previous="$(
    hsa_renewal_finalization_previous "$authenticated_generation_id"
  )" || return
  if [[ -n "$finalization_previous" ]]; then
    printf '%s\n' \
      'HSA mTLS startup renewal prior cleanup remains pending after finalization retry.' \
      >&2
    return 1
  fi
}

hsa_reconcile_persistent_renewal() {
  local authenticated_current inspection prior_generation_id selection
  inspection="$(hsa_renewal_inspect)" || return
  selection="$(hsa_renewal_valid_selection "$inspection")" || return
  authenticated_current="$(jq -r '.current' <<<"$selection")" || return
  prior_generation_id="$(
    jq -r 'if .previous == null then "" else .previous end' <<<"$selection"
  )" || return
  if [[ -z "$prior_generation_id" ]]; then
    printf '%s\n' 'HSA mTLS startup renewal: current generation reused.'
    return 0
  fi

  if hsa_renewal_verify; then
    hsa_finalize_authenticated_renewal "$authenticated_current" || return
    printf '%s\n' 'HSA mTLS startup renewal authenticated and finalized.'
    return 0
  fi

  hsa_renewal_stop_endpoints
  hsa_renewal_rollback
  hsa_renewal_deploy
  hsa_renewal_start_endpoints
  hsa_renewal_verify || {
    printf '%s\n' \
      'HSA mTLS startup renewal rollback could not authenticate the restored generation.' \
      >&2
    return 1
  }
  printf '%s\n' \
    'HSA mTLS startup renewal failed; the prior generation was restored and authenticated.' \
    >&2
}
