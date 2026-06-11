import { describe, expect, it, vi } from 'vitest'
import {
  DELETED_USER_INTERNAL_NAME,
  executePrivacyErasure,
  previewPrivacyErasure,
  privacyTargetFingerprint,
} from '@/lib/privacy/erasure'

const TARGET_HSA_ID = 'SE5560000001-kalle1'
const OTHER_HSA_ID = 'SE5560000001-kalle2'

type OccurrenceMap = Record<
  string,
  {
    affectedValues?: string[]
    count: number
    value?: string | null
    values?: string[]
  }
>

function keyForPrivacySql(sql: string): string | null {
  const affectedMatch = sql.match(/privacy:affected:([a-z0-9_.]+)/)
  if (affectedMatch) return `${affectedMatch[1]}#affected`
  if (sql.includes('FROM requirement_areas WHERE owner_hsa_id')) {
    return 'requirement_areas.owner'
  }
  if (
    sql.includes('FROM requirement_areas area') &&
    sql.includes('area.owner_hsa_id = @0')
  ) {
    return 'requirement_areas.owner'
  }
  if (sql.includes('FROM requirement_packages pkg')) {
    return 'requirement_packages.owner'
  }
  if (sql.includes('FROM requirement_versions WHERE created_by_hsa_id')) {
    return 'requirement_versions.created_by'
  }
  if (sql.includes('FROM deviations WHERE created_by_hsa_id')) {
    return 'deviations.created_by'
  }
  if (sql.includes('FROM deviations WHERE decided_by_hsa_id')) {
    return 'deviations.decided_by'
  }
  if (
    sql.includes(
      'FROM specification_local_requirement_deviations WHERE created_by_hsa_id',
    )
  ) {
    return 'specification_local_requirement_deviations.created_by'
  }
  if (
    sql.includes(
      'FROM specification_local_requirement_deviations WHERE decided_by_hsa_id',
    )
  ) {
    return 'specification_local_requirement_deviations.decided_by'
  }
  if (sql.includes('FROM improvement_suggestions WHERE created_by_hsa_id')) {
    return 'improvement_suggestions.created_by'
  }
  if (sql.includes('FROM improvement_suggestions WHERE resolved_by_hsa_id')) {
    return 'improvement_suggestions.resolved_by'
  }
  if (
    sql.includes('FROM requirements_specifications WHERE responsible_hsa_id')
  ) {
    return 'requirements_specifications.responsible'
  }
  if (sql.includes('FROM requirement_area_co_authors WHERE hsa_id')) {
    return 'requirement_area_co_authors.hsa_id'
  }
  if (
    sql.includes('FROM requirement_area_co_authors WHERE created_by_hsa_id')
  ) {
    return 'requirement_area_co_authors.created_by'
  }
  if (sql.includes('FROM specification_co_authors WHERE hsa_id')) {
    return 'specification_co_authors.hsa_id'
  }
  if (sql.includes('FROM specification_co_authors WHERE created_by_hsa_id')) {
    return 'specification_co_authors.created_by'
  }
  if (sql.includes('FROM action_audit_events WHERE actor_hsa_id')) {
    return 'action_audit_events.actor'
  }
  return null
}

function createPrivacyDb(occurrences: OccurrenceMap) {
  const query = vi.fn(
    <T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T> => {
      void parameters
      let rows: Array<{ count: number } | { value: string }> = []
      const key = keyForPrivacySql(sql)
      if (key) {
        const isAffected = key.endsWith('#affected')
        const occurrenceKey = isAffected ? key.slice(0, -9) : key
        const hit = occurrences[occurrenceKey] ?? { count: 0 }
        rows = isAffected
          ? (hit.affectedValues ?? []).map(value => ({ value }))
          : sql.includes('COUNT(*)')
            ? [{ count: hit.count }]
            : hit.values
              ? hit.values.map(value => ({ value }))
              : hit.value == null
                ? []
                : [{ value: hit.value }]
      }
      return Promise.resolve(rows as T)
    },
  )
  const db = { query } as Parameters<typeof previewPrivacyErasure>[0]
  return { db, query }
}

function createTransactionalDb(query: ReturnType<typeof vi.fn>) {
  return {
    transaction: vi.fn(async (_level: string, callback) => callback({ query })),
  } as never
}

