import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const powershell = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh'
const powershellProbe = spawnSync(
  powershell,
  ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'],
  { encoding: 'utf8' },
)
const powershellIt = powershellProbe.status === 0 ? it : it.skip

describe('Azure development workstation transfer', () => {
  powershellIt(
    'preserves destination trust and stays local during partial readiness',
    () => {
      const result = spawnSync(
        powershell,
        [
          '-NoLogo',
          '-NoProfile',
          '-File',
          'tests/powershell/azure-dev-workstation-transfer.test.ps1',
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      )

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toContain(
        'Azure workstation transfer behavioral regressions passed.',
      )
    },
    30_000,
  )
})
