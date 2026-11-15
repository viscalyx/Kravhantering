import { describe, expect, it, vi } from 'vitest'
import {
  createSpecificationLocalRequirement,
  createSpecificationNeedsReference,
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

describe('requirements specification mutations', () => {
  const appDb = useSqlIntegrationDatabase()

  it('makes new library bindings current even when the application clock is ahead', async () => {
    const db = appDb()
    const area = await createArea(db)
    const published = await createPublishedRequirement(
      db,
      area.id,
      'Immediately current',
    )
    const specification = await createSpecificationFixture(db, 'SQL-CLOCK')
    const [{ now }] = await db.query<Array<{ now: Date }>>(
      'SELECT SYSUTCDATETIME() AS now',
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(now.getTime() + 60_000))
    try {
      expect(
        await linkRequirementsToSpecificationAtomically(db, specification.id, {
          requirementIds: [published.requirementId],
        }),
      ).toBe(1)
      expect(
        await db.query(
          'SELECT requirement_id FROM current_requirement_applications WHERE requirements_specification_id = @0',
          [specification.id],
        ),
      ).toEqual([{ requirement_id: published.requirementId }])
      expect(
        await linkRequirementsToSpecificationAtomically(db, specification.id, {
          requirementIds: [published.requirementId],
          needsReferenceText: 'Duplicate-only clock need',
        }),
      ).toBe(0)
      expect(
        await db.query(
          'SELECT id FROM specification_needs_references WHERE specification_id = @0',
          [specification.id],
        ),
      ).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes an auto-created needs reference when a duplicate-only add links nothing', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Link me once',
    )
    const specification = await createSpecificationFixture(appDb(), 'SQL-LINK')

    await linkRequirementsToSpecificationAtomically(appDb(), specification.id, {
      requirementIds: [published.requirementId],
    })
    await createSpecificationNeedsReference(appDb(), specification.id, {
      description: null,
      text: 'Pre-registered unused need',
    })

    const addedAgain = await linkRequirementsToSpecificationAtomically(
      appDb(),
      specification.id,
      {
        requirementIds: [published.requirementId],
        needsReferenceText: '  Duplicate-only need  ',
      },
    )

    const needsReferences = (await appDb().query(
      `SELECT text
       FROM specification_needs_references
       WHERE specification_id = @0
       ORDER BY text`,
      [specification.id],
    )) as Array<{ text: string }>
    expect(addedAgain).toBe(0)
    expect(needsReferences).toEqual([{ text: 'Pre-registered unused need' }])
  })

  it('creates, updates, and deletes needs references through the shared workflow', async () => {
    const specification = await createSpecificationFixture(
      appDb(),
      'SQL-NEEDS-WORKFLOW',
    )
    const context = await makeRequestContext()
    const service = createRequirementsService(appDb())

    const created = await service.manageNeedsReference(context, {
      description: '  Initial context  ',
      operation: 'create',
      specificationId: specification.id,
      text: '  Initial need  ',
    })
    expect(created).toMatchObject({
      needsReference: {
        description: 'Initial context',
        text: 'Initial need',
      },
    })
    if (!('needsReference' in created)) {
      throw new Error('Expected a created needs reference')
    }

    const updated = await service.manageNeedsReference(context, {
      description: '  Updated context  ',
      needsReferenceId: created.needsReference.id,
      operation: 'update',
      specificationId: specification.id,
      text: '  Updated need  ',
    })
    expect(updated).toMatchObject({
      needsReference: {
        description: 'Updated context',
        id: created.needsReference.id,
        text: 'Updated need',
      },
    })

    await expect(
      service.manageNeedsReference(context, {
        needsReferenceId: created.needsReference.id,
        operation: 'delete',
        specificationId: specification.id,
      }),
    ).resolves.toEqual({
      deletedNeedsReferenceId: created.needsReference.id,
    })
    await expect(
      appDb().query(
        `SELECT id FROM specification_needs_references WHERE specification_id = @0`,
        [specification.id],
      ),
    ).resolves.toEqual([])
  })

  it('leaves needs-reference persistence unchanged after workflow failures', async () => {
    const specification = await createSpecificationFixture(
      appDb(),
      'SQL-NEEDS-FAILURES',
    )
    const context = await makeRequestContext()
    const service = createRequirementsService(appDb())
    const stable = await createSpecificationNeedsReference(
      appDb(),
      specification.id,
      { description: 'Stable description', text: 'Stable need' },
    )
    const linked = await createSpecificationNeedsReference(
      appDb(),
      specification.id,
      { description: null, text: 'Linked need' },
    )
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Library requirement using the linked need',
    )
    await linkRequirementsToSpecificationAtomically(appDb(), specification.id, {
      needsReferenceId: linked.id,
      requirementIds: [published.requirementId],
    })
    await createSpecificationLocalRequirement(appDb(), specification.id, {
      description: 'Local requirement using the linked need',
      needsReferenceId: linked.id,
    })

    await expect(
      service.manageNeedsReference(context, {
        operation: 'create',
        specificationId: specification.id,
        text: '   ',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      service.manageNeedsReference(context, {
        needsReferenceId: stable.id,
        operation: 'update',
        specificationId: specification.id,
        text: 'Linked need',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      service.manageNeedsReference(context, {
        needsReferenceId: 999_999,
        operation: 'update',
        specificationId: specification.id,
        text: 'Missing need',
      }),
    ).rejects.toMatchObject({ code: 'not_found' })
    await expect(
      service.manageNeedsReference(context, {
        needsReferenceId: linked.id,
        operation: 'delete',
        specificationId: specification.id,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })

    const unassignedContext = await makeRequestContext()
    unassignedContext.actor.roles = []
    unassignedContext.actor.hsaId = 'SE5560000001-unassigned-sql-needs'
    await expect(
      service.manageNeedsReference(unassignedContext, {
        operation: 'create',
        specificationId: specification.id,
        text: 'Unauthorized need',
      }),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'specification_author_required' },
    })

    await expect(
      appDb().query(
        `SELECT id, text, description
         FROM specification_needs_references
         WHERE specification_id = @0
         ORDER BY id`,
        [specification.id],
      ),
    ).resolves.toEqual([
      {
        description: 'Stable description',
        id: stable.id,
        text: 'Stable need',
      },
      { description: null, id: linked.id, text: 'Linked need' },
    ])
  })
})
