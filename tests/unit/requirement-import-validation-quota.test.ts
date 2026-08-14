import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkRequirementImportValidationSessionQuotaAdvisory,
  createRequirementImportValidationSessionAtomically,
  type RequirementImportValidationSessionQuotaCode,
} from '@/lib/dal/requirement-import-validation-sessions'

const MIB = 1024 * 1024
const now = new Date('2026-08-14T10:05:00.000Z')
const windowStart = new Date('2026-08-14T10:00:00.000Z')
const windowEnd = new Date('2026-08-14T10:10:00.000Z')

const settings = {
  maxActiveSessionsPerDestination: 100,
  maxActiveSessionsPerPrincipal: 10,
  maxCreationsPerWindow: 20,
  maxReservedBytes: 512 * MIB,
}

const data = {
  creatorPrincipalFingerprint: 'a'.repeat(64),
  destinationId: 7,
  destinationKind: 'requirements_library',
  destinationSnapshotJson: '{"kind":"requirements_library"}',
  expiresAt: new Date('2026-08-14T11:05:00.000Z'),
  payloadHash: 'b'.repeat(64),
  referenceDataFingerprint: 'c'.repeat(64),
  reservedBytes: 2 * MIB,
  submittedPayloadJson: '{"requirements":[]}',
  tokenHash: 'd'.repeat(64),
  validationResultJson: '{"rows":[]}',
}

const insertedRow = {
  ...data,
  createdAt: now,
  executionResultJson: null,
  id: 11,
  updatedAt: now,
}

function createDb(
  usage: {
    destinationActiveSessions?: number
    principalActiveSessions?: number
    reservedBytes?: number
    successfulCreations?: number
  } = {},
) {
  const query = vi
    .fn()
    .mockResolvedValueOnce([{ lockResult: 0 }])
    .mockResolvedValueOnce([settings])
    .mockResolvedValueOnce([{ now, windowEnd, windowStart }])
    .mockResolvedValueOnce([
      {
        destinationActiveSessions: usage.destinationActiveSessions ?? 99,
        principalActiveSessions: usage.principalActiveSessions ?? 9,
        reservedBytes: usage.reservedBytes ?? 510 * MIB,
      },
    ])
    .mockResolvedValueOnce([
      { successfulCreations: usage.successfulCreations ?? 19 },
    ])
  const manager = { query }
  const transaction = vi.fn(
    async (
      _isolation: string,
      callback: (executor: typeof manager) => Promise<unknown>,
    ) => callback(manager),
  )
  return { db: { transaction } as never, manager, query, transaction }
}

function createDbFromResponses(responses: unknown[]) {
  const query = vi.fn()
  for (const response of responses) query.mockResolvedValueOnce(response)
  const manager = { query }
  const transaction = vi.fn(
    async (
      _isolation: string,
      callback: (executor: typeof manager) => Promise<unknown>,
    ) => callback(manager),
  )
  return { db: { transaction } as never, query }
}

