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
  if (sql.includes('SELECT CONCAT(area.prefix')) {
    return 'owners.identity.areaReferences'
  }
  if (sql.includes('SELECT pkg.name AS value')) {
    return 'owners.identity.packageReferences'
  }
  if (sql.includes('FROM owners WHERE hsa_id')) return 'owners.identity'
  if (sql.includes('requirement_areas area INNER JOIN owners')) {
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
      'owners.identity': {
        count: 1,
        value: 'Kalle Svensson',
      },
    })

    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.totalCount).toBe(1)
    expect(preview.groups).toEqual([
      expect.objectContaining({
        affectedReferences: [],
        count: 1,
        currentDisplayValue: 'Kalle Svensson',
        key: 'owners.identity',
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

  it('allows only delete or skip for an owner when no requirement areas reference the owner', async () => {
    const { db } = createPrivacyDb({
      'owners.identity': {
        affectedValues: ['SEC Säkerhet'],
        count: 1,
        value: 'Kalle Svensson',
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
        allowedActions: ['delete', 'skip'],
        disabledReasonKey: null,
        key: 'owners.identity',
        recommendedAction: 'delete',
        warningKey: 'ownerDelete',
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

  it('blocks owner anonymize when requirement areas still reference the owner and no replacement exists', async () => {
    const { db } = createPrivacyDb({
      'owners.identity': {
        affectedValues: ['INT Integration', 'SEC Säkerhet'],
        count: 1,
        value: 'Kalle Svensson',
      },
      'owners.identity.areaReferences': {
        count: 2,
        values: ['INT Integration', 'SEC Säkerhet'],
      },
      'requirement_areas.owner': {
        affectedValues: ['INT Integration', 'SEC Säkerhet'],
        count: 2,
        value: 'Kalle Svensson',
      },
    })

    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          affectedReferences: ['INT Integration', 'SEC Säkerhet'],
          allowedActions: ['skip'],
          blockingReferences: [
            {
              objectKey: 'requirementAreas',
              values: ['INT Integration', 'SEC Säkerhet'],
            },
          ],
          disabledReasonKey: 'ownerAreaReplacementRequired',
          key: 'owners.identity',
          recommendedAction: 'skip',
        }),
        expect.objectContaining({
          affectedReferences: ['INT Integration', 'SEC Säkerhet'],
          allowedActions: ['skip'],
          controlledByGroupKey: 'owners.identity',
          disabledReasonKey: null,
          key: 'requirement_areas.owner',
          readOnlyReasonKey: 'controlledByOwner',
          recommendedAction: 'skip',
        }),
      ]),
    )
  })

  it('allows only switch or skip for an owner when requirement areas reference the owner and a replacement exists', async () => {
    const { db } = createPrivacyDb({
      'owners.identity': {
        affectedValues: ['SEC Säkerhet'],
        count: 1,
        value: 'Kalle Svensson',
      },
      'owners.identity.areaReferences': {
        count: 1,
        values: ['SEC Säkerhet'],
      },
      'requirement_areas.owner': {
        affectedValues: ['SEC Säkerhet'],
        count: 1,
        value: 'Kalle Svensson',
      },
    })

    const preview = await previewPrivacyErasure(db, {
      replacement: {
        displayName: 'John Levi',
        hsaId: 'SE5560000001-johlju',
      },
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          affectedReferences: ['SEC Säkerhet'],
          allowedActions: ['switch', 'skip'],
          disabledReasonKey: null,
          key: 'owners.identity',
          recommendedAction: 'switch',
          warningKey: 'ownerAreaSwitchOnly',
        }),
        expect.objectContaining({
          affectedReferences: ['SEC Säkerhet'],
          allowedActions: ['switch', 'skip'],
          controlledByGroupKey: 'owners.identity',
          disabledReasonKey: null,
          key: 'requirement_areas.owner',
          readOnlyReasonKey: 'controlledByOwner',
          recommendedAction: 'switch',
        }),
      ]),
    )
  })

  it('disables requirement package owner switching when no replacement exists', async () => {
    const { db } = createPrivacyDb({
      'owners.identity': {
        affectedValues: ['SPR Språkstöd', 'TIL Tillgänglighet'],
        count: 1,
        value: 'Kalle Svensson',
      },
      'owners.identity.packageReferences': {
        count: 2,
        values: ['SPR Språkstöd', 'TIL Tillgänglighet'],
      },
      'requirement_packages.owner': {
        affectedValues: ['SPR Språkstöd', 'TIL Tillgänglighet'],
        count: 2,
        value: 'Kalle Svensson',
      },
    })

    const preview = await previewPrivacyErasure(db, {
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(preview.groups).toEqual([
      expect.objectContaining({
        allowedActions: ['skip'],
        blockingReferences: [
          {
            objectKey: 'requirementPackages',
            values: ['SPR Språkstöd', 'TIL Tillgänglighet'],
          },
        ],
        disabledReasonKey: 'ownerPackageReplacementRequired',
        key: 'owners.identity',
        recommendedAction: 'skip',
      }),
      expect.objectContaining({
        affectedReferences: ['SPR Språkstöd', 'TIL Tillgänglighet'],
        allowedActions: ['skip'],
        controlledByGroupKey: 'owners.identity',
        disabledReasonKey: null,
        key: 'requirement_packages.owner',
        readOnlyReasonKey: 'controlledByOwner',
        recommendedAction: 'skip',
      }),
    ])
  })

  it('allows requirement package owner switching when a replacement exists', async () => {
    const { db } = createPrivacyDb({
      'owners.identity': {
        affectedValues: ['SPR Språkstöd'],
        count: 1,
        value: 'Kalle Svensson',
      },
      'owners.identity.packageReferences': {
        count: 1,
        values: ['SPR Språkstöd'],
      },
      'requirement_packages.owner': {
        affectedValues: ['SPR Språkstöd'],
        count: 1,
        value: 'Kalle Svensson',
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
        allowedActions: ['switch', 'skip'],
        blockingReferences: [
          {
            objectKey: 'requirementPackages',
            values: ['SPR Språkstöd'],
          },
        ],
        disabledReasonKey: null,
        key: 'owners.identity',
        recommendedAction: 'switch',
        warningKey: 'ownerPackageSwitchOnly',
      }),
      expect.objectContaining({
        affectedReferences: ['SPR Språkstöd'],
        allowedActions: ['switch', 'skip'],
        controlledByGroupKey: 'owners.identity',
        disabledReasonKey: null,
        key: 'requirement_packages.owner',
        readOnlyReasonKey: 'controlledByOwner',
        recommendedAction: 'switch',
      }),
    ])
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
      [
        TARGET_HSA_ID,
        replacement.hsaId,
        replacement.displayName,
        expect.any(Date),
      ],
    )
    expect(result.actions.switch).toBe(1)
  })

  it('uses combined owner blocker copy keys when areas and packages reference the owner', async () => {
    const withoutReplacement = await previewPrivacyErasure(
      createPrivacyDb({
        'owners.identity': {
          affectedValues: ['SEC Säkerhet', 'SPR Språkstöd'],
          count: 1,
          value: 'Kalle Svensson',
        },
        'owners.identity.areaReferences': {
          count: 1,
          values: ['SEC Säkerhet'],
        },
        'owners.identity.packageReferences': {
          count: 1,
          values: ['SPR Språkstöd'],
        },
      }).db,
      {
        target: { hsaId: TARGET_HSA_ID },
      },
    )

    expect(withoutReplacement.groups).toEqual([
      expect.objectContaining({
        allowedActions: ['skip'],
        disabledReasonKey: 'ownerAreaAndPackageReplacementRequired',
        key: 'owners.identity',
        recommendedAction: 'skip',
      }),
    ])

    const withReplacement = await previewPrivacyErasure(
      createPrivacyDb({
        'owners.identity': {
          affectedValues: ['SEC Säkerhet', 'SPR Språkstöd'],
          count: 1,
          value: 'Kalle Svensson',
        },
        'owners.identity.areaReferences': {
          count: 1,
          values: ['SEC Säkerhet'],
        },
        'owners.identity.packageReferences': {
          count: 1,
          values: ['SPR Språkstöd'],
        },
      }).db,
      {
        replacement: {
          displayName: 'John Levi',
          hsaId: 'SE5560000001-johlju',
        },
        target: { hsaId: TARGET_HSA_ID },
      },
    )

    expect(withReplacement.groups).toEqual([
      expect.objectContaining({
        allowedActions: ['switch', 'skip'],
        disabledReasonKey: null,
        key: 'owners.identity',
        recommendedAction: 'switch',
        warningKey: 'ownerAreaAndPackageSwitchOnly',
      }),
    ])
  })

  it('switches requirement areas from the owner action even when the client sends skip for the informational row', async () => {
    let areaReferences = 1
    const query = vi.fn(
      <T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T> => {
        void parameters
        if (sql.includes('UPDATE t') && sql.includes('requirement_areas')) {
          areaReferences = 0
          return Promise.resolve([] as T)
        }
        if (sql.includes('SELECT COUNT(*) AS count FROM owners')) {
          return Promise.resolve([{ count: 1 }] as T)
        }
        if (sql.includes('SELECT TOP (1) CONCAT(first_name')) {
          return Promise.resolve([{ value: 'Kalle Svensson' }] as T)
        }
        if (sql.includes('SELECT CONCAT(area.prefix')) {
          return Promise.resolve([{ value: 'SEC Säkerhet' }] as T)
        }
        if (
          sql.includes('SELECT COUNT(*) AS count FROM requirement_areas area')
        ) {
          return Promise.resolve([{ count: 1 }] as T)
        }
        if (sql.includes('SELECT TOP (1) CONCAT(owner.first_name')) {
          return Promise.resolve([{ value: 'Kalle Svensson' }] as T)
        }
        if (
          sql.includes('SELECT TOP (1) id') &&
          sql.includes('FROM owners WHERE hsa_id')
        ) {
          return Promise.resolve([{ id: 2 }] as T)
        }
        if (sql.includes('SELECT id FROM owners WHERE hsa_id')) {
          return Promise.resolve([{ id: 1 }] as T)
        }
        if (
          sql.includes('SELECT COUNT(*) AS count FROM requirement_areas WHERE')
        ) {
          return Promise.resolve([{ count: areaReferences }] as T)
        }
        if (
          sql.includes('(SELECT COUNT(*) FROM requirement_areas WHERE owner_id')
        ) {
          return Promise.resolve([{ count: areaReferences }] as T)
        }
        if (sql.includes('COUNT(*)')) {
          return Promise.resolve([{ count: 0 }] as T)
        }
        return Promise.resolve([] as T)
      },
    )
    const db = { query } as Parameters<typeof previewPrivacyErasure>[0]
    const preview = await previewPrivacyErasure(db, {
      replacement: {
        displayName: 'John Levi',
        hsaId: 'SE5560000001-johlju',
      },
      target: { hsaId: TARGET_HSA_ID },
    })

    query.mockClear()

    const result = await executePrivacyErasure(createTransactionalDb(query), {
      actions: {
        'owners.identity': 'switch',
        'requirement_areas.owner': 'skip',
      },
      previewToken: preview.previewToken,
      replacement: {
        displayName: 'John Levi',
        hsaId: 'SE5560000001-johlju',
      },
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM requirement_areas t'),
      [TARGET_HSA_ID, 2],
    )
    expect(query).toHaveBeenCalledWith('DELETE FROM owners WHERE id = @0', [1])
    expect(result.actions.switch).toBe(2)
    expect(result.actions.skip).toBe(0)
    expect(
      query.mock.calls.some(
        ([sql, parameters]) =>
          String(sql).includes('UPDATE t') && parameters?.[1] === 2,
      ),
    ).toBe(true)
  })

  it('switches requirement packages from the owner action even when the client sends skip for the informational row', async () => {
    let packageReferences = 1
    const query = vi.fn(
      <T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T> => {
        void parameters
        if (sql.includes('UPDATE requirement_packages')) {
          packageReferences = 0
          return Promise.resolve([] as T)
        }
        if (sql.includes('SELECT COUNT(*) AS count FROM owners')) {
          return Promise.resolve([{ count: 1 }] as T)
        }
        if (sql.includes('SELECT TOP (1) CONCAT(first_name')) {
          return Promise.resolve([{ value: 'Kalle Svensson' }] as T)
        }
        if (
          sql.includes('SELECT COUNT(*) AS count FROM requirement_packages pkg')
        ) {
          return Promise.resolve([{ count: packageReferences }] as T)
        }
        if (sql.includes('SELECT TOP (1) pkg.lead_display_name')) {
          return Promise.resolve([{ value: 'Kalle Svensson' }] as T)
        }
        if (sql.includes('SELECT pkg.name AS value')) {
          return Promise.resolve(
            packageReferences > 0
              ? ([{ value: 'SPR Språkstöd' }] as T)
              : ([] as T),
          )
        }
        if (
          sql.includes('SELECT TOP (1) id') &&
          sql.includes('FROM owners WHERE hsa_id')
        ) {
          return Promise.resolve([{ id: 2 }] as T)
        }
        if (sql.includes('SELECT id FROM owners WHERE hsa_id')) {
          return Promise.resolve([{ id: 1 }] as T)
        }
        if (
          sql.includes('SELECT COUNT(*) AS count FROM requirement_areas WHERE')
        ) {
          return Promise.resolve([{ count: 0 }] as T)
        }
        if (
          sql.includes('(SELECT COUNT(*) FROM requirement_areas WHERE owner_id')
        ) {
          return Promise.resolve([{ count: packageReferences }] as T)
        }
        if (sql.includes('COUNT(*)')) {
          return Promise.resolve([{ count: 0 }] as T)
        }
        return Promise.resolve([] as T)
      },
    )
    const db = { query } as Parameters<typeof previewPrivacyErasure>[0]
    const preview = await previewPrivacyErasure(db, {
      replacement: {
        displayName: 'John Levi',
        hsaId: 'SE5560000001-johlju',
      },
      target: { hsaId: TARGET_HSA_ID },
    })

    query.mockClear()

    const result = await executePrivacyErasure(createTransactionalDb(query), {
      actions: {
        'owners.identity': 'switch',
        'requirement_packages.owner': 'skip',
      },
      previewToken: preview.previewToken,
      replacement: {
        displayName: 'John Levi',
        hsaId: 'SE5560000001-johlju',
      },
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE requirement_packages'),
      [TARGET_HSA_ID, 'SE5560000001-johlju', 'John Levi', expect.any(Date)],
    )
    expect(query).toHaveBeenCalledWith('DELETE FROM owners WHERE id = @0', [1])
    expect(result.actions.switch).toBe(2)
    expect(result.actions.skip).toBe(0)
    expect(
      query.mock.calls.some(
        ([sql, parameters]) =>
          String(sql).includes('UPDATE requirement_packages') &&
          parameters?.[1] === 'SE5560000001-johlju',
      ),
    ).toBe(true)
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

  it('stores optional replacement email when creating a replacement owner for owner reference switches', async () => {
    const { db, query } = createPrivacyDb({
      'requirement_areas.owner': {
        affectedValues: ['SEC Säkerhet'],
        count: 1,
        value: 'Kalle Svensson',
      },
    })
    const replacement = {
      displayName: 'John Levi',
      email: 'john.levi@example.com',
      firstName: 'John Carl',
      hsaId: 'SE5560000001-johlju',
      lastName: 'Levi',
    }
    const preview = await previewPrivacyErasure(db, {
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    await executePrivacyErasure(createTransactionalDb(query), {
      actions: { 'requirement_areas.owner': 'switch' },
      previewToken: preview.previewToken,
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO owners'),
      [
        'John Carl',
        'Levi',
        'john.levi@example.com',
        'SE5560000001-johlju',
        expect.any(Date),
      ],
    )
  })

  it('updates existing replacement owner names from explicit fields', async () => {
    const query = vi.fn(
      <T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T> => {
        void parameters
        if (
          sql.includes('SELECT COUNT(*) AS count FROM requirement_areas area')
        ) {
          return Promise.resolve([{ count: 1 }] as T)
        }
        if (sql.includes('SELECT TOP (1) CONCAT(owner.first_name')) {
          return Promise.resolve([{ value: 'Anna Maria Eriksson' }] as T)
        }
        if (sql.includes('privacy:affected:requirement_areas.owner')) {
          return Promise.resolve([{ value: 'SEC Säkerhet' }] as T)
        }
        if (sql.includes('SELECT TOP (1) id, email FROM owners')) {
          return Promise.resolve([{ email: 'old@example.com', id: 2 }] as T)
        }
        if (sql.includes('COUNT(*)')) {
          return Promise.resolve([{ count: 0 }] as T)
        }
        return Promise.resolve([] as T)
      },
    )
    const db = { query } as Parameters<typeof previewPrivacyErasure>[0]
    const replacement = {
      displayName: 'Anna Maria Eriksson',
      email: 'anna.maria.eriksson@example.com',
      firstName: 'Anna Maria',
      hsaId: 'SE5560000001-johlju',
      lastName: 'Eriksson',
    }
    const preview = await previewPrivacyErasure(db, {
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    query.mockClear()

    await executePrivacyErasure(createTransactionalDb(query), {
      actions: { 'requirement_areas.owner': 'switch' },
      previewToken: preview.previewToken,
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE owners'),
      [
        2,
        'Anna Maria',
        'Eriksson',
        'anna.maria.eriksson@example.com',
        expect.any(Date),
      ],
    )
  })

  it('derives a missing replacement owner first name when last name is explicit', async () => {
    const { db, query } = createPrivacyDb({
      'requirement_areas.owner': {
        affectedValues: ['SEC Säkerhet'],
        count: 1,
        value: 'Kalle Svensson',
      },
    })
    const replacement = {
      displayName: 'John Doe',
      hsaId: 'SE5560000001-johlju',
      lastName: 'Doe',
    }
    const preview = await previewPrivacyErasure(db, {
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    await executePrivacyErasure(createTransactionalDb(query), {
      actions: { 'requirement_areas.owner': 'switch' },
      previewToken: preview.previewToken,
      replacement,
      target: { hsaId: TARGET_HSA_ID },
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO owners'),
      ['John', 'Doe', null, 'SE5560000001-johlju', expect.any(Date)],
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
