import { describe, expect, it } from 'vitest'
import {
  createSpecificationLocalRequirement,
  linkRequirementsToSpecificationAtomically,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { createRequirementsService } from '@/lib/requirements/service'
import {
  createArea,
  createPublishedRequirement,
  createSpecificationFixture,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

interface LinkedLibraryItemFixture {
  libraryItemId: number
  publishedRequirementId: number
  specification: { id: number }
}

interface RemovalAuditRow {
  decision: string
  detailsJson: string | null
  targetId: string | null
  targetKind: string
}

async function seedLinkedLibraryItem(
  db: SqlServerDatabase,
  specificationCode: string,
  requirementDescription: string,
): Promise<LinkedLibraryItemFixture> {
  const area = await createArea(db)
  const published = await createPublishedRequirement(
    db,
    area.id,
    requirementDescription,
  )
  const specification = await createSpecificationFixture(db, specificationCode)
  await linkRequirementsToSpecificationAtomically(db, specification.id, {
    requirementIds: [published.requirementId],
  })
  const libraryRows = (await db.query(
    `SELECT id
     FROM requirements_specification_items
     WHERE requirements_specification_id = @0 AND requirement_id = @1`,
    [specification.id, published.requirementId],
  )) as Array<{ id: number }>
  const libraryItemId = libraryRows[0]?.id
  if (libraryItemId == null) {
    throw new Error('Failed to seed a linked library requirement')
  }
  return {
    libraryItemId,
    publishedRequirementId: published.requirementId,
    specification,
  }
}

async function removalAuditRows(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<RemovalAuditRow[]> {
  return db.query(
    `SELECT
       decision,
       details_json AS detailsJson,
       target_id AS targetId,
       target_kind AS targetKind
     FROM action_audit_events
     WHERE action = @0 AND target_id = @1
     ORDER BY id`,
    ['specification.requirements.removed', String(specificationId)],
  )
}

describe('requirement application mutation workflow', () => {
  const appDb = useSqlIntegrationDatabase()

  it('updates library and specification-local fields through one workflow', async () => {
    const { libraryItemId, specification } = await seedLinkedLibraryItem(
      appDb(),
      'SQL-APPLICATION-UPDATE',
      'Workflow library requirement',
    )
    const local = await createSpecificationLocalRequirement(
      appDb(),
      specification.id,
      { description: 'Workflow local requirement' },
    )

    const outcome = await createRequirementsService(
      appDb(),
    ).mutateRequirementApplications(await makeRequestContext(), {
      fields: { note: 'One workflow update' },
      itemRefs: [`lib:${libraryItemId}`, `local:${local.id}`],
      operation: 'update',
      specificationId: specification.id,
    })

    expect(outcome).toEqual({ operation: 'update', updatedCount: 2 })
    await expect(
      appDb().query(
        `SELECT note
         FROM requirements_specification_items
         WHERE id = @0`,
        [libraryItemId],
      ),
    ).resolves.toEqual([{ note: 'One workflow update' }])
    await expect(
      appDb().query(
        `SELECT note
         FROM specification_local_requirements
         WHERE id = @0`,
        [local.id],
      ),
    ).resolves.toEqual([{ note: 'One workflow update' }])
  })

  it('removes mixed item kinds atomically through the same workflow', async () => {
    const { libraryItemId, specification } = await seedLinkedLibraryItem(
      appDb(),
      'SQL-APPLICATION-REMOVE',
      'Workflow removal requirement',
    )
    const local = await createSpecificationLocalRequirement(
      appDb(),
      specification.id,
      { description: 'Workflow removal local requirement' },
    )

    const outcome = await createRequirementsService(
      appDb(),
    ).mutateRequirementApplications(await makeRequestContext(), {
      itemRefs: [`lib:${libraryItemId}`, `local:${local.id}`],
      operation: 'remove',
      specificationId: specification.id,
    })

    expect(outcome).toEqual({
      operation: 'remove',
      removedCount: 2,
      removedLibraryCount: 1,
      removedSpecificationLocalCount: 1,
    })
    const remaining = (await appDb().query(
      `SELECT (
         SELECT COUNT(*) FROM requirements_specification_items
         WHERE requirements_specification_id = @0
       ) + (
         SELECT COUNT(*) FROM specification_local_requirements
         WHERE specification_id = @0
       ) AS count`,
      [specification.id],
    )) as Array<{ count: number }>
    expect(Number(remaining[0]?.count)).toBe(0)

    const auditRows = await removalAuditRows(appDb(), specification.id)
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]).toMatchObject({
      decision: 'allowed',
      targetId: String(specification.id),
      targetKind: 'RequirementsSpecification',
    })
    expect(JSON.parse(auditRows[0]?.detailsJson ?? '{}')).toMatchObject({
      operation: 'remove_from_specification',
      removedCount: 2,
      requirementCount: 2,
      specificationId: specification.id,
    })
  })

  it('removes requirement identifiers while retaining specification-local items', async () => {
    const { publishedRequirementId, specification } =
      await seedLinkedLibraryItem(
        appDb(),
        'SQL-APPLICATION-REQUIREMENT-REMOVE',
        'Workflow requirement-id removal',
      )
    const local = await createSpecificationLocalRequirement(
      appDb(),
      specification.id,
      { description: 'Retained local requirement' },
    )

    const outcome = await createRequirementsService(
      appDb(),
    ).mutateRequirementApplications(await makeRequestContext(), {
      operation: 'remove',
      requirementIds: [publishedRequirementId],
      specificationId: specification.id,
    })

    expect(outcome).toEqual({
      operation: 'remove',
      removedCount: 1,
      removedLibraryCount: 1,
      removedSpecificationLocalCount: 0,
    })
    await expect(
      appDb().query(
        `SELECT COUNT(*) AS count
         FROM requirements_specification_items
         WHERE requirements_specification_id = @0`,
        [specification.id],
      ),
    ).resolves.toEqual([{ count: 0 }])
    await expect(
      appDb().query(
        `SELECT id
         FROM specification_local_requirements
         WHERE specification_id = @0`,
        [specification.id],
      ),
    ).resolves.toEqual([{ id: local.id }])

    const auditRows = await removalAuditRows(appDb(), specification.id)
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]).toMatchObject({
      decision: 'allowed',
      targetId: String(specification.id),
      targetKind: 'RequirementsSpecification',
    })
    expect(JSON.parse(auditRows[0]?.detailsJson ?? '{}')).toMatchObject({
      operation: 'remove_from_specification',
      removedCount: 1,
      requirementCount: 1,
      specificationId: specification.id,
    })
  })

  it('rejects a claimed and stored parent mismatch without mutation', async () => {
    const { libraryItemId } = await seedLinkedLibraryItem(
      appDb(),
      'SQL-APPLICATION-STORED-PARENT',
      'Foreign-parent workflow requirement',
    )
    const claimedParent = await createSpecificationFixture(
      appDb(),
      'SQL-APPLICATION-CLAIMED-PARENT',
    )

    await expect(
      createRequirementsService(appDb()).mutateRequirementApplications(
        await makeRequestContext(),
        {
          fields: { note: 'Must not be written' },
          itemRefs: [`lib:${libraryItemId}`],
          operation: 'update',
          specificationId: claimedParent.id,
        },
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'foreign_specification_child' },
    })
    await expect(
      appDb().query(
        `SELECT note
         FROM requirements_specification_items
         WHERE id = @0`,
        [libraryItemId],
      ),
    ).resolves.toEqual([{ note: null }])
    await expect(
      appDb().query(
        `SELECT decision, denial_reason AS denialReason
         FROM action_audit_events
         WHERE action = @0 AND target_id = @1`,
        [
          'specification.requirement_application.update.denied',
          String(claimedParent.id),
        ],
      ),
    ).resolves.toEqual([
      {
        decision: 'denied',
        denialReason: 'foreign_specification_child',
      },
    ])
  })
})
