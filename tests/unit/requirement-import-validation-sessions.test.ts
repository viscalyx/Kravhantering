import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getOwnedRequirementImportValidationSession,
  inspectExpiredRequirementImportValidationSessions,
  purgeExpiredRequirementImportValidationSessions,
  updateRequirementImportValidationSessionExecutionResult,
} from '@/lib/dal/requirement-import-validation-sessions'
import { createRequirementImportValidationSessionCleanupTarget } from '@/lib/transient-cleanup/requirement-import-validation-sessions'

const row = {
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  creatorPrincipalFingerprint: 'principal-fingerprint',
  destinationId: '7' as unknown as number,
  destinationKind: 'requirements_library',
  destinationSnapshotJson: '{}',
  executionResultJson: null,
  expiresAt: '2026-08-01T10:15:00.000Z',
  id: '11' as unknown as number,
  payloadHash: 'payload-hash',
  referenceDataFingerprint: 'fingerprint',
  reservedBytes: 4096,
  submittedPayloadJson: '{}',
  tokenHash: 'token-hash',
  updatedAt: new Date('2026-08-01T10:01:00.000Z'),
  validationResultJson: '{}',
}

describe('requirement import validation-session DAL', () => {
  const query = vi.fn()
  const db = { query } as never

  beforeEach(() => vi.clearAllMocks())

  it('loads stored content only when token and principal fingerprints both match', async () => {
    query.mockResolvedValueOnce([
      {
        ...row,
        creatorPrincipalFingerprint: 'principal-fingerprint',
        reservedBytes: 4096,
      },
    ])

    await expect(
      getOwnedRequirementImportValidationSession(
        { query },
        'token-hash',
        'principal-fingerprint',
        { lockForUpdate: true },
      ),
    ).resolves.toMatchObject({
      creatorPrincipalFingerprint: 'principal-fingerprint',
      id: 11,
    })
    expect(query.mock.calls[0]?.[0]).toContain(
      'creator_principal_fingerprint = @1',
    )
    expect(query.mock.calls[0]?.[1]).toEqual([
      'token-hash',
      'principal-fingerprint',
    ])
  })

  it('updates execution results with bound parameters', async () => {
    query.mockResolvedValueOnce(undefined)
    const updatedAt = new Date('2026-08-01T10:02:00.000Z')
    await updateRequirementImportValidationSessionExecutionResult(
      { query },
      11,
      '{"created":1}',
      updatedAt,
    )
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE'), [
      '{"created":1}',
      updatedAt,
      11,
    ])
  })

  it('reports only aggregate expired-session backlog metrics', async () => {
    query.mockResolvedValueOnce([
      {
        expiredRowCount: '12',
        expiredStoredBytes: '4096',
        oldestExpiredAgeMs: '60000',
      },
    ])

    await expect(
      inspectExpiredRequirementImportValidationSessions(db),
    ).resolves.toEqual({
      expiredRowCount: 12,
      expiredStoredBytes: 4096,
      oldestExpiredAgeMs: 60000,
    })
    expect(query.mock.calls[0]?.[0]).toContain('COUNT_BIG(*)')
    expect(query.mock.calls[0]?.[0]).toContain('DATALENGTH')
    expect(query.mock.calls[0]?.[0]).toContain('SYSUTCDATETIME()')
    expect(query.mock.calls[0]?.[1]).toBeUndefined()
  })

  it.each([
    [0, 1],
    [42.9, 42],
    [999, 500],
  ])('bounds purge limit %s to %s', async (limit, expected) => {
    query.mockResolvedValueOnce([{ deletedRows: String(expected) }])
    await expect(
      purgeExpiredRequirementImportValidationSessions(db, limit),
    ).resolves.toEqual({ deletedRows: expected })
    expect(query.mock.calls[0]?.[0]).toContain('TOP (@0)')
    expect(query.mock.calls[0]?.[0]).toContain('UPDLOCK, READPAST, ROWLOCK')
    expect(query.mock.calls[0]?.[0]).toContain('expires_at <= SYSUTCDATETIME()')
    expect(query.mock.calls[0]?.[0]).toContain('ORDER BY expires_at, id')
    expect(query.mock.calls[0]?.[1]).toEqual([expected])
  })

  it('adapts aggregate inspection and bounded purge as one cleanup target', async () => {
    query
      .mockResolvedValueOnce([
        {
          expiredRowCount: '1',
          expiredStoredBytes: '100',
          oldestExpiredAgeMs: '1000',
        },
      ])
      .mockResolvedValueOnce([{ deletedRows: '1' }])
    const target = createRequirementImportValidationSessionCleanupTarget(db)

    await expect(target.inspect()).resolves.toMatchObject({
      expiredRowCount: 1,
    })
    await expect(target.purgeBatch(1)).resolves.toEqual({ deletedRows: 1 })
    expect(target.kind).toBe('requirement_import_validation_sessions')
  })
})
