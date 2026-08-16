import { describe, expect, it } from 'vitest'
import {
  createSpecificationLocalRequirement,
  linkRequirementsToSpecificationAtomically,
} from '@/lib/dal/requirements-specifications'
import { createRequirementsService } from '@/lib/requirements/service'
import {
  createArea,
  createPublishedRequirement,
  createSpecificationFixture,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

describe('requirement application mutation workflow', () => {
  const appDb = useSqlIntegrationDatabase()

  it('updates library and specification-local fields through one workflow', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Workflow library requirement',
    )
    const specification = await createSpecificationFixture(
      appDb(),
      'SQL-APPLICATION-UPDATE',
    )
    await linkRequirementsToSpecificationAtomically(appDb(), specification.id, {
      requirementIds: [published.requirementId],
    })
    const libraryRows = (await appDb().query(
      `SELECT id
       FROM requirements_specification_items
       WHERE requirements_specification_id = @0 AND requirement_id = @1`,
      [specification.id, published.requirementId],
    )) as Array<{ id: number }>
    const libraryItemId = libraryRows[0]?.id
    expect(libraryItemId).toBeTypeOf('number')
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
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Workflow removal requirement',
    )
    const specification = await createSpecificationFixture(
      appDb(),
      'SQL-APPLICATION-REMOVE',
    )
    await linkRequirementsToSpecificationAtomically(appDb(), specification.id, {
      requirementIds: [published.requirementId],
    })
    const libraryRows = (await appDb().query(
      `SELECT id
       FROM requirements_specification_items
       WHERE requirements_specification_id = @0 AND requirement_id = @1`,
      [specification.id, published.requirementId],
    )) as Array<{ id: number }>
    const libraryItemId = libraryRows[0]?.id
    expect(libraryItemId).toBeTypeOf('number')
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
  })

  it('rejects a claimed and stored parent mismatch without mutation', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Foreign-parent workflow requirement',
    )
    const storedParent = await createSpecificationFixture(
      appDb(),
      'SQL-APPLICATION-STORED-PARENT',
    )
    const claimedParent = await createSpecificationFixture(
      appDb(),
      'SQL-APPLICATION-CLAIMED-PARENT',
    )
    await linkRequirementsToSpecificationAtomically(appDb(), storedParent.id, {
      requirementIds: [published.requirementId],
    })
    const rows = (await appDb().query(
      `SELECT id, note
       FROM requirements_specification_items
       WHERE requirements_specification_id = @0 AND requirement_id = @1`,
      [storedParent.id, published.requirementId],
    )) as Array<{ id: number; note: string | null }>
    const libraryItemId = rows[0]?.id
    expect(libraryItemId).toBeTypeOf('number')

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
  })
})
