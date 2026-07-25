import { describe, expect, it } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import {
  createSpecificationWithAudit,
  deleteSpecificationWithAudit,
  updateSpecificationWithAudit,
} from '@/lib/requirements/specification-mutations'
import {
  createSpecificationFixture,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

interface ActionAuditRow {
  action: string
  actorHsaId: string | null
  detailsJson: string | null
  targetId: string | null
  targetKind: string
  targetUniqueId: string | null
}

async function actionRows(
  db: SqlServerDatabase,
  specificationId?: number,
): Promise<ActionAuditRow[]> {
  const targetClause = specificationId == null ? '' : 'AND target_id = @0'
  return db.query(
    `SELECT
       action,
       actor_hsa_id AS actorHsaId,
       details_json AS detailsJson,
       target_id AS targetId,
       target_kind AS targetKind,
       target_unique_id AS targetUniqueId
     FROM action_audit_events
     WHERE action IN (
       N'specification.create',
       N'specification.update',
       N'specification.delete'
     )
       ${targetClause}
     ORDER BY occurred_at, id`,
    specificationId == null ? [] : [String(specificationId)],
  )
}

async function specificationRows(
  db: SqlServerDatabase,
  specificationCode: string,
): Promise<Array<{ name: string; specificationLifecycleStatusId: number }>> {
  return db.query(
    `SELECT
       name,
       specification_lifecycle_status_id AS specificationLifecycleStatusId
     FROM requirements_specifications
     WHERE specification_code = @0`,
    [specificationCode],
  )
}

async function waitForDeleteRaceMarker(db: SqlServerDatabase): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = (await db.query(
      `SELECT TOP (1) marker
       FROM specification_delete_race_coordination WITH (NOLOCK)`,
    )) as Array<{ marker: number }>
    if (rows.length > 0) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('Timed out waiting for the specification delete race marker')
}

