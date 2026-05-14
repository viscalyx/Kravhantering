import { describe, expect, it, vi } from 'vitest'
import { seedDatabase, seedPositionDetail } from '../../typeorm/seed.mjs'
import {
  RETENTION_HISTORY_ONLY_VERSION_IDS,
  RETENTION_POSITIVE_SOURCE_KEYS,
  RETENTION_SEED,
} from '../../typeorm/seed-archiving-retention-build.mjs'

// cspell:ignore linneab repoåtkomstgranskning retentionlinked retentionorphan

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

function rowById(rows: Record<string, unknown>[]) {
  return new Map(rows.map(row => [row.id, row]))
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

  it('seeds the inline ISO quality characteristics model', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDatabase(executor)

    const qualityCharacteristics = seedRowsFor(rows, 'quality_characteristics')
    expect(qualityCharacteristics).toHaveLength(49)
    expect(qualityCharacteristics.map(row => row.id)).toEqual(
      Array.from({ length: 49 }, (_, index) => index + 1),
    )
    expect(
      qualityCharacteristics.every(
        row =>
          typeof row.name_sv === 'string' &&
          row.name_sv.length > 0 &&
          typeof row.name_en === 'string' &&
          row.name_en.length > 0 &&
          typeof row.chapter_id === 'string' &&
          row.chapter_id.length > 0,
      ),
    ).toBe(true)
    expect(
      qualityCharacteristics
        .filter(row => row.parent_id == null)
        .map(row => row.chapter_id),
    ).toEqual(['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '3.9'])
    expect(qualityCharacteristics[0]).toMatchObject({
      chapter_id: '3.1',
      id: 1,
      name_en: 'Functional suitability',
      name_sv: 'Funktionell lämplighet',
      parent_id: null,
      requirement_type_id: 1,
    })
    expect(qualityCharacteristics[48]).toMatchObject({
      chapter_id: '3.9.5',
      id: 49,
      name_en: 'Safe integration',
      name_sv: 'Säker integration',
      parent_id: 44,
      requirement_type_id: 2,
    })
    expect(qualityCharacteristics[5]).toMatchObject({
      id: 6,
      name_en: 'Time behavior',
    })
    expect(qualityCharacteristics[35]).toMatchObject({
      id: 36,
      name_en: 'Analyzability',
    })
    const rowById = new Map(qualityCharacteristics.map(row => [row.id, row]))
    for (const row of qualityCharacteristics) {
      if (row.parent_id == null) continue
      const parent = rowById.get(row.parent_id)
      expect(parent).toBeDefined()
      expect(row.chapter_id).toEqual(
        expect.stringContaining(`${String(parent?.chapter_id)}.`),
      )
    }
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
      'access_review_items.decided_by': seedRowsFor(
        rows,
        'access_review_items',
      ).filter(row => row.decided_by_hsa_id === LINNEA_HSA_ID).length,
      'access_review_items.principal': seedRowsFor(
        rows,
        'access_review_items',
      ).filter(row => row.principal_hsa_id === LINNEA_HSA_ID).length,
      'access_review_runs.completed_by': seedRowsFor(
        rows,
        'access_review_runs',
      ).filter(row => row.completed_by_hsa_id === LINNEA_HSA_ID).length,
      'access_review_runs.created_by': seedRowsFor(
        rows,
        'access_review_runs',
      ).filter(row => row.created_by_hsa_id === LINNEA_HSA_ID).length,
      'access_review_runs.reviewer': seedRowsFor(
        rows,
        'access_review_runs',
      ).filter(row => row.reviewer_hsa_id === LINNEA_HSA_ID).length,
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
      'access_review_items.decided_by': 2,
      'access_review_items.principal': 1,
      'access_review_runs.completed_by': 1,
      'access_review_runs.created_by': 1,
      'access_review_runs.reviewer': 1,
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
    const linneaCompletedRuns = seedRowsFor(rows, 'access_review_runs').filter(
      row =>
        row.status === 'completed' &&
        (row.created_by_hsa_id === LINNEA_HSA_ID ||
          row.reviewer_hsa_id === LINNEA_HSA_ID),
    )
    const accessReviewRunsById = new Map(
      seedRowsFor(rows, 'access_review_runs').map(row => [row.id, row]),
    )
    expect(linneaCompletedRuns).toHaveLength(2)
    expect(accessReviewRunsById.get(1)).toMatchObject({
      created_by_hsa_id: LINNEA_HSA_ID,
      external_evidence_reference:
        'DNR-KH-2025-0142: IAM- och repoåtkomstgranskning 2025',
      status: 'completed',
    })
    expect(accessReviewRunsById.get(2)).toMatchObject({
      external_evidence_reference:
        'REV-IAM-2024-009: IdP-rollgranskning och sign-off',
      reviewer_hsa_id: LINNEA_HSA_ID,
      status: 'completed',
    })
    expect(accessReviewRunsById.get(3)).toMatchObject({
      external_evidence_reference:
        'Jira IAM-7312: Årlig granskning IdP-roller, repo och MCP 2026',
      status: 'in_review',
    })
    expect(
      linneaCompletedRuns.some(
        row =>
          row.created_by_hsa_id === LINNEA_HSA_ID &&
          row.created_by_display_name === LINNEA_DISPLAY_NAME,
      ),
    ).toBe(true)
    expect(
      linneaCompletedRuns.some(
        row =>
          row.created_by_hsa_id !== LINNEA_HSA_ID &&
          row.reviewer_hsa_id === LINNEA_HSA_ID &&
          row.reviewer_display_name === LINNEA_DISPLAY_NAME,
      ),
    ).toBe(true)
  })

  it('seeds deterministic archiving retention fixtures for every active policy source', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDatabase(executor)

    expect(RETENTION_POSITIVE_SOURCE_KEYS).toEqual([
      'owners.identity',
      'requirement_areas.unused',
      'requirement_packages.unused',
      'norm_references.unused',
      'requirement_versions.archived_unused',
      'requirement_versions.review_stale',
      'requirement_versions.draft_stale',
      'requirements_specifications.obsolete',
    ])

    const owners = rowById(seedRowsFor(rows, 'owners'))
    const areas = rowById(seedRowsFor(rows, 'requirement_areas'))
    const packages = rowById(seedRowsFor(rows, 'requirement_packages'))
    const norms = rowById(seedRowsFor(rows, 'norm_references'))
    const requirements = rowById(seedRowsFor(rows, 'requirements'))
    const versions = rowById(seedRowsFor(rows, 'requirement_versions'))
    const specifications = rowById(
      seedRowsFor(rows, 'requirements_specifications'),
    )
    const localRequirements = rowById(
      seedRowsFor(rows, 'specification_local_requirements'),
    )
    const specificationItems = seedRowsFor(
      rows,
      'requirements_specification_items',
    )
    const versionPackages = seedRowsFor(
      rows,
      'requirement_version_requirement_packages',
    )
    const versionNorms = seedRowsFor(
      rows,
      'requirement_version_norm_references',
    )
    const localPackages = seedRowsFor(
      rows,
      'specification_local_requirement_requirement_packages',
    )
    const localNorms = seedRowsFor(
      rows,
      'specification_local_requirement_norm_references',
    )

    expect(owners.get(RETENTION_SEED.owner.orphan)).toMatchObject({
      hsa_id: 'SE2321000032-retentionorphan',
      updated_at: '2023-01-15 09:00:00',
    })
    expect(
      seedRowsFor(rows, 'requirement_areas').some(
        row => row.owner_id === RETENTION_SEED.owner.orphan,
      ),
    ).toBe(false)
    expect(
      seedRowsFor(rows, 'requirement_packages').some(
        row => row.owner_id === RETENTION_SEED.owner.orphan,
      ),
    ).toBe(false)

    expect(areas.get(RETENTION_SEED.requirementArea.unused)).toMatchObject({
      name: 'RETENTION-SEED oanvänt kravområde',
      updated_at: '2023-01-15 09:00:00',
    })
    expect(
      packages.get(RETENTION_SEED.requirementPackage.unused),
    ).toMatchObject({
      name_sv: 'RETENTION-SEED oanvänt kravpaket',
      updated_at: '2023-01-15 09:00:00',
    })
    expect(norms.get(RETENTION_SEED.normReference.unused)).toMatchObject({
      name: 'RETENTION-SEED oanvänd normreferens',
      updated_at: '2023-01-15 09:00:00',
    })

    expect(
      versions.get(RETENTION_SEED.requirementVersion.archivedUnused),
    ).toMatchObject({
      has_specification_item_history: 0,
      requirement_status_id: 4,
      status_updated_at: '2024-01-15 09:00:00',
    })
    expect(
      versions.get(RETENTION_SEED.requirementVersion.reviewStale),
    ).toMatchObject({
      archive_initiated_at: null,
      has_specification_item_history: 0,
      requirement_status_id: 2,
      status_updated_at: '2024-01-15 09:00:00',
    })
    expect(
      versions.get(RETENTION_SEED.requirementVersion.draftStale),
    ).toMatchObject({
      edited_at: '2024-01-15 09:00:00',
      has_specification_item_history: 0,
      requirement_status_id: 1,
      status_updated_at: '2024-01-15 09:00:00',
    })

    expect(
      specifications.get(RETENTION_SEED.specification.obsolete),
    ).toMatchObject({
      name: 'RETENTION-SEED kravunderlag utanför förvaltning',
      responsible_display_name: 'seed',
      specification_lifecycle_status_id: 1,
      updated_at: '2023-01-15 09:00:00',
    })
    expect(
      specificationItems.filter(
        row =>
          row.requirements_specification_id ===
          RETENTION_SEED.specification.obsolete,
      ),
    ).toHaveLength(2)
    expect(
      localRequirements.get(
        RETENTION_SEED.localRequirement.obsoleteSpecification,
      ),
    ).toMatchObject({
      specification_id: RETENTION_SEED.specification.obsolete,
      unique_id: 'RETENTION-SEED-LR-1',
    })

    expect(owners.get(RETENTION_SEED.owner.linked)).toMatchObject({
      hsa_id: 'SE2321000032-retentionlinked',
    })
    expect(
      seedRowsFor(rows, 'requirement_areas').some(
        row => row.owner_id === RETENTION_SEED.owner.linked,
      ),
    ).toBe(true)
    expect(
      seedRowsFor(rows, 'requirement_packages').some(
        row => row.owner_id === RETENTION_SEED.owner.linked,
      ),
    ).toBe(true)
    expect(areas.get(RETENTION_SEED.requirementArea.freshUnused)).toMatchObject(
      {
        updated_at: '2026-04-25 09:00:00',
      },
    )
    expect(
      packages.get(RETENTION_SEED.requirementPackage.freshUnused),
    ).toMatchObject({
      updated_at: '2026-04-25 09:00:00',
    })
    expect(norms.get(RETENTION_SEED.normReference.freshUnused)).toMatchObject({
      updated_at: '2026-04-25 09:00:00',
    })
    expect(
      [...requirements.values()].some(
        row => row.requirement_area_id === RETENTION_SEED.requirementArea.used,
      ),
    ).toBe(true)
    expect(
      [...localRequirements.values()].some(
        row => row.requirement_area_id === RETENTION_SEED.requirementArea.used,
      ),
    ).toBe(true)
    expect(
      versionPackages.some(
        row =>
          row.requirement_package_id === RETENTION_SEED.requirementPackage.used,
      ),
    ).toBe(true)
    expect(
      localPackages.some(
        row =>
          row.requirement_package_id === RETENTION_SEED.requirementPackage.used,
      ),
    ).toBe(true)
    expect(
      versionNorms.some(
        row => row.norm_reference_id === RETENTION_SEED.normReference.used,
      ),
    ).toBe(true)
    expect(
      localNorms.some(
        row => row.norm_reference_id === RETENTION_SEED.normReference.used,
      ),
    ).toBe(true)
    expect(
      specificationItems.some(
        row =>
          row.requirement_version_id ===
          RETENTION_SEED.requirementVersion.currentSpecificationLink,
      ),
    ).toBe(true)
    expect(
      versions.get(RETENTION_SEED.requirementVersion.historyOnly),
    ).toMatchObject({
      has_specification_item_history: 1,
      requirement_status_id: 4,
    })
    expect(RETENTION_HISTORY_ONLY_VERSION_IDS).toContain(
      RETENTION_SEED.requirementVersion.historyOnly,
    )
    expect(
      specificationItems.some(
        row =>
          row.requirement_version_id ===
          RETENTION_SEED.requirementVersion.historyOnly,
      ),
    ).toBe(false)
    expect(
      versions.get(RETENTION_SEED.requirementVersion.archiveReview),
    ).toMatchObject({
      archive_initiated_at: '2024-01-15 09:00:00',
      requirement_status_id: 2,
    })
    expect(
      specifications.get(RETENTION_SEED.specification.management),
    ).toMatchObject({
      specification_lifecycle_status_id: 4,
      updated_at: '2023-01-15 09:00:00',
    })
    expect(
      specifications.get(RETENTION_SEED.specification.freshObsolete),
    ).toMatchObject({
      specification_lifecycle_status_id: 1,
      updated_at: '2026-04-25 09:00:00',
    })
  })
})
