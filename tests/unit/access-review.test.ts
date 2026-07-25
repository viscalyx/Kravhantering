import { describe, expect, it, vi } from 'vitest'
import {
  type AccessReviewPrincipalSnapshot,
  cancelAccessReviewRun,
  collectAccessReviewAssignments,
  completeAccessReviewRun,
  createAccessReviewRun,
  decideAccessReviewItem,
  getAccessReviewRun,
  listAccessReviewRuns,
} from '@/lib/access-review/service'

function accessReviewSnapshot(index: number): AccessReviewPrincipalSnapshot {
  return {
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

const adminActor = {
  displayName: 'Ada Admin',
  hsaId: 'SE5560000001-admin1',
  roles: ['Admin'],
}

function accessReviewMutationDb(
  options: {
    comment?: string | null
    decision?: string
    itemUpdateCount?: number
    pendingCount?: number
    runUpdateCount?: number
    status?: string
  } = {},
) {
  let comment = options.comment ?? null
  let decision = options.decision ?? 'pending'
  let status = options.status ?? 'in_review'
  const transactionQueries: { parameters?: unknown[]; sql: string }[] = []
  const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
    transactionQueries.push({ parameters, sql })
    if (sql.includes('FROM access_review_runs WITH (UPDLOCK, HOLDLOCK)')) {
      return [{ id: 42, status }]
    }
    if (sql.includes('FROM access_review_items WITH (UPDLOCK, HOLDLOCK)')) {
      if (sql.includes('COUNT(*)')) {
        return [
          {
            pendingCount:
              options.pendingCount ?? (decision === 'pending' ? 1 : 0),
          },
        ]
      }
      return [{ comment, decision }]
    }
    if (sql.includes('UPDATE access_review_items')) {
      const count = options.itemUpdateCount ?? 1
      if (count === 1) {
        decision = String(parameters?.[0])
        comment = parameters?.[4] == null ? null : String(parameters[4])
      }
      return Array.from({ length: count }, () => ({ id: 7 }))
    }
    if (sql.includes('UPDATE access_review_runs')) {
      const count = options.runUpdateCount ?? 1
      if (count === 1 && sql.includes("status = N'completed'")) {
        status = 'completed'
      }
      if (count === 1 && sql.includes("status = N'cancelled'")) {
        status = 'cancelled'
      }
      return Array.from({ length: count }, () => ({ id: 42 }))
    }
    if (sql.includes('FROM access_review_runs run')) {
      return [
        {
          ...accessReviewRunRow(1),
          approvedCount: decision === 'approved' ? 1 : 0,
          changedCount: decision === 'changed' ? 1 : 0,
          notApplicableCount: decision === 'not_applicable' ? 1 : 0,
          pendingCount: decision === 'pending' ? 1 : 0,
          revokeRequiredCount: decision === 'revoke_required' ? 1 : 0,
          status,
        },
      ]
    }
    if (sql.includes('FROM access_review_items')) {
      return [
        {
          ...accessReviewItemRows([accessReviewSnapshot(1)])[0],
          comment,
          decidedAt: decision === 'pending' ? null : '2026-05-12T12:30:00.000Z',
          decidedByDisplayName: decision === 'pending' ? null : 'Ada Admin',
          decidedByHsaId: decision === 'pending' ? null : 'SE5560000001-admin1',
          decision,
          id: 7,
        },
      ]
    }
    return []
  })
  const db = {
    query: vi.fn(async () => {
      throw new Error('Mutation reads must use the transaction executor')
    }),
    transaction: vi.fn(async (_isolation, callback) => callback({ query })),
  }
  return { db, transactionQueries }
}

