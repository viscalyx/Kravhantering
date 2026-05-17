import { describe, expect, it, vi } from 'vitest'
import {
  collectDataSubjectExport,
  DATA_SUBJECT_EXPORT_SOURCE_KEYS,
} from '@/lib/privacy/data-subject-export'
import { PRIVACY_ERASURE_GROUP_POLICIES } from '@/lib/privacy/erasure'

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
  it('uses the same HSA-ID backed source keys as privacy erasure', () => {
    expect(new Set(DATA_SUBJECT_EXPORT_SOURCE_KEYS)).toEqual(
      new Set(PRIVACY_ERASURE_GROUP_POLICIES.map(policy => policy.key)),
    )
    expect(Object.isFrozen(PRIVACY_ERASURE_GROUP_POLICIES)).toBe(true)
  })

  it('collects structured owner data and self-session claims', async () => {
    const { db } = createExportDb({
      'owners.identity': [
        {
          email: 'kalle@example.test',
          firstName: 'Kalle',
          hsaId: TARGET_HSA_ID,
          lastName: 'Svensson',
          ownerId: 7,
          ownerLabel: 'Kalle Svensson',
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
      'owners.identity',
    ])
    expect(result.sources[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldName: 'sub', value: 'subject-1' }),
        expect.objectContaining({ fieldName: 'roles', value: ['Reviewer'] }),
      ]),
    )
    expect(result.sources[1].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldName: 'hsa_id', value: TARGET_HSA_ID }),
        expect.objectContaining({
          fieldName: 'email',
          value: 'kalle@example.test',
        }),
      ]),
    )
  })

  it('matches by exact HSA-ID and does not export duplicate display-name rows', async () => {
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
          canGenerateAi: true,
          decision: 'approved',
          displayName: 'Kalle Svensson',
          hsaId: TARGET_HSA_ID,
          itemKey: '42:7',
          permissionType: 'area_co_author',
          scopeKey: '1',
          scopeLabel: 'AI på',
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
})
