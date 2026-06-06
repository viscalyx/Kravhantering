import { describe, expect, it, vi } from 'vitest'
import {
  deleteNormReference,
  listNormReferences,
} from '@/lib/dal/norm-references'

describe('norm references DAL', () => {
  it('lists active norm references by default and can include selected archived IDs', async () => {
    const query = vi.fn(async (..._args: unknown[]) => [
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 7,
        isArchived: 1,
        issuer: 'ISO',
        name: 'ISO 27001',
        normReferenceId: 'ISO-27001',
        reference: 'ISO/IEC 27001:2022',
        type: 'Standard',
        updatedAt: '2026-01-02T00:00:00.000Z',
        uri: null,
        version: '2022',
      },
    ])
    const db = { query } as unknown as Parameters<typeof listNormReferences>[0]

    const result = await listNormReferences(db, {
      includeArchived: false,
      includeIds: [7, 7, -1],
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('normReferences.is_archived = 0'),
      [0, 7],
    )
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain(
      'normReferences.id IN (@1)',
    )
    expect(result).toEqual([
      expect.objectContaining({
        id: 7,
        isArchived: true,
        normReferenceId: 'ISO-27001',
      }),
    ])
  })

  it('deletes only unused norm references', async () => {
    const query = vi.fn(async (..._args: unknown[]) => [{ id: 3 }])
    const db = { query } as unknown as Parameters<typeof deleteNormReference>[0]

    const result = await deleteNormReference(db, 3)

    expect(result).toBe(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('requirement_version_norm_references'),
      [3],
    )
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain(
      'specification_local_requirement_norm_references',
    )
  })
})
