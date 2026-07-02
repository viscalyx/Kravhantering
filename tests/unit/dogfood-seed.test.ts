import { describe, expect, it } from 'vitest'
import {
  AREA_PREFIX_BY_ID,
  DOGFOOD_AREAS,
  DOGFOOD_KH_INFOR_INDEXES,
  DOGFOOD_KRAV,
  DOGFOOD_NORMS,
  DOGFOOD_OWNERS,
  DOGFOOD_REQUIREMENT_PACKAGES,
  DOGFOOD_SPECIFICATION_LOCALS,
  DOGFOOD_SPECIFICATIONS,
  ID,
  SPEC_KH,
  SPEC_KH_INFOR,
  VERSION_ID_BASE,
} from '../../typeorm/seed-dogfood.mjs'
import { appendDogfoodSeed } from '../../typeorm/seed-dogfood-build.mjs'
import { PWT_MANUAL_SEED } from '../../typeorm/seed-playwright-manual-cases-build.mjs'

function emptySeed() {
  return {
    norm_references: {
      columns: [
        'id',
        'norm_reference_id',
        'name',
        'type',
        'reference',
        'version',
        'issuer',
        'created_at',
        'updated_at',
        'uri',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_packages: {
      columns: [
        'id',
        'name',
        'description',
        'lead_hsa_id',
        'is_archived',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_areas: {
      columns: [
        'id',
        'prefix',
        'name',
        'description',
        'owner_hsa_id',
        'next_sequence',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [
        [1, 'INT', 'Integration', 'desc', 'SE5560000001-annaj', 39, 't', 't'],
        [2, 'SÄK', 'Säkerhet', 'desc', 'SE5560000001-1002', 41, 't', 't'],
        [3, 'PRE', 'Prestanda', 'desc', 'SE5560000001-annaj', 38, 't', 't'],
        [4, 'ANV', 'Användbarhet', 'desc', 'SE5560000001-marias', 37, 't', 't'],
        [5, 'LAG', 'Lagring', 'desc', 'SE5560000001-annaj', 38, 't', 't'],
        [6, 'BEH', 'Behörighet', 'desc', 'SE5560000001-1002', 37, 't', 't'],
        [7, 'IDN', 'Identitet', 'desc', 'SE5560000001-1002', 37, 't', 't'],
        [8, 'LOG', 'Loggning', 'desc', 'SE5560000001-annaj', 38, 't', 't'],
        [9, 'DRF', 'Drift', 'desc', 'SE5560000001-marias', 36, 't', 't'],
        [10, 'DAT', 'Data', 'desc', 'SE5560000001-annaj', 36, 't', 't'],
      ],
    },
    requirements: {
      columns: [
        'id',
        'unique_id',
        'requirement_area_id',
        'sequence_number',
        'is_archived',
        'created_at',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_versions: {
      columns: [
        'id',
        'requirement_id',
        'version_number',
        'description',
        'acceptance_criteria',
        'requirement_category_id',
        'requirement_type_id',
        'quality_characteristic_id',
        'requirement_status_id',
        'is_testing_required',
        'verification_method',
        'created_at',
        'edited_at',
        'published_at',
        'archived_at',
        'created_by',
        'archive_initiated_at',
        'priority_level_id',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_version_norm_references: {
      columns: ['requirement_version_id', 'norm_reference_id'],
      pk: ['requirement_version_id', 'norm_reference_id'],
      rows: [],
    },
    requirement_version_requirement_packages: {
      columns: ['requirement_version_id', 'requirement_package_id'],
      pk: ['requirement_version_id', 'requirement_package_id'],
      rows: [],
    },
    requirements_specifications: {
      columns: [
        'id',
        'specification_governance_object_type_id',
        'specification_implementation_type_id',
        'created_at',
        'updated_at',
        'business_needs_reference',
        'unique_id',
        'name',
        'specification_lifecycle_status_id',
        'local_requirement_next_sequence',
      ],
      pk: ['id'],
      rows: [],
    },
    specification_needs_references: {
      columns: [
        'id',
        'specification_id',
        'text',
        'description',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    specification_local_requirements: {
      columns: [
        'id',
        'specification_id',
        'unique_id',
        'sequence_number',
        'description',
        'acceptance_criteria',
        'requirement_category_id',
        'requirement_type_id',
        'quality_characteristic_id',
        'priority_level_id',
        'is_testing_required',
        'verification_method',
        'needs_reference_id',
        'specification_item_status_id',
        'note',
        'status_updated_at',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    specification_local_requirement_norm_references: {
      columns: ['specification_local_requirement_id', 'norm_reference_id'],
      pk: ['specification_local_requirement_id', 'norm_reference_id'],
      rows: [],
    },
    requirements_specification_items: {
      columns: [
        'id',
        'requirements_specification_id',
        'requirement_id',
        'requirement_version_id',
        'needs_reference_id',
        'created_at',
        'specification_item_status_id',
        'note',
        'status_updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_selection_question_sequences: {
      columns: ['area_id', 'next_sequence'],
      pk: ['area_id'],
      rows: [],
    },
    requirement_selection_questions: {
      columns: [
        'id',
        'question_code',
        'area_id',
        'selection_type',
        'question_text',
        'help_text',
        'sort_order',
        'is_active',
        'is_archived',
        'archived_at',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_selection_answers: {
      columns: [
        'id',
        'question_id',
        'answer_text',
        'description',
        'sort_order',
        'is_no_requirement_selection',
        'is_active',
        'is_archived',
        'archived_at',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_selection_question_visibility_groups: {
      columns: ['id', 'question_id', 'sort_order', 'created_at', 'updated_at'],
      pk: ['id'],
      rows: [],
    },
    requirement_selection_question_visibility_conditions: {
      columns: [
        'id',
        'visibility_group_id',
        'parent_question_id',
        'answer_id',
        'sort_order',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_selection_answer_packages: {
      columns: ['answer_id', 'requirement_package_id'],
      pk: ['answer_id', 'requirement_package_id'],
      rows: [],
    },
    requirement_selection_answer_requirements: {
      columns: ['answer_id', 'requirement_id'],
      pk: ['answer_id', 'requirement_id'],
      rows: [],
    },
    specification_requirement_selection_answers: {
      columns: [
        'specification_id',
        'question_id',
        'answer_id',
        'is_historical',
        'changed_at',
        'changed_by_hsa_id',
        'changed_by_display_name',
      ],
      pk: ['specification_id', 'question_id', 'answer_id'],
      rows: [],
    },
    requirement_area_co_authors: {
      columns: [
        'area_id',
        'hsa_id',
        'created_at',
        'created_by_hsa_id',
        'created_by_display_name',
      ],
      pk: ['area_id', 'hsa_id'],
      rows: [],
    },
    specification_co_authors: {
      columns: [
        'specification_id',
        'hsa_id',
        'created_at',
        'created_by_hsa_id',
        'created_by_display_name',
      ],
      pk: ['specification_id', 'hsa_id'],
      rows: [],
    },
    rfi_question_sequences: {
      columns: ['area_id', 'next_sequence'],
      pk: ['area_id'],
      rows: [],
    },
    rfi_questions: {
      columns: [
        'id',
        'question_code',
        'area_id',
        'sort_order',
        'is_archived',
        'archived_at',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    rfi_question_versions: {
      columns: [
        'id',
        'rfi_question_id',
        'version_number',
        'question_text',
        'help_text',
        'expected_answer_format',
        'is_active',
        'created_by_hsa_id',
        'created_by_display_name',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    rfi_question_version_requirement_packages: {
      columns: ['rfi_question_version_id', 'requirement_package_id'],
      pk: ['rfi_question_version_id', 'requirement_package_id'],
      rows: [],
    },
    specification_rfi_lists: {
      columns: [
        'specification_id',
        'is_locked',
        'locked_at',
        'locked_by_hsa_id',
        'locked_by_display_name',
        'created_at',
        'updated_at',
      ],
      pk: ['specification_id'],
      rows: [],
    },
    specification_rfi_question_items: {
      columns: [
        'specification_id',
        'rfi_question_id',
        'rfi_question_version_id',
        'is_included',
        'relevance',
        'changed_at',
        'changed_by_hsa_id',
        'changed_by_display_name',
      ],
      pk: ['specification_id', 'rfi_question_id'],
      rows: [],
    },
    rfi_question_suggestions: {
      columns: [
        'id',
        'area_id',
        'rfi_question_id',
        'specification_id',
        'source_specification_unique_id',
        'source_specification_name',
        'content',
        'is_review_requested',
        'review_requested_at',
        'resolution',
        'resolution_motivation',
        'created_by_hsa_id',
        'created_by_display_name',
        'created_at',
        'updated_at',
        'resolved_by_hsa_id',
        'resolved_by_display_name',
        'resolved_at',
      ],
      pk: ['id'],
      rows: [],
    },
    improvement_suggestions: {
      columns: [
        'id',
        'requirement_id',
        'requirement_version_id',
        'content',
        'is_review_requested',
        'resolution',
        'resolution_motivation',
        'resolved_by',
        'resolved_at',
        'created_by',
        'created_at',
        'updated_at',
        'review_requested_at',
      ],
      pk: ['id'],
      rows: [],
    },
  }
}

describe('dogfood seed inventory', () => {
  it('every Krav fills all required properties', () => {
    expect(DOGFOOD_KRAV).toHaveLength(59)
    for (const k of DOGFOOD_KRAV) {
      expect(typeof k.area).toBe('number')
      expect(AREA_PREFIX_BY_ID[k.area]).toBeTruthy()
      expect(k.desc).toBeTruthy()
      expect(k.ac).toBeTruthy()
      expect(k.vm).toBeTruthy()
      expect(typeof k.cat).toBe('number')
      expect(typeof k.type).toBe('number')
      expect(typeof k.qc).toBe('number')
      expect(typeof k.risk).toBe('number')
      expect(typeof k.test).toBe('boolean')
      expect(Array.isArray(k.pkg)).toBe(true)
      expect(Array.isArray(k.norm)).toBe(true)
      expect(typeof k.item).toBe('number')
    }
  })

  it('Krav descriptions and acceptance criteria meet minimum lengths', () => {
    for (const k of DOGFOOD_KRAV) {
      expect(k.desc.length).toBeGreaterThan(20)
      expect(k.ac.length).toBeGreaterThan(20)
    }
  })

  it('areas, person fixtures, norms and requirement packages have expected sizes', () => {
    expect(DOGFOOD_OWNERS).toHaveLength(5)
    expect(DOGFOOD_AREAS).toHaveLength(6)
    expect(DOGFOOD_NORMS).toHaveLength(6)
    expect(DOGFOOD_REQUIREMENT_PACKAGES).toHaveLength(11)
    expect(DOGFOOD_SPECIFICATIONS).toHaveLength(2)
  })

  it('reuses the base Användarvänlighet requirement package', () => {
    expect(ID.pkg.anvandbarhet).toBe(5)
    expect(DOGFOOD_REQUIREMENT_PACKAGES.map(pkg => pkg[0])).not.toContain(
      ID.pkg.anvandbarhet,
    )
    expect(DOGFOOD_REQUIREMENT_PACKAGES.map(pkg => pkg[1])).not.toContain(
      'Användarvänlighet',
    )
  })

  it('specification-local entries reference Krav that are also in KH-INFOR', () => {
    const infor = new Set(DOGFOOD_KH_INFOR_INDEXES)
    expect(infor.size).toBe(DOGFOOD_KH_INFOR_INDEXES.length)
    for (const idx of DOGFOOD_KH_INFOR_INDEXES) {
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(DOGFOOD_KRAV.length)
    }
    for (const pl of DOGFOOD_SPECIFICATION_LOCALS) {
      expect(infor.has(pl.kravIdx)).toBe(true)
      expect(DOGFOOD_KRAV[pl.kravIdx]).toBeDefined()
    }
  })
})

describe('appendDogfoodSeed', () => {
  it('produces KH and KH-INFOR specifications with expected items and all v1 Publicerad', () => {
    const seed = emptySeed()
    const summary = appendDogfoodSeed(seed)

    expect(summary.requirementsAdded).toBe(DOGFOOD_KRAV.length)
    expect(summary.specificationsAdded).toBe(2)

    const pkgs = seed.requirements_specifications.rows
    const kh = pkgs.find(r => r[0] === SPEC_KH)
    const khInfor = pkgs.find(r => r[0] === SPEC_KH_INFOR)
    expect(kh).toBeDefined()
    expect(khInfor).toBeDefined()
    expect(kh?.[6]).toBe('KH')
    expect(khInfor?.[6]).toBe('KH-INFOR')
    expect(kh?.[8]).toBe(ID.specLifecycle.utveckling)
    expect(khInfor?.[8]).toBe(ID.specLifecycle.inforande)

    const items = seed.requirements_specification_items.rows
    expect(items.filter(r => r[1] === SPEC_KH)).toHaveLength(
      DOGFOOD_KRAV.length,
    )
    expect(items.filter(r => r[1] === SPEC_KH_INFOR)).toHaveLength(
      DOGFOOD_KH_INFOR_INDEXES.length,
    )

    // All dogfood requirement_versions are v1 + Publicerad. Manual-case
    // fixtures appended by the demo/test seed include draft and archived rows.
    const dogfoodVersionIds = new Set(
      Array.from(
        { length: DOGFOOD_KRAV.length },
        (_, index) => VERSION_ID_BASE + index + 1,
      ),
    )
    const versions = seed.requirement_versions.rows.filter(row =>
      dogfoodVersionIds.has(row[0] as number),
    )
    expect(versions).toHaveLength(DOGFOOD_KRAV.length)
    for (const v of versions) {
      expect(v[2]).toBe(1) // version_number
      expect(v[8]).toBe(ID.status.publicerad) // requirement_status_id
      expect(v[13]).toBeTruthy() // published_at
      expect(v[14]).toBeNull() // archived_at
    }

    // Every requirement application points to a published v1.
    const versionById = new Map(versions.map(v => [v[0], v]))
    const dogfoodItems = items.filter(
      row => row[1] === SPEC_KH || row[1] === SPEC_KH_INFOR,
    )
    for (const it of dogfoodItems) {
      const v = versionById.get(it[3])
      expect(v).toBeDefined()
      expect(v?.[8]).toBe(ID.status.publicerad)
    }

    // Existing area's next_sequence is bumped by the krav count for that area
    const intArea = seed.requirement_areas.rows.find(r => r[0] === 1)
    const intCount = DOGFOOD_KRAV.filter(k => k.area === 1).length
    expect(intArea?.[5]).toBe(39 + intCount)

    // Specification locals appended for KH-INFOR only
    const locals = seed.specification_local_requirements.rows
    expect(locals.filter(r => r[1] === SPEC_KH)).toHaveLength(0)
    expect(locals.filter(r => r[1] === SPEC_KH_INFOR)).toHaveLength(
      DOGFOOD_SPECIFICATION_LOCALS.length,
    )
  })

  it('appends requirement-selection demo questions, answers and saved choices', () => {
    const seed = emptySeed()
    const summary = appendDogfoodSeed(seed)

    expect(summary.requirementSelectionQuestionsAdded).toBe(9)
    expect(summary.requirementSelectionAnswersAdded).toBe(31)
    expect(summary.specificationRequirementSelectionAnswersAdded).toBe(22)

    const questions = seed.requirement_selection_questions.rows
    expect(questions).toHaveLength(9)
    expect(questions.map(row => row[1])).toEqual([
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
    expect(questions.every(row => row[7] === 1 && row[8] === 0)).toBe(true)

    const sequenceByArea = new Map(
      seed.requirement_selection_question_sequences.rows.map(row => [
        row[0],
        row[1],
      ]),
    )
    expect(sequenceByArea).toEqual(
      new Map([
        [ID.area.SAK, 2],
        [ID.area.INT, 2],
        [ID.area.DRF, 5],
        [ID.area.ANV, 2],
        [ID.area.RAP, 2],
        [ID.area.KVA, 2],
      ]),
    )

    const answers = seed.requirement_selection_answers.rows
    const packageLinks = seed.requirement_selection_answer_packages.rows
    const requirementLinks = seed.requirement_selection_answer_requirements.rows
    expect(answers).toHaveLength(31)
    expect(packageLinks).toHaveLength(47)
    expect(requirementLinks).toHaveLength(47)

    const noRequirementAnswerIds = new Set(
      answers.filter(row => row[5] === 1).map(row => row[0]),
    )
    expect(noRequirementAnswerIds).toEqual(new Set([7, 11, 16, 22]))
    for (const answerId of noRequirementAnswerIds) {
      expect(packageLinks.some(row => row[0] === answerId)).toBe(false)
      expect(requirementLinks.some(row => row[0] === answerId)).toBe(false)
    }

    expect(packageLinks.some(row => row[0] === 6)).toBe(true)
    expect(requirementLinks.some(row => row[0] === 6)).toBe(false)
    expect(packageLinks.some(row => row[0] === 4)).toBe(true)
    expect(requirementLinks.some(row => row[0] === 4)).toBe(true)

    const visibilityGroups = seed
      .requirement_selection_question_visibility_groups.rows as Array<
      Array<number | string>
    >
    const visibilityConditions = seed
      .requirement_selection_question_visibility_conditions.rows as Array<
      Array<number | string>
    >
    expect(visibilityGroups).toEqual([
      [1, 6, 0, expect.any(String), expect.any(String)],
      [2, 7, 0, expect.any(String), expect.any(String)],
      [3, 8, 0, expect.any(String), expect.any(String)],
      [4, 9, 0, expect.any(String), expect.any(String)],
      [5, 9, 1, expect.any(String), expect.any(String)],
    ])
    expect(visibilityConditions.map(row => row.slice(1, 5))).toEqual([
      [1, 2, 4, 0],
      [1, 2, 5, 1],
      [1, 2, 6, 2],
      [2, 3, 8, 0],
      [2, 3, 10, 1],
      [3, 3, 9, 0],
      [3, 3, 10, 1],
      [4, 7, 25, 0],
      [5, 8, 27, 0],
      [5, 8, 28, 1],
    ])

    const savedAnswers = seed.specification_requirement_selection_answers.rows
    expect(savedAnswers).toHaveLength(22)
    expect(new Set(savedAnswers.map(row => row[0]))).toEqual(
      new Set([1, 7, 8, SPEC_KH_INFOR]),
    )
    expect(savedAnswers.some(row => row[3] === 1)).toBe(true)
    expect(savedAnswers).toContainEqual([
      7,
      5,
      18,
      1,
      expect.any(String),
      'SE5560000001-oscarn',
      'Oscar Nilsson',
    ])
  })

  it('appends deterministic Playwright manual-case demo fixtures', () => {
    const seed = emptySeed()
    const summary = appendDogfoodSeed(seed)

    expect(summary.playwrightManualCaseRequirementsAdded).toBe(207)
    expect(summary.playwrightManualCaseSpecificationsAdded).toBe(7)

    const requirementUniqueIds = new Set(
      seed.requirements.rows.map(row => row[1]),
    )
    expect([...requirementUniqueIds]).toEqual(
      expect.arrayContaining([
        'PWT-LIFE-RESTORE',
        'PWT-LIFE-PACKAGE-SWAP',
        'PWT-LIFE-PACKAGE-ARCHIVE',
        'PWT-SPEC-EDIT-SOURCE',
      ]),
    )

    const specificationUniqueIds = new Set(
      seed.requirements_specifications.rows.map(row => row[6]),
    )
    expect([...specificationUniqueIds]).toEqual(
      expect.arrayContaining([
        'PWT-SPEC-EDIT-2026',
        'PWT-SPEC-REPORT-INFOR',
        'PWT-SPEC-REPORT-UTV',
        'PWT-SPEC-REPORT-FORV',
        'PWT-SPEC-TRACE-200',
        'PWT-SPEC-TRACE-201',
        'PWT-RFI-WORKFLOW-2026',
      ]),
    )

    const items = seed.requirements_specification_items.rows
    expect(
      items.filter(row => row[1] === PWT_MANUAL_SEED.specification.trace200),
    ).toHaveLength(200)
    expect(
      items.filter(row => row[1] === PWT_MANUAL_SEED.specification.trace201),
    ).toHaveLength(201)

    expect(
      seed.rfi_question_suggestions.rows.filter(
        row => (row[0] as number) >= 920000,
      ),
    ).toHaveLength(4)
    expect(seed.specification_co_authors.rows).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          PWT_MANUAL_SEED.specification.rfiWorkflow,
          'SE5560000001-specco1',
        ]),
      ]),
    )
    expect(seed.improvement_suggestions.rows).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          920001,
          PWT_MANUAL_SEED.requirement.editSource,
        ]),
      ]),
    )
  })

  it('mints unique IDs from current area next_sequence rows', () => {
    const seed = emptySeed()
    const intArea = seed.requirement_areas.rows.find(r => r[0] === ID.area.INT)
    if (!intArea) throw new Error('Expected INT area in test seed')

    intArea[5] = 99
    appendDogfoodSeed(seed)

    const intRequirements = seed.requirements.rows.filter(
      r => r[2] === ID.area.INT,
    )
    const intCount = DOGFOOD_KRAV.filter(k => k.area === ID.area.INT).length
    expect(intRequirements[0]?.[1]).toBe('INT0099')
    expect(intRequirements[0]?.[3]).toBe(99)
    expect(intArea[5]).toBe(99 + intCount)
  })
})
