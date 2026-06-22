import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { seedDemoDatabase } from '../../typeorm/seed.mjs'
import {
  RETENTION_HISTORY_ONLY_VERSION_IDS,
  RETENTION_POSITIVE_SOURCE_KEYS,
  RETENTION_SEED,
} from '../../typeorm/seed-archiving-retention-build.mjs'
import {
  seedPositionDetail,
  seedRequiredDatabase,
} from '../../typeorm/seed-required.mjs'

// cspell:ignore linneab manualarea manualpkg manualspec pkglead repobehörighetsöversyn specco
// cspell:ignore retentionfresh retentionlinked retentionorphan

const LINNEA_HSA_ID = 'SE5560000001-linneab'
const LINNEA_DISPLAY_NAME = 'Linnéa Bergström'
const PRIVACY_SEED_TS = '2026-04-23 09:00:00'
const RESPONSIBILITY_PERSON_PLACEHOLDER = '(saknar namn, kräver nytt uppslag)'

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
      if (params.length !== columns.length) {
        throw new Error(
          `Seed row arity mismatch for ${table}: ${params.length} values for ${columns.length} columns`,
        )
      }
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

describe('seed profiles', () => {
  it('keeps the required seed module free of demo-only builders', () => {
    const requiredSeedSource = readFileSync(
      path.join(process.cwd(), 'typeorm/seed-required.mjs'),
      'utf8',
    )

    expect(requiredSeedSource).not.toContain('seed-dogfood')
    expect(requiredSeedSource).not.toContain('seed-archiving-retention-build')
    expect(requiredSeedSource).not.toContain('appendDogfoodSeed')
    expect(requiredSeedSource).not.toContain('appendArchivingRetentionSeed')
  })

  it('reports seed failures without serializing the full seed row', async () => {
    const executor = {
      query: vi.fn(async () => {
        throw new Error('insert failed')
      }),
    }

    const error = await seedRequiredDatabase(executor).then(
      () => {
        throw new Error('Expected seedRequiredDatabase to reject')
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

    await seedRequiredDatabase(executor)

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

  it('keeps required seed data to system and lookup tables', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedRequiredDatabase(executor)

    expect(seedRowsFor(rows, 'requirement_statuses').length).toBeGreaterThan(0)
    expect(seedRowsFor(rows, 'quality_characteristics')).toHaveLength(49)
    const retentionPolicies = seedRowsFor(rows, 'archiving_retention_policies')
    expect(retentionPolicies).toHaveLength(6)
    expect(retentionPolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          policy_key: 'archived_requirement_selection_delete',
        }),
        expect.objectContaining({
          age_days: 730,
          information_set:
            'Arkiverade RFI-frågor och historiska RFI-frågeversioner',
          policy_key: 'rfi_questions_retention_delete',
        }),
        expect.objectContaining({
          information_set: 'Kravansvarspersoner utan kravansvarstilldelning',
          policy_key: 'orphaned_responsibility_people_delete',
        }),
      ]),
    )
    expect(seedRowsFor(rows, 'owners')).toHaveLength(0)
    expect(seedRowsFor(rows, 'requirement_areas')).toHaveLength(0)
    expect(seedRowsFor(rows, 'requirements')).toHaveLength(0)
    expect(seedRowsFor(rows, 'requirement_versions')).toHaveLength(0)
    expect(seedRowsFor(rows, 'requirements_specifications')).toHaveLength(0)
    expect(seedRowsFor(rows, 'requirement_selection_questions')).toHaveLength(0)
    expect(seedRowsFor(rows, 'requirement_selection_answers')).toHaveLength(0)
    expect(
      seedRowsFor(rows, 'specification_requirement_selection_answers'),
    ).toHaveLength(0)
    expect(seedRowsFor(rows, 'action_audit_events')).toHaveLength(0)
  })

  it('seeds demo requirement-selection data with valid published links', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDemoDatabase(executor)

    const questionSequences = seedRowsFor(
      rows,
      'requirement_selection_question_sequences',
    )
    const questions = seedRowsFor(rows, 'requirement_selection_questions')
    const answers = seedRowsFor(rows, 'requirement_selection_answers')
    const answerPackages = seedRowsFor(
      rows,
      'requirement_selection_answer_packages',
    )
    const answerRequirements = seedRowsFor(
      rows,
      'requirement_selection_answer_requirements',
    )
    const savedAnswers = seedRowsFor(
      rows,
      'specification_requirement_selection_answers',
    )
    const packagesById = rowById(seedRowsFor(rows, 'requirement_packages'))
    const requirementsById = rowById(seedRowsFor(rows, 'requirements'))
    const specificationsById = rowById(
      seedRowsFor(rows, 'requirements_specifications'),
    )
    const questionsById = rowById(questions)
    const answersById = rowById(answers)
    const demoQuestionCodes = new Set([
      'SÄK-KUF001',
      'INT-KUF001',
      'DRF-KUF001',
      'DRF-KUF002',
      'DRF-KUF003',
      'DRF-KUF004',
      'ANV-KUF001',
      'RAP-KUF001',
      'KVA-KUF001',
    ])
    const demoQuestionIds = new Set(
      questions
        .filter(row => demoQuestionCodes.has(String(row.question_code)))
        .map(row => row.id),
    )
    const demoAnswers = answers.filter(row =>
      demoQuestionIds.has(row.question_id),
    )
    const demoSavedAnswers = savedAnswers.filter(row =>
      demoQuestionIds.has(row.question_id),
    )
    const publishedRequirementIds = new Set(
      seedRowsFor(rows, 'requirement_versions')
        .filter(row => row.requirement_status_id === 3)
        .map(row => row.requirement_id),
    )

    expect(demoQuestionIds.size).toBe(9)
    expect(demoAnswers).toHaveLength(31)
    expect(new Set(questionSequences.map(row => row.next_sequence))).toEqual(
      new Set([2, 5]),
    )
    expect(
      questionSequences
        .map(row => row.area_id)
        .sort((left, right) => Number(left) - Number(right)),
    ).toEqual([1, 2, 4, 9, 1002, 1004])
    expect(answerPackages).toHaveLength(47)
    expect(answerRequirements).toHaveLength(47)
    expect(new Set(demoSavedAnswers.map(row => row.specification_id))).toEqual(
      new Set([1, 7, 8, 1002]),
    )
    expect(demoSavedAnswers.some(row => row.is_historical === 1)).toBe(true)

    for (const answer of answers) {
      expect(questionsById.has(answer.question_id)).toBe(true)
    }
    for (const link of answerPackages) {
      expect(answersById.has(link.answer_id)).toBe(true)
      expect(packagesById.has(link.requirement_package_id)).toBe(true)
    }
    for (const link of answerRequirements) {
      expect(answersById.has(link.answer_id)).toBe(true)
      expect(requirementsById.has(link.requirement_id)).toBe(true)
      expect(publishedRequirementIds.has(link.requirement_id)).toBe(true)
    }
    for (const savedAnswer of savedAnswers) {
      const answer = answersById.get(savedAnswer.answer_id)
      expect(specificationsById.has(savedAnswer.specification_id)).toBe(true)
      expect(questionsById.has(savedAnswer.question_id)).toBe(true)
      expect(answer).toBeDefined()
      expect(answer?.question_id).toBe(savedAnswer.question_id)
    }

    const packageLinkAnswerIds = new Set(
      answerPackages.map(row => row.answer_id),
    )
    const requirementLinkAnswerIds = new Set(
      answerRequirements.map(row => row.answer_id),
    )
    for (const answer of answers.filter(
      row => row.is_no_requirement_selection === 1,
    )) {
      expect(packageLinkAnswerIds.has(answer.id)).toBe(false)
      expect(requirementLinkAnswerIds.has(answer.id)).toBe(false)
    }
  })

  it('seeds duplicate-name privacy data with distinct HSA-id decisions', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDemoDatabase(executor)

    const duplicateNameSuggestionRows = seedRowsFor(
      rows,
      'improvement_suggestions',
    ).filter(
      row =>
        row.content ===
        'Privacy seed proves duplicate display names are matched by HSA-id.',
    )
    const kalleSpecificationHsaIds = new Set(
      seedRowsFor(rows, 'requirements_specifications')
        .filter(row =>
          ['SE5560000001-kalle1', 'SE5560000001-kalle2'].includes(
            String(row.responsible_hsa_id),
          ),
        )
        .map(row => row.responsible_hsa_id),
    )
    expect(kalleSpecificationHsaIds).toEqual(
      new Set(['SE5560000001-kalle1', 'SE5560000001-kalle2']),
    )
    expect(seedRowsFor(rows, 'owners')).toHaveLength(0)
    expect(duplicateNameSuggestionRows).toHaveLength(1)
    expect(duplicateNameSuggestionRows[0]).toMatchObject({
      resolved_by: 'Kalle Svensson',
      resolved_by_hsa_id: 'SE5560000001-kalle2',
      resolution_motivation:
        'Resolved by the second duplicate-name HSA identity.',
    })
  })

  it('seeds each requirement package name only once', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDemoDatabase(executor)

    const packages = seedRowsFor(rows, 'requirement_packages')
    const packageNames = packages.map(row => row.name)
    const duplicateNames = packageNames.filter(
      (name, index) => packageNames.indexOf(name) !== index,
    )
    expect(duplicateNames).toEqual([])

    const matchingPackages = packages.filter(
      row => row.name === 'Användarvänlighet',
    )
    expect(matchingPackages).toHaveLength(1)
    expect(matchingPackages[0]).toMatchObject({ id: 5 })
  })

  it('seeds requirement package co-author relationships', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDemoDatabase(executor)

    const packageIds = new Set(
      seedRowsFor(rows, 'requirement_packages').map(row => row.id),
    )
    const responsibilityPersonHsaIds = new Set(
      seedRowsFor(rows, 'requirement_responsibility_people').map(
        row => row.hsa_id,
      ),
    )
    const coAuthors = seedRowsFor(rows, 'requirement_package_co_authors')

    expect(coAuthors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hsa_id: 'SE5560000001-pkgco1',
          requirement_package_id: 1,
        }),
      ]),
    )
    for (const coAuthor of coAuthors) {
      expect(packageIds.has(coAuthor.requirement_package_id)).toBe(true)
      expect(responsibilityPersonHsaIds.has(coAuthor.hsa_id)).toBe(true)
    }
  })

  it('seeds deterministic authorization fixtures for role testing', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDemoDatabase(executor)

    expect(seedRowsFor(rows, 'requirement_areas')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 910100,
          owner_hsa_id: 'SE5560000001-areaowner1',
          prefix: 'AUTHZ',
        }),
      ]),
    )
    expect(seedRowsFor(rows, 'requirement_area_co_authors')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          area_id: 910100,
          hsa_id: 'SE5560000001-areaco1',
        }),
        expect.objectContaining({
          area_id: 910100,
          hsa_id: 'SE5560000001-smoke1',
        }),
      ]),
    )
    expect(seedRowsFor(rows, 'requirements_specifications')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 910400,
          responsible_hsa_id: 'SE5560000001-specresp1',
          unique_id: 'AUTHZ-SPEC-2026',
        }),
      ]),
    )
    expect(seedRowsFor(rows, 'specification_co_authors')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hsa_id: 'SE5560000001-specco1',
          specification_id: 910400,
        }),
      ]),
    )
    expect(seedRowsFor(rows, 'requirement_packages')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 910200,
          lead_hsa_id: 'SE5560000001-pkglead1',
          name: 'AUTHZ kravpaket',
        }),
      ]),
    )
    expect(seedRowsFor(rows, 'requirement_package_co_authors')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hsa_id: 'SE5560000001-pkgco1',
          requirement_package_id: 910200,
        }),
      ]),
    )
  })

  it('seeds demo RFI question suggestions across workflow states', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDemoDatabase(executor)

    const rfiQuestionSuggestions = rowById(
      seedRowsFor(rows, 'rfi_question_suggestions'),
    )

    expect(rfiQuestionSuggestions.get(1)).toMatchObject({
      is_review_requested: 0,
      resolution: null,
      rfi_question_id: 1,
      specification_id: 1,
    })
    expect(rfiQuestionSuggestions.get(2)).toMatchObject({
      is_review_requested: 0,
      resolution: null,
      rfi_question_id: null,
      specification_id: 1,
    })
    expect(rfiQuestionSuggestions.get(3)).toMatchObject({
      is_review_requested: 1,
      resolution: null,
      rfi_question_id: 2,
      specification_id: 1,
    })
    expect(rfiQuestionSuggestions.get(4)).toMatchObject({
      is_review_requested: 1,
      resolution: 1,
      rfi_question_id: 3,
      specification_id: 1,
    })
    expect(rfiQuestionSuggestions.get(5)).toMatchObject({
      is_review_requested: 1,
      resolution: 2,
      rfi_question_id: null,
      specification_id: 1,
    })
  })

  it('seeds local responsibility people from live assignments and HSA mock details', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDemoDatabase(executor)

    const hsaFixture = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'containers/hsa-directory-mock/fixtures/hsa-personer.json',
        ),
        'utf8',
      ),
    ) as {
      hsaPersonRecords: Array<{
        givenName: string
        hsaIdentity: string
        mail?: string
        middleName?: string
        sn?: string
      }>
    }
    const hsaMockById = new Map(
      hsaFixture.hsaPersonRecords.map(record => [record.hsaIdentity, record]),
    )
    const responsibilityPeople = seedRowsFor(
      rows,
      'requirement_responsibility_people',
    )
    const liveAssignmentColumns = [
      ['requirement_areas', 'owner_hsa_id'],
      ['requirement_area_co_authors', 'hsa_id'],
      ['requirements_specifications', 'responsible_hsa_id'],
      ['specification_co_authors', 'hsa_id'],
      ['requirement_packages', 'lead_hsa_id'],
      ['requirement_package_co_authors', 'hsa_id'],
    ] as const
    const expectedHsaIds = new Set([
      'SE5560000001-retentionorphan',
      'SE5560000001-retentionfresh',
    ])
    for (const [table, column] of liveAssignmentColumns) {
      for (const row of seedRowsFor(rows, table)) {
        if (row[column]) expectedHsaIds.add(String(row[column]))
      }
    }

    expect(responsibilityPeople.map(row => row.hsa_id).sort()).toEqual(
      [...expectedHsaIds].sort(),
    )
    expect(
      [...expectedHsaIds].filter(hsaId => !hsaMockById.has(hsaId)),
    ).toEqual([])

    for (const personRow of responsibilityPeople) {
      if (personRow.hsa_id === 'SE5560000001-pkgco1') {
        expect(personRow).toMatchObject({
          email: null,
          given_name: RESPONSIBILITY_PERSON_PLACEHOLDER,
          last_fetched_at: null,
        })
        continue
      }
      const hsaPerson = hsaMockById.get(String(personRow.hsa_id))
      expect(personRow).toMatchObject({
        email: hsaPerson?.mail ?? null,
        given_name: hsaPerson?.givenName,
        last_fetched_at: expect.any(String),
        middle_name: hsaPerson?.middleName ?? null,
        surname: hsaPerson?.sn ?? null,
      })
    }
    expect(
      responsibilityPeople.find(
        row => row.hsa_id === 'SE5560000001-retentionorphan',
      ),
    ).toMatchObject({
      given_name: 'Rolf',
      updated_at: '2023-01-15 09:00:00',
    })
    expect(
      responsibilityPeople.find(
        row => row.hsa_id === 'SE5560000001-retentionfresh',
      ),
    ).toMatchObject({
      given_name: 'Freja',
      updated_at: '2026-04-25 09:00:00',
    })
    expect(
      responsibilityPeople.find(
        row => row.hsa_id === 'SE5560000001-retentionlinked',
      ),
    ).toMatchObject({
      given_name: 'Lena',
      updated_at: '2023-01-15 09:00:00',
    })
  })

  it('seeds Linnea privacy data with decisions and improvement suggestions', async () => {
    const { executor, rows } = collectSeedInsertRows()

    await seedDemoDatabase(executor)

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
      'action_audit_events.actor': seedRowsFor(
        rows,
        'action_audit_events',
      ).filter(row => row.actor_hsa_id === LINNEA_HSA_ID).length,
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
      'requirement_area_co_authors.created_by': seedRowsFor(
        rows,
        'requirement_area_co_authors',
      ).filter(row => row.created_by_hsa_id === LINNEA_HSA_ID).length,
      'requirement_area_co_authors.hsa_id': seedRowsFor(
        rows,
        'requirement_area_co_authors',
      ).filter(row => row.hsa_id === LINNEA_HSA_ID).length,
      'requirement_areas.owner': seedRowsFor(rows, 'requirement_areas').filter(
        row => row.owner_hsa_id === LINNEA_HSA_ID,
      ).length,
      'requirement_packages.owner': seedRowsFor(
        rows,
        'requirement_packages',
      ).filter(row => row.lead_hsa_id === LINNEA_HSA_ID).length,
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
      'action_audit_events.actor': 2,
      'deviations.created_by': 1,
      'deviations.decided_by': 1,
      'improvement_suggestions.created_by': 1,
      'improvement_suggestions.resolved_by': 1,
      'requirement_area_co_authors.created_by': 1,
      'requirement_area_co_authors.hsa_id': 1,
      'requirement_areas.owner': 2,
      'requirement_packages.owner': 1,
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
      seedRowsFor(rows, 'requirement_responsibility_people').find(
        row => row.hsa_id === LINNEA_HSA_ID,
      ),
    ).toMatchObject({
      email: 'linnea.bergstrom@example.test',
      given_name: 'Linnea',
      hsa_id: LINNEA_HSA_ID,
      last_fetched_at: PRIVACY_SEED_TS,
      surname: 'Bergström',
    })
    expect(
      seedRowsFor(rows, 'specification_co_authors').find(
        row => row.created_by_hsa_id === LINNEA_HSA_ID,
      )?.created_by_display_name,
    ).toBe(LINNEA_DISPLAY_NAME)
    expect(
      seedRowsFor(rows, 'action_audit_events').find(
        row => row.actor_hsa_id === LINNEA_HSA_ID,
      )?.actor_display_name,
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
        'DNR-KH-2025-0142: IAM- och repobehörighetsöversyn 2025',
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

    await seedDemoDatabase(executor)

    expect(RETENTION_POSITIVE_SOURCE_KEYS).toEqual([
      'requirement_areas.unused',
      'requirement_packages.unused',
      'norm_references.unused',
      'requirement_versions.archived_unused',
      'requirement_versions.review_stale',
      'requirement_versions.draft_stale',
      'requirements_specifications.obsolete',
      'requirement_selection_questions.archived',
      'requirement_selection_answers.archived',
      'rfi_question_versions.historical_unreferenced',
      'rfi_questions.archived_unreferenced',
      'requirement_responsibility_people.orphaned',
    ])

    const areas = rowById(seedRowsFor(rows, 'requirement_areas'))
    const packages = rowById(seedRowsFor(rows, 'requirement_packages'))
    const norms = rowById(seedRowsFor(rows, 'norm_references'))
    const requirements = rowById(seedRowsFor(rows, 'requirements'))
    const versions = rowById(seedRowsFor(rows, 'requirement_versions'))
    const specifications = rowById(
      seedRowsFor(rows, 'requirements_specifications'),
    )
    const requirementSelectionQuestions = rowById(
      seedRowsFor(rows, 'requirement_selection_questions'),
    )
    const requirementSelectionAnswers = rowById(
      seedRowsFor(rows, 'requirement_selection_answers'),
    )
    const rfiQuestions = rowById(seedRowsFor(rows, 'rfi_questions'))
    const rfiQuestionVersions = rowById(
      seedRowsFor(rows, 'rfi_question_versions'),
    )
    const rfiQuestionSuggestions = rowById(
      seedRowsFor(rows, 'rfi_question_suggestions'),
    )
    const responsibilityPeople = new Map(
      seedRowsFor(rows, 'requirement_responsibility_people').map(row => [
        row.hsa_id,
        row,
      ]),
    )
    const savedRequirementSelectionAnswers = seedRowsFor(
      rows,
      'specification_requirement_selection_answers',
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
    const specificationRfiLists = seedRowsFor(rows, 'specification_rfi_lists')
    const specificationRfiQuestionItems = seedRowsFor(
      rows,
      'specification_rfi_question_items',
    )

    expect(seedRowsFor(rows, 'owners')).toHaveLength(0)
    expect(
      seedRowsFor(rows, 'requirement_areas').some(
        row => row.owner_hsa_id === 'SE5560000001-retentionorphan',
      ),
    ).toBe(false)
    expect(
      seedRowsFor(rows, 'requirement_packages').some(
        row => row.lead_hsa_id === 'SE5560000001-retentionorphan',
      ),
    ).toBe(false)

    expect(areas.get(RETENTION_SEED.requirementArea.unused)).toMatchObject({
      name: 'RETENTION-SEED oanvänt kravområde',
      updated_at: '2023-01-15 09:00:00',
    })
    expect(
      packages.get(RETENTION_SEED.requirementPackage.unused),
    ).toMatchObject({
      name: 'RETENTION-SEED oanvänt kravpaket',
      updated_at: '2023-01-15 09:00:00',
    })
    expect(norms.get(RETENTION_SEED.normReference.unused)).toMatchObject({
      name: 'RETENTION-SEED oanvänd normreferens',
      updated_at: '2023-01-15 09:00:00',
    })
    expect(
      responsibilityPeople.get(RETENTION_SEED.responsibilityPerson.orphan),
    ).toMatchObject({
      given_name: 'Rolf',
      surname: 'RetentionOrphan',
      updated_at: '2023-01-15 09:00:00',
    })
    expect(
      responsibilityPeople.get(
        RETENTION_SEED.responsibilityPerson.stillAssigned,
      ),
    ).toMatchObject({
      given_name: 'Lena',
      surname: 'RetentionLinked',
      updated_at: '2023-01-15 09:00:00',
    })
    expect(
      responsibilityPeople.get(RETENTION_SEED.responsibilityPerson.freshOrphan),
    ).toMatchObject({
      given_name: 'Freja',
      surname: 'RetentionFresh',
      updated_at: '2026-04-25 09:00:00',
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
      responsible_hsa_id: 'SE5560000001-seed',
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
    expect(
      localRequirements.get(
        RETENTION_SEED.localRequirement.obsoleteSpecification,
      ),
    ).not.toHaveProperty('requirement_area_id')

    expect(
      seedRowsFor(rows, 'requirement_areas').some(
        row => row.owner_hsa_id === 'SE5560000001-retentionlinked',
      ),
    ).toBe(true)
    expect(
      seedRowsFor(rows, 'requirement_packages').some(
        row => row.lead_hsa_id === 'SE5560000001-retentionlinked',
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
    expect(
      requirementSelectionQuestions.get(
        RETENTION_SEED.requirementSelectionQuestion.unusedArchived,
      ),
    ).toMatchObject({
      archived_at: '2024-01-15 09:00:00',
      is_archived: 1,
      question_code: 'RSK-KUF901',
    })
    expect(
      requirementSelectionAnswers.get(
        RETENTION_SEED.requirementSelectionAnswer.unusedArchived,
      ),
    ).toMatchObject({
      archived_at: '2024-01-15 09:00:00',
      is_archived: 1,
      question_id:
        RETENTION_SEED.requirementSelectionQuestion.withArchivedAnswer,
    })
    expect(
      requirementSelectionQuestions.get(
        RETENTION_SEED.requirementSelectionQuestion.freshArchived,
      ),
    ).toMatchObject({
      archived_at: '2026-04-25 09:00:00',
    })
    expect(
      savedRequirementSelectionAnswers.some(
        row =>
          row.question_id ===
          RETENTION_SEED.requirementSelectionQuestion.blockedHistory,
      ),
    ).toBe(true)
    expect(
      requirementSelectionAnswers.get(
        RETENTION_SEED.requirementSelectionAnswer.questionHistoryChild,
      ),
    ).toMatchObject({
      archived_at: '2024-01-15 09:00:00',
      is_archived: 1,
      question_id: RETENTION_SEED.requirementSelectionQuestion.blockedHistory,
    })
    expect(
      savedRequirementSelectionAnswers.some(
        row =>
          row.answer_id ===
          RETENTION_SEED.requirementSelectionAnswer.blockedHistory,
      ),
    ).toBe(true)
    expect(
      rfiQuestionVersions.get(
        RETENTION_SEED.rfiQuestionVersion.historicalUnreferencedVersion,
      ),
    ).toMatchObject({
      is_active: 0,
      rfi_question_id: RETENTION_SEED.rfiQuestion.historicalUnreferenced,
      updated_at: '2023-01-15 09:00:00',
    })
    expect(
      rfiQuestionVersions.get(
        RETENTION_SEED.rfiQuestionVersion.historicalUnreferencedActive,
      ),
    ).toMatchObject({
      is_active: 1,
      rfi_question_id: RETENTION_SEED.rfiQuestion.historicalUnreferenced,
      version_number: 2,
    })
    expect(
      rfiQuestions.get(RETENTION_SEED.rfiQuestion.archivedUnreferenced),
    ).toMatchObject({
      archived_at: '2023-01-15 09:00:00',
      is_archived: 1,
      question_code: 'RSK-RFI911',
    })
    expect(
      rfiQuestionVersions.get(
        RETENTION_SEED.rfiQuestionVersion.historicalFreshVersion,
      ),
    ).toMatchObject({
      is_active: 0,
      updated_at: '2026-04-25 09:00:00',
    })
    expect(
      rfiQuestions.get(RETENTION_SEED.rfiQuestion.archivedFresh),
    ).toMatchObject({
      archived_at: '2026-04-25 09:00:00',
      is_archived: 1,
    })
    expect(specificationRfiLists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          is_locked: 0,
          specification_id: RETENTION_SEED.specification.management,
        }),
      ]),
    )
    expect(specificationRfiQuestionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rfi_question_id: RETENTION_SEED.rfiQuestion.historicalBlockedList,
          rfi_question_version_id:
            RETENTION_SEED.rfiQuestionVersion.historicalBlockedListVersion,
          specification_id: RETENTION_SEED.specification.management,
        }),
        expect.objectContaining({
          rfi_question_id: RETENTION_SEED.rfiQuestion.archivedBlockedList,
          rfi_question_version_id:
            RETENTION_SEED.rfiQuestionVersion.archivedBlockedListActive,
          specification_id: RETENTION_SEED.specification.management,
        }),
      ]),
    )
    expect(
      rfiQuestionSuggestions.get(
        RETENTION_SEED.rfiQuestionSuggestion.archivedBlockedSuggestion,
      ),
    ).toMatchObject({
      resolution: 1,
      rfi_question_id: RETENTION_SEED.rfiQuestion.archivedBlockedSuggestion,
      specification_id: RETENTION_SEED.specification.management,
    })
  })
})
