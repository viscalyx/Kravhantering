import { describe, expect, it, vi } from 'vitest'
import {
  createNormReference,
  deleteNormReference,
  getNormReferenceByNormReferenceId,
  listConnectedLibraryRequirementIds,
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

  it('gets norm references by stable ID without filtering archived rows', async () => {
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
    const db = {
      query,
    } as unknown as Parameters<typeof getNormReferenceByNormReferenceId>[0]

    const result = await getNormReferenceByNormReferenceId(db, 'ISO-27001')

    const sql = String(query.mock.calls[0]?.[0] ?? '')
    expect(query).toHaveBeenCalledWith(expect.any(String), ['ISO-27001'])
    expect(sql).toContain('normReferences.norm_reference_id = @0')
    expect(sql).not.toContain('normReferences.is_archived = 0')
    expect(result).toEqual(
      expect.objectContaining({
        id: 7,
        isArchived: true,
        normReferenceId: 'ISO-27001',
      }),
    )
  })

  it('lists distinct connected library requirement IDs for a norm reference', async () => {
    const query = vi.fn(async (..._args: unknown[]) => [
      { id: 2, uniqueId: 'REQ-0002' },
      { id: 10, uniqueId: 'REQ-0010' },
    ])
    const db = {
      query,
    } as unknown as Parameters<typeof listConnectedLibraryRequirementIds>[0]

    const result = await listConnectedLibraryRequirementIds(db, 3)

    const sql = String(query.mock.calls[0]?.[0] ?? '')
    expect(query).toHaveBeenCalledWith(expect.any(String), [3])
    expect(sql).toContain('SELECT DISTINCT')
    expect(sql).toContain('requirement_version_norm_references')
    expect(sql).toContain('INNER JOIN requirement_versions')
    expect(sql).toContain('INNER JOIN requirements')
    expect(sql).toContain('requirements.unique_id AS uniqueId')
    expect(sql).toContain('ORDER BY requirements.unique_id ASC')
    expect(sql).not.toContain('specification_local_requirement_norm_references')
    expect(result).toEqual([
      { id: 2, uniqueId: 'REQ-0002' },
      { id: 10, uniqueId: 'REQ-0010' },
    ])
  })

  it('returns stable exhaustion instead of a timestamp ID after all generated candidates exist', async () => {
    const repository = {
      create: vi.fn(),
      findOne: vi.fn(async () => ({ id: 1 })),
      save: vi.fn(),
    }
    const db = {
      getRepository: vi.fn(() => repository),
    } as unknown as Parameters<typeof createNormReference>[0]

    await expect(
      createNormReference(db, {
        issuer: 'Riksdagen',
        name: 'Svensk författning',
        reference: 'SFS 2026:529',
        type: 'Lag',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'norm_reference_id_generation_exhausted' },
      status: 409,
    })

    expect(repository.save).not.toHaveBeenCalled()
    expect(repository.findOne).toHaveBeenCalledTimes(999)
  })
})
