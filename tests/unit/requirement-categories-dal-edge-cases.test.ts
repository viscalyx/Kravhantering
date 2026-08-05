import { describe, expect, it, vi } from 'vitest'
import { listCategories } from '@/lib/dal/requirement-categories'
import type { SqlServerDatabase } from '@/lib/db'

describe('requirement categories DAL', () => {
  it('maps repository entities ordered by Swedish name', async () => {
    const repository = {
      find: vi.fn(async () => [
        { id: 2, nameEn: 'Security', nameSv: 'Sakerhet' },
      ]),
    }
    const db = {
      getRepository: vi.fn(() => repository),
    } as unknown as SqlServerDatabase

    await expect(listCategories(db)).resolves.toEqual([
      { id: 2, nameEn: 'Security', nameSv: 'Sakerhet' },
    ])
    expect(repository.find).toHaveBeenCalledWith({
      order: { nameSv: 'ASC' },
    })
  })
})