describe('requirements specification audited mutations', () => {
  const appDb = useSqlIntegrationDatabase()

  it('commits exactly one durable Action-log row for create, update, and delete', async () => {
    const context = await makeRequestContext()
    const specification = await createSpecificationWithAudit(
      appDb(),
      {
        businessNeedsReference: 'Private business need',
        name: 'Audited SQL specification',
        responsibleHsaId: 'SE5560000001-sqltest1',
        responsiblePerson: {
          email: null,
          givenName: 'SQL',
          hsaId: 'SE5560000001-sqltest1',
          middleName: null,
          surname: 'Integration Test',
        },
        specificationCode: 'AUDIT-SPEC-SQL',
        specificationLifecycleStatusId: 4,
      },
      context,
    )

    await expect(
      updateSpecificationWithAudit(
        appDb(),
        specification.id,
        {
          name: 'Updated private name',
          specificationLifecycleStatusId: 3,
        },
        context,
      ),
    ).resolves.toMatchObject({ status: 'updated' })
    await expect(
      deleteSpecificationWithAudit(appDb(), specification.id, context),
    ).resolves.toEqual({ status: 'deleted' })

    const rows = await actionRows(appDb(), specification.id)
    expect(rows).toHaveLength(3)
    expect(rows.map(row => row.action)).toEqual([
      'specification.create',
      'specification.update',
      'specification.delete',
    ])
    expect(
      rows.every(
        row =>
          row.actorHsaId === 'SE5560000001-sqltest1' &&
          row.targetId === String(specification.id) &&
          row.targetKind === 'RequirementsSpecification' &&
          row.targetUniqueId === 'AUDIT-SPEC-SQL',
      ),
    ).toBe(true)
    expect(rows.map(row => JSON.parse(row.detailsJson ?? '{}'))).toEqual([
      { specificationLifecycleStatusId: 4 },
      {
        changedFields: ['name', 'specificationLifecycleStatusId'],
        newSpecificationLifecycleStatusId: 3,
        previousSpecificationLifecycleStatusId: 4,
      },
      { specificationLifecycleStatusId: 3 },
    ])
    expect(JSON.stringify(rows)).not.toContain('Private business need')
    expect(JSON.stringify(rows)).not.toContain('Updated private name')
  })

  it('rolls back every business mutation when its Action-log insert fails', async () => {
    await appDb().query(
      `CREATE TRIGGER fail_specification_action_audit
       ON action_audit_events
       AFTER INSERT
       AS
       BEGIN
         SET NOCOUNT ON;
         IF EXISTS (
           SELECT 1
           FROM inserted
           WHERE action IN (
             N'specification.create',
             N'specification.update',
             N'specification.delete'
           )
         )
           THROW 51000, 'Injected specification Action-log failure', 1;
       END`,
    )

    try {
      const context = await makeRequestContext()
      await expect(
        createSpecificationWithAudit(
          appDb(),
          {
            name: 'Rolled back create',
            responsibleHsaId: 'SE5560000001-sqltest1',
            responsiblePerson: {
              email: null,
              givenName: 'SQL',
              hsaId: 'SE5560000001-sqltest1',
              middleName: null,
              surname: 'Integration Test',
            },
            specificationCode: 'ROLLBACK-CREATE-SQL',
            specificationLifecycleStatusId: 4,
          },
          context,
        ),
      ).rejects.toThrow('Injected specification Action-log failure')
      expect(
        await specificationRows(appDb(), 'ROLLBACK-CREATE-SQL'),
      ).toHaveLength(0)

      const specification = await createSpecificationFixture(
        appDb(),
        'ROLLBACK-UPDATE-DELETE-SQL',
      )
      await expect(
        updateSpecificationWithAudit(
          appDb(),
          specification.id,
          {
            name: 'Must roll back',
            specificationLifecycleStatusId: 3,
          },
          context,
        ),
      ).rejects.toThrow('Injected specification Action-log failure')
      expect(
        await specificationRows(appDb(), 'ROLLBACK-UPDATE-DELETE-SQL'),
      ).toEqual([
        {
          name: 'ROLLBACK-UPDATE-DELETE-SQL specification',
          specificationLifecycleStatusId: 4,
        },
      ])

      await expect(
        deleteSpecificationWithAudit(appDb(), specification.id, context),
      ).rejects.toThrow('Injected specification Action-log failure')
      expect(
        await specificationRows(appDb(), 'ROLLBACK-UPDATE-DELETE-SQL'),
      ).toHaveLength(1)
    } finally {
      await appDb().query(
        'DROP TRIGGER IF EXISTS fail_specification_action_audit',
      )
    }
  })

  it('returns not_found without an Action-log row for update and delete', async () => {
    const context = await makeRequestContext()
    const missingUpdateId = 2_000_000_000
    const missingDeleteId = 1_999_999_999

    await expect(
      updateSpecificationWithAudit(
        appDb(),
        missingUpdateId,
        { name: 'Missing' },
        context,
      ),
    ).resolves.toEqual({ status: 'not_found' })
    await expect(
      deleteSpecificationWithAudit(appDb(), missingDeleteId, context),
    ).resolves.toEqual({ status: 'not_found' })

    expect(await actionRows(appDb(), missingUpdateId)).toHaveLength(0)
    expect(await actionRows(appDb(), missingDeleteId)).toHaveLength(0)
  })

  it('serializes update against delete so committed data and evidence agree', async () => {
    const specification = await createSpecificationFixture(
      appDb(),
      'DELETE-RACE-SQL',
    )
    await appDb().query(
      `CREATE TABLE specification_delete_race_coordination (
         marker int NOT NULL
       )`,
    )
    await appDb().query(
      `CREATE TRIGGER coordinate_specification_delete_race
       ON requirements_specifications
       AFTER DELETE
       AS
       BEGIN
         SET NOCOUNT ON;
         IF EXISTS (
           SELECT 1
           FROM deleted
           WHERE specification_code = N'DELETE-RACE-SQL'
         )
         BEGIN
           INSERT INTO specification_delete_race_coordination (marker)
           VALUES (1);
           WAITFOR DELAY '00:00:02';
         END
       END`,
    )

    try {
      const deletePromise = deleteSpecificationWithAudit(
        appDb(),
        specification.id,
        await makeRequestContext(),
      )
      await waitForDeleteRaceMarker(appDb())
      const updatePromise = updateSpecificationWithAudit(
        appDb(),
        specification.id,
        { name: 'Racing update' },
        await makeRequestContext(),
      )

      const [deleted, updated] = await Promise.all([
        deletePromise,
        updatePromise,
      ])

      expect(deleted).toEqual({ status: 'deleted' })
      expect(updated).toEqual({ status: 'not_found' })
      expect(await specificationRows(appDb(), 'DELETE-RACE-SQL')).toHaveLength(
        0,
      )
      const rows = await actionRows(appDb(), specification.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        action: 'specification.delete',
        targetId: String(specification.id),
        targetUniqueId: 'DELETE-RACE-SQL',
      })
    } finally {
      await appDb().query(
        'DROP TRIGGER IF EXISTS coordinate_specification_delete_race',
      )
      await appDb().query(
        'DROP TABLE IF EXISTS specification_delete_race_coordination',
      )
    }
  })
})
