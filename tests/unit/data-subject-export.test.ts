import { describe, expect, it, vi } from 'vitest'
import {
  applyDataSubjectExportRowLimit,
  collectDataSubjectExport as collectDataSubjectExportImplementation,
  DATA_SUBJECT_EXPORT_SOURCE_KEYS,
} from '@/lib/privacy/data-subject-export'
import { PRIVACY_ERASURE_GROUP_POLICIES } from '@/lib/privacy/erasure'

// cspell:ignore retentionorphan RetentionOrphan

const TARGET_HSA_ID = 'SE5560000001-kalle1'
const OTHER_HSA_ID = 'SE5560000001-kalle2'

type RowMap = Record<string, Array<Record<string, unknown>>>

function collectDataSubjectExport(
  db: Parameters<typeof collectDataSubjectExportImplementation>[0],
  input: Parameters<typeof collectDataSubjectExportImplementation>[1],
  itemLimit?: Parameters<typeof collectDataSubjectExportImplementation>[2],
): ReturnType<typeof collectDataSubjectExportImplementation> {
  return collectDataSubjectExportImplementation(
    db,
    input,
    itemLimit ?? {
      createItemLimitError: limit =>
        Object.assign(new Error('limit'), { limit }),
      maxItems: 5000,
      signal: new AbortController().signal,
    },
  )
}

function keyForExportSql(sql: string): string | null {
  const match = sql.match(/privacy:data-export:([a-z0-9_.]+)/)
  return match?.[1] ?? null
}

function createExportDb(rowsByKey: RowMap) {
  const query = vi.fn(
    <T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T> => {
      const key = keyForExportSql(sql)
      const target = parameters?.[0]
      const usesMcpFingerprint = key?.startsWith(
        'requirement_import_validation_',
      )
      const usesHsaQuotaFingerprint = key?.startsWith(
        'hsa_verification_quota_buckets',
      )
      const targetMatches = usesMcpFingerprint
        ? typeof target === 'string' && /^[a-f0-9]{64}$/u.test(target)
        : usesHsaQuotaFingerprint
          ? typeof target === 'string' &&
            /^hfp_[A-Za-z0-9_-]{22}$/u.test(target)
          : target === TARGET_HSA_ID
      const rows = key && targetMatches ? (rowsByKey[key] ?? []) : []
      return Promise.resolve(rows as T)
    },
  )
  const db = { query } as Parameters<typeof collectDataSubjectExport>[0]
  return { db, query }
}

function generatedBy() {
  return {
    displayName: 'Disa PrivacyOfficer',
    hsaId: 'SE5560000001-privacy1',
    roles: ['PrivacyOfficer'],
    source: 'oidc',
    sub: 'privacy-sub',
  }
}

