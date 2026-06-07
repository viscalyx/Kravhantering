import { describe, expect, it, vi } from 'vitest'
import {
  type AccessReviewPrincipalSnapshot,
  cancelAccessReviewRun,
  collectAccessReviewAssignments,
  createAccessReviewRun,
  decideAccessReviewItem,
  getAccessReviewRun,
  listAccessReviewRuns,
} from '@/lib/access-review/service'

function accessReviewSnapshot(index: number): AccessReviewPrincipalSnapshot {
  return {
    canGenerateAi: index % 2 === 0,
    permissionType: index % 2 === 0 ? 'area_co_author' : 'area_owner',
    principalDisplayName: `Reviewer ${index}`,
    principalHsaId: `SE5560000001-reviewer${index}`,
    scopeKey: String(index),
    scopeLabel: `Scope ${index}`,
    scopeType: 'requirement_area',
    sourceKey: 'requirement_area_co_authors.hsa_id',
    sourceTable: 'requirement_area_co_authors',
  }
}

function accessReviewRunRow(itemCount: number) {
  return {
    approvedCount: 0,
    changedCount: 0,
    completedAt: null,
    completedByDisplayName: null,
    completedByHsaId: null,
    createdAt: '2026-05-12T12:00:00.000Z',
    createdByDisplayName: 'Ada Admin',
    createdByHsaId: 'SE5560000001-admin1',
    dueAt: '2026-06-11T12:00:00.000Z',
    externalEvidenceReference: null,
    id: 42,
    itemCount,
    notApplicableCount: 0,
    pendingCount: itemCount,
    periodEnd: '2027-05-12T12:00:00.000Z',
    periodStart: '2026-05-12T12:00:00.000Z',
    reviewerDisplayName: 'Ada Admin',
    reviewerHsaId: 'SE5560000001-admin1',
    revokeRequiredCount: 0,
    status: 'in_review',
    updatedAt: '2026-05-12T12:00:00.000Z',
  }
}

function accessReviewItemRows(items: AccessReviewPrincipalSnapshot[]) {
  return items.map((item, index) => ({
    canGenerateAi: item.canGenerateAi ? 1 : 0,
    comment: null,
    createdAt: '2026-05-12T12:00:00.000Z',
    decidedAt: null,
    decidedByDisplayName: null,
    decidedByHsaId: null,
    decision: 'pending',
    id: index + 1,
    permissionType: item.permissionType,
    principalDisplayName: item.principalDisplayName,
    principalHsaId: item.principalHsaId,
    scopeKey: item.scopeKey,
    scopeLabel: item.scopeLabel,
    scopeType: item.scopeType,
    sourceKey: item.sourceKey,
    sourceTable: item.sourceTable,
  }))
}

function accessReviewCreateDb(items: AccessReviewPrincipalSnapshot[]) {
  const rootQueries: { parameters?: unknown[]; sql: string }[] = []
  const transactionQueries: { parameters?: unknown[]; sql: string }[] = []
  const generatedAt = new Date('2026-05-12T12:00:00.000Z')
  const db = {
    query: vi.fn(async (sql: string, parameters?: unknown[]) => {
      rootQueries.push({ parameters, sql })
      if (sql.includes('FROM access_review_items')) {
        return accessReviewItemRows(items)
      }
      return [accessReviewRunRow(items.length)]
    }),
    transaction: vi.fn(async callback => {
      await callback({
        query: vi.fn(async (sql: string, parameters?: unknown[]) => {
          transactionQueries.push({ parameters, sql })
          if (sql.includes('FROM access_review_runs WITH')) return []
          if (sql.includes('access-review:collect-assignments')) return items
          if (sql.includes('INSERT INTO access_review_runs')) {
            return [{ id: 42 }]
          }
          return []
        }),
      })
    }),
  }

  return { db, generatedAt, rootQueries, transactionQueries }
}

