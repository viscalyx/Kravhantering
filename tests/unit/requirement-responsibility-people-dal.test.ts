import { describe, expect, it, vi } from 'vitest'
import {
  cleanupUnassignedRequirementResponsibilityPeople,
  upsertRequirementResponsibilityPerson,
} from '@/lib/dal/requirement-responsibility-people'

describe('requirement responsibility people DAL', () => {
  it('uses an idempotent locked MERGE for responsibility person upsert operations', async () => {
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => [])
    const fetchedAt = new Date('2026-06-13T12:00:00.000Z')

    await upsertRequirementResponsibilityPerson(
      { query },
      {
        email: 'owner@example.test',
        givenName: 'Area',
        hsaId: 'SE5560000001-owner1',
        middleName: null,
        surname: 'Owner',
      },
      fetchedAt,
    )

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'MERGE INTO requirement_responsibility_people WITH (HOLDLOCK)',
      ),
      [
        'SE5560000001-owner1',
        'Area',
        null,
        'Owner',
        'owner@example.test',
        null,
        fetchedAt,
      ],
    )
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('ON target.hsa_id = source.hsa_id')
    expect(sql).toContain('WHEN MATCHED THEN')
    expect(sql).toContain('target.has_protected_personal_data')
    expect(sql).toContain(
      'COALESCE(source.has_protected_personal_data, CONVERT(bit, 0))',
    )
    expect(sql).toContain('WHEN NOT MATCHED THEN')
  })

  it('retains assigned or shared person rows during orphan cleanup', async () => {
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => [
      { hsaId: 'SE5560000001-orphan1' },
    ])

    await expect(
      cleanupUnassignedRequirementResponsibilityPeople({ query }, [
        'SE5560000001-orphan1',
        'SE5560000001-shared1',
        'SE5560000001-orphan1',
        null,
      ]),
    ).resolves.toEqual(['SE5560000001-orphan1'])

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE person'),
      ['SE5560000001-orphan1', 'SE5560000001-shared1'],
    )
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('FROM requirement_responsibility_people person')
    expect(sql).toContain('NOT EXISTS')
    expect(sql).toContain('requirement_areas area')
    expect(sql).toContain('requirement_area_co_authors co_author')
    expect(sql).toContain('requirements_specifications specification_record')
    expect(sql).toContain('specification_co_authors co_author')
    expect(sql).toContain('requirement_packages requirement_package')
    expect(sql).toContain('requirement_package_co_authors co_author')
  })

  it('skips orphan cleanup when no HSA-ids are supplied', async () => {
    const query = vi.fn()

    await expect(
      cleanupUnassignedRequirementResponsibilityPeople({ query }, [
        null,
        undefined,
        '',
      ]),
    ).resolves.toEqual([])

    expect(query).not.toHaveBeenCalled()
  })
})
