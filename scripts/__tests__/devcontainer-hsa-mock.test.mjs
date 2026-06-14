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
    .mockImplementation((command, args, options) =>
      spawnResult(handler(command, args, options)),
    )
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
            { ID: 'test-host-abc', Name: 'app', State: 'running' },
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
        'hsa-mtls-cert-generator',
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
        'hsa-mtls-cert-generator',
        'hsa-directory-mock',
        'hsa-person-lookup-adapter',
        'kong',
      ],
      expect.any(Object),
    )
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
        'node scripts/devcontainer/hsa-mock.mjs <config|build|up|recreate|status|verify|logs|restart|down>',
      ),
    )
  })

  it('returns exit code 1 and logs usage when action is missing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(main([])).resolves.toBe(1)

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'node scripts/devcontainer/hsa-mock.mjs <config|build|up|recreate|status|verify|logs|restart|down>',
      ),
    )
  })
})
