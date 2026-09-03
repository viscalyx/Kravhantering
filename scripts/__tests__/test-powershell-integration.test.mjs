import { describe, expect, it, vi } from 'vitest'
import {
  createPesterInstallArgs,
  createPesterTestArgs,
  DOCKER_PHASE_TIMEOUT_MS,
  PESTER_VERSION,
  POWERSHELL_IMAGE,
  runDocker,
} from '../test-powershell-integration.mjs'

describe('isolated PowerShell integration-test runner', () => {
  it('downloads only the pinned Pester module into an ephemeral cache', () => {
    const args = createPesterInstallArgs({ moduleCache: '/tmp/pester-modules' })
    const command = args.join(' ')

    expect(args).toContain(POWERSHELL_IMAGE)
    expect(args).toContain('--read-only')
    expect(command).toContain(`-RequiredVersion ${PESTER_VERSION}`)
    expect(command).toContain('Save-Module -Name Pester')
    expect(command).toContain(
      'source=/tmp/pester-modules,target=/pester-modules',
    )
    expect(command).not.toContain('/workspace')
    expect(command).not.toContain('KRAVHANTERING_PESTER_INTEGRATION')
  })

  it('runs tests offline with a read-only repository and explicit opt-in', () => {
    const args = createPesterTestArgs({
      moduleCache: '/tmp/pester-modules',
      passwdFile: '/tmp/pester-passwd',
      repositoryRoot: '/repo',
      resultDir: '/repo/test-results/pester',
    })
    const command = args.join(' ')

    expect(args).toContain('--network=none')
    expect(args).toContain('--read-only')
    expect(args).toContain('--cap-drop=ALL')
    expect(command).toContain('/tmp:rw,exec,nosuid,nodev,size=512m')
    expect(command).toContain('source=/repo,target=/workspace,readonly')
    expect(command).toContain(
      'source=/tmp/pester-modules,target=/pester-modules,readonly',
    )
    expect(command).toContain(
      'source=/tmp/pester-passwd,target=/etc/passwd,readonly',
    )
    expect(command).toContain('KRAVHANTERING_PESTER_INTEGRATION=1')
    expect(command).toContain('PSModulePath=/pester-modules')
    expect(command).toContain("'tests/powershell/Unit'")
    expect(command).toContain("'tests/powershell/Integration'")
    expect(command).toContain('$configuration.Should.DisableV5 = $true')
    expect(command).not.toContain('/var/run/docker.sock')
    expect(command).not.toMatch(/(?:GH_TOKEN|COPILOT_GITHUB_TOKEN)=/u)
    expect(command).not.toMatch(/AZURE_(?:CLIENT|TENANT|SUBSCRIPTION)_/u)
  })

  it('bounds Docker phases and reports timeout context', () => {
    const spawn = vi.fn(() => ({
      error: Object.assign(new Error('spawnSync docker ETIMEDOUT'), {
        code: 'ETIMEDOUT',
      }),
      status: null,
    }))

    expect(() => runDocker(['run'], 'Pester test phase', spawn)).toThrow(
      `Pester test phase timed out after ${DOCKER_PHASE_TIMEOUT_MS} ms.`,
    )
    expect(spawn).toHaveBeenCalledWith('docker', ['run'], {
      stdio: 'inherit',
      timeout: DOCKER_PHASE_TIMEOUT_MS,
    })
  })
})