describe('privacy erasure service', () => {
  it('rejects blank target HSA-ID values', async () => {
    const { db } = createPrivacyDb({})

    await expect(
      previewPrivacyErasure(db, {
        target: { hsaId: '' },
      }),
    ).rejects.toMatchObject({
      details: { reason: 'invalid_target_hsa_id' },
      status: 400,
    })
  })

  it('matches duplicate display names by exact HSA-ID only', async () => {
    const { db, query } = createPrivacyDb({
      'requirement_areas.owner': {
        affectedValues: ['SEC Säkerhet'],
        count: 1,
        value: TARGET_HSA_ID,
      },
    })

    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.totalCount).toBe(1)
    expect(preview.groups).toEqual([
      expect.objectContaining({
        affectedReferences: ['SEC Säkerhet'],
        count: 1,
        currentDisplayValue: TARGET_HSA_ID,
        key: 'requirement_areas.owner',
      }),
    ])
    expect(
      query.mock.calls.map(([, parameters]) => parameters?.[0]).filter(Boolean),
    ).toEqual(expect.arrayContaining([TARGET_HSA_ID]))
    expect(
      query.mock.calls.some(
        ([, parameters]) => parameters?.[0] === OTHER_HSA_ID,
      ),
    ).toBe(false)
  })

  it('allows switch or skip for a requirement area owner when a replacement exists', async () => {
    const { db } = createPrivacyDb({
      'requirement_areas.owner': {
        affectedValues: ['SEC Säkerhet'],
        count: 1,
        value: TARGET_HSA_ID,
      },
    })

    const preview = await previewPrivacyErasure(db, {
      replacement: {
        displayName: 'John Levi',
        hsaId: 'SE5560000001-johlju',
      },
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.groups).toEqual([
      expect.objectContaining({
        affectedReferences: ['SEC Säkerhet'],
        allowedActions: ['switch', 'skip'],
        disabledReasonKey: null,
        key: 'requirement_areas.owner',
        recommendedAction: 'switch',
        warningKey: 'liveAssignment',
      }),
    ])
  })

  it('finds the second duplicate-name improvement decision only by HSA-ID', async () => {
    const { db, query } = createPrivacyDb({
      'improvement_suggestions.resolved_by': {
        affectedValues: ['INT0001 v1 / suggestion 990001'],
        count: 1,
        value: 'Kalle Svensson',
      },
    })

    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: OTHER_HSA_ID },
    })

    expect(preview.totalCount).toBe(1)
    expect(preview.groups).toEqual([
      expect.objectContaining({
        affectedReferences: ['INT0001 v1 / suggestion 990001'],
        count: 1,
        currentDisplayValue: 'Kalle Svensson',
        key: 'improvement_suggestions.resolved_by',
        objectKey: 'improvementSuggestions',
      }),
    ])
    expect(
      query.mock.calls.map(([, parameters]) => parameters?.[0]).filter(Boolean),
    ).toEqual(expect.arrayContaining([OTHER_HSA_ID]))
    expect(
      query.mock.calls.some(
        ([, parameters]) => parameters?.[0] === TARGET_HSA_ID,
      ),
    ).toBe(false)
  })

  it('removes switch from all preview groups when no replacement exists', async () => {
    const { db } = createPrivacyDb({
      'improvement_suggestions.resolved_by': {
        affectedValues: ['INT0001 v1 / suggestion 990001'],
        count: 1,
        value: 'Kalle Svensson',
      },
      'requirement_area_co_authors.hsa_id': {
        affectedValues: ['INT Integration'],
        count: 1,
        value: 'Kalle Svensson',
      },
      'requirements_specifications.responsible': {
        affectedValues: ['SPEC-1 Kravunderlag'],
        count: 1,
        value: 'Kalle Svensson',
      },
    })

    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.groups).toHaveLength(3)
    for (const group of preview.groups) {
      expect(group.allowedActions).not.toContain('switch')
    }
    expect(preview.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          allowedActions: ['anonymize', 'skip'],
          key: 'improvement_suggestions.resolved_by',
        }),
        expect.objectContaining({
          allowedActions: ['anonymize', 'skip'],
          key: 'requirements_specifications.responsible',
        }),
        expect.objectContaining({
          allowedActions: ['delete', 'skip'],
          key: 'requirement_area_co_authors.hsa_id',
        }),
      ]),
    )
  })

  it('allows only skip for a requirement area owner when no replacement exists', async () => {
    const { db } = createPrivacyDb({
      'requirement_areas.owner': {
        affectedValues: ['INT Integration', 'SEC Säkerhet'],
        count: 2,
        value: TARGET_HSA_ID,
      },
    })

    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.groups).toEqual([
      expect.objectContaining({
        affectedReferences: ['INT Integration', 'SEC Säkerhet'],
        allowedActions: ['skip'],
        disabledReasonKey: null,
        key: 'requirement_areas.owner',
        readOnlyReasonKey: null,
        recommendedAction: 'skip',
      }),
    ])
  })

  it('allows only skip for a requirement package lead when no replacement exists', async () => {
    const { db, query } = createPrivacyDb({
      'requirement_packages.owner': {
        affectedValues: ['SPR Språkstöd'],
        count: 1,
        value: 'Kalle Svensson',
      },
    })

    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.groups).toEqual([
      expect.objectContaining({
        affectedReferences: ['SPR Språkstöd'],
        allowedActions: ['skip'],
        disabledReasonKey: null,
        key: 'requirement_packages.owner',
        readOnlyReasonKey: null,
        recommendedAction: 'skip',
      }),
    ])

    query.mockClear()

    await executePrivacyErasure(createTransactionalDb(query), {
      actions: { 'requirement_packages.owner': 'skip' },
      previewToken: preview.previewToken,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(
      query.mock.calls.some(
        ([sql, parameters]) =>
          String(sql).includes('DELETE person') &&
          parameters?.[0] === TARGET_HSA_ID,
      ),
    ).toBe(true)
  })

  it('allows package-lead switching when the target is not an owner row', async () => {
    const replacement = {
      displayName: 'John Levi',
      hsaId: 'SE5560000001-johlju',
    }
    const { db, query } = createPrivacyDb({
      'requirement_packages.owner': {
        affectedValues: ['SPR Språkstöd'],
        count: 1,
        value: 'Kalle Svensson',
      },
    })

    const preview = await previewPrivacyErasure(db, {
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.groups).toEqual([
      expect.objectContaining({
        allowedActions: ['switch', 'skip'],
        controlledByGroupKey: null,
        key: 'requirement_packages.owner',
        readOnlyReasonKey: null,
        recommendedAction: 'switch',
      }),
    ])

    query.mockClear()

    const result = await executePrivacyErasure(createTransactionalDb(query), {
      actions: { 'requirement_packages.owner': 'switch' },
      previewToken: preview.previewToken,
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE requirement_packages'),
      [TARGET_HSA_ID, replacement.hsaId, expect.any(Date)],
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('MERGE INTO requirement_responsibility_people'),
      [
        replacement.hsaId,
        replacement.displayName,
        null,
        null,
        null,
        expect.any(Date),
      ],
    )
    expect(result.actions.switch).toBe(1)
  })

  it('switches requirement area owner HSA-ID directly', async () => {
    const { db, query } = createPrivacyDb({
      'requirement_areas.owner': {
        affectedValues: ['SEC Säkerhet'],
        count: 1,
        value: TARGET_HSA_ID,
      },
    })
    const replacement = {
      displayName: 'John Levi',
      hsaId: 'SE5560000001-johlju',
    }
    const preview = await previewPrivacyErasure(db, {
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    query.mockClear()

    const result = await executePrivacyErasure(createTransactionalDb(query), {
      actions: { 'requirement_areas.owner': 'switch' },
      previewToken: preview.previewToken,
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE requirement_areas'),
      [TARGET_HSA_ID, replacement.hsaId, expect.any(Date)],
    )
    expect(result.actions.switch).toBe(1)
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('owners')),
    ).toBe(false)
  })

  it('uses the no-user sentinel and clears HSA-ID when no replacement exists', async () => {
    const { db, query } = createPrivacyDb({
      'requirement_versions.created_by': {
        count: 1,
        value: 'Kalle Svensson',
      },
    })
    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: TARGET_HSA_ID },
    })

    const result = await executePrivacyErasure(createTransactionalDb(query), {
      actions: { 'requirement_versions.created_by': 'anonymize' },
      previewToken: preview.previewToken,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.actions.anonymize).toBe(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE requirement_versions'),
      [TARGET_HSA_ID, DELETED_USER_INTERNAL_NAME],
    )
  })

  it('does not create a replacement owner when switching direct HSA snapshots', async () => {
    const { db, query } = createPrivacyDb({
      'requirement_versions.created_by': {
        count: 1,
        value: 'Kalle Svensson',
      },
    })
    const replacement = {
      displayName: 'John Levi',
      email: 'john.levi@example.com',
      hsaId: 'SE5560000001-johlju',
    }
    const preview = await previewPrivacyErasure(db, {
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    await executePrivacyErasure(createTransactionalDb(query), {
      actions: { 'requirement_versions.created_by': 'switch' },
      previewToken: preview.previewToken,
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO owners'),
      ),
    ).toBe(false)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE requirement_versions'),
      [TARGET_HSA_ID, replacement.hsaId, replacement.displayName],
    )
  })

  it('anonymizes co-author creator snapshots with the no-user display label', async () => {
    const { db, query } = createPrivacyDb({
      'requirement_area_co_authors.created_by': {
        affectedValues: ['INT Integration'],
        count: 1,
        value: 'Kalle Svensson',
      },
    })
    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: TARGET_HSA_ID },
    })
    expect(preview.groups[0]?.currentDisplayValue).toBe('Kalle Svensson')

    const result = await executePrivacyErasure(createTransactionalDb(query), {
      actions: { 'requirement_area_co_authors.created_by': 'anonymize' },
      previewToken: preview.previewToken,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.actions.anonymize).toBe(1)
    expect(
      query.mock.calls.some(([sql, parameters]) => {
        const normalizedSql = String(sql).replace(/\s+/g, ' ')
        return (
          normalizedSql.includes(
            'UPDATE requirement_area_co_authors SET created_by_hsa_id = NULL, created_by_display_name = @1 WHERE created_by_hsa_id = @0',
          ) &&
          parameters?.[0] === TARGET_HSA_ID &&
          parameters?.[1] === DELETED_USER_INTERNAL_NAME
        )
      }),
    ).toBe(true)
  })

  it('anonymizes action-log actor snapshots without deleting action-log rows', async () => {
    const { db, query } = createPrivacyDb({
      'action_audit_events.actor': {
        affectedValues: ['requirement.create #1'],
        count: 1,
        value: 'Kalle Svensson',
      },
    })
    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.groups[0]).toEqual(
      expect.objectContaining({
        affectedReferences: ['requirement.create #1'],
        key: 'action_audit_events.actor',
        objectKey: 'actionAuditEvents',
        recommendedAction: 'anonymize',
      }),
    )

    const result = await executePrivacyErasure(createTransactionalDb(query), {
      actions: { 'action_audit_events.actor': 'anonymize' },
      previewToken: preview.previewToken,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(result.actions.anonymize).toBe(1)
    expect(
      query.mock.calls.some(([sql, parameters]) => {
        const normalizedSql = String(sql).replace(/\s+/g, ' ')
        return (
          normalizedSql.includes(
            'UPDATE action_audit_events SET actor_hsa_id = NULL, actor_display_name = @1 WHERE actor_hsa_id = @0',
          ) &&
          parameters?.[0] === TARGET_HSA_ID &&
          parameters?.[1] === DELETED_USER_INTERNAL_NAME
        )
      }),
    ).toBe(true)
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('DELETE FROM action_audit_events'),
      ),
    ).toBe(false)
  })

  it('rejects stale previews before applying mutations', async () => {
    const previewDb = createPrivacyDb({
      'requirement_versions.created_by': {
        count: 1,
        value: 'Kalle Svensson',
      },
    })
    const preview = await previewPrivacyErasure(previewDb.db, {
      target: { hsaId: TARGET_HSA_ID },
    })
    const staleDb = createPrivacyDb({
      'requirement_versions.created_by': {
        count: 2,
        value: 'Kalle Svensson',
      },
    })

    await expect(
      executePrivacyErasure(createTransactionalDb(staleDb.query), {
        previewToken: preview.previewToken,
        target: { hsaId: TARGET_HSA_ID },
      }),
    ).rejects.toMatchObject({
      details: { reason: 'stale_privacy_preview' },
      status: 409,
    })
    expect(
      staleDb.query.mock.calls.some(([sql]) =>
        /UPDATE|DELETE|INSERT/.test(sql),
      ),
    ).toBe(false)
  })

  it('rejects stale previews when replacement display details change', async () => {
    const previewDb = createPrivacyDb({
      'requirement_versions.created_by': {
        count: 1,
        value: 'Kalle Svensson',
      },
    })
    const preview = await previewPrivacyErasure(previewDb.db, {
      replacement: {
        displayName: 'John Levi',
        email: 'john.levi@example.com',
        hsaId: 'SE5560000001-johlju',
      },
      target: { hsaId: TARGET_HSA_ID },
    })
    const executionDb = createPrivacyDb({
      'requirement_versions.created_by': {
        count: 1,
        value: 'Kalle Svensson',
      },
    })

    await expect(
      executePrivacyErasure(createTransactionalDb(executionDb.query), {
        actions: { 'requirement_versions.created_by': 'switch' },
        previewToken: preview.previewToken,
        replacement: {
          displayName: 'Jane Levi',
          email: 'jane.levi@example.com',
          hsaId: 'SE5560000001-johlju',
        },
        target: { hsaId: TARGET_HSA_ID },
      }),
    ).rejects.toMatchObject({
      details: { reason: 'stale_privacy_preview' },
      status: 409,
    })
    expect(
      executionDb.query.mock.calls.some(([sql]) =>
        /UPDATE|DELETE|INSERT/.test(sql),
      ),
    ).toBe(false)
  })

  it('creates a stable non-reversible fingerprint', () => {
    const fingerprint = privacyTargetFingerprint(TARGET_HSA_ID)

    expect(fingerprint).toHaveLength(64)
    expect(fingerprint).toBe(privacyTargetFingerprint(TARGET_HSA_ID))
    expect(fingerprint).not.toContain(TARGET_HSA_ID)
    expect(fingerprint).not.toContain('kalle')
  })
})
