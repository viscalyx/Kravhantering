import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseCli } from '../src/cli.mjs'

const cliPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/cli.mjs',
)

describe('provisioner CLI', () => {
  it('exposes explicit lifecycle paths without secret-bearing options', () => {
    const parsed = parseCli(
      [
        'rotate',
        'app-to-kong',
        '--root',
        '/runtime/generations',
        '--issuer-root',
        '/run/issuer',
        '--lifetime',
        'ephemeral',
        '--profile',
        '/profile.json',
      ],
      {},
    )

    assert.deepEqual(parsed, {
      args: ['app-to-kong'],
      command: 'rotate',
      options: {
        includeProbes: false,
        issuerRoot: '/run/issuer',
        lifetime: 'ephemeral',
        profilePath: '/profile.json',
        rootDir: '/runtime/generations',
        runtimeRoot: '/run/kravhantering/hsa-mtls-runtime',
      },
    })
  })

  it('requires an explicit test-only switch before materializing probes', () => {
    assert.equal(
      parseCli(['deploy', '--include-probes'], {}).options.includeProbes,
      true,
    )
  })

  it('rejects options without values using a stable category', () => {
    assert.throws(
      () => parseCli(['ensure', '--root'], {}),
      error => error.category === 'ARGUMENT_INVALID',
    )
  })

  it('requires the authenticated generation ID for finalize', () => {
    const result = spawnSync(process.execPath, [cliPath, 'finalize'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HSA_MTLS_PROFILE_PATH: '/missing/profile.json',
      },
    })

    assert.equal(result.status, 1)
    assert.deepEqual(JSON.parse(result.stderr), {
      category: 'ARGUMENT_INVALID',
      ok: false,
    })
  })
})