describe('access review service', () => {
  it('collects app-managed assignments with AI flags', async () => {
    const rows = [
      {
        canGenerateAi: 0,
        permissionType: 'area_owner',
        principalDisplayName: 'SE5560000001-admin1',
        principalHsaId: 'SE5560000001-admin1',
        scopeKey: '1',
        scopeLabel: 'INT Integration',
        scopeType: 'requirement_area',
        sourceKey: 'requirement_areas.owner',
        sourceTable: 'requirement_areas',
      },
      {
        canGenerateAi: 1,
        permissionType: 'area_co_author',
        principalDisplayName: 'Kalle Svensson',
        principalHsaId: 'SE5560000001-kalle1',
        scopeKey: '1',
        scopeLabel: 'INT Integration',
        scopeType: 'requirement_area',
        sourceKey: 'requirement_area_co_authors.hsa_id',
        sourceTable: 'requirement_area_co_authors',
      },
      {
        canGenerateAi: true,
        permissionType: 'specification_responsible',
        principalDisplayName: 'Sara Holm',
        principalHsaId: 'SE5560000001-sara1',
        scopeKey: '2',
        scopeLabel: 'SPEC Specification',
        scopeType: 'requirements_specification',
        sourceKey: 'requirements_specifications.responsible',
        sourceTable: 'requirements_specifications',
      },
      {
        canGenerateAi: 0,
        permissionType: 'specification_co_author',
        principalDisplayName: 'Linnéa Bergström',
        principalHsaId: 'SE5560000001-linnea1',
        scopeKey: '2',
        scopeLabel: 'SPEC Specification',
        scopeType: 'requirements_specification',
        sourceKey: 'specification_co_authors.hsa_id',
        sourceTable: 'specification_co_authors',
      },
    ]
    const queryCalls: string[] = []
    const query = async <T = unknown[]>(
      sql: string,
      _parameters?: unknown[],
    ): Promise<T> => {
      queryCalls.push(sql)
      return rows as T
    }

    const result = await collectAccessReviewAssignments({ query })

    expect(queryCalls).toHaveLength(1)
    expect(new Set(result.map(item => item.sourceKey))).toEqual(
      new Set([
        'requirement_areas.owner',
        'requirement_area_co_authors.hsa_id',
        'requirements_specifications.responsible',
        'specification_co_authors.hsa_id',
      ]),
    )
    expect(
      result.find(item => item.permissionType === 'area_co_author')
        ?.canGenerateAi,
    ).toBe(true)
    expect(result.map(item => item.principalHsaId)).not.toContain(
      'SE5560000001-unrelated',
    )
    expect(
      result.find(item => item.permissionType === 'area_owner')
        ?.principalDisplayName,
    ).toBe('SE5560000001-admin1')
  })

  it('requires Admin or PrivacyOfficer to create a review run', async () => {
    const db = {
      transaction: vi.fn(),
    }

    await expect(
      createAccessReviewRun(
        db as never,
        {
          reviewer: {
            displayName: 'Ada Admin',
            hsaId: 'SE5560000001-admin1',
          },
        },
        {
          displayName: 'Rita Reviewer',
          hsaId: 'SE5560000001-reviewer1',
          roles: ['Reviewer'],
        },
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'access_review_role_required' },
    })
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('lets PrivacyOfficer list access review runs without reviewer filtering', async () => {
    const db = {
      query: vi.fn(async () => [
        {
          ...accessReviewRunRow(1),
          reviewerHsaId: 'SE5560000001-admin1',
        },
      ]),
    }

    const runs = await listAccessReviewRuns(db as never, {
      displayName: 'Disa PrivacyOfficer',
      hsaId: 'SE5560000001-privacy1',
      roles: ['PrivacyOfficer'],
    })

    expect(runs).toHaveLength(1)
    expect(db.query).toHaveBeenCalledWith(
      expect.not.stringContaining('WHERE run.reviewer_hsa_id'),
      [],
    )
  })

  it('rejects reviewer-only users even when they are assigned reviewer', async () => {
    const db = {
      query: vi.fn(async (sql: string, parameters?: unknown[]) => {
        if (sql.includes('FROM access_review_runs')) {
          if (parameters?.[0] === 999) return []
          return [
            {
              ...accessReviewRunRow(1),
              reviewerDisplayName: 'Rita Reviewer',
              reviewerHsaId: 'SE5560000001-reviewer1',
            },
          ]
        }
        return accessReviewItemRows([accessReviewSnapshot(1)])
      }),
    }
    const reviewerOnlyActor = {
      displayName: 'Rita Reviewer',
      hsaId: 'SE5560000001-reviewer1',
      roles: ['Reviewer'],
    }

    await expect(
      listAccessReviewRuns(db as never, reviewerOnlyActor),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'access_review_role_required' },
    })
    await expect(
      getAccessReviewRun(db as never, 42, reviewerOnlyActor),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'access_review_role_required' },
    })
    await expect(
      getAccessReviewRun(db as never, 999, reviewerOnlyActor),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'access_review_role_required' },
    })
    await expect(
      decideAccessReviewItem(
        db as never,
        42,
        1,
        { decision: 'approved' },
        reviewerOnlyActor,
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'access_review_role_required' },
    })
  })

  it('blocks creating a second review while one is still open', async () => {
    const queryCalls: string[] = []
    const db = {
      transaction: vi.fn(async callback => {
        await callback({
          query: vi.fn(async (sql: string) => {
            queryCalls.push(sql)
            if (sql.includes('FROM access_review_runs WITH')) {
              return [{ id: 42, status: 'in_review' }]
            }
            return []
          }),
        })
      }),
    }

    await expect(
      createAccessReviewRun(
        db as never,
        {
          reviewer: {
            displayName: 'Ada Admin',
            hsaId: 'SE5560000001-admin1',
          },
        },
        {
          displayName: 'Ada Admin',
          hsaId: 'SE5560000001-admin1',
          roles: ['Admin'],
        },
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'active_access_review_exists' },
    })
    expect(queryCalls.some(sql => sql.includes('UNION ALL'))).toBe(false)
    expect(
      queryCalls.some(sql => sql.includes('INSERT INTO access_review_runs')),
    ).toBe(false)
  })

  it('creates review items in one parameterized bulk insert for small runs', async () => {
    const items = [accessReviewSnapshot(1), accessReviewSnapshot(2)]
    const { db, generatedAt, transactionQueries } = accessReviewCreateDb(items)

    const detail = await createAccessReviewRun(
      db as never,
      {
        generatedAt,
        reviewer: {
          displayName: 'Ada Admin',
          hsaId: 'SE5560000001-admin1',
        },
      },
      {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
        roles: ['Admin'],
      },
    )

    const itemInsertQueries = transactionQueries.filter(query =>
      query.sql.includes('INSERT INTO access_review_items'),
    )
    expect(detail.items).toHaveLength(2)
    expect(itemInsertQueries).toHaveLength(1)
    expect(itemInsertQueries[0].parameters).toHaveLength(22)
    expect(itemInsertQueries[0].sql).toContain('(@0, @1, @2')
    expect(itemInsertQueries[0].sql).toContain('(@11, @12, @13')
    expect(itemInsertQueries[0].parameters?.[9]).toBe(0)
    expect(itemInsertQueries[0].parameters?.[20]).toBe(1)
    expect(itemInsertQueries[0].parameters?.[10]).toBe(
      generatedAt.toISOString(),
    )
    expect(itemInsertQueries[0].parameters?.[21]).toBe(
      generatedAt.toISOString(),
    )
  })

  it('runs the create audit callback inside the review creation transaction', async () => {
    const items = [accessReviewSnapshot(1), accessReviewSnapshot(2)]
    const { db, generatedAt, transactionQueries } = accessReviewCreateDb(items)
    const audit = vi.fn(async (executor, detail) => {
      expect(detail).toEqual({
        itemCount: 2,
        runId: 42,
        status: 'in_review',
      })
      await executor.query('INSERT INTO action_audit_events (...) VALUES (...)')
    })

    await createAccessReviewRun(
      db as never,
      {
        generatedAt,
        reviewer: {
          displayName: 'Ada Admin',
          hsaId: 'SE5560000001-admin1',
        },
      },
      {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
        roles: ['Admin'],
      },
      { audit },
    )

    expect(audit).toHaveBeenCalledTimes(1)
    expect(
      transactionQueries.some(query =>
        query.sql.includes('INSERT INTO action_audit_events'),
      ),
    ).toBe(true)
  })

  it('splits review item inserts into batches below the SQL Server parameter limit', async () => {
    const items = Array.from({ length: 151 }, (_, index) =>
      accessReviewSnapshot(index + 1),
    )
    const { db, generatedAt, transactionQueries } = accessReviewCreateDb(items)

    const detail = await createAccessReviewRun(
      db as never,
      {
        generatedAt,
        reviewer: {
          displayName: 'Ada Admin',
          hsaId: 'SE5560000001-admin1',
        },
      },
      {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
        roles: ['Admin'],
      },
    )

    const itemInsertQueries = transactionQueries.filter(query =>
      query.sql.includes('INSERT INTO access_review_items'),
    )
    expect(detail.items).toHaveLength(151)
    expect(itemInsertQueries).toHaveLength(2)
    expect(itemInsertQueries[0].parameters).toHaveLength(1650)
    expect(itemInsertQueries[1].parameters).toHaveLength(11)
    expect(itemInsertQueries[0].sql).toContain('(@1639, @1640, @1641')
    expect(itemInsertQueries[1].sql).toContain('(@0, @1, @2')
  })

  it('marks an in-review run as cancelled instead of deleting review evidence', async () => {
    const runRow = {
      approvedCount: 0,
      changedCount: 0,
      completedAt: null,
      completedByDisplayName: null,
      completedByHsaId: null,
      createdAt: '2026-05-12T12:00:00.000Z',
      createdByDisplayName: 'Ada Admin',
      createdByHsaId: 'SE5560000001-admin1',
      dueAt: '2026-06-11T12:00:00.000Z',
      externalEvidenceReference: null,
      id: 42,
      itemCount: 1,
      notApplicableCount: 0,
      pendingCount: 1,
      periodEnd: '2027-05-12T12:00:00.000Z',
      periodStart: '2026-05-12T12:00:00.000Z',
      reviewerDisplayName: 'Ada Admin',
      reviewerHsaId: 'SE5560000001-admin1',
      revokeRequiredCount: 0,
      status: 'in_review',
      updatedAt: '2026-05-12T12:00:00.000Z',
    }
    const updateSql: string[] = []
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('UPDATE access_review_runs')) {
          updateSql.push(sql)
          runRow.status = 'cancelled'
          runRow.updatedAt = '2026-05-12T12:30:00.000Z'
          return []
        }
        if (sql.includes('FROM access_review_items')) return []
        return [runRow]
      }),
    }

    const detail = await cancelAccessReviewRun(db as never, 42, {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      roles: ['Admin'],
    })

    expect(detail.run.status).toBe('cancelled')
    expect(updateSql[0]).toContain("status = N'cancelled'")
    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM access_review_runs'),
      expect.anything(),
    )
  })
})
