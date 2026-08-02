import { describe, expect, it } from 'vitest'
import {
  createPesterInstallArgs,
  createPesterTestArgs,
  PESTER_VERSION,
  POWERSHELL_IMAGE,
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
      repositoryRoot: '/repo',
      resultDir: '/repo/test-results/pester',
    })
    const command = args.join(' ')

    expect(args).toContain('--network=none')
    expect(args).toContain('--read-only')
    expect(args).toContain('--cap-drop=ALL')
    expect(command).toContain('source=/repo,target=/workspace,readonly')
    expect(command).toContain(
      'source=/tmp/pester-modules,target=/pester-modules,readonly',
    )
    expect(command).toContain('KRAVHANTERING_PESTER_INTEGRATION=1')
    expect(command).toContain('PSModulePath=/pester-modules')
    expect(command).toContain('$configuration.Should.DisableV5 = $true')
    expect(command).not.toContain('/var/run/docker.sock')
    expect(command).not.toMatch(/(?:GH_TOKEN|COPILOT_GITHUB_TOKEN)=/u)
    expect(command).not.toMatch(/AZURE_(?:CLIENT|TENANT|SUBSCRIPTION)_/u)
  })
})
