import childProcess from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RECONCILER_PATH = path.resolve(
  process.cwd(),
  'scripts/azure-dev/hsa-persistent-renewal.sh',
)

function runReconciler({ pending, verificationResults = [] }) {
  const shell = String.raw`
    set -euo pipefail
    source "$1"
    calls=''
    verify_count=0
    record() {
      if [[ -n "$calls" ]]; then calls="$calls,$1"; else calls="$1"; fi
    }
    hsa_renewal_inspect() {
      jq -n --arg previous "$PENDING_GENERATION" \
        '{result:{selection:{current:"current",previous:(if $previous == "" then null else $previous end)}}}'
    }
    hsa_renewal_verify() {
      record verify
      verify_count=$((verify_count + 1))
      case "$VERIFY_RESULTS:$verify_count" in
        pass:1|fail,pass:2) return 0 ;;
        *) return 1 ;;
      esac
    }
    hsa_renewal_finalize() { record finalize; }
    hsa_renewal_stop_endpoints() { record stop-kong-adapter-mock; }
    hsa_renewal_rollback() { record rollback-delete-failed; }
    hsa_renewal_deploy() { record deploy-previous; }
    hsa_renewal_start_endpoints() { record start-mock-adapter-kong; }
    hsa_reconcile_persistent_renewal
    printf 'CALLS=%s\n' "$calls"
  `
  return childProcess.spawnSync(
    'bash',
    ['-c', shell, 'bash', RECONCILER_PATH],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PENDING_GENERATION: pending ?? '',
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
    expect(result.stdout).toContain('CALLS=')
  })

  it('finalizes only after the promoted generation authenticates', () => {
    const result = runReconciler({
      pending: 'verified-generation',
      verificationResults: ['pass'],
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('CALLS=verify,finalize')
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
