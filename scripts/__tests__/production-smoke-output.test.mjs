import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const PRODUCTION_SMOKE_PATH = path.resolve(
  process.cwd(),
  'scripts/containers/production-smoke.sh',
)
const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true })
  }
})

function runReadinessProbe(failures) {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kh-production-smoke-output-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const countPath = path.join(temporaryDirectory, 'probe-count')
  fs.writeFileSync(countPath, '0')

  const shell = String.raw`
    source "$1"
    cleanup_config_temp() { :; }
    service_systemctl() { printf '%s\n' active; }
    sleep() { :; }
    curl() {
      local count
      count="$(($(<"$PROBE_COUNT_PATH") + 1))"
      printf '%s' "$count" >"$PROBE_COUNT_PATH"
      if (( count > PROBE_FAILURES )); then
        printf '%s' 200
        return 0
      fi
      if (( count % 2 == 0 )); then
        printf '%s' 000
        return 7
      fi
      printf '%s' 503
      return 22
    }
    wait_for_url \
      'https://kravhantering.test/api/ready' \
      'application readiness after SQL Server restart'
  `
  const result = childProcess.spawnSync(
    'bash',
    ['-c', shell, 'bash', PRODUCTION_SMOKE_PATH],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PROBE_COUNT_PATH: countPath,
        PROBE_FAILURES: String(failures),
      },
    },
  )
  return { countPath, result }
}

describe('production smoke output', () => {
  it('summarizes expected readiness retries with lifecycle context', () => {
    const { countPath, result } = runReadinessProbe(12)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(
      'Lifecycle transition: application readiness after SQL Server restart.',
    )
    expect(result.stdout).toContain('failed curl probes')
    expect(result.stdout).toContain('are expected until startup completes')
    expect(result.stdout).toContain('last probe: HTTP 503; attempt 1/90')
    expect(result.stdout).toContain(
      'last probe: connection unavailable; attempt 10/90',
    )
    expect(result.stdout).toContain(
      'Ready: application readiness after SQL Server restart',
    )
    expect(result.stdout.match(/Still waiting/gu)).toHaveLength(2)
    expect(fs.readFileSync(countPath, 'utf8')).toBe('13')
  })
})
