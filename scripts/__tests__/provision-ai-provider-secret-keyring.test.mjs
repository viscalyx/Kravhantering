import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseAiProviderSecretKeyring } from '../../lib/ai/provider-secret-keyring.ts'
import { provisionAiProviderSecretKeyring } from '../provision-ai-provider-secret-keyring.mjs'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(path => rm(path, { force: true, recursive: true })),
  )
})

async function temporaryKeyringPath() {
  const directory = await mkdtemp(join(tmpdir(), 'krav-keyring-test-'))
  temporaryDirectories.push(directory)
  return join(directory, 'nested', 'ai-provider-secrets.json')
}

describe('local AI provider-secret keyring provisioning', () => {
  it('creates a unique, loadable 256-bit keyring with private permissions', async () => {
    const path = await temporaryKeyringPath()

    const result = await provisionAiProviderSecretKeyring({ path })

    expect(result).toEqual({ created: true, path })
    const serialized = await readFile(path, 'utf8')
    const ring = parseAiProviderSecretKeyring(serialized)
    expect(ring.activeWriteVersion).toBe('local-1')
    expect(ring.keyForVersion('local-1')).toHaveLength(32)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it('is idempotent and never reads, overwrites, or returns an existing keyring', async () => {
    const path = await temporaryKeyringPath()
    await provisionAiProviderSecretKeyring({ path })
    const before = await readFile(path)

    const result = await provisionAiProviderSecretKeyring({ path })

    expect(result).toEqual({ created: false, path })
    expect(await readFile(path)).toEqual(before)
    expect(JSON.stringify(result)).not.toContain(before.toString('base64'))
  })

  it('uses exclusive creation under concurrent provisioning', async () => {
    const path = await temporaryKeyringPath()

    const results = await Promise.all([
      provisionAiProviderSecretKeyring({ path }),
      provisionAiProviderSecretKeyring({ path }),
    ])

    expect(results.filter(result => result.created)).toHaveLength(1)
    expect(results.filter(result => !result.created)).toHaveLength(1)
    const serialized = await readFile(path, 'utf8')
    expect(() => parseAiProviderSecretKeyring(serialized)).not.toThrow()
  })
})
