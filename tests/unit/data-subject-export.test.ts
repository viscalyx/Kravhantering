import { describe, expect, it, vi } from 'vitest'
import {
  collectDataSubjectExport,
  DATA_SUBJECT_EXPORT_SOURCE_KEYS,
} from '@/lib/privacy/data-subject-export'
import { PRIVACY_ERASURE_GROUP_POLICIES } from '@/lib/privacy/erasure'

// cspell:ignore retentionorphan RetentionOrphan

const TARGET_HSA_ID = 'SE5560000001-kalle1'
const OTHER_HSA_ID = 'SE5560000001-kalle2'

type RowMap = Record<string, Array<Record<string, unknown>>>

function keyForExportSql(sql: string): string | null {
  const match = sql.match(/privacy:data-export:([a-z0-9_.]+)/)
  return match?.[1] ?? null
}

function createExportDb(rowsByKey: RowMap) {
  const query = vi.fn(
    <T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T> => {
      const key = keyForExportSql(sql)
      const target = parameters?.[0]
      const rows = key && target === TARGET_HSA_ID ? (rowsByKey[key] ?? []) : []
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
})
