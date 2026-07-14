import { describe, expect, it, vi } from 'vitest'
import {
  runClientBundleChecks,
  runClientBundleCli,
} from '../../scripts/check-client-bundles.mjs'

describe('client bundle checks', () => {
  it('runs both focused checks with the same build and mode', () => {
    const runAdmin = vi.fn(() => ({ surface: 'admin' }))
    const runStewardship = vi.fn(() => ({ surface: 'stewardship' }))

    const report = runClientBundleChecks({
      projectRoot: '/workspace/project',
      reportOnly: true,
      runAdmin,
      runStewardship,
    })

    const expectedOptions = {
      projectRoot: '/workspace/project',
      reportOnly: true,
    }
    expect(runAdmin).toHaveBeenCalledOnce()
    expect(runAdmin).toHaveBeenCalledWith(expectedOptions)
    expect(runStewardship).toHaveBeenCalledOnce()
    expect(runStewardship).toHaveBeenCalledWith(expectedOptions)
    expect(report).toEqual({
      admin: { surface: 'admin' },
      stewardship: { surface: 'stewardship' },
    })
  })

  it('maps CLI options and failures to an exit code', () => {
    const runChecks = vi.fn()
    expect(
      runClientBundleCli({
        argv: ['node', 'check-client-bundles.mjs', '--report'],
        cwd: '/workspace/project',
        runChecks,
      }),
    ).toBe(0)
    expect(runChecks).toHaveBeenCalledWith({
      projectRoot: '/workspace/project',
      reportOnly: true,
    })

    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    expect(
      runClientBundleCli({
        argv: [],
        cwd: '/workspace/project',
        runChecks: () => {
          throw new Error('bundle failure')
        },
      }),
    ).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('bundle failure')

    const nonErrorFailure = 'non-Error bundle failure'
    expect(
      runClientBundleCli({
        argv: [],
        cwd: '/workspace/project',
        runChecks: () => {
          throw nonErrorFailure
        },
      }),
    ).toBe(1)
    expect(errorSpy).toHaveBeenLastCalledWith(nonErrorFailure)
  })
})
