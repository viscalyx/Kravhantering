import { describe, expect, it, vi } from 'vitest'
import { seedDatabase, seedPositionDetail } from '../../typeorm/seed.mjs'

describe('seedDatabase', () => {
  it('reports seed failures without serializing the full seed row', async () => {
    const executor = {
      query: vi.fn(async () => {
        throw new Error('insert failed')
      }),
    }

    const error = await seedDatabase(executor).then(
      () => {
        throw new Error('Expected seedDatabase to reject')
      },
      caught => caught,
    )
    expect(error).toBeInstanceOf(Error)

    const message = error instanceof Error ? error.message : String(error)
    expect(message).toContain('Seed failed while seeding')
    expect(message).toContain(': insert failed')
    expect(message).not.toContain('row=')
    expect(message).not.toContain('SFS 2018:218')
  })

  it('seedPositionDetail formats table/rowIndex/pk correctly', () => {
    expect(
      seedPositionDetail({
        primaryKeyDetail: 'pk={id=1}',
        rowIndex: 0,
        table: 'norm_references',
      }),
    ).toBe(" while seeding table='norm_references' rowIndex=0 pk={id=1}")
  })
})