describe('access review service', () => {
  it('collects app-managed assignments', async () => {
    const rows = [
      {
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
    expect(result.map(item => item.permissionType)).toContain('area_co_author')
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

  it('uses ordered defaults for a review period', async () => {
    const items = [accessReviewSnapshot(1)]
    const { db, generatedAt, transactionQueries } = accessReviewCreateDb(items)

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
    )

    const runInsert = transactionQueries.find(query =>
      query.sql.includes('INSERT INTO access_review_runs'),
    )
    expect(runInsert?.parameters?.slice(0, 3)).toEqual([
      '2026-05-12T12:00:00.000Z',
      '2027-05-12T12:00:00.000Z',
      '2026-06-11T12:00:00.000Z',
    ])
  })

  it('rejects a default-derived reversed review period before opening a transaction', async () => {
    const db = { transaction: vi.fn() }

    await expect(
      createAccessReviewRun(
        db as never,
        {
          generatedAt: new Date('2026-05-12T12:00:00.000Z'),
          periodEnd: new Date('2026-05-12T11:59:59.999Z'),
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
      code: 'validation',
      details: { reason: 'access_review_period_out_of_order' },
    })
    expect(db.transaction).not.toHaveBeenCalled()
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
    expect(itemInsertQueries[0].parameters).toHaveLength(20)
    expect(itemInsertQueries[0].sql).toContain('(@0, @1, @2')
    expect(itemInsertQueries[0].sql).toContain('(@10, @11, @12')
    expect(itemInsertQueries[0].parameters?.[9]).toBe(generatedAt.toISOString())
    expect(itemInsertQueries[0].parameters?.[19]).toBe(
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
    expect(itemInsertQueries[0].parameters).toHaveLength(1500)
    expect(itemInsertQueries[1].parameters).toHaveLength(10)
    expect(itemInsertQueries[0].sql).toContain('(@1490, @1491, @1492')
    expect(itemInsertQueries[1].sql).toContain('(@0, @1, @2')
  })

  it('serializes decision revisions behind the run lock and audits the applied revision', async () => {
    const { db, transactionQueries } = accessReviewMutationDb({
      comment: 'Original',
      decision: 'approved',
    })
    const audit = vi.fn()

    const result = await decideAccessReviewItem(
      db as never,
      42,
      7,
      { comment: '  Revised  ', decision: 'changed' },
      adminActor,
      { audit },
    )

    expect(db.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    expect(transactionQueries[0]?.sql).toContain(
      'FROM access_review_runs WITH (UPDLOCK, HOLDLOCK)',
    )
    expect(transactionQueries[1]?.sql).toContain(
      'FROM access_review_items WITH (UPDLOCK, HOLDLOCK)',
    )
    const itemUpdate = transactionQueries.find(query =>
      query.sql.includes('UPDATE access_review_items'),
    )
    expect(itemUpdate?.sql).toContain("status IN (N'draft', N'in_review')")
    expect(itemUpdate?.sql).toContain('OUTPUT INSERTED.id AS id')
    expect(itemUpdate?.parameters?.[4]).toBe('Revised')
    expect(result.applied).toBe(true)
    expect(result.detail.items[0]).toMatchObject({
      comment: 'Revised',
      decision: 'changed',
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      { decision: 'changed', itemId: 7, runId: 42 },
    )
    expect(db.query).not.toHaveBeenCalled()
  })

  it('treats an identical normalized decision retry as a no-op', async () => {
    const { db, transactionQueries } = accessReviewMutationDb({
      comment: null,
      decision: 'approved',
    })
    const audit = vi.fn()

    const result = await decideAccessReviewItem(
      db as never,
      42,
      7,
      { comment: '   ', decision: 'approved' },
      adminActor,
      { audit },
    )

    expect(result.applied).toBe(false)
    expect(result.detail.items[0]?.decidedAt).toBe('2026-05-12T12:30:00.000Z')
    expect(
      transactionQueries.some(query =>
        query.sql.includes('UPDATE access_review_items'),
      ),
    ).toBe(false)
    expect(audit).not.toHaveBeenCalled()
  })

  it('keeps decision fields immutable after either terminal state', async () => {
    for (const status of ['completed', 'cancelled']) {
      const { db, transactionQueries } = accessReviewMutationDb({ status })

      await expect(
        decideAccessReviewItem(
          db as never,
          42,
          7,
          { decision: 'approved' },
          adminActor,
        ),
      ).rejects.toMatchObject({
        code: 'conflict',
        details: { reason: 'access_review_closed', status },
      })
      expect(transactionQueries).toHaveLength(1)
    }
  })

  it('asserts the affected row count for conditional decision updates', async () => {
    const { db } = accessReviewMutationDb({ itemUpdateCount: 0 })

    await expect(
      decideAccessReviewItem(
        db as never,
        42,
        7,
        { decision: 'approved' },
        adminActor,
      ),
    ).rejects.toThrow(
      'Access review item decision expected to update one row but updated 0',
    )
  })

  it('checks pending items after locking the run in the completion transaction', async () => {
    const { db, transactionQueries } = accessReviewMutationDb({
      pendingCount: 1,
    })

    await expect(
      completeAccessReviewRun(db as never, 42, adminActor),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: {
        pendingCount: 1,
        reason: 'access_review_pending_items',
      },
    })
    expect(transactionQueries[0]?.sql).toContain(
      'FROM access_review_runs WITH (UPDLOCK, HOLDLOCK)',
    )
    expect(transactionQueries[1]?.sql).toContain(
      'FROM access_review_items WITH (UPDLOCK, HOLDLOCK)',
    )
    expect(
      transactionQueries.some(query =>
        query.sql.includes('UPDATE access_review_runs'),
      ),
    ).toBe(false)
  })

  it.each([
    ['deadlock victim', { number: 1205 }],
    ['lock timeout', { driverError: { number: '1222' } }],
  ])(
    'maps a transient SQL Server %s failure to a retryable service error',
    async (_failure, transactionError) => {
      const db = {
        transaction: vi.fn().mockRejectedValue(transactionError),
      }

      await expect(
        completeAccessReviewRun(db as never, 42, adminActor),
      ).rejects.toMatchObject({
        code: 'service_unavailable',
        details: { reason: 'access_review_completion_retry' },
        status: 503,
      })
    },
  )

  it('preserves unrelated database failures during completion', async () => {
    const transactionError = Object.assign(new Error('SQL failure'), {
      number: 2627,
    })
    const db = {
      transaction: vi.fn().mockRejectedValue(transactionError),
    }

    await expect(
      completeAccessReviewRun(db as never, 42, adminActor),
    ).rejects.toBe(transactionError)
  })

  it('returns the winning terminal retry as a no-op and rejects the opposing transition', async () => {
    const completed = accessReviewMutationDb({
      decision: 'approved',
      status: 'completed',
    })
    const completedAudit = vi.fn()
    const completionRetry = await completeAccessReviewRun(
      completed.db as never,
      42,
      adminActor,
      { audit: completedAudit },
    )
    expect(completionRetry.applied).toBe(false)
    expect(completionRetry.detail.run.status).toBe('completed')
    expect(completedAudit).not.toHaveBeenCalled()
    await expect(
      cancelAccessReviewRun(completed.db as never, 42, adminActor),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'access_review_completed' },
    })

    const cancelled = accessReviewMutationDb({ status: 'cancelled' })
    const cancelledAudit = vi.fn()
    const cancellationRetry = await cancelAccessReviewRun(
      cancelled.db as never,
      42,
      adminActor,
      { audit: cancelledAudit },
    )
    expect(cancellationRetry.applied).toBe(false)
    expect(cancellationRetry.detail.run.status).toBe('cancelled')
    expect(cancelledAudit).not.toHaveBeenCalled()
    await expect(
      completeAccessReviewRun(cancelled.db as never, 42, adminActor),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'access_review_cancelled' },
    })
  })

  it('marks an in-review run cancelled atomically and audits inside the transaction', async () => {
    const { db, transactionQueries } = accessReviewMutationDb()
    const audit = vi.fn(async executor => {
      await executor.query('INSERT INTO action_audit_events (...) VALUES (...)')
    })

    const result = await cancelAccessReviewRun(db as never, 42, adminActor, {
      audit,
    })

    expect(result).toMatchObject({
      applied: true,
      detail: { run: { status: 'cancelled' } },
    })
    expect(db.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    expect(transactionQueries[0]?.sql).toContain(
      'FROM access_review_runs WITH (UPDLOCK, HOLDLOCK)',
    )
    const update = transactionQueries.find(query =>
      query.sql.includes('UPDATE access_review_runs'),
    )
    expect(update?.sql).toContain("status IN (N'draft', N'in_review')")
    expect(update?.sql).toContain('OUTPUT INSERTED.id AS id')
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      { itemCount: 1, runId: 42, status: 'cancelled' },
    )
    expect(
      transactionQueries.some(query =>
        query.sql.includes('DELETE FROM access_review_runs'),
      ),
    ).toBe(false)
  })

  it('audits completion after its conditional update and transaction-local response read', async () => {
    const { db, transactionQueries } = accessReviewMutationDb({
      decision: 'approved',
      pendingCount: 0,
    })
    const audit = vi.fn()

    const result = await completeAccessReviewRun(db as never, 42, adminActor, {
      audit,
    })

    expect(result.applied).toBe(true)
    expect(result.detail.run.status).toBe('completed')
    const updateIndex = transactionQueries.findIndex(query =>
      query.sql.includes('UPDATE access_review_runs'),
    )
    const responseReadIndex = transactionQueries.findIndex(query =>
      query.sql.includes('FROM access_review_runs run'),
    )
    expect(updateIndex).toBeGreaterThan(0)
    expect(responseReadIndex).toBeGreaterThan(updateIndex)
    expect(transactionQueries[updateIndex]?.sql).toContain('NOT EXISTS')
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      { itemCount: 1, runId: 42, status: 'completed' },
    )
  })

  it('asserts the affected row count for a terminal conditional update', async () => {
    const { db } = accessReviewMutationDb({ runUpdateCount: 0 })

    await expect(
      cancelAccessReviewRun(db as never, 42, adminActor),
    ).rejects.toThrow(
      'Access review cancellation expected to update one row but updated 0',
    )
  })
})
