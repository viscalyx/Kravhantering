import { describe, expect, it } from 'vitest'
import {
  createSpecificationNeedsReference,
  linkRequirementsToSpecificationAtomically,
} from '@/lib/dal/requirements-specifications'
import {
  createArea,
  createPublishedRequirement,
  createSpecificationFixture,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

describe('requirements specification mutations', () => {
  const appDb = useSqlIntegrationDatabase()

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
})
