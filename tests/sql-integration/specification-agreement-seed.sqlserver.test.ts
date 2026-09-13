import { describe, expect, it } from 'vitest'
import { seedDemoDatabase } from '@/typeorm/seed.mjs'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

describe('agreement demo data', () => {
  const database = useSqlIntegrationDatabase()
  it('seeds coherent original, current, future and correction contexts without duplicating them on repeat', async () => {
    const db = database()
    await seedDemoDatabase(db)
    const counts = () =>
      db.query(`SELECT specification.id, COUNT(amendment.id) AS amendments
      FROM requirements_specifications specification LEFT JOIN specification_amendments amendment ON amendment.specification_id = specification.id
      WHERE specification.id IN (3, 4, 5) GROUP BY specification.id ORDER BY specification.id`)
    expect(await counts()).toEqual([
      { id: 3, amendments: 0 },
      { id: 4, amendments: 1 },
      { id: 5, amendments: 3 },
    ])
    const current = await db.query(
      'SELECT id FROM current_requirement_applications WHERE requirements_specification_id = 5 ORDER BY id',
    )
    expect(current).toEqual([{ id: 22 }, { id: 132301 }])
    expect(
      await db.query(
        'SELECT id FROM current_specification_local_requirements WHERE specification_id = 5',
      ),
    ).toEqual([{ id: 132302 }])
    expect(
      await db.query(
        'SELECT decision FROM deviations WHERE specification_item_id = 20 AND id = 132301',
      ),
    ).toEqual([{ decision: 1 }])
    expect(
      await db.query(
        'SELECT replaces_amendment_id AS original FROM specification_amendments WHERE id = 132304',
      ),
    ).toEqual([{ original: 132303 }])
    await seedDemoDatabase(db)
    expect(await counts()).toEqual([
      { id: 3, amendments: 0 },
      { id: 4, amendments: 1 },
      { id: 5, amendments: 3 },
    ])
    expect(
      await db.query(
        'SELECT id FROM current_requirement_applications WHERE requirements_specification_id = 5 ORDER BY id',
      ),
    ).toEqual(current)
  })
})
