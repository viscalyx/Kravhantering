import {
  chmod,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  symlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseAiProviderSecretKeyring } from '../../lib/ai/provider-secret-keyring.ts'
import {
  defaultAiProviderSecretKeyringPath,
  provisionAiProviderSecretKeyring,
  runAiProviderSecretKeyringProvisioning,
  validateExistingAiProviderSecretKeyring,
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

  it('validates but never overwrites or returns an existing keyring', async () => {
    const path = await temporaryKeyringPath()
    await provisionAiProviderSecretKeyring({ path })
    const before = await readFile(path)

    const result = await provisionAiProviderSecretKeyring({ path })

    expect(result).toEqual({ created: false, path })
    expect(await readFile(path)).toEqual(before)
    expect(JSON.stringify(result)).not.toContain(before.toString('base64'))
  })

  it('rejects an existing keyring with insecure file permissions', async () => {
    const path = await temporaryKeyringPath()
    await provisionAiProviderSecretKeyring({ path })
    await chmod(path, 0o644)

    await expect(provisionAiProviderSecretKeyring({ path })).rejects.toThrow(
      'keyring file must have mode 600',
    )
  })

  it('rejects an existing keyring in an insecure directory', async () => {
    const path = await temporaryKeyringPath()
    await provisionAiProviderSecretKeyring({ path })
    await chmod(join(path, '..'), 0o755)

    await expect(provisionAiProviderSecretKeyring({ path })).rejects.toThrow(
      'keyring directory must have mode 700',
    )
  })

  it('rejects an existing keyring owned by another user', async () => {
    const path = await temporaryKeyringPath()
    await provisionAiProviderSecretKeyring({ path })
    const ownerUid = (process.getuid?.() ?? 0) + 1

    await expect(
      provisionAiProviderSecretKeyring(
        { path },
        {
          inspectPath: async () => ({
            isDirectory: () => true,
            mode: 0o700,
            uid: ownerUid,
          }),
          ownerUid,
        },
      ),
    ).rejects.toThrow('keyring file has an unexpected owner')
  })

  it('rejects an existing keyring that cannot be opened for reading', async () => {
    const path = await temporaryKeyringPath()
    await provisionAiProviderSecretKeyring({ path })

    await expect(
      validateExistingAiProviderSecretKeyring(path, {
        openFile: async () => {
          throw Object.assign(new Error('permission denied'), {
            code: 'EACCES',
          })
        },
      }),
    ).rejects.toThrow('permission denied')
  })

  it('rejects a malformed existing keyring', async () => {
    const path = await temporaryKeyringPath()
    await provisionAiProviderSecretKeyring({ path })
    const handle = await open(path, 'w', 0o600)
    try {
      await handle.writeFile('{}', { encoding: 'utf8' })
    } finally {
      await handle.close()
    }

    await expect(provisionAiProviderSecretKeyring({ path })).rejects.toThrow(
      'keyring format version must be 1',
    )
  })

  it('rejects a symbolic link instead of following it', async () => {
    const target = await temporaryKeyringPath()
    await provisionAiProviderSecretKeyring({ path: target })
    const path = join(target, '..', 'linked-keyring.json')
    await symlink(target, path)

    await expect(provisionAiProviderSecretKeyring({ path })).rejects.toThrow()
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
    await provisionAiProviderSecretKeyring({ path })

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
