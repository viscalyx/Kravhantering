import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const validationPath = path.join(
  process.cwd(),
  'scripts/azure-dev/AzureDev.Validation.psm1',
)
const validation = readFileSync(validationPath, 'utf8')
const hsaValidationStart = validation.indexOf('hsa_response="$(mktemp)"')
const hsaValidationEnd = validation.indexOf(
  '\ncd /workspace',
  hsaValidationStart,
)

if (hsaValidationStart < 0 || hsaValidationEnd < 0) {
  throw new Error('Could not locate HSA smoke validation block')
}

const hsaValidation = validation.slice(hsaValidationStart, hsaValidationEnd)

function runHsaValidation() {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), 'azure-hsa-smoke-validation-'),
  )
  const harness = [
    'set -E -e -u -o pipefail',
    `trap 'exit_code=$?; printf "Unexpected ERR trap (exit %s)\\n" "\${exit_code}" >&2; exit "\${exit_code}"' ERR`,
    'seq() { printf "1\\n2\\n"; }',
    'curl() {',
    '  if [ "$1" = -s ]; then',
    '    printf "CURL_ATTEMPT\\n" >&2',
    '    printf 000',
    '    return 7',
    '  fi',
    '  return 7',
    '}',
    'sleep() { :; }',
    'podman() { :; }',
    'dump_smoke_diagnostics() { printf "SMOKE_DIAGNOSTICS\\n"; }',
    hsaValidation,
  ].join('\n')

  try {
    return spawnSync('bash', ['-c', harness], {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: temporaryDirectory },
    })
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true })
  }
}

describe('Azure development smoke validation', () => {
  it('retries a non-zero HSA curl exit before reporting diagnostics', () => {
    const result = runHsaValidation()

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('CURL_ATTEMPT\nCURL_ATTEMPT\n')
    expect(result.stdout).toContain(
      'HSA smoke request failed. curl exit: 7 HTTP status: 000',
    )
    expect(result.stdout).toContain('SMOKE_DIAGNOSTICS')
  })
})
