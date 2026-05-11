import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { seedDatabase, seedPositionDetail } from '../../typeorm/seed.mjs'

// cspell:ignore linneab

const LINNEA_HSA_ID = 'SE2321000032-linneab'
const LINNEA_DISPLAY_NAME = 'Linnéa Bergström'

interface SeedInsertRow {
  row: Record<string, unknown>
  table: string
}

function collectSeedInsertRows() {
  const rows: SeedInsertRow[] = []
  const executor = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const match = sql.match(/INSERT INTO \[([^\]]+)\] \(([^)]+)\) VALUES/)
      if (!match) return
      const [, table, columnList] = match
      const columns = columnList
        .split(',')
        .map(column => column.trim().replace(/^\[|\]$/g, ''))
      rows.push({
        row: Object.fromEntries(
          columns.map((column, index) => [column, params[index]]),
        ),
        table,
      })
    }),
  }

  return { executor, rows }
}

function seedRowsFor(rows: SeedInsertRow[], table: string) {
  return rows
    .filter(seedRow => seedRow.table === table)
    .map(seedRow => seedRow.row)
}

function displayName(value: string) {
  return `${value.slice(0, 1).toLocaleUpperCase('sv-SE')}${value.slice(1)}`
}

function parseQualityCharacteristicsSource() {
  const swedishNames = new Map(
    readFileSync(
      join(process.cwd(), 'docs', 'kvalitetsegenskaper-svenska.csv'),
      'utf8',
    )
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map(line => {
        const [english, swedish] = line.split(';')
        return [english, swedish] as const
      }),
  )
  let parentId: number | null = null
  return readFileSync(
    join(process.cwd(), 'docs', 'kvalitetsegenskaper.csv'),
    'utf8',
  )
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line, index) => {
      const [chapterId, groupName, characteristicName] = line.split(';')
      const isParent = groupName !== '-'
      const sourceNameEn = isParent ? groupName : characteristicName
      if (isParent) parentId = index + 1
      return {
        chapter_id: chapterId,
        id: index + 1,
        name_en: displayName(sourceNameEn),
        name_sv: displayName(swedishNames.get(sourceNameEn) ?? ''),
        parent_id: isParent ? null : parentId,
        requirement_type_id:
          chapterId === '3.1' || chapterId.startsWith('3.1.') ? 1 : 2,
      }
    })
}

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

  it('seeds quality characteristics from the CSV source files', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDatabase(executor)

    const qualityCharacteristics = seedRowsFor(rows, 'quality_characteristics')
    expect(qualityCharacteristics).toHaveLength(49)
    expect(qualityCharacteristics).toEqual(parseQualityCharacteristicsSource())
  })

  it('seeds duplicate-name privacy data with distinct HSA-ID decisions', async () => {
    const kalleOwnerHsaIds = new Set<unknown>()
    const duplicateNameSuggestionRows: unknown[][] = []
    const executor = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (
          sql.includes('INSERT INTO [owners]') &&
          params[1] === 'Kalle' &&
          params[2] === 'Svensson'
        ) {
          kalleOwnerHsaIds.add(params[6])
        }
        if (
          sql.includes('INSERT INTO [improvement_suggestions]') &&
          params.includes(
            'Privacy seed proves duplicate display names are matched by HSA-ID.',
          )
        ) {
          duplicateNameSuggestionRows.push(params)
        }
      }),
    }

    await seedDatabase(executor)

    expect(kalleOwnerHsaIds).toEqual(
      new Set(['SE2321000032-kalle1', 'SE2321000032-kalle2']),
    )
    expect(duplicateNameSuggestionRows).toHaveLength(1)
    expect(duplicateNameSuggestionRows[0]).toEqual(
      expect.arrayContaining([
        'Kalle Svensson',
        'SE2321000032-kalle2',
        'Resolved by the second duplicate-name HSA identity.',
      ]),
    )
  })

  it('seeds Linnea privacy data with decisions and improvement suggestions', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDatabase(executor)

    const owners = seedRowsFor(rows, 'owners')
    const linneaOwnerIds = new Set(
      owners.filter(row => row.hsa_id === LINNEA_HSA_ID).map(row => row.id),
    )
    const counts = {
      'deviations.created_by': seedRowsFor(rows, 'deviations').filter(
        row => row.created_by_hsa_id === LINNEA_HSA_ID,
      ).length,
      'deviations.decided_by': seedRowsFor(rows, 'deviations').filter(
        row => row.decided_by_hsa_id === LINNEA_HSA_ID,
      ).length,
      'improvement_suggestions.created_by': seedRowsFor(
        rows,
        'improvement_suggestions',
      ).filter(row => row.created_by_hsa_id === LINNEA_HSA_ID).length,
      'improvement_suggestions.resolved_by': seedRowsFor(
        rows,
        'improvement_suggestions',
      ).filter(row => row.resolved_by_hsa_id === LINNEA_HSA_ID).length,
      'owners.identity': linneaOwnerIds.size,
      'requirement_area_co_authors.created_by': seedRowsFor(
        rows,
        'requirement_area_co_authors',
      ).filter(row => row.created_by_hsa_id === LINNEA_HSA_ID).length,
      'requirement_area_co_authors.hsa_id': seedRowsFor(
        rows,
        'requirement_area_co_authors',
      ).filter(row => row.hsa_id === LINNEA_HSA_ID).length,
      'requirement_areas.owner': seedRowsFor(rows, 'requirement_areas').filter(
        row => linneaOwnerIds.has(row.owner_id),
      ).length,
      'requirement_packages.owner': seedRowsFor(
        rows,
        'requirement_packages',
      ).filter(row => linneaOwnerIds.has(row.owner_id)).length,
      'requirement_versions.created_by': seedRowsFor(
        rows,
        'requirement_versions',
      ).filter(row => row.created_by_hsa_id === LINNEA_HSA_ID).length,
      'requirements_specifications.responsible': seedRowsFor(
        rows,
        'requirements_specifications',
      ).filter(row => row.responsible_hsa_id === LINNEA_HSA_ID).length,
      'specification_co_authors.created_by': seedRowsFor(
        rows,
        'specification_co_authors',
      ).filter(row => row.created_by_hsa_id === LINNEA_HSA_ID).length,
      'specification_co_authors.hsa_id': seedRowsFor(
        rows,
        'specification_co_authors',
      ).filter(row => row.hsa_id === LINNEA_HSA_ID).length,
      'specification_local_requirement_deviations.created_by': seedRowsFor(
        rows,
        'specification_local_requirement_deviations',
      ).filter(row => row.created_by_hsa_id === LINNEA_HSA_ID).length,
      'specification_local_requirement_deviations.decided_by': seedRowsFor(
        rows,
        'specification_local_requirement_deviations',
      ).filter(row => row.decided_by_hsa_id === LINNEA_HSA_ID).length,
    }

    expect(counts).toEqual({
      'deviations.created_by': 1,
      'deviations.decided_by': 1,
      'improvement_suggestions.created_by': 1,
      'improvement_suggestions.resolved_by': 1,
      'owners.identity': 1,
      'requirement_area_co_authors.created_by': 1,
      'requirement_area_co_authors.hsa_id': 1,
      'requirement_areas.owner': 2,
      'requirement_packages.owner': 2,
      'requirement_versions.created_by': 1,
      'requirements_specifications.responsible': 1,
      'specification_co_authors.created_by': 1,
      'specification_co_authors.hsa_id': 1,
      'specification_local_requirement_deviations.created_by': 1,
      'specification_local_requirement_deviations.decided_by': 1,
    })
    expect(
      seedRowsFor(rows, 'requirement_versions').find(
        row => row.created_by_hsa_id === LINNEA_HSA_ID,
      )?.created_by,
    ).toBe(LINNEA_DISPLAY_NAME)
    expect(
      seedRowsFor(rows, 'requirement_area_co_authors').find(
        row => row.created_by_hsa_id === LINNEA_HSA_ID,
      )?.created_by_display_name,
    ).toBe(LINNEA_DISPLAY_NAME)
    expect(
      seedRowsFor(rows, 'specification_co_authors').find(
        row => row.hsa_id === LINNEA_HSA_ID,
      )?.display_name,
    ).toBe(LINNEA_DISPLAY_NAME)
    expect(
      seedRowsFor(rows, 'specification_co_authors').find(
        row => row.created_by_hsa_id === LINNEA_HSA_ID,
      )?.created_by_display_name,
    ).toBe(LINNEA_DISPLAY_NAME)
  })
})
