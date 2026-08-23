import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseCli } from '../src/cli.mjs'

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
        issuerRoot: '/run/issuer',
        lifetime: 'ephemeral',
        profilePath: '/profile.json',
        rootDir: '/runtime/generations',
      },
    })
  })

  it('rejects options without values using a stable category', () => {
    assert.throws(
      () => parseCli(['ensure', '--root'], {}),
      error => error.category === 'ARGUMENT_INVALID',
    )
  })
})
