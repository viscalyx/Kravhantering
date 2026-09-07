import { spawnSync } from 'node:child_process'
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { decryptAiProviderSecret } from '../../lib/ai/provider-secret-crypto.ts'
import { parseAiProviderSecretKeyring } from '../../lib/ai/provider-secret-keyring.ts'
import {
  loadAiProviderSecretMaintenanceKeyring,
  reencryptAiProviderSecretBatch,
  verifyAiProviderSecretRestoreSet,
} from '../ai-provider-secret-maintenance.mjs'

function serializedKeyring(activeWriteVersion = 'root-2') {
  return JSON.stringify({
    activeWriteVersion,
    formatVersion: 1,
    keys: {
      'root-1': randomBytes(32).toString('base64'),
      'root-2': randomBytes(32).toString('base64'),
    },
  })
}

function keyring(serialized) {
  return loadAiProviderSecretMaintenanceKeyring(
    { AI_PROVIDER_SECRET_KEYRING_FILE: '/run/keyring.json' },
    () => serialized,
  )
}

function encryptedRow(serialized, rootKeyVersion = 'root-1') {
  const document = JSON.parse(serialized)
  document.activeWriteVersion = rootKeyVersion
  const source = keyring(JSON.stringify(document))
  const id = randomUUID()
  const connectionId = randomUUID()
  const plaintext = Buffer.from('maintenance-secret', 'utf8')
  const nonce = randomBytes(12)
  const key = source.keyForVersion(rootKeyVersion)
  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: 16,
  })
  cipher.setAAD(
    Buffer.from(
      [
        'kravhantering.ai-provider-secret',
        '1',
        rootKeyVersion,
        connectionId,
        id,
      ].join('\0'),
    ),
  )
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  key.fill(0)
  plaintext.fill(0)
  return {
    authenticationTag: cipher.getAuthTag(),
    ciphertext,
    connectionId,
    formatVersion: 1,
    id,
    nonce,
    revisionToken: randomUUID(),
    rootKeyVersion,
  }
}

