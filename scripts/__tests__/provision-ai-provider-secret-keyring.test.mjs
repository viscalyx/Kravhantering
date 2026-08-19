import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseAiProviderSecretKeyring } from '../../lib/ai/provider-secret-keyring.ts'
import {
  defaultAiProviderSecretKeyringPath,
  provisionAiProviderSecretKeyring,
  runAiProviderSecretKeyringProvisioning,
} from '../provision-ai-provider-secret-keyring.mjs'

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

  it('resolves configured and default paths without reading secret data', async () => {
    expect(
      defaultAiProviderSecretKeyringPath(
        { AI_PROVIDER_SECRET_KEYRING_FILE: 'configured/keyring.json' },
        '/workspace/project',
      ),
    ).toBe('/workspace/project/configured/keyring.json')
    expect(defaultAiProviderSecretKeyringPath({}, '/workspace/project')).toBe(
      '/workspace/project/.local/ai-provider-secret-keyring.json',
    )
  })

  it('runs explicit and default provisioning paths with metadata-only logs', async () => {
    const provision = vi
      .fn()
      .mockResolvedValueOnce({
        created: true,
        path: '/workspace/project/explicit.json',
      })
      .mockResolvedValueOnce({
        created: false,
        path: '/workspace/project/from-env.json',
      })
    const log = vi.fn()

    await runAiProviderSecretKeyringProvisioning({
      argv: ['--path', 'explicit.json'],
      cwd: '/workspace/project',
      env: {},
      log,
      provision,
    })
    await runAiProviderSecretKeyringProvisioning({
      argv: [],
      cwd: '/workspace/project',
      env: { AI_PROVIDER_SECRET_KEYRING_FILE: 'from-env.json' },
      log,
      provision,
    })

    expect(provision).toHaveBeenNthCalledWith(1, {
      path: '/workspace/project/explicit.json',
    })
    expect(provision).toHaveBeenNthCalledWith(2, {
      path: '/workspace/project/from-env.json',
    })
    expect(log.mock.calls.flat()).toEqual([
      'Created local AI provider-secret keyring at /workspace/project/explicit.json',
      'Local AI provider-secret keyring already exists at /workspace/project/from-env.json',
    ])
  })

  it('rejects a missing explicit path value', async () => {
    await expect(
      runAiProviderSecretKeyringProvisioning({ argv: ['--path'] }),
    ).rejects.toThrow('--path requires a value')
  })

  it('propagates unexpected publication failures and still removes the temporary file', async () => {
    const path = await temporaryKeyringPath()
    const removeFile = vi.fn(async temporaryPath => {
      await rm(temporaryPath)
    })

    await expect(
      provisionAiProviderSecretKeyring(
        { path },
        {
          linkFile: vi.fn(async () => {
            throw Object.assign(new Error('read-only filesystem'), {
              code: 'EROFS',
            })
          }),
          removeFile,
        },
      ),
    ).rejects.toThrow('read-only filesystem')
    expect(removeFile).toHaveBeenCalledOnce()
  })

  it('does not mask an existing destination when temporary cleanup also fails', async () => {
    const path = await temporaryKeyringPath()

    await expect(
      provisionAiProviderSecretKeyring(
        { path },
        {
          linkFile: vi.fn(async () => {
            throw Object.assign(new Error('already exists'), { code: 'EEXIST' })
          }),
          removeFile: vi.fn(async () => {
            throw new Error('cleanup denied')
          }),
        },
      ),
    ).resolves.toEqual({ created: false, path })
  })
})
