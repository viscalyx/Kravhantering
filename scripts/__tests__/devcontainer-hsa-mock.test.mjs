import childProcess from 'node:child_process'
import os from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRunning, main, parseComposeJson } from '../devcontainer/hsa-mock.mjs'

function spawnResult(overrides = {}) {
  return {
    error: undefined,
    status: 0,
    stderr: '',
    stdout: '',
    ...overrides,
  }
}

function mockSpawnSync(handler) {
  return vi
    .spyOn(childProcess, 'spawnSync')
    .mockImplementation((command, args, options) => {
      const result = handler(command, args, options)
      if (
        result?.stdout === undefined &&
        args.join(' ').includes('run --rm hsa-mtls-provisioner inspect')
      ) {
        return spawnResult({
          ...result,
          stdout: JSON.stringify({
            ok: true,
            result: {
              selection: { current: 'generation-2', previous: null },
            },
          }),
        })
      }
      return spawnResult(result)
    })
}

describe('devcontainer HSA mock helper', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses Docker Compose JSON array output', () => {
    expect(
      parseComposeJson(
        JSON.stringify([
          { ID: 'abc123', Service: 'app', State: 'running' },
          { ID: 'def456', Service: 'hsa-directory-mock', State: 'exited' },
        ]),
      ),
    ).toEqual([
      { ID: 'abc123', Service: 'app', State: 'running' },
      { ID: 'def456', Service: 'hsa-directory-mock', State: 'exited' },
    ])
  })

  it('parses Docker Compose line-delimited JSON output', () => {
    expect(
      parseComposeJson(
        [
          JSON.stringify({ ID: 'abc123', Service: 'app', State: 'running' }),
          JSON.stringify({
            ID: 'def456',
            Service: 'hsa-directory-mock',
            Status: 'Up 2s',
          }),
        ].join('\n'),
      ),
    ).toEqual([
      { ID: 'abc123', Service: 'app', State: 'running' },
      { ID: 'def456', Service: 'hsa-directory-mock', Status: 'Up 2s' },
    ])
  })

  it('detects running services from state or status fields', () => {
    expect(isRunning({ State: 'running' })).toBe(true)
    expect(isRunning({ Status: 'Up 5 seconds (healthy)' })).toBe(true)
    expect(isRunning({ Status: 'setup failed' })).toBe(false)
    expect(isRunning({ State: 'exited', Status: 'Exited (0)' })).toBe(false)
    expect(isRunning(null)).toBe(false)
  })

  it('routes config through the detected default devcontainer profile', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('test-host')
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') {
        return { stdout: '/workspace-host\n' }
      }
      return {}
    })

    await expect(main(['config'])).resolves.toBe(0)

    expect(consoleLog).toHaveBeenCalledWith(
      'Using default devcontainer profile (.devcontainer/docker-compose.yml)',
    )
    expect(spawnSync).toHaveBeenLastCalledWith(
      'docker',
      [
        'compose',
        '-f',
        '.devcontainer/docker-compose.yml',
        'config',
        'hsa-mtls-provisioner',
        'hsa-directory-mock',
        'hsa-person-lookup-adapter',
        'kong',
      ],
      expect.objectContaining({
        env: expect.objectContaining({
          WORKSPACE_BUILD_ROOT: expect.any(String),
          WORKSPACE_HOST_ROOT: '/workspace-host',
        }),
      }),
    )
  })

  it('routes up through the elevated profile when that app container matches the hostname', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('elevated-host')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (
        text ===
        'compose -f .devcontainer/docker-compose.yml ps --format json app'
      ) {
        return { stdout: '[]' }
      }
      if (
        text ===
        'compose -f .devcontainer/elevated/docker-compose.yml ps --format json app'
      ) {
        return {
          stdout: JSON.stringify([
            { ID: 'elevated-host-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') {
        return { stdout: '/workspace-host\n' }
      }
      return {}
    })

    await expect(main(['up'])).resolves.toBe(0)

    expect(spawnSync).toHaveBeenLastCalledWith(
      'docker',
      [
        'compose',
        '-f',
        '.devcontainer/elevated/docker-compose.yml',
        'up',
        '--build',
        '-d',
        'hsa-mtls-provisioner',
        'hsa-directory-mock',
        'hsa-person-lookup-adapter',
        'kong',
      ],
      expect.any(Object),
    )
  })

  it('starts dependencies and checks both services for status', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('test-host')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'test-host-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') {
        return { stdout: '/workspace-host\n' }
      }
      return {}
    })

    await expect(main(['status'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    expect(calls).toContain(
      'compose -f .devcontainer/docker-compose.yml up --build -d hsa-directory-mock',
    )
    expect(calls).toContain(
      'compose -f .devcontainer/docker-compose.yml up --build -d hsa-person-lookup-adapter',
    )
    expect(calls.some(call => call.includes('up --build -d --no-deps'))).toBe(
      false,
    )
    expect(
      calls.some(
        call =>
          call.includes('exec -T hsa-directory-mock') &&
          call.includes('http://127.0.0.1:8081/health'),
      ),
    ).toBe(true)
  })

  it('returns exit code 1 and logs usage when an action command fails', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('test-host')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'test-host-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') {
        return { stdout: '/workspace-host\n' }
      }
      if (text.includes('restart hsa-directory-mock')) {
        return { status: 12 }
      }
      return {}
    })

    await expect(main(['restart'])).resolves.toBe(1)

    expect(consoleError).toHaveBeenCalledWith(
      'docker compose restart HSA lookup services failed with 12',
    )
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'node scripts/devcontainer/hsa-mock.mjs <config|build|up|recreate|status|ensure|inspect|verify|renew-startup|rotate|rollback-verify|logs|restart|down>',
      ),
    )
  })

  it('returns exit code 1 and logs usage when action is missing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(main([])).resolves.toBe(1)

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'node scripts/devcontainer/hsa-mock.mjs <config|build|up|recreate|status|ensure|inspect|verify|renew-startup|rotate|rollback-verify|logs|restart|down>',
      ),
    )
  })

  it('rotates and finalizes only after verification', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('test-host')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spawnSync = mockSpawnSync((_command, args) => {
      if (args.join(' ').includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (args.join(' ').includes('hsa-mtls-provisioner rotate')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              generationId: 'generation-2',
              previousGenerationId: 'generation-1',
            },
          }),
        }
      }
      return {}
    })

    await expect(main(['rotate', 'app-to-kong'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    expect(calls).toContainEqual(
      expect.stringContaining(
        'run --rm hsa-mtls-provisioner rotate app-to-kong',
      ),
    )
    expect(calls.at(-2)).toContain('run --rm hsa-mtls-provisioner finalize')
    expect(calls.at(-1)).toContain('run --rm hsa-mtls-provisioner inspect')
    expect(calls.findIndex(call => call.includes('stop app'))).toBeLessThan(
      calls.findIndex(call => call.includes('stop kong')),
    )
  })

  it('rejects an ambiguous rotation finalization against a different current generation', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('test-host')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let finalizeCount = 0
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('hsa-mtls-provisioner rotate')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              generationId: 'generation-2',
              previousGenerationId: 'generation-1',
            },
          }),
        }
      }
      if (text.includes('hsa-mtls-provisioner finalize')) {
        finalizeCount += 1
        return { status: 1 }
      }
      if (text.includes('hsa-mtls-provisioner inspect')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              selection: { current: 'generation-3', previous: null },
            },
          }),
        }
      }
      return {}
    })

    await expect(main(['rotate', 'app-to-kong'])).resolves.toBe(1)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    const verified = calls.findIndex(call => call.includes('exec -T app node'))
    expect(finalizeCount).toBe(1)
    expect(consoleError).toHaveBeenCalledWith(
      'HSA mTLS selection changed while reconciling finalization',
    )
    expect(calls.slice(verified + 1)).not.toContainEqual(
      expect.stringContaining('stop app'),
    )
    expect(calls).not.toContainEqual(expect.stringContaining('rollback'))
  })

  it('accepts a reconciled rotation after an ambiguous finalization retry failure', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('test-host')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let finalizeCount = 0
    let inspectCount = 0
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('hsa-mtls-provisioner rotate')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              generationId: 'generation-2',
              previousGenerationId: 'generation-1',
            },
          }),
        }
      }
      if (text.includes('hsa-mtls-provisioner finalize')) {
        finalizeCount += 1
        return { status: 1 }
      }
      if (text.includes('hsa-mtls-provisioner inspect')) {
        inspectCount += 1
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              selection: {
                current: 'generation-2',
                previous: inspectCount === 1 ? 'generation-1' : null,
              },
            },
          }),
        }
      }
      return {}
    })

    await expect(main(['rotate', 'app-to-kong'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    expect(finalizeCount).toBe(2)
    expect(inspectCount).toBe(2)
    expect(calls).not.toContainEqual(expect.stringContaining('rollback'))
  })

  it('reuses ensured material without deployment or recreation', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('host-shell')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('run --rm hsa-mtls-provisioner ensure')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: { action: 'reused', generationId: 'generation-1' },
          }),
        }
      }
      return {}
    })

    await expect(main(['ensure'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    const stopped = calls.findIndex(call => call.includes('stop app'))
    const ensured = calls.findIndex(call =>
      call.includes('run --rm hsa-mtls-provisioner ensure'),
    )
    const started = calls.findIndex(call =>
      call.includes('up -d --wait hsa-directory-mock'),
    )
    expect(stopped).toBeGreaterThan(-1)
    expect(ensured).toBeGreaterThan(stopped)
    expect(started).toBeGreaterThan(ensured)
    expect(calls).not.toContainEqual(expect.stringContaining('deploy'))
    expect(calls).not.toContainEqual(expect.stringContaining('finalize'))
    expect(calls).not.toContainEqual(expect.stringContaining('rollback'))
    expect(calls).not.toContainEqual(
      expect.stringContaining('--force-recreate'),
    )
    expect(calls).toContainEqual(expect.stringContaining('exec -T app node'))
  })

  it('switches, recreates, authenticates, and finalizes automatic renewal', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('host-shell')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('run --rm hsa-mtls-provisioner ensure')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              action: 'promoted',
              generationId: 'generation-2',
              previousGenerationId: 'generation-1',
            },
          }),
        }
      }
      return {}
    })

    await expect(main(['ensure'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    const stopped = calls.findIndex(call => call.includes('stop app'))
    const ensured = calls.findIndex(call =>
      call.includes('run --rm hsa-mtls-provisioner ensure'),
    )
    const deployed = calls.findIndex(call =>
      call.includes('run --rm hsa-mtls-provisioner deploy'),
    )
    const recreated = calls.findIndex(call =>
      call.includes('up -d --wait --force-recreate hsa-directory-mock'),
    )
    const verified = calls.findIndex(call => call.includes('exec -T app node'))
    const finalized = calls.findIndex(call =>
      call.includes('run --rm hsa-mtls-provisioner finalize'),
    )
    expect(ensured).toBeGreaterThan(stopped)
    expect(deployed).toBeGreaterThan(ensured)
    expect(recreated).toBeGreaterThan(deployed)
    expect(verified).toBeGreaterThan(recreated)
    expect(finalized).toBeGreaterThan(verified)
  })

  it('keeps authenticated renewal running when finalization already reconciled despite a command failure', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('host-shell')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let finalizeCount = 0
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('run --rm hsa-mtls-provisioner ensure')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              action: 'promoted',
              generationId: 'generation-2',
              previousGenerationId: 'generation-1',
            },
          }),
        }
      }
      if (text.includes('run --rm hsa-mtls-provisioner finalize')) {
        finalizeCount += 1
        return { status: 1 }
      }
      if (text.includes('run --rm hsa-mtls-provisioner inspect')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              selection: { current: 'generation-2', previous: null },
            },
          }),
        }
      }
      return {}
    })

    await expect(main(['ensure'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    const verified = calls.findIndex(call => call.includes('exec -T app node'))
    const finalized = calls.findIndex(call => call.includes('finalize'))
    const reconciled = calls.findIndex(call =>
      call.includes('hsa-mtls-provisioner inspect'),
    )
    expect(finalized).toBeGreaterThan(verified)
    expect(reconciled).toBeGreaterThan(finalized)
    expect(finalizeCount).toBe(1)
    expect(calls.slice(verified + 1)).not.toContainEqual(
      expect.stringContaining('stop app'),
    )
    expect(calls).not.toContainEqual(expect.stringContaining('rollback'))
  })

  it('retries finalization when deletion failure retains the prior cleanup identity', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('host-shell')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    let finalizeCount = 0
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('run --rm hsa-mtls-provisioner ensure')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              action: 'promoted',
              generationId: 'generation-2',
              previousGenerationId: 'generation-1',
            },
          }),
        }
      }
      if (text.includes('run --rm hsa-mtls-provisioner finalize')) {
        finalizeCount += 1
        return { status: finalizeCount === 1 ? 1 : 0 }
      }
      if (text.includes('run --rm hsa-mtls-provisioner inspect')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              selection: {
                current: 'generation-2',
                previous: finalizeCount >= 2 ? null : 'generation-1',
              },
            },
          }),
        }
      }
      return {}
    })

    await expect(main(['ensure'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    expect(finalizeCount).toBe(2)
    expect(
      calls.filter(call => call.includes('hsa-mtls-provisioner inspect')),
    ).toHaveLength(2)
    expect(calls).not.toContainEqual(expect.stringContaining('rollback'))
  })

  it('rolls back and authenticates the prior generation after ensure verification fails', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('host-shell')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let verificationCount = 0
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('run --rm hsa-mtls-provisioner ensure')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              action: 'promoted',
              generationId: 'generation-2',
              previousGenerationId: 'generation-1',
            },
          }),
        }
      }
      if (text.includes('exec -T app node')) {
        verificationCount += 1
        return { status: verificationCount === 1 ? 1 : 0 }
      }
      return {}
    })

    await expect(main(['ensure'])).resolves.toBe(1)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    const firstVerification = calls.findIndex(call =>
      call.includes('exec -T app node'),
    )
    const rollback = calls.findIndex(call =>
      call.includes('run --rm hsa-mtls-provisioner rollback'),
    )
    const recoveryVerification = calls.findLastIndex(call =>
      call.includes('exec -T app node'),
    )
    expect(rollback).toBeGreaterThan(firstVerification)
    expect(recoveryVerification).toBeGreaterThan(rollback)
    expect(verificationCount).toBe(2)
    expect(calls).not.toContainEqual(expect.stringContaining('finalize'))
  })

  it('restarts an initial promoted generation before reporting verification failure', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('host-shell')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('run --rm hsa-mtls-provisioner ensure')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              action: 'promoted',
              generationId: 'generation-1',
            },
          }),
        }
      }
      if (text.includes('exec -T app node')) return { status: 1 }
      return {}
    })

    await expect(main(['ensure'])).resolves.toBe(1)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    const failedVerification = calls.findIndex(call =>
      call.includes('exec -T app node'),
    )
    const recoveryStart = calls.findLastIndex(call =>
      call.includes('up -d --wait --force-recreate app'),
    )
    expect(recoveryStart).toBeGreaterThan(failedVerification)
    expect(
      calls.filter(call => call.includes('hsa-mtls-provisioner deploy')),
    ).toHaveLength(2)
    expect(calls).not.toContainEqual(expect.stringContaining('rollback'))
  })

  it('keeps ordinary startup renewal non-blocking when no promotion is pending', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('current-app')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'current-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('run --rm hsa-mtls-provisioner inspect')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: { selection: { current: 'generation-1', previous: null } },
          }),
        }
      }
      return {}
    })

    await expect(main(['renew-startup'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    expect(calls).not.toContainEqual(
      expect.stringContaining('exec -T app node'),
    )
    expect(calls).not.toContainEqual(expect.stringContaining('finalize'))
  })

  it('authenticates a pending startup renewal before finalization', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('current-app')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    let finalized = false
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'current-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('run --rm hsa-mtls-provisioner finalize')) {
        finalized = true
        return {}
      }
      if (text.includes('run --rm hsa-mtls-provisioner inspect')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              selection: {
                current: 'renewed-generation',
                previous: finalized ? null : 'verified-generation',
              },
            },
          }),
        }
      }
      return {}
    })

    await expect(main(['renew-startup'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    const verification = calls.findIndex(call =>
      call.includes('exec -T app node'),
    )
    const finalization = calls.findIndex(call => call.includes('finalize'))
    expect(verification).toBeGreaterThan(-1)
    expect(finalization).toBeGreaterThan(verification)
  })

  it('rolls back a failed startup renewal and authenticates recovery', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('current-app')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let verificationCount = 0
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'current-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('run --rm hsa-mtls-provisioner inspect')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            result: {
              selection: {
                current: 'failed-generation',
                previous: 'verified-generation',
              },
            },
          }),
        }
      }
      if (text.includes('exec -T app node')) {
        verificationCount += 1
        return { status: verificationCount === 1 ? 1 : 0 }
      }
      return {}
    })

    await expect(main(['renew-startup'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    const rollback = calls.findIndex(call => call.includes('rollback'))
    expect(calls.findIndex(call => call.includes('stop kong'))).toBeLessThan(
      calls.findIndex(call => call.includes('stop hsa-person-lookup-adapter')),
    )
    expect(rollback).toBeGreaterThan(-1)
    expect(calls.findIndex(call => call.includes('deploy'))).toBeGreaterThan(
      rollback,
    )
    const recreatedApp = calls.findIndex(
      (call, index) =>
        call.includes('up -d --wait --force-recreate app') && index > rollback,
    )
    expect(recreatedApp).toBeGreaterThan(rollback)
    expect(
      calls.findLastIndex(call => call.includes('exec -T app node')),
    ).toBeGreaterThan(recreatedApp)
    expect(verificationCount).toBe(2)
    expect(calls).not.toContainEqual(expect.stringContaining('stop app'))
  })

  it('rejects an unsuccessful inspect envelope before reading selection', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('current-app')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'current-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('run --rm hsa-mtls-provisioner inspect')) {
        return { stdout: JSON.stringify({ ok: false }) }
      }
      return {}
    })

    await expect(main(['renew-startup'])).resolves.toBe(1)
    expect(consoleError).toHaveBeenCalledWith(
      'HSA mTLS provisioner inspect returned invalid output',
    )
  })

  it('requires rotation to be launched outside the app container', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('current-app')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSpawnSync((_command, args) => {
      if (args.join(' ').includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'current-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      return {}
    })

    await expect(main(['rotate', 'app-to-kong'])).resolves.toBe(1)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('must be launched from the host checkout'),
    )
  })

  it('observes an injected post-promotion failure before rollback', async () => {
    vi.spyOn(os, 'hostname').mockReturnValue('host-shell')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spawnSync = mockSpawnSync((_command, args) => {
      const text = args.join(' ')
      if (text.includes('ps --format json app')) {
        return {
          stdout: JSON.stringify([
            { ID: 'remote-app-abc', Name: 'app', State: 'running' },
          ]),
        }
      }
      if (args[0] === 'inspect') return { stdout: '/workspace-host\n' }
      if (text.includes('HSA_MTLS_FORCE_VERIFY_FAILURE=true')) {
        return { status: 1 }
      }
      return {}
    })

    await expect(main(['rollback-verify', 'kong-to-adapter'])).resolves.toBe(0)

    const calls = spawnSync.mock.calls.map(([, args]) => args.join(' '))
    const failureIndex = calls.findIndex(call =>
      call.includes('HSA_MTLS_FORCE_VERIFY_FAILURE=true'),
    )
    const rollbackIndex = calls.findIndex(call =>
      call.includes('run --rm hsa-mtls-provisioner rollback'),
    )
    expect(failureIndex).toBeGreaterThan(-1)
    expect(rollbackIndex).toBeGreaterThan(failureIndex)
  })
})
