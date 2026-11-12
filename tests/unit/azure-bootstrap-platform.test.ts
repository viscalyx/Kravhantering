import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const bootstrap = readFileSync(
  'scripts/azure-dev/templates/bootstrap-host.sh',
  'utf8',
)
const selector = bootstrap.match(
  /select_host_platform\(\) \{[\s\S]*?\n\}/u,
)?.[0]

function selectPlatform(args: string[]) {
  return spawnSync(
    'bash',
    [
      '-c',
      `set -eu\nlog() { printf '%s\\n' "$*" >&2; }\n${selector}\nselect_host_platform "$@"\nprintf '%s %s\\n' "$HOST_CODENAME" "$HOST_DOTNET_MAJOR"`,
      'platform-test',
      ...args,
    ],
    { encoding: 'utf8' },
  )
}

describe('Azure bootstrap supported host platform', () => {
  it.each(['26.04.1', '26.04.2', '26.04.10'])(
    'selects native Resolute packages for Ubuntu %s',
    version => {
      const result = selectPlatform([
        'ubuntu',
        '26.04',
        `${version} LTS (Resolute Raccoon)`,
        'resolute',
        'amd64',
      ])
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('resolute 10\n')
    },
  )

  it('preserves Noble package selection for supported existing hosts', () => {
    const result = selectPlatform([
      'ubuntu',
      '24.04',
      '24.04.4 LTS (Noble Numbat)',
      'noble',
      'amd64',
    ])
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('noble 8\n')
  })

  it.each([
    ['ubuntu', '26.04', '26.04 LTS', 'resolute', 'amd64'],
    ['ubuntu', '26.04', '26.04.0 LTS', 'resolute', 'amd64'],
    ['ubuntu', '26.04', '26.04.1 LTS', 'noble', 'amd64'],
    ['ubuntu', '26.04', '', 'resolute', 'amd64'],
    ['ubuntu', '26.10', '26.10', 'stately', 'amd64'],
    ['debian', '26.04', '26.04.1 LTS', 'resolute', 'amd64'],
    ['ubuntu', '26.04', '26.04.1 LTS', 'resolute', 'arm64'],
  ])('rejects unsupported guest identity %j %j %j %j %j', (...args) => {
    const result = selectPlatform(args)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unsupported Azure development host')
  })
})
