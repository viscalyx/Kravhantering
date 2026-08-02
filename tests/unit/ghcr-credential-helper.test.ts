import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const HELPER = path.join(
  process.cwd(),
  '.github',
  'actions',
  'ghcr-credential-helper',
  'docker-credential-ghcr-env',
)

function runHelper(
  operation: string,
  input: string,
  env: Record<string, string> = {},
) {
  return spawnSync(HELPER, [operation], {
    encoding: 'utf8',
    env: {
      NODE_ENV: 'test',
      PATH: process.env.PATH,
      ...env,
    },
    input,
  })
}

describe('GHCR environment credential helper', () => {
  it('is executable and returns the explicitly scoped credentials', () => {
    expect(statSync(HELPER).mode & 0o111).not.toBe(0)

    const result = runHelper('get', 'ghcr.io', {
      GHCR_TOKEN: 'short-lived-token',
      GHCR_USERNAME: 'octocat',
    })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      Secret: 'short-lived-token',
      Username: 'octocat',
    })
  })

  it('falls back to the standard GitHub Actions environment', () => {
    const result = runHelper('get', 'https://ghcr.io', {
      GH_TOKEN: 'github-actions-token',
      GITHUB_ACTOR: 'github-actions[bot]',
    })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      Secret: 'github-actions-token',
      Username: 'github-actions[bot]',
    })
  })

  it('accepts Docker store and erase calls without persisting the secret', () => {
    const store = runHelper(
      'store',
      JSON.stringify({
        Secret: 'short-lived-token',
        ServerURL: 'ghcr.io',
        Username: 'octocat',
      }),
    )
    const erase = runHelper('erase', 'ghcr.io')

    expect(store.status).toBe(0)
    expect(store.stdout).toBe('')
    expect(erase.status).toBe(0)
    expect(erase.stdout).toBe('')
  })

  it('rejects requests for other registries', () => {
    const result = runHelper('get', 'docker.io', {
      GHCR_TOKEN: 'short-lived-token',
      GHCR_USERNAME: 'octocat',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Credentials are unavailable for docker.io')
  })
})