describe('data-subject export service', () => {
  it('bounds only simple top-level SELECT source queries', () => {
    expect(
      applyDataSubjectExportRowLimit(
        '/* privacy:data-export:test */\n SELECT value FROM records',
        '@1',
      ),
    ).toBe(
      '/* privacy:data-export:test */\n SELECT TOP (@1) value FROM records',
    )
    for (const sql of [
      'WITH rows AS (SELECT value FROM records) SELECT value FROM rows',
      'SELECT DISTINCT value FROM records',
      '(SELECT value FROM records)',
      'SELECT TOP (10) value FROM records',
    ]) {
      expect(() => applyDataSubjectExportRowLimit(sql, '@1')).toThrow(
        'Privacy export source query must be a simple SELECT',
      )
    }
  })

  it('rejects SELECT modifiers after block and line comments', () => {
    for (const modifier of ['ALL', 'DISTINCT', 'TOP (10)']) {
      for (const comment of [
        '/* query qualifier */ ',
        '-- query qualifier\n',
      ]) {
        expect(() =>
          applyDataSubjectExportRowLimit(
            `SELECT ${comment}${modifier} value FROM records`,
            '@1',
          ),
        ).toThrow('Privacy export source query must be a simple SELECT')
      }
    }
  })

  it('exports forensic actor metadata for every matching lifecycle role', async () => {
    const { db, query } = createExportDb({
      'ai_forensic_capture_windows.identity': [
        {
          actorRole: 'requester',
          captureWindowId: 47,
          direction: 'output',
          displayName: 'Kalle Svensson',
          expiresAt: new Date('2026-08-15T14:00:00Z'),
          hsaId: TARGET_HSA_ID,
          operation: 'ai.generate-requirement-import',
          requestedAt: new Date('2026-08-15T13:45:00Z'),
        },
      ],
      'ai_forensic_evidence_events.actor_fingerprint': [
        {
          actorFingerprint: 'a'.repeat(64),
          blockedStep: 'provider_output',
          capturedAt: new Date('2026-08-15T13:46:00Z'),
          direction: 'output',
          eventId: 'event-47',
          operation: 'ai.generate-requirement-import',
        },
      ],
    })

    const result = await collectDataSubjectExport(db, {
      generatedBy: generatedBy(),
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.sources.map(source => source.key)).toEqual(
      expect.arrayContaining([
        'ai_forensic_capture_windows.identity',
        'ai_forensic_evidence_events.actor_fingerprint',
      ]),
    )
    expect(JSON.stringify(result.sources)).not.toContain('evidence_json')
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('CROSS APPLY (VALUES'),
      ),
    ).toBe(true)
    expect(
      query.mock.calls
        .filter(([sql]) => String(sql).includes('ai_forensic'))
        .every(([, parameters]) => parameters?.[0] === TARGET_HSA_ID),
    ).toBe(true)
    expect(JSON.stringify(result.sources)).not.toContain(OTHER_HSA_ID)
  })

  it('exports safe MCP session and rate metadata without token, payload, validation, or destination names', async () => {
    const { db, query } = createExportDb({
      'requirement_import_validation_rate_buckets.principal': [
        {
          expiresAt: new Date('2026-08-14T10:20:00Z'),
          successfulCreations: 4,
          windowStartedAt: new Date('2026-08-14T10:00:00Z'),
        },
      ],
      'requirement_import_validation_sessions.creator': [
        {
          createdAt: new Date('2026-08-14T10:01:00Z'),
          destinationKind: 'requirements_library',
          expiresAt: new Date('2026-08-14T11:01:00Z'),
          reservedBytes: 4096,
        },
      ],
    })

    const result = await collectDataSubjectExport(db, {
      generatedBy: generatedBy(),
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.sources.map(source => source.key)).toEqual(
      expect.arrayContaining([
        'requirement_import_validation_sessions.creator',
        'requirement_import_validation_rate_buckets.principal',
      ]),
    )
    const serialized = JSON.stringify(result.sources)
    expect(serialized).toContain('reserved_bytes')
    expect(serialized).toContain('successful_creations')
    expect(serialized).not.toMatch(
      /token_hash|submitted_payload|validation_result|execution_result|destination_name/u,
    )
    const mcpQueryParameters = query.mock.calls
      .filter(([sql]) =>
        String(sql).includes(
          'privacy:data-export:requirement_import_validation',
        ),
      )
      .map(([, parameters]) => parameters?.[0])
    expect(mcpQueryParameters).not.toContain(TARGET_HSA_ID)
  })

  it('exports safe HSA verification quota metadata without either party fingerprint', async () => {
    const { db, query } = createExportDb({
      'hsa_verification_quota_buckets.subject': [
        {
          bucketKind: 'actor_target',
          expiresAt: new Date('2026-09-04T12:35:00Z'),
          requestCount: 4,
          windowStartedAt: new Date('2026-09-04T12:34:00Z'),
        },
      ],
    })

    const result = await collectDataSubjectExport(db, {
      generatedBy: generatedBy(),
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.sources).toContainEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            fieldName: 'bucket_kind',
            value: 'actor_target',
          }),
          expect.objectContaining({ fieldName: 'request_count', value: 4 }),
        ]),
        key: 'hsa_verification_quota_buckets.subject',
      }),
    )
    const serialized = JSON.stringify(result.sources)
    expect(serialized).not.toMatch(
      /actor_fingerprint|target_fingerprint|actor_subject_fingerprint|afp_|hfp_/u,
    )
    const quotaQuery = query.mock.calls.find(([sql]) =>
      String(sql).includes(
        'privacy:data-export:hsa_verification_quota_buckets.subject',
      ),
    )
    expect(quotaQuery?.[1]?.[0]).toMatch(/^hfp_[A-Za-z0-9_-]{22}$/u)
  })

  it('uses the same HSA-id backed source keys as privacy erasure', () => {
    expect(new Set(DATA_SUBJECT_EXPORT_SOURCE_KEYS)).toEqual(
      new Set(PRIVACY_ERASURE_GROUP_POLICIES.map(policy => policy.key)),
    )
    expect(Object.isFrozen(PRIVACY_ERASURE_GROUP_POLICIES)).toBe(true)
  })

  it('collects requirement-area owner HSA-id data and self-session claims', async () => {
    const { db } = createExportDb({
      'requirement_areas.owner': [
        {
          areaId: 7,
          areaLabel: 'INT Integration',
          hsaId: TARGET_HSA_ID,
          updatedAt: new Date('2026-05-01T10:00:00Z'),
        },
      ],
    })

    const result = await collectDataSubjectExport(db, {
      generatedAt: new Date('2026-05-12T12:00:00Z'),
      generatedBy: generatedBy(),
      selfSession: {
        email: 'kalle@example.test',
        expiresAt: 1_777_777_777,
        familyName: 'Svensson',
        givenName: 'Kalle',
        hsaId: TARGET_HSA_ID,
        name: 'Kalle Svensson',
        roles: ['Reviewer'],
        sub: 'subject-1',
      },
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.schemaVersion).toBe('privacy-data-subject-export.v1')
    expect(result.generatedAt).toBe('2026-05-12T12:00:00.000Z')
    expect(result.sources.map(source => source.key)).toEqual([
      'auth.session',
      'requirement_areas.owner',
    ])
    expect(result.sources[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldName: 'sub', value: 'subject-1' }),
        expect.objectContaining({ fieldName: 'roles', value: ['Reviewer'] }),
      ]),
    )
    expect(result.sources[1].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: 'owner_hsa_id',
          value: TARGET_HSA_ID,
        }),
      ]),
    )
  })

  it('exports unassigned local responsibility person identity data', async () => {
    const { db } = createExportDb({
      'requirement_responsibility_people.identity': [
        {
          email: 'rolf.retentionorphan@example.test',
          givenName: 'Rolf',
          hsaId: TARGET_HSA_ID,
          lastFetchedAt: new Date('2023-01-15T09:00:00Z'),
          middleName: null,
          surname: 'RetentionOrphan',
          updatedAt: new Date('2023-01-15T09:00:00Z'),
        },
      ],
    })

    const result = await collectDataSubjectExport(db, {
      generatedBy: generatedBy(),
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.sources).toEqual([
      expect.objectContaining({
        key: 'requirement_responsibility_people.identity',
        relationToSubject: 'requirement_responsibility_person',
      }),
    ])
    expect(result.sources[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: 'hsa_id',
          value: TARGET_HSA_ID,
        }),
        expect.objectContaining({
          fieldName: 'given_name',
          value: 'Rolf',
        }),
        expect.objectContaining({
          fieldName: 'email',
          value: 'rolf.retentionorphan@example.test',
        }),
      ]),
    )
  })

  it('preserves malformed source timestamps and null identity fields defensively', async () => {
    const { db } = createExportDb({
      'requirement_responsibility_people.identity': [
        {
          hasProtectedPersonalData: false,
          hsaId: null,
          lastFetchedAt: '',
          updatedAt: 'not-a-timestamp',
        },
        {
          hsaId: TARGET_HSA_ID,
          lastFetchedAt: '2026-05-01T10:00:00Z',
          updatedAt: '2026-05-02T10:00:00Z',
        },
      ],
    })

    const result = await collectDataSubjectExport(db, {
      generatedBy: generatedBy(),
      selfSession: {
        expiresAt: 1_777_777_777,
        familyName: 'Svensson',
        givenName: 'Kalle',
        hsaId: TARGET_HSA_ID,
        name: 'Kalle Svensson',
        roles: [],
        sub: 'subject-1',
      },
      target: { hsaId: TARGET_HSA_ID },
    })

    const identity = result.sources.find(
      source => source.key === 'requirement_responsibility_people.identity',
    )
    expect(identity?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'not-a-timestamp' }),
        expect.objectContaining({ timestamp: '2026-05-02T10:00:00.000Z' }),
        expect.objectContaining({ fieldName: 'last_fetched_at', value: null }),
      ]),
    )
    expect(
      result.sources
        .find(source => source.key === 'auth.session')
        ?.items.find(entry => entry.fieldName === 'email')?.value,
    ).toBeNull()
  })

  it('matches by exact HSA-id and does not export duplicate display-name rows', async () => {
    const { db, query } = createExportDb({
      'improvement_suggestions.resolved_by': [
        {
          actorTimestamp: new Date('2026-05-02T10:00:00Z'),
          displayName: 'Kalle Svensson',
          hsaId: TARGET_HSA_ID,
          suggestionId: 99,
          suggestionLabel: 'INT0001 v1 / suggestion 99',
        },
      ],
    })

    const result = await collectDataSubjectExport(db, {
      generatedBy: generatedBy(),
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(JSON.stringify(result)).not.toContain(OTHER_HSA_ID)
    expect(
      query.mock.calls.map(([, parameters]) => parameters?.[0]).filter(Boolean),
    ).toEqual(expect.arrayContaining([TARGET_HSA_ID]))
    expect(
      query.mock.calls.some(
        ([, parameters]) => parameters?.[0] === OTHER_HSA_ID,
      ),
    ).toBe(false)
    expect(result.sources).toEqual([
      expect.objectContaining({
        key: 'improvement_suggestions.resolved_by',
        relationToSubject: 'historical_decision_snapshot',
      }),
    ])
  })

  it('exports action audit actor snapshots without raw details payloads', async () => {
    const { db } = createExportDb({
      'action_audit_events.actor': [
        {
          action: 'requirement.create',
          decision: 'allowed',
          displayName: 'Kalle Svensson',
          eventId: 17,
          hsaId: TARGET_HSA_ID,
          occurredAt: new Date('2026-05-04T08:00:00Z'),
          targetId: '42',
          targetKind: 'Requirement',
          targetUniqueId: 'AUTH-42',
        },
      ],
    })

    const result = await collectDataSubjectExport(db, {
      generatedBy: generatedBy(),
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.sources).toEqual([
      expect.objectContaining({
        key: 'action_audit_events.actor',
        relationToSubject: 'action_audit_actor_snapshot',
      }),
    ])
    expect(result.sources[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: 'actor_hsa_id',
          value: TARGET_HSA_ID,
        }),
        expect.objectContaining({
          fieldName: 'actor_display_name',
          value: 'Kalle Svensson',
        }),
        expect.objectContaining({
          fieldName: 'action',
          value: 'requirement.create',
        }),
      ]),
    )
    expect(JSON.stringify(result)).not.toContain('details_json')
  })

  it('keeps known limitations in the export payload', async () => {
    const { db } = createExportDb({})

    const result = await collectDataSubjectExport(db, {
      generatedBy: generatedBy(),
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.limitations.map(limitation => limitation.key)).toEqual([
      'free_text_not_scanned',
      'security_audit_logs_external',
      'direct_transfer_not_implemented',
      'session_claims_self_only',
    ])
    expect(result.summary.limitationCount).toBe(4)
  })

  it('keeps access review related object labels out of the export payload', async () => {
    const { db, query } = createExportDb({
      'access_review_items.principal': [
        {
          actorTimestamp: new Date('2026-05-04T10:00:00Z'),
          decision: 'approved',
          displayName: 'Kalle Svensson',
          hsaId: TARGET_HSA_ID,
          itemKey: '42:7',
          permissionType: 'area_co_author',
          scopeKey: '1',
          scopeLabel: 'INT Integration',
          scopeType: 'requirement_area',
          sourceKey: 'requirement_area_co_authors.hsa_id',
        },
      ],
      'access_review_runs.created_by': [
        {
          actorTimestamp: new Date('2026-05-03T10:00:00Z'),
          displayName: 'Kalle Svensson',
          dueAt: new Date('2026-06-03T10:00:00Z'),
          externalEvidenceReference: 'IDM-2026-04',
          hsaId: TARGET_HSA_ID,
          periodEnd: new Date('2027-05-03T10:00:00Z'),
          periodStart: new Date('2026-05-03T10:00:00Z'),
          runId: 42,
          status: 'completed',
        },
      ],
    })

    const result = await collectDataSubjectExport(db, {
      generatedBy: generatedBy(),
      target: { hsaId: TARGET_HSA_ID },
    })
    const runObject = result.sources.find(
      source => source.key === 'access_review_runs.created_by',
    )?.items[0]?.relatedObject
    const itemObject = result.sources.find(
      source => source.key === 'access_review_items.principal',
    )?.items[0]?.relatedObject
    const sql = query.mock.calls.map(([statement]) => statement).join('\n')

    expect(runObject).toEqual({ key: '42', type: 'access_review_run' })
    expect(itemObject).toEqual({ key: '42:7', type: 'access_review_item' })
    expect(JSON.stringify(result)).not.toContain('Access review')
    expect(JSON.stringify(result)).not.toContain('access_review:')
    expect(sql).not.toContain('runLabel')
    expect(sql).not.toContain('itemLabel')
  })

  it('collects every assignment and historical actor source mapper', async () => {
    const timestamp = new Date('2026-05-01T10:00:00Z')
    const actorRow = {
      actorTimestamp: timestamp,
      deviationId: 1,
      deviationLabel: 'Deviation 1',
      displayName: 'Kalle Svensson',
      hsaId: TARGET_HSA_ID,
    }
    const { db } = createExportDb({
      'requirement_packages.owner': [
        {
          hsaId: TARGET_HSA_ID,
          packageId: 1,
          packageLabel: 'Package',
          updatedAt: timestamp,
        },
      ],
      'requirement_versions.created_by': [
        {
          createdAt: timestamp,
          displayName: 'Kalle Svensson',
          hsaId: TARGET_HSA_ID,
          versionId: 1,
          versionLabel: 'REQ-1 v1',
        },
      ],
      'deviations.created_by': [actorRow],
      'deviations.decided_by': [actorRow],
      'specification_local_requirement_deviations.created_by': [actorRow],
      'specification_local_requirement_deviations.decided_by': [actorRow],
      'improvement_suggestions.created_by': [
        {
          actorTimestamp: timestamp,
          displayName: 'Kalle Svensson',
          hsaId: TARGET_HSA_ID,
          suggestionId: 1,
          suggestionLabel: 'Suggestion 1',
        },
      ],
      'requirements_specifications.responsible': [
        {
          hsaId: TARGET_HSA_ID,
          specificationId: 1,
          specificationLabel: 'SPEC One',
          updatedAt: timestamp,
        },
      ],
      'requirement_area_co_authors.hsa_id': [
        {
          areaId: 1,
          areaLabel: 'Area',
          createdAt: timestamp,
          hsaId: TARGET_HSA_ID,
        },
      ],
      'requirement_area_co_authors.created_by': [
        {
          areaId: 1,
          areaLabel: 'Area',
          createdAt: timestamp,
          displayName: 'Kalle Svensson',
          hsaId: TARGET_HSA_ID,
        },
      ],
      'requirement_package_co_authors.hsa_id': [
        {
          createdAt: timestamp,
          hsaId: TARGET_HSA_ID,
          packageId: 1,
          packageLabel: 'Package',
        },
      ],
      'requirement_package_co_authors.created_by': [
        {
          createdAt: timestamp,
          displayName: 'Kalle Svensson',
          hsaId: TARGET_HSA_ID,
          packageId: 1,
          packageLabel: 'Package',
        },
      ],
      'specification_co_authors.hsa_id': [
        {
          createdAt: timestamp,
          hsaId: TARGET_HSA_ID,
          specificationId: 1,
          specificationLabel: 'SPEC One',
        },
      ],
      'specification_co_authors.created_by': [
        {
          createdAt: timestamp,
          displayName: 'Kalle Svensson',
          hsaId: TARGET_HSA_ID,
          specificationId: 1,
          specificationLabel: 'SPEC One',
        },
      ],
    })

    const result = await collectDataSubjectExport(db, {
      generatedBy: generatedBy(),
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.sources.map(source => source.key)).toEqual(
      expect.arrayContaining([
        'requirement_packages.owner',
        'requirement_versions.created_by',
        'deviations.created_by',
        'deviations.decided_by',
        'specification_local_requirement_deviations.created_by',
        'specification_local_requirement_deviations.decided_by',
        'requirements_specifications.responsible',
        'requirement_area_co_authors.hsa_id',
        'requirement_package_co_authors.hsa_id',
        'specification_co_authors.hsa_id',
      ]),
    )
  })

  it('bounds self-session PDF rows before querying database sources', async () => {
    const exact = createExportDb({})
    const input = {
      generatedBy: generatedBy(),
      selfSession: {
        expiresAt: 1_800_000_000,
        familyName: 'Svensson',
        givenName: 'Kalle',
        hsaId: TARGET_HSA_ID,
        name: 'Kalle Svensson',
        roles: ['Reviewer'],
        sub: 'subject-1',
      },
      target: { hsaId: TARGET_HSA_ID },
    }
    const createItemLimitError = (limit: number) =>
      Object.assign(new Error('limit'), { limit })

    await expect(
      collectDataSubjectExport(exact.db, input, {
        createItemLimitError,
        maxItems: 8,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ summary: { itemCount: 8 } })
    expect(exact.query).toHaveBeenCalled()
    for (const [sql, parameters] of exact.query.mock.calls) {
      expect(sql).toContain('SELECT TOP (@1)')
      expect(parameters?.[1]).toBe(1)
      expect(parameters?.[0]).toSatisfy(
        value =>
          value === TARGET_HSA_ID ||
          (typeof value === 'string' &&
            (/^[a-f0-9]{64}$/u.test(value) ||
              /^hfp_[A-Za-z0-9_-]{22}$/u.test(value))),
      )
    }

    const excess = createExportDb({})
    await expect(
      collectDataSubjectExport(excess.db, input, {
        createItemLimitError,
        maxItems: 7,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ limit: 7 })
    expect(excess.query).not.toHaveBeenCalled()
  })

  it('stops bounded collection before database work when generation is cancelled', async () => {
    const { db, query } = createExportDb({})
    const controller = new AbortController()
    const reason = new Error('cancelled before collection')
    controller.abort(reason)

    await expect(
      collectDataSubjectExport(
        db,
        {
          generatedBy: generatedBy(),
          target: { hsaId: TARGET_HSA_ID },
        },
        {
          createItemLimitError: limit =>
            Object.assign(new Error('limit'), { limit }),
          maxItems: 1000,
          signal: controller.signal,
        },
      ),
    ).rejects.toBe(reason)
    expect(query).not.toHaveBeenCalled()
  })

  it('counts row expansion at the exact item boundary and fetches only one overflow row', async () => {
    const rows = {
      'requirement_responsibility_people.identity': [
        {
          email: 'kalle@example.test',
          givenName: 'Kalle',
          hasProtectedPersonalData: false,
          hsaId: TARGET_HSA_ID,
          lastFetchedAt: new Date('2026-08-18T10:00:00Z'),
          middleName: null,
          surname: 'Svensson',
          updatedAt: new Date('2026-08-18T10:00:00Z'),
        },
      ],
    }
    const exact = createExportDb(rows)
    const signal = new AbortController().signal
    const createItemLimitError = (limit: number) =>
      Object.assign(new Error('limit'), { limit })

    await expect(
      collectDataSubjectExport(
        exact.db,
        {
          generatedBy: generatedBy(),
          target: { hsaId: TARGET_HSA_ID },
        },
        { createItemLimitError, maxItems: 7, signal },
      ),
    ).resolves.toMatchObject({ summary: { itemCount: 7 } })

    const excess = createExportDb(rows)
    await expect(
      collectDataSubjectExport(
        excess.db,
        {
          generatedBy: generatedBy(),
          target: { hsaId: TARGET_HSA_ID },
        },
        { createItemLimitError, maxItems: 6, signal },
      ),
    ).rejects.toMatchObject({ limit: 6 })
    const firstQuery = excess.query.mock.calls[0]
    expect(firstQuery[0]).toContain('SELECT TOP (@1)')
    expect(firstQuery[1]).toEqual([TARGET_HSA_ID, 7])
  })
})
