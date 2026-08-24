import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const bootstrapPath = path.join(
  process.cwd(),
  'scripts/azure-dev/templates/bootstrap-host.sh',
)
const bootstrap = readFileSync(bootstrapPath, 'utf8')
const validationStart = bootstrap.indexOf('validate_loopback_ports() {')
const validationEnd = bootstrap.indexOf('\n}\n\nmain() {', validationStart)

if (validationStart < 0 || validationEnd < 0) {
  throw new Error(
    'Could not locate validate_loopback_ports in bootstrap-host.sh',
  )
}

const validateLoopbackPorts = bootstrap.slice(
  validationStart,
  validationEnd + 2,
)
const validBody = JSON.stringify({
  givenName: 'Ada',
  hsaId: 'SE5560000001-manualarea1',
})

function runValidation(status: string, body: string) {
  const harness = [
    'set -euo pipefail',
    'WORKSPACE_DIR=/workspace',
    'seq() { printf "1\\n"; }',
    "ss() { printf '%s\\n' '127.0.0.1:1433' '127.0.0.1:8080' '127.0.0.1:18443'; }",
    'curl() {',
    '  local output=""',
    '  while [ "$#" -gt 0 ]; do',
    '    case "$1" in',
    '      -o) output="$2"; shift 2 ;;',
    '      *) shift ;;',
    '    esac',
    '  done',
    '  printf "%s" "$LOOKUP_BODY" > "$output"',
    '  printf "%s" "$LOOKUP_STATUS"',
    '}',
    'sleep() { :; }',
    'log() { :; }',
    'dump_support_stack_diagnostics() { :; }',
    validateLoopbackPorts,
    'validate_loopback_ports',
  ].join('\n')

  return spawnSync('bash', ['-c', harness], {
    encoding: 'utf8',
    env: {
      ...process.env,
      LOOKUP_BODY: body,
      LOOKUP_STATUS: status,
    },
  })
}

describe('Azure bootstrap loopback validation', () => {
  it('accepts an HTTP 200 HSA lookup response that satisfies the contract', () => {
    const result = runValidation('200', validBody)

    expect(result.status).toBe(0)
  })

  it.each([
    ['HTTP 202', '202', validBody],
    ['HTTP 204', '204', ''],
    [
      'a different HSA-id',
      '200',
      JSON.stringify({ givenName: 'Ada', hsaId: 'SE5560000001-other' }),
    ],
    [
      'a missing given name',
      '200',
      JSON.stringify({ hsaId: 'SE5560000001-manualarea1' }),
    ],
  ])('rejects %s as readiness', (_scenario, status, body) => {
    const result = runValidation(status, body)

    expect(result.status).toBe(1)
  })
})
