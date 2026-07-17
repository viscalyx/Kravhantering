import { describe, expect, it } from 'vitest'
import {
  createSpecificationLocalRequirement,
  linkRequirementsToSpecificationAtomically,
} from '@/lib/dal/requirements-specifications'
import { REQUIREMENT_SORT_FIELDS } from '@/lib/requirements/list-view'
import { querySpecificationItemPage } from '@/lib/requirements/specification-item-page'
import {
  createArea,
  createPublishedRequirement,
  createSpecificationFixture,
  useSqlIntegrationDatabase,
} from './sql-test-database'

describe('specification item pagination', () => {
  const appDb = useSqlIntegrationDatabase()

  it('traverses mixed item pages for every sort and survives a deleted anchor', async () => {
    const area = await createArea(appDb())
    const published = await Promise.all(
      ['Alpha library', 'Beta library', 'Gamma library'].map(description =>
        createPublishedRequirement(appDb(), area.id, description),
      ),
    )
    const specification = await createSpecificationFixture(
      appDb(),
      'SQL-PAGING',
    )
    await linkRequirementsToSpecificationAtomically(appDb(), specification.id, {
      requirementIds: published.map(item => item.requirementId),
    })
    for (const description of ['Alpha local', 'Beta local', 'Gamma local']) {
      await createSpecificationLocalRequirement(appDb(), specification.id, {
        description,
      })
    }

    for (const sortBy of REQUIREMENT_SORT_FIELDS) {
      for (const direction of ['asc', 'desc'] as const) {
        const page = await querySpecificationItemPage(appDb(), {
          limit: 100,
          locale: 'sv',
          sort: { by: sortBy, direction },
          specificationId: specification.id,
        })
        expect(page.items).toHaveLength(6)
        expect(page.pagination).toMatchObject({
          count: 6,
          hasMore: false,
          nextCursor: null,
        })
        expect(new Set(page.items.map(item => item.itemRef)).size).toBe(6)
      }
    }

    const traversed: string[] = []
    let cursor: string | undefined
    do {
      const page = await querySpecificationItemPage(appDb(), {
        cursor,
        limit: cursor ? 1 : 2,
        specificationId: specification.id,
      })
      traversed.push(...page.items.map(item => item.itemRef ?? ''))
      cursor = page.pagination.nextCursor ?? undefined
    } while (cursor)
    expect(traversed).toHaveLength(6)
    expect(new Set(traversed).size).toBe(6)

    const firstPage = await querySpecificationItemPage(appDb(), {
      limit: 2,
      specificationId: specification.id,
    })
    const formerAnchor = firstPage.items.at(-1)?.itemRef
    if (!formerAnchor || !firstPage.pagination.nextCursor) {
      throw new Error('Expected a continuation boundary.')
    }
    const [kind, rawId] = formerAnchor.split(':')
    await appDb().query(
      kind === 'lib'
        ? 'DELETE FROM requirements_specification_items WHERE id = @0'
        : 'DELETE FROM specification_local_requirements WHERE id = @0',
      [Number(rawId)],
    )
    await expect(
      querySpecificationItemPage(appDb(), {
        cursor: firstPage.pagination.nextCursor,
        limit: 1,
        specificationId: specification.id,
      }),
    ).resolves.toMatchObject({ pagination: { limit: 1 } })
  })
})
