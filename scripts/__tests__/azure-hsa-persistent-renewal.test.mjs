import childProcess from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RECONCILER_PATH = path.resolve(
  process.cwd(),
  'scripts/azure-dev/hsa-persistent-renewal.sh',
)

function runReconciler({
  finalizeMode = 'success',
  pending,
  selectionMode = 'valid',
  verificationResults = [],
}) {
  const shell = String.raw`
    set -euo pipefail
    source "$1"
    calls=''
    current='current-generation'
    previous="$PENDING_GENERATION"
    finalize_count=0
    verify_count=0
    record() {
      if [[ -n "$calls" ]]; then calls="$calls,$1"; else calls="$1"; fi
    }
    hsa_renewal_inspect() {
      case "$SELECTION_MODE" in
        valid)
          jq -n --arg current "$current" --arg previous "$previous" \
            '{result:{selection:{current:$current,previous:(if $previous == "" then null else $previous end)}}}'
          ;;
        missing-previous)
          jq -n --arg current "$current" '{result:{selection:{current:$current}}}'
          ;;
        false-previous)
          jq -n --arg current "$current" '{result:{selection:{current:$current,previous:false}}}'
          ;;
        empty-previous)
          jq -n --arg current "$current" '{result:{selection:{current:$current,previous:""}}}'
          ;;
        number-previous)
          jq -n --arg current "$current" '{result:{selection:{current:$current,previous:42}}}'
          ;;
        object-previous)
          jq -n --arg current "$current" '{result:{selection:{current:$current,previous:{}}}}'
          ;;
        array-previous)
          jq -n --arg current "$current" '{result:{selection:{current:$current,previous:[]}}}'
          ;;
        missing-current)
          jq -n '{result:{selection:{previous:null}}}'
          ;;
        false-current)
          jq -n '{result:{selection:{current:false,previous:null}}}'
          ;;
        empty-current)
          jq -n '{result:{selection:{current:"",previous:null}}}'
          ;;
        number-current)
          jq -n '{result:{selection:{current:42,previous:null}}}'
          ;;
        object-current)
          jq -n '{result:{selection:{current:{},previous:null}}}'
          ;;
        array-current)
          jq -n '{result:{selection:{current:[],previous:null}}}'
          ;;
        *) return 2 ;;
      esac
    }
    hsa_renewal_verify() {
      record verify
      verify_count=$((verify_count + 1))
      case "$VERIFY_RESULTS:$verify_count" in
        pass:1|fail,pass:2) return 0 ;;
        *) return 1 ;;
      esac
    }
    hsa_renewal_finalize() {
      finalize_count=$((finalize_count + 1))
      record "finalize:$1"
      [[ "$1" == "$current" ]] || return 1
      case "$FINALIZE_MODE" in
        success) previous=''; return 0 ;;
        ambiguous-complete) previous=''; return 1 ;;
        retry-success)
          if [[ "$finalize_count" -eq 1 ]]; then return 1; fi
          previous=''
          return 0
          ;;
        persistent-failure) return 1 ;;
        mismatch) current='concurrent-generation'; return 1 ;;
        *) return 2 ;;
      esac
    }
    hsa_renewal_stop_endpoints() { record stop-kong-adapter-mock; }
    hsa_renewal_rollback() { record rollback-delete-failed; }
    hsa_renewal_deploy() { record deploy-previous; }
    hsa_renewal_start_endpoints() { record start-mock-adapter-kong; }
    set +e
    hsa_reconcile_persistent_renewal
    status=$?
    set -e
    printf 'CALLS=%s\n' "$calls"
    exit "$status"
  `
  return childProcess.spawnSync(
    'bash',
    ['-c', shell, 'bash', RECONCILER_PATH],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        FINALIZE_MODE: finalizeMode,
        PENDING_GENERATION: pending ?? '',
        SELECTION_MODE: selectionMode,
        VERIFY_RESULTS: verificationResults.join(','),
      },
    },
  )
}

describe('Azure persistent HSA mTLS startup renewal', () => {
  it('does no endpoint work during an ordinary reused startup', () => {
    const result = runReconciler({ pending: null })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('current generation reused')
    expect(result.stdout).toContain('CALLS=\n')
  })

  it.each([
    'missing-previous',
    'false-previous',
    'empty-previous',
    'number-previous',
    'object-previous',
    'array-previous',
    'missing-current',
    'false-current',
    'empty-current',
    'number-current',
    'object-current',
    'array-current',
  ])('fails closed for malformed %s selection state', selectionMode => {
    const result = runReconciler({ selectionMode })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('invalid HSA mTLS selection')
    expect(result.stdout).toContain('CALLS=\n')
  })

  it('finalizes only after the promoted generation authenticates', () => {
    const result = runReconciler({
      pending: 'verified-generation',
      verificationResults: ['pass'],
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('CALLS=verify,finalize:current-generation')
  })

  it('accepts a failed finalize command after inspection proves cleanup completed', () => {
    const result = runReconciler({
      finalizeMode: 'ambiguous-complete',
      pending: 'verified-generation',
      verificationResults: ['pass'],
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('CALLS=verify,finalize:current-generation')
  })

  it('retries exact-current pending cleanup and accepts the completed retry', () => {
    const result = runReconciler({
      finalizeMode: 'retry-success',
      pending: 'verified-generation',
      verificationResults: ['pass'],
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(
      'CALLS=verify,finalize:current-generation,finalize:current-generation',
    )
  })

  it('fails after one retry leaves exact-current prior cleanup pending', () => {
    const result = runReconciler({
      finalizeMode: 'persistent-failure',
      pending: 'verified-generation',
      verificationResults: ['pass'],
    })

    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain(
      'CALLS=verify,finalize:current-generation,finalize:current-generation',
    )
    expect(result.stderr).toContain('remains pending after finalization retry')
  })

  it('rejects finalization that no longer selects the authenticated generation', () => {
    const result = runReconciler({
      finalizeMode: 'mismatch',
      pending: 'verified-generation',
      verificationResults: ['pass'],
    })

    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain('CALLS=verify,finalize:current-generation')
    expect(result.stderr).toContain('other than the authenticated generation')
  })

  it('restores, restarts in server-first order, and verifies after failure', () => {
    const result = runReconciler({
      pending: 'verified-generation',
      verificationResults: ['fail', 'pass'],
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'CALLS=verify,stop-kong-adapter-mock,rollback-delete-failed,deploy-previous,start-mock-adapter-kong,verify',
    )
    expect(result.stderr).toContain('prior generation was restored')
  })

  it('fails closed when recovery does not authenticate', () => {
    const result = runReconciler({
      pending: 'verified-generation',
      verificationResults: ['fail', 'fail'],
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('could not authenticate')
  })
})
