import { describe, expect, it, vi } from 'vitest'
import {
  runClientBundleChecks,
  runClientBundleCli,
} from '../../scripts/check-client-bundles.mjs'

describe('client bundle checks', () => {
  it('runs every focused check with the same build and mode', () => {
    const runAdmin = vi.fn(() => ({ surface: 'admin' }))
    const runRequirementWorkflow = vi.fn(() => ({
      surface: 'requirement-workflow',
    }))
    const runStewardship = vi.fn(() => ({ surface: 'stewardship' }))

    const report = runClientBundleChecks({
      projectRoot: '/workspace/project',
      reportOnly: true,
      runAdmin,
      runRequirementWorkflow,
      runStewardship,
    })

    const expectedOptions = {
      projectRoot: '/workspace/project',
      reportOnly: true,
    }
    expect(runAdmin).toHaveBeenCalledOnce()
    expect(runAdmin).toHaveBeenCalledWith(expectedOptions)
    expect(runRequirementWorkflow).toHaveBeenCalledOnce()
    expect(runRequirementWorkflow).toHaveBeenCalledWith(expectedOptions)
    expect(runStewardship).toHaveBeenCalledOnce()
    expect(runStewardship).toHaveBeenCalledWith(expectedOptions)
    expect(report).toEqual({
      admin: { surface: 'admin' },
      requirementWorkflow: { surface: 'requirement-workflow' },
      stewardship: { surface: 'stewardship' },
    })
  })

  it('runs every focused check when one fails', () => {
    const adminFailure = new Error('admin failed')
    const runAdmin = vi.fn(() => {
      throw adminFailure
    })
    const runStewardship = vi.fn(() => ({ surface: 'stewardship' }))
    const runRequirementWorkflow = vi.fn(() => ({
      surface: 'requirement-workflow',
    }))

    let thrown
    try {
      runClientBundleChecks({
        projectRoot: '/workspace/project',
        runAdmin,
        runRequirementWorkflow,
        runStewardship,
      })
    } catch (error) {
      thrown = error
    }

    expect(runAdmin).toHaveBeenCalledOnce()
    expect(runRequirementWorkflow).toHaveBeenCalledOnce()
    expect(runStewardship).toHaveBeenCalledOnce()
    expect(thrown).toBeInstanceOf(AggregateError)
    expect(thrown.errors).toEqual([adminFailure])
    expect(thrown.message).toContain('admin failed')
  })

  it('surfaces every focused check failure', () => {
    const adminFailure = new Error('admin failed')
    const stewardshipFailure = 'stewardship failed'
    const requirementWorkflowFailure = new Error('requirement workflow failed')

    let thrown
    try {
      runClientBundleChecks({
        projectRoot: '/workspace/project',
        runAdmin: () => {
          throw adminFailure
        },
        runRequirementWorkflow: () => {
          throw requirementWorkflowFailure
        },
        runStewardship: () => {
          throw stewardshipFailure
        },
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect(thrown.errors).toEqual([
      adminFailure,
      requirementWorkflowFailure,
      stewardshipFailure,
    ])
    expect(thrown.message).toContain('admin failed')
    expect(thrown.message).toContain('requirement workflow failed')
    expect(thrown.message).toContain('stewardship failed')
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
