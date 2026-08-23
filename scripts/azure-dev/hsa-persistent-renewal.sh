#!/usr/bin/env bash

# Reconcile a provisioner promotion after callers have started the HSA chain.
# Callers provide the environment-specific operations as hsa_renewal_* shell
# functions so this state machine remains behaviorally testable without Podman.
hsa_reconcile_persistent_renewal() {
  local inspection previous
  inspection="$(hsa_renewal_inspect)" || return
  previous="$(jq -er '.result.selection.previous // ""' <<<"$inspection")" || return
  if [[ -z "$previous" ]]; then
    printf '%s\n' 'HSA mTLS startup renewal: current generation reused.'
    return 0
  fi

  if hsa_renewal_verify; then
    hsa_renewal_finalize
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
