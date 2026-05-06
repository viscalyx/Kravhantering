import { describe, expect, it, vi } from 'vitest'
import { seedDatabase } from '../../typeorm/seed.mjs'

describe('seedDatabase', () => {
  it('reports seed failures without serializing the full seed row', async () => {
    const executor = {
      query: vi.fn(async () => {
        throw new Error('insert failed')
      }),
    }

    let message = ''
    try {
      await seedDatabase(executor)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toContain(
      "Seed failed while seeding table='norm_references' rowIndex=0 pk={id=1}: insert failed",
    )
    expect(message).not.toContain('row=')
    expect(message).not.toContain('SFS 2018:218')
  })
})
