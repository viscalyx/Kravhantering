import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const source = readFileSync(
  'scripts/azure-dev/templates/podman-client.sh',
  'utf8',
)
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function runClient(remote: boolean, exitCode = 0) {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'azure-podman-client-test-'),
  )
  directories.push(directory)
  const binary = path.join(directory, 'podman')
  const wrapper = path.join(directory, 'client.sh')
  writeFileSync(
    binary,
    `#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys

runtime = Path(os.environ['XDG_RUNTIME_DIR'])
print(json.dumps({
    'runtime': str(runtime),
    'mode': runtime.stat().st_mode & 0o777,
    'host': os.environ['CONTAINER_HOST'],
    'arguments': sys.argv[1:],
}))
raise SystemExit(int(os.environ['PROBE_EXIT_CODE']))
`,
    { mode: 0o755 },
  )
  // Substitute only the external binary boundary; run the wrapper's real logic.
  writeFileSync(
    wrapper,
    source.replaceAll(
      '/usr/bin/podman',
      `'${binary.replaceAll("'", "'\\''")}'`,
    ),
  )
  const result = spawnSync('bash', [wrapper, 'run', 'two words', '$literal'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TMPDIR: directory,
      XDG_RUNTIME_DIR: directory,
      CONTAINER_HOST: remote ? 'unix:///run/user/2042/podman/podman.sock' : '',
      PROBE_EXIT_CODE: String(exitCode),
    },
  })
  return { directory, result, observed: JSON.parse(result.stdout) }
}

describe('Azure Podman client launcher', () => {
  it.each([0, 42])(
    'isolates remote client scratch state and cleans it up after exit %s',
    exitCode => {
      const { directory, result, observed } = runClient(true, exitCode)

      expect(result.status, result.stderr).toBe(exitCode)
      expect(observed.runtime).toMatch(
        new RegExp(`^${directory}/krav-podman-client\\.`),
      )
      expect(observed.mode).toBe(0o700)
      expect(observed.host).toBe('unix:///run/user/2042/podman/podman.sock')
      expect(observed.arguments).toEqual(['run', 'two words', '$literal'])
      expect(existsSync(observed.runtime)).toBe(false)
      expect(existsSync(directory)).toBe(true)
    },
  )

  it('preserves the native engine runtime and exit status without a remote connection', () => {
    const { directory, result, observed } = runClient(false, 37)

    expect(result.status, result.stderr).toBe(37)
    expect(observed.runtime).toBe(directory)
    expect(observed.host).toBe('')
    expect(observed.arguments).toEqual(['run', 'two words', '$literal'])
    expect(existsSync(directory)).toBe(true)
  })
})