describe('MCP import-validation quota insertion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts equality at every quota and commits the session plus rate increment', async () => {
    const { db, query, transaction } = createDb()
    query.mockResolvedValueOnce([insertedRow]).mockResolvedValueOnce([])

    await expect(
      createRequirementImportValidationSessionAtomically(db, data),
    ).resolves.toEqual({ session: expect.objectContaining({ id: 11 }) })

    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    expect(query.mock.calls[0]?.[0]).toContain('sp_getapplock')
    expect(query.mock.calls[5]?.[0]).toContain(
      'INSERT INTO requirement_import_validation_sessions',
    )
    expect(query.mock.calls[6]?.[0]).toContain(
      'requirement_import_validation_rate_buckets',
    )
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('expires_at <= SYSUTCDATETIME()'),
      ),
    ).toBe(false)
  })

  it.each<{
    code: RequirementImportValidationSessionQuotaCode
    usage: Parameters<typeof createDb>[0]
  }>([
    {
      code: 'import_validation_principal_session_quota_exceeded',
      usage: { principalActiveSessions: 10 },
    },
    {
      code: 'import_validation_creation_rate_exceeded',
      usage: { successfulCreations: 20 },
    },
    {
      code: 'import_validation_destination_session_quota_exceeded',
      usage: { destinationActiveSessions: 100 },
    },
    {
      code: 'import_validation_storage_quota_exceeded',
      usage: { reservedBytes: 510 * MIB + 1 },
    },
  ])('rejects one-over $code without storing session content', async entry => {
    const { db, query } = createDb(entry.usage)

    const result = await createRequirementImportValidationSessionAtomically(
      db,
      data,
    )

    expect(result).toMatchObject({ rejection: { code: entry.code } })
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes(
          'INSERT INTO requirement_import_validation_sessions',
        ),
      ),
    ).toBe(false)
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes(
          'UPDATE requirement_import_validation_rate_buckets',
        ),
      ),
    ).toBe(false)
  })

  it('rejects immediately when settings are reduced below current usage', async () => {
    const { db, query } = createDb({ principalActiveSessions: 42 })

    await expect(
      createRequirementImportValidationSessionAtomically(db, data),
    ).resolves.toEqual({
      rejection: {
        code: 'import_validation_principal_session_quota_exceeded',
      },
    })
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes(
          'INSERT INTO requirement_import_validation_sessions',
        ),
      ),
    ).toBe(false)
  })

  it('reports only the highest-precedence quota and bounds the caller retry delay', async () => {
    const { db } = createDb({
      destinationActiveSessions: 100,
      principalActiveSessions: 10,
      reservedBytes: 512 * MIB,
      successfulCreations: 20,
    })

    await expect(
      createRequirementImportValidationSessionAtomically(db, data),
    ).resolves.toEqual({
      rejection: {
        code: 'import_validation_principal_session_quota_exceeded',
      },
    })
  })

  it('returns a bounded retry delay only for the caller creation-rate quota', async () => {
    const { db } = createDb({ successfulCreations: 20 })

    await expect(
      createRequirementImportValidationSessionAtomically(db, data),
    ).resolves.toEqual({
      rejection: {
        code: 'import_validation_creation_rate_exceeded',
        retryAfterSeconds: 300,
      },
    })
  })

  it('performs a payload-free advisory check with the same precedence', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        ...settings,
        destinationActiveSessions: 100,
        now,
        principalActiveSessions: 10,
        reservedBytes: 512 * MIB,
        successfulCreations: 20,
        windowEnd,
      },
    ])

    await expect(
      checkRequirementImportValidationSessionQuotaAdvisory(
        { query },
        {
          creatorPrincipalFingerprint: data.creatorPrincipalFingerprint,
          destinationId: data.destinationId,
          destinationKind: data.destinationKind,
          requestedReservedBytes: 0,
        },
      ),
    ).resolves.toEqual({
      code: 'import_validation_principal_session_quota_exceeded',
    })
    expect(query.mock.calls[0]?.[0]).not.toMatch(
      /submitted_payload|validation_result|destination_snapshot/u,
    )
  })

  it('fails closed when advisory quota settings are missing', async () => {
    await expect(
      checkRequirementImportValidationSessionQuotaAdvisory(
        { query: vi.fn().mockResolvedValue([]) },
        {
          creatorPrincipalFingerprint: data.creatorPrincipalFingerprint,
          destinationId: data.destinationId,
          destinationKind: data.destinationKind,
          requestedReservedBytes: 0,
        },
      ),
    ).rejects.toThrow('quota settings are missing')
  })

  it.each([
    {
      message: 'quota lock row',
      responses: [[]],
      text: 'Failed to acquire MCP import-validation quota lock',
    },
    {
      message: 'quota lock',
      responses: [[{ lockResult: -1 }]],
      text: 'Failed to acquire MCP import-validation quota lock',
    },
    {
      message: 'quota settings',
      responses: [[{ lockResult: 0 }], []],
      text: 'quota settings are missing',
    },
    {
      message: 'quota clock',
      responses: [[{ lockResult: 0 }], [settings], []],
      text: 'quota clock is unavailable',
    },
    {
      message: 'quota usage',
      responses: [
        [{ lockResult: 0 }],
        [settings],
        [{ now, windowEnd, windowStart }],
        [],
      ],
      text: 'quota usage is unavailable',
    },
    {
      message: 'insert result',
      responses: [
        [{ lockResult: 0 }],
        [settings],
        [{ now, windowEnd, windowStart }],
        [
          {
            destinationActiveSessions: 0,
            principalActiveSessions: 0,
            reservedBytes: 0,
          },
        ],
        [{ successfulCreations: 0 }],
        [],
      ],
      text: 'Failed to create requirement import validation session',
    },
  ])('fails closed when the $message is unavailable', async entry => {
    const { db } = createDbFromResponses(entry.responses)

    await expect(
      createRequirementImportValidationSessionAtomically(db, data),
    ).rejects.toThrow(entry.text)
  })

  it('creates the first rate bucket when no current window row exists', async () => {
    const { db } = createDbFromResponses([
      [{ lockResult: 0 }],
      [settings],
      [{ now, windowEnd, windowStart }],
      [
        {
          destinationActiveSessions: 0,
          principalActiveSessions: 0,
          reservedBytes: 0,
        },
      ],
      [],
      [insertedRow],
      [],
    ])

    await expect(
      createRequirementImportValidationSessionAtomically(db, data),
    ).resolves.toEqual({ session: expect.objectContaining({ id: 11 }) })
  })
})
