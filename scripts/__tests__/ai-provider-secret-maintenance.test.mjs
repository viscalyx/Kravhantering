import { createCipheriv, randomBytes, randomUUID } from 'node:crypto'
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
      'is invalid',
    )
    expect(() =>
      keyring(
        JSON.stringify({
          activeWriteVersion: 'root-1',
          formatVersion: 1,
          keys: { 'root-1': 'bad' },
        }),
      ),
    ).toThrow('invalid key')
    expect(() =>
      keyring(
        JSON.stringify({
          activeWriteVersion: 'root-missing',
          formatVersion: 1,
          keys: { 'root-1': randomBytes(32).toString('base64') },
        }),
      ),
    ).toThrow('active root key is unavailable')
  })

  it.each([
    ['canonical', randomBytes(32).toString('base64'), true],
    ['empty', '', false],
    ['ignored punctuation', `${randomBytes(32).toString('base64')}!`, false],
    [
      'embedded whitespace',
      `${randomBytes(16).toString('base64')}\n${randomBytes(16).toString('base64')}`,
      false,
    ],
    [
      'missing padding',
      randomBytes(32).toString('base64').replace(/=$/u, ''),
      false,
    ],
    ['wrong decoded size', randomBytes(31).toString('base64'), false],
  ])(
    'matches runtime keyring acceptance for %s base64',
    (_label, encoded, accepted) => {
      const serialized = JSON.stringify({
        activeWriteVersion: 'root-1',
        formatVersion: 1,
        keys: { 'root-1': encoded },
      })
      const runtimeAccepted = (() => {
        try {
          parseAiProviderSecretKeyring(serialized)
          return true
        } catch {
          return false
        }
      })()
      const maintenanceAccepted = (() => {
        try {
          keyring(serialized)
          return true
        } catch {
          return false
        }
      })()
      expect(runtimeAccepted).toBe(accepted)
      expect(maintenanceAccepted).toBe(runtimeAccepted)
    },
  )

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