describe('plain-Node AI provider-secret maintenance', () => {
  it.each(['db-job', 'demo-seed'])(
    'verifies retained secrets from the %s packaged layout',
    stage => {
      const root = mkdtempSync(join(tmpdir(), 'keyring-package-'))
      try {
        // Materialize the stage's repository COPY instructions outside the checkout.
        // Build-stage dependencies are unnecessary for the standalone maintenance API.
        const dockerfile = readFileSync('containers/app/Dockerfile', 'utf8')
        const section = dockerfile
          .split(new RegExp(`^FROM .+ AS ${stage}$`, 'm'))[1]
          .split(/^FROM /m)[0]
        for (const line of section.split('\n')) {
          if (!line.startsWith('COPY ') || line.includes('--from=')) continue
          const paths = line
            .split(/\s+/u)
            .slice(1)
            .filter(value => !value.startsWith('--'))
          const target = paths.pop()
          for (const source of paths) {
            const destination = join(
              root,
              target.endsWith('/')
                ? `${target}${source.split('/').at(-1)}`
                : target,
            )
            mkdirSync(dirname(destination), { recursive: true })
            cpSync(source, destination, { recursive: true })
          }
        }
        const serialized = serializedKeyring()
        const row = encryptedRow(serialized)
        const env = { ...process.env }
        delete env.NODE_OPTIONS
        delete env.NODE_NO_WARNINGS
        const result = spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `
        import { readFileSync } from 'node:fs'
        import { loadAiProviderSecretMaintenanceKeyring, verifyAiProviderSecretRestoreSet } from './scripts/ai-provider-secret-maintenance.mjs'
        const { serialized, row } = JSON.parse(readFileSync(0, 'utf8'), (_key, value) =>
          value?.type === 'Buffer' ? Buffer.from(value.data) : value)
        const ring = loadAiProviderSecretMaintenanceKeyring({ AI_PROVIDER_SECRET_KEYRING_FILE: 'fixture' }, () => serialized)
        const report = await verifyAiProviderSecretRestoreSet({ query: async () => [row] }, ring)
        const omitted = await verifyAiProviderSecretRestoreSet({ query: async () => [row] }, ring, { omitRootKeyVersion: 'root-1' })
        console.log(JSON.stringify({ report, omitted }))
      `,
          ],
          {
            cwd: root,
            env,
            input: JSON.stringify({ serialized, row }),
            encoding: 'utf8',
          },
        )
        expect(result.status, result.stderr).toBe(0)
        expect(result.stderr).toBe('')
        expect(JSON.parse(result.stdout)).toMatchObject({
          report: { checkedSecretVersionCount: 1, compatible: true },
          omitted: { compatible: false, failedSecretVersionCount: 1 },
        })
        expect(result.stdout).not.toContain('maintenance-secret')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )

  it('loads only a complete external keyring and returns copied key bytes', () => {
    const serialized = serializedKeyring()
    const loaded = keyring(serialized)
    expect(loaded.activeWriteVersion).toBe('root-2')
    const first = loaded.keyForVersion('root-1')
    const second = loaded.keyForVersion('root-1')
    first.fill(0)
    expect(second.equals(Buffer.alloc(32))).toBe(false)
    expect(() => loaded.keyForVersion('missing')).toThrow('unavailable')

    expect(() => loadAiProviderSecretMaintenanceKeyring({})).toThrow(
      'AI_PROVIDER_SECRET_KEYRING_FILE',
    )
    expect(() =>
      loadAiProviderSecretMaintenanceKeyring(
        { AI_PROVIDER_SECRET_KEYRING_FILE: '/missing' },
        () => {
          throw new Error('read failed')
        },
      ),
    ).toThrow('file is unavailable')
    expect(() => keyring('{')).toThrow('not valid JSON')
    expect(() => keyring(JSON.stringify({ formatVersion: 2 }))).toThrow(
      'format version must be 1',
    )
    expect(() =>
      keyring(
        JSON.stringify({
          activeWriteVersion: 'root-1',
          formatVersion: 1,
          keys: { 'root-1': 'bad' },
        }),
      ),
    ).toThrow('not valid base64')
    expect(() =>
      keyring(
        JSON.stringify({
          activeWriteVersion: 'root-missing',
          formatVersion: 1,
          keys: { 'root-1': randomBytes(32).toString('base64') },
        }),
      ),
    ).toThrow('active write version root-missing is unavailable')
  })

  it('authenticates retained rows and proves an omitted root is unavailable', async () => {
    const serialized = serializedKeyring()
    const row = encryptedRow(serialized)
    const db = { query: vi.fn(async () => [row]) }
    await expect(
      verifyAiProviderSecretRestoreSet(db, keyring(serialized)),
    ).resolves.toMatchObject({
      checkedSecretVersionCount: 1,
      compatible: true,
      safeToRemoveOmittedRootKeyVersion: null,
    })
    await expect(
      verifyAiProviderSecretRestoreSet(db, keyring(serialized), {
        omitRootKeyVersion: 'root-1',
      }),
    ).resolves.toMatchObject({
      compatible: false,
      safeToRemoveOmittedRootKeyVersion: false,
    })
    const corrupt = { ...row, authenticationTag: Buffer.alloc(16) }
    db.query.mockResolvedValueOnce([corrupt])
    await expect(
      verifyAiProviderSecretRestoreSet(db, keyring(serialized)),
    ).resolves.toMatchObject({ compatible: false })
  })

  it.each([
    ['valid', row => row, true],
    [
      'empty ciphertext',
      row => ({ ...row, ciphertext: Buffer.alloc(0) }),
      false,
    ],
    ['wrong nonce length', row => ({ ...row, nonce: Buffer.alloc(11) }), false],
    [
      'wrong authentication tag length',
      row => ({ ...row, authenticationTag: Buffer.alloc(15) }),
      false,
    ],
    ['unsupported format', row => ({ ...row, formatVersion: 2 }), false],
    [
      'invalid connection binding',
      row => ({ ...row, connectionId: 'bad' }),
      false,
    ],
    ['invalid secret binding', row => ({ ...row, id: 'bad' }), false],
    [
      'invalid root version',
      row => ({ ...row, rootKeyVersion: '../root' }),
      false,
    ],
  ])(
    'matches runtime envelope acceptance for %s',
    async (_label, mutate, accepted) => {
      const serialized = serializedKeyring()
      const row = mutate(encryptedRow(serialized))
      const runtimeRing = parseAiProviderSecretKeyring(serialized)
      const runtimeAccepted = (() => {
        try {
          decryptAiProviderSecret(
            runtimeRing,
            { connectionId: row.connectionId, secretVersionId: row.id },
            {
              authenticationTag: row.authenticationTag,
              ciphertext: row.ciphertext,
              formatVersion: row.formatVersion,
              nonce: row.nonce,
              rootKeyVersion: row.rootKeyVersion,
            },
          )
          return true
        } catch {
          return false
        }
      })()
      const db = {
        query: vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]),
      }
      const maintenance = await verifyAiProviderSecretRestoreSet(
        db,
        keyring(serialized),
        { batchSize: 10 },
      )
      expect(runtimeAccepted).toBe(accepted)
      expect(maintenance.compatible).toBe(runtimeAccepted)
    },
  )

  it('pages every retained row and caps opaque failure evidence', async () => {
    const serialized = serializedKeyring()
    const rows = Array.from({ length: 25 }, () => ({
      ...encryptedRow(serialized),
      authenticationTag: Buffer.alloc(16),
    }))
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce(rows.slice(0, 10))
        .mockResolvedValueOnce(rows.slice(10, 20))
        .mockResolvedValueOnce(rows.slice(20))
        .mockResolvedValueOnce([]),
    }

    await expect(
      verifyAiProviderSecretRestoreSet(db, keyring(serialized), {
        batchSize: 10,
      }),
    ).resolves.toMatchObject({
      checkedSecretVersionCount: 25,
      compatible: false,
      failedSecretVersionCount: 25,
      failureSample: expect.any(Array),
      failureSampleTruncated: true,
    })
    const report = await verifyAiProviderSecretRestoreSet(
      {
        query: vi
          .fn()
          .mockResolvedValueOnce(rows.slice(0, 10))
          .mockResolvedValueOnce(rows.slice(10, 20))
          .mockResolvedValueOnce(rows.slice(20))
          .mockResolvedValueOnce([]),
      },
      keyring(serialized),
      { batchSize: 10 },
    )
    expect(report.failureSample).toHaveLength(20)
    expect(report).not.toHaveProperty('results')
    expect(JSON.stringify(report).length).toBeLessThan(10_000)
    expect(db.query).toHaveBeenCalledTimes(3)
    expect(String(db.query.mock.calls[0][0])).toContain('TOP (10)')
  })

  it('bounds restore input and root-version evidence across complete batches', async () => {
    const ring = keyring(serializedKeyring())
    const db = { query: vi.fn(async () => []) }
    for (const batchSize of [0, 1_001, 1.5]) {
      await expect(
        verifyAiProviderSecretRestoreSet(db, ring, { batchSize }),
      ).rejects.toThrow('batch size must be 1-1000')
    }
    expect(db.query).not.toHaveBeenCalled()
    await expect(
      verifyAiProviderSecretRestoreSet(db, ring),
    ).resolves.toMatchObject({
      checkedSecretVersionCount: 0,
      compatible: true,
      referencedRootKeyVersions: [],
    })
    const row = encryptedRow(serializedKeyring())
    const rows = Array.from({ length: 101 }, (_, index) => ({
      ...row,
      rootKeyVersion: `missing-${index}`,
    }))
    rows.push(rows[0])
    const paged = {
      query: vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]),
    }
    const report = await verifyAiProviderSecretRestoreSet(paged, ring, {
      batchSize: 102,
    })
    expect(report.referencedRootKeyVersions).toHaveLength(100)
    expect(report.referencedRootKeyVersionsTruncated).toBe(true)
    expect(report.failedSecretVersionCount).toBe(102)
    expect(report.failureSample).toHaveLength(20)
  })

  it('validates bounded rotation arguments and rotates one fenced batch', async () => {
    const serialized = serializedKeyring()
    const row = encryptedRow(serialized)
    const update = vi.fn(async () => [{ updatedId: row.id }])
    const db = {
      query: vi.fn(async () => [{ count: 0 }]),
      transaction: vi.fn(async (_level, use) =>
        use({
          query: vi
            .fn()
            .mockResolvedValueOnce([row])
            .mockImplementation(update),
        }),
      ),
    }
    await expect(
      reencryptAiProviderSecretBatch(db, keyring(serialized), {
        batchSize: 100,
        fromRootKeyVersion: 'root-1',
      }),
    ).resolves.toEqual({
      fromRootKeyVersion: 'root-1',
      reencryptedCount: 1,
      remainingCount: 0,
      safeToRemoveFromRootKeyVersion: true,
      toRootKeyVersion: 'root-2',
    })
    expect(update).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE [ai_provider_secret_versions]'),
      expect.arrayContaining([row.id, 'root-2', row.revisionToken, 'root-1']),
    )
    expect(String(update.mock.calls[0][0])).toContain(
      'OUTPUT INSERTED.[id] INTO @updated',
    )

    const missedUpdateDb = {
      query: vi.fn(async () => [{ count: 1 }]),
      transaction: vi.fn(async (_level, use) =>
        use({
          query: vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]),
        }),
      ),
    }
    await expect(
      reencryptAiProviderSecretBatch(missedUpdateDb, keyring(serialized), {
        batchSize: 100,
        fromRootKeyVersion: 'root-1',
      }),
    ).resolves.toMatchObject({
      reencryptedCount: 0,
      remainingCount: 1,
      safeToRemoveFromRootKeyVersion: false,
    })

    for (const input of [
      { batchSize: 0, fromRootKeyVersion: 'root-1' },
      { batchSize: 1_001, fromRootKeyVersion: 'root-1' },
      { batchSize: 1.5, fromRootKeyVersion: 'root-1' },
      { batchSize: 1, fromRootKeyVersion: 'bad version' },
      { batchSize: 1, fromRootKeyVersion: 'root-2' },
    ]) {
      await expect(
        reencryptAiProviderSecretBatch(db, keyring(serialized), input),
      ).rejects.toThrow()
    }
  })
})
