import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFileSync = vi.fn()

vi.mock('node:child_process', () => ({
  default: {
    execFileSync,
  },
}))

const { checkoutUpdateBranch } = await import(
  '../../.github/workflows/vendor-image-updates.mjs'
)

function gitCommandArgs() {
  return execFileSync.mock.calls.map(([_command, args]) => args)
}

describe('vendor image updater git operations', () => {
  beforeEach(() => {
    execFileSync.mockReset()
  })

  it('fetches an existing update branch tracking ref before checkout', () => {
    const branch = 'automation/vendor-image/keycloak-26.7.0'
    execFileSync.mockImplementation((_command, args) => {
      if (args[0] === 'ls-remote') {
        return `0123456789abcdef\trefs/heads/${branch}\n`
      }
      return ''
    })

    checkoutUpdateBranch(branch)

    expect(gitCommandArgs()).toEqual([
      ['ls-remote', '--exit-code', '--heads', 'origin', branch],
      [
        'fetch',
        'origin',
        `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
      ],
      ['switch', '--force-create', branch, 'origin/main'],
    ])
  })

  it('clears a stale tracking ref for a fresh update branch before checkout', () => {
    const branch = 'automation/vendor-image/keycloak-26.7.0'
    execFileSync.mockImplementation((_command, args) => {
      if (args[0] === 'ls-remote') {
        const error = new Error('remote branch not found')
        error.status = 2
        throw error
      }
      return ''
    })

    checkoutUpdateBranch(branch)

    expect(gitCommandArgs()).toEqual([
      ['ls-remote', '--exit-code', '--heads', 'origin', branch],
      ['update-ref', '-d', `refs/remotes/origin/${branch}`],
      ['switch', '--force-create', branch, 'origin/main'],
    ])
  })
})
