// Deterministic fixtures for Admin > Archiving retention previews.
//
// Public entry point: appendArchivingRetentionSeed(SEED_DATA)
//
// The rows use a dedicated 910000+ ID range and RETENTION-SEED labels so they
// are easy to recognize in the Admin UI after a local db:seed:demo run.

const OLD_730_TS = '2023-01-15 09:00:00'
const OLD_365_TS = '2024-01-15 09:00:00'
const NEW_TS = '2026-04-25 09:00:00'

export const RETENTION_SEED = Object.freeze({
  deviation: {
    library: 910300,
    local: 910301,
  },
  localRequirement: {
    obsoleteSpecification: 910300,
  },
  needsReference: {
    obsoleteSpecificationLibrary: 910300,
    obsoleteSpecificationLocal: 910301,
  },
  normReference: {
    freshUnused: 910032,
    unused: 910030,
    used: 910031,
  },
  requirement: {
    archivedUnused: 910101,
    archiveReview: 910105,
    currentSpecificationLink: 910106,
    draftStale: 910103,
    historyOnly: 910104,
    reviewStale: 910102,
    specificationLibrary: 910201,
  },
  requirementArea: {
    freshUnused: 910012,
    unused: 910010,
    used: 910011,
  },
  requirementPackage: {
    freshUnused: 910022,
    unused: 910020,
    used: 910021,
  },
  responsibilityPerson: {
    freshOrphan: 'SE5560000001-retentionfresh',
    orphan: 'SE5560000001-retentionorphan',
    stillAssigned: 'SE5560000001-retentionlinked',
  },
  rfiQuestion: {
    archivedBlockedList: 910513,
    archivedBlockedSuggestion: 910514,
    archivedFresh: 910512,
    archivedUnreferenced: 910511,
    historicalBlockedList: 910503,
    historicalFresh: 910502,
    historicalUnreferenced: 910501,
  },
  rfiQuestionSuggestion: {
    archivedBlockedSuggestion: 910501,
  },
  rfiQuestionVersion: {
    archivedBlockedListActive: 910515,
    archivedBlockedSuggestionActive: 910516,
    archivedFreshActive: 910514,
    archivedUnreferencedActive: 910513,
    historicalBlockedListActive: 910506,
    historicalBlockedListVersion: 910505,
    historicalFreshActive: 910504,
    historicalFreshVersion: 910503,
    historicalUnreferencedActive: 910502,
    historicalUnreferencedVersion: 910501,
  },
  requirementVersion: {
    archivedUnused: 910101,
    archiveReview: 910105,
    currentSpecificationLink: 910106,
    draftStale: 910103,
    historyOnly: 910104,
    reviewStale: 910102,
    specificationLibrary: 910201,
  },
  requirementSelectionAnswer: {
    blockedHistory: 910416,
    freshArchived: 910415,
    questionCandidateChild: 910411,
    questionHistoryChild: 910413,
    unusedArchived: 910414,
  },
  requirementSelectionQuestion: {
    blockedHistory: 910403,
    freshArchived: 910402,
    unusedArchived: 910401,
    withArchivedAnswer: 910404,
  },
  specification: {
    freshObsolete: 910302,
    management: 910301,
    obsolete: 910300,
  },
  specificationItem: {
    currentLink: 910301,
    library: 910300,
  },
})

export const RETENTION_HISTORY_ONLY_VERSION_IDS = [
  RETENTION_SEED.requirementVersion.historyOnly,
]

export const RETENTION_POSITIVE_SOURCE_KEYS = [
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
]

function tableSection(seedData, name) {
  const table = seedData[name]
  if (!table)
    throw new Error(`Archiving retention seed: missing table '${name}'`)
  return table
}

function ensureRow(table, row, pkColumns) {
  const indexes = pkColumns.map(column => table.columns.indexOf(column))
  if (indexes.some(index => index < 0)) {
    throw new Error(
      `Archiving retention seed: missing PK column for ${pkColumns.join(', ')}`,
    )
  }
  const matches = existing =>
    indexes.every(index => existing[index] === row[index])
  if (!table.rows.some(matches)) table.rows.push(row)
}

function rowFromColumns(table, values) {
  return table.columns.map(column =>
    Object.hasOwn(values, column) ? values[column] : null,
  )
}

function ensureColumn(table, columnName, defaultValue = null) {
  if (table.columns.includes(columnName)) return
  table.columns.push(columnName)
  for (const row of table.rows) {
    row.push(defaultValue)
  }
}

function addRow(seedData, tableName, values) {
  const table = tableSection(seedData, tableName)
  ensureRow(table, rowFromColumns(table, values), table.pk)
}

function requirementVersionRow(values) {
  return {
    acceptance_criteria:
      'RETENTION-SEED verifierar att gallringskandidaten matchas deterministiskt i Admin > Arkivering.',
    archive_initiated_at: null,
    archived_at: null,
    created_at: OLD_365_TS,
    created_by: 'seed',
    description:
      'RETENTION-SEED kravversion för deterministisk gallrings- och arkiveringspreview.',
    edited_at: OLD_365_TS,
    is_testing_required: 1,
    published_at: null,
    quality_characteristic_id: 1,
    requirement_category_id: 2,
    requirement_type_id: 1,
    priority_level_id: 2,
    verification_method: 'Seed fixture inspected through Admin > Arkivering.',
    version_number: 1,
    ...values,
  }
}

function addRetentionTaxonomy(seedData) {
  ensureColumn(tableSection(seedData, 'requirement_areas'), 'owner_hsa_id')

  for (const area of [
    {
      description:
        'RETENTION-SEED kravområde utan krav- eller lokalkravkoppling.',
      id: RETENTION_SEED.requirementArea.unused,
      name: 'RETENTION-SEED oanvänt kravområde',
      prefix: 'RSU',
      updatedAt: OLD_730_TS,
    },
    {
      description:
        'RETENTION-SEED kravområde som används av krav och lokalkrav.',
      id: RETENTION_SEED.requirementArea.used,
      name: 'RETENTION-SEED använt kravområde',
      prefix: 'RSK',
      updatedAt: OLD_730_TS,
    },
    {
      description: 'RETENTION-SEED kravområde som är oanvänt men för nytt.',
      id: RETENTION_SEED.requirementArea.freshUnused,
      name: 'RETENTION-SEED nytt oanvänt kravområde',
      prefix: 'RSN',
      updatedAt: NEW_TS,
    },
  ]) {
    addRow(seedData, 'requirement_areas', {
      created_at: area.updatedAt,
      description: area.description,
      id: area.id,
      name: area.name,
      next_sequence: 20,
      owner_hsa_id: 'SE5560000001-retentionlinked',
      prefix: area.prefix,
      updated_at: area.updatedAt,
    })
  }

  for (const pkg of [
    {
      id: RETENTION_SEED.requirementPackage.unused,
      name: 'RETENTION-SEED oanvänt kravpaket',
      updatedAt: OLD_730_TS,
    },
    {
      id: RETENTION_SEED.requirementPackage.used,
      name: 'RETENTION-SEED använt kravpaket',
      updatedAt: OLD_730_TS,
    },
    {
      id: RETENTION_SEED.requirementPackage.freshUnused,
      name: 'RETENTION-SEED nytt oanvänt kravpaket',
      updatedAt: NEW_TS,
    },
  ]) {
    addRow(seedData, 'requirement_packages', {
      created_at: pkg.updatedAt,
      id: pkg.id,
      is_archived: 0,
      lead_hsa_id: 'SE5560000001-retentionlinked',
      name: pkg.name,
      purpose_and_scope: `${pkg.name} för deterministiska arkiveringstester.`,
      updated_at: pkg.updatedAt,
    })
  }

  for (const norm of [
    {
      id: RETENTION_SEED.normReference.unused,
      normReferenceId: 'RETENTION-SEED-NORM-UNUSED',
      title: 'RETENTION-SEED oanvänd normreferens',
      updatedAt: OLD_730_TS,
    },
    {
      id: RETENTION_SEED.normReference.used,
      normReferenceId: 'RETENTION-SEED-NORM-USED',
      title: 'RETENTION-SEED använd normreferens',
      updatedAt: OLD_730_TS,
    },
    {
      id: RETENTION_SEED.normReference.freshUnused,
      normReferenceId: 'RETENTION-SEED-NORM-FRESH',
      title: 'RETENTION-SEED ny oanvänd normreferens',
      updatedAt: NEW_TS,
    },
  ]) {
    addRow(seedData, 'norm_references', {
      created_at: norm.updatedAt,
      id: norm.id,
      is_archived: 0,
      issuer: 'RETENTION-SEED',
      name: norm.title,
      norm_reference_id: norm.normReferenceId,
      reference: norm.normReferenceId,
      type: 'Seed',
      updated_at: norm.updatedAt,
      uri: null,
      version: null,
    })
  }
}

function addRetentionRequirements(seedData) {
  const requirements = [
    [
      RETENTION_SEED.requirement.archivedUnused,
      'RETENTION-SEED-ARCHIVED',
      1,
      1,
    ],
    [RETENTION_SEED.requirement.reviewStale, 'RETENTION-SEED-REVIEW', 2, 0],
    [RETENTION_SEED.requirement.draftStale, 'RETENTION-SEED-DRAFT', 3, 0],
    [RETENTION_SEED.requirement.historyOnly, 'RETENTION-SEED-HISTORY', 4, 1],
    [
      RETENTION_SEED.requirement.archiveReview,
      'RETENTION-SEED-ARCHIVE-REVIEW',
      5,
      0,
    ],
    [
      RETENTION_SEED.requirement.currentSpecificationLink,
      'RETENTION-SEED-CURRENT-LINK',
      6,
      1,
    ],
    [
      RETENTION_SEED.requirement.specificationLibrary,
      'RETENTION-SEED-SPEC-LIB',
      7,
      0,
    ],
  ]
  for (const [id, uniqueId, sequence, isArchived] of requirements) {
    addRow(seedData, 'requirements', {
      created_at: OLD_365_TS,
      id,
      is_archived: isArchived,
      requirement_area_id: RETENTION_SEED.requirementArea.used,
      sequence_number: sequence,
      unique_id: uniqueId,
    })
  }

  const versions = [
    requirementVersionRow({
      archived_at: OLD_365_TS,
      has_specification_item_history: 0,
      id: RETENTION_SEED.requirementVersion.archivedUnused,
      requirement_id: RETENTION_SEED.requirement.archivedUnused,
      requirement_status_id: 4,
      status_updated_at: OLD_365_TS,
    }),
    requirementVersionRow({
      has_specification_item_history: 0,
      id: RETENTION_SEED.requirementVersion.reviewStale,
      requirement_id: RETENTION_SEED.requirement.reviewStale,
      requirement_status_id: 2,
      status_updated_at: OLD_365_TS,
    }),
    requirementVersionRow({
      has_specification_item_history: 0,
      id: RETENTION_SEED.requirementVersion.draftStale,
      requirement_id: RETENTION_SEED.requirement.draftStale,
      requirement_status_id: 1,
      status_updated_at: OLD_365_TS,
    }),
    requirementVersionRow({
      archived_at: OLD_365_TS,
      has_specification_item_history: 0,
      id: RETENTION_SEED.requirementVersion.historyOnly,
      requirement_id: RETENTION_SEED.requirement.historyOnly,
      requirement_status_id: 4,
      status_updated_at: OLD_365_TS,
    }),
    requirementVersionRow({
      archive_initiated_at: OLD_365_TS,
      has_specification_item_history: 0,
      id: RETENTION_SEED.requirementVersion.archiveReview,
      requirement_id: RETENTION_SEED.requirement.archiveReview,
      requirement_status_id: 2,
      status_updated_at: OLD_365_TS,
    }),
    requirementVersionRow({
      archived_at: OLD_365_TS,
      has_specification_item_history: 0,
      id: RETENTION_SEED.requirementVersion.currentSpecificationLink,
      requirement_id: RETENTION_SEED.requirement.currentSpecificationLink,
      requirement_status_id: 4,
      status_updated_at: OLD_365_TS,
    }),
    requirementVersionRow({
      has_specification_item_history: 0,
      id: RETENTION_SEED.requirementVersion.specificationLibrary,
      published_at: OLD_365_TS,
      requirement_id: RETENTION_SEED.requirement.specificationLibrary,
      requirement_status_id: 3,
      status_updated_at: OLD_365_TS,
    }),
  ]
  for (const version of versions) {
    addRow(seedData, 'requirement_versions', version)
  }

  for (const versionId of [
    RETENTION_SEED.requirementVersion.archivedUnused,
    RETENTION_SEED.requirementVersion.currentSpecificationLink,
    RETENTION_SEED.requirementVersion.specificationLibrary,
  ]) {
    addRow(seedData, 'requirement_version_requirement_packages', {
      requirement_package_id: RETENTION_SEED.requirementPackage.used,
      requirement_version_id: versionId,
    })
    addRow(seedData, 'requirement_version_norm_references', {
      norm_reference_id: RETENTION_SEED.normReference.used,
      requirement_version_id: versionId,
    })
  }
}

function addRetentionSpecifications(seedData) {
  for (const spec of [
    {
      id: RETENTION_SEED.specification.obsolete,
      lifecycle: 1,
      name: 'RETENTION-SEED kravunderlag utanför förvaltning',
      uniqueId: 'RETENTION-SEED-OBSOLETE-SPEC',
      updatedAt: OLD_730_TS,
    },
    {
      id: RETENTION_SEED.specification.management,
      lifecycle: 4,
      name: 'RETENTION-SEED kravunderlag i förvaltning',
      uniqueId: 'RETENTION-SEED-MANAGEMENT-SPEC',
      updatedAt: OLD_730_TS,
    },
    {
      id: RETENTION_SEED.specification.freshObsolete,
      lifecycle: 1,
      name: 'RETENTION-SEED nytt kravunderlag utanför förvaltning',
      uniqueId: 'RETENTION-SEED-FRESH-SPEC',
      updatedAt: NEW_TS,
    },
  ]) {
    addRow(seedData, 'requirements_specifications', {
      business_needs_reference: `${spec.uniqueId}: deterministisk fixture för Admin > Arkivering.`,
      created_at: spec.updatedAt,
      id: spec.id,
      local_requirement_next_sequence: 2,
      name: spec.name,
      specification_implementation_type_id: 1,
      specification_lifecycle_status_id: spec.lifecycle,
      specification_governance_object_type_id: 2,
      unique_id: spec.uniqueId,
      updated_at: spec.updatedAt,
    })
  }

  addRow(seedData, 'specification_needs_references', {
    created_at: OLD_730_TS,
    description: null,
    id: RETENTION_SEED.needsReference.obsoleteSpecificationLibrary,
    specification_id: RETENTION_SEED.specification.obsolete,
    text: 'RETENTION-SEED behovsreferens för export av kopplat katalogkrav.',
    updated_at: OLD_730_TS,
  })
  addRow(seedData, 'specification_needs_references', {
    created_at: OLD_730_TS,
    description: null,
    id: RETENTION_SEED.needsReference.obsoleteSpecificationLocal,
    specification_id: RETENTION_SEED.specification.obsolete,
    text: 'RETENTION-SEED behovsreferens för export av lokalt krav.',
    updated_at: OLD_730_TS,
  })

  for (const item of [
    {
      id: RETENTION_SEED.specificationItem.library,
      requirementId: RETENTION_SEED.requirement.specificationLibrary,
      versionId: RETENTION_SEED.requirementVersion.specificationLibrary,
    },
    {
      id: RETENTION_SEED.specificationItem.currentLink,
      requirementId: RETENTION_SEED.requirement.currentSpecificationLink,
      versionId: RETENTION_SEED.requirementVersion.currentSpecificationLink,
    },
  ]) {
    addRow(seedData, 'requirements_specification_items', {
      created_at: OLD_730_TS,
      id: item.id,
      needs_reference_id:
        RETENTION_SEED.needsReference.obsoleteSpecificationLibrary,
      note: 'RETENTION-SEED katalogkrav i kravunderlagsexport.',
      requirement_id: item.requirementId,
      requirement_version_id: item.versionId,
      requirements_specification_id: RETENTION_SEED.specification.obsolete,
      specification_item_status_id: 1,
      status_updated_at: OLD_730_TS,
    })
  }

  addRow(seedData, 'deviations', {
    created_at: OLD_730_TS,
    created_by: 'Erik Svensson',
    decided_at: OLD_730_TS,
    decided_by: 'Anna Lindqvist',
    decision: 1,
    decision_motivation:
      'RETENTION-SEED beslut som ska avidentifieras i arkivexporten.',
    id: RETENTION_SEED.deviation.library,
    is_review_requested: 1,
    motivation:
      'RETENTION-SEED avvikelse på katalogkrav för representativ arkivexport.',
    specification_item_id: RETENTION_SEED.specificationItem.library,
    updated_at: OLD_730_TS,
  })

  addRow(seedData, 'specification_local_requirements', {
    acceptance_criteria:
      'RETENTION-SEED lokalt krav ingår med taxonomi, paket och normreferens i JSON-exporten.',
    created_at: OLD_730_TS,
    description:
      'RETENTION-SEED lokalt krav för representativ kravunderlagsexport.',
    id: RETENTION_SEED.localRequirement.obsoleteSpecification,
    is_testing_required: 1,
    needs_reference_id:
      RETENTION_SEED.needsReference.obsoleteSpecificationLocal,
    note: 'RETENTION-SEED lokal kravnotering.',
    quality_characteristic_id: 1,
    requirement_category_id: 2,
    requirement_type_id: 1,
    priority_level_id: 2,
    sequence_number: 1,
    specification_id: RETENTION_SEED.specification.obsolete,
    specification_item_status_id: 1,
    status_updated_at: OLD_730_TS,
    unique_id: 'RETENTION-SEED-LR-1',
    updated_at: OLD_730_TS,
    verification_method: 'RETENTION-SEED exportverifiering.',
  })

  addRow(seedData, 'specification_local_requirement_norm_references', {
    norm_reference_id: RETENTION_SEED.normReference.used,
    specification_local_requirement_id:
      RETENTION_SEED.localRequirement.obsoleteSpecification,
  })
  addRow(seedData, 'specification_local_requirement_requirement_packages', {
    requirement_package_id: RETENTION_SEED.requirementPackage.used,
    specification_local_requirement_id:
      RETENTION_SEED.localRequirement.obsoleteSpecification,
  })
  addRow(seedData, 'specification_local_requirement_deviations', {
    created_at: OLD_730_TS,
    created_by: 'Erik Svensson',
    decided_at: OLD_730_TS,
    decided_by: 'Karl Nilsson',
    decision: 2,
    decision_motivation:
      'RETENTION-SEED lokalt avvikelsebeslut som ska avidentifieras i export.',
    id: RETENTION_SEED.deviation.local,
    is_review_requested: 1,
    motivation:
      'RETENTION-SEED lokal avvikelse för representativ kravunderlagsexport.',
    specification_local_requirement_id:
      RETENTION_SEED.localRequirement.obsoleteSpecification,
    updated_at: OLD_730_TS,
  })
}

function addRetentionRequirementSelection(seedData) {
  for (const question of [
    {
      archivedAt: OLD_365_TS,
      code: 'RSK-KUF901',
      id: RETENTION_SEED.requirementSelectionQuestion.unusedArchived,
      isArchived: 1,
      text: 'RETENTION-SEED arkiverad kravurvalsfråga utan historik',
      updatedAt: OLD_365_TS,
    },
    {
      archivedAt: NEW_TS,
      code: 'RSK-KUF902',
      id: RETENTION_SEED.requirementSelectionQuestion.freshArchived,
      isArchived: 1,
      text: 'RETENTION-SEED ny arkiverad kravurvalsfråga',
      updatedAt: NEW_TS,
    },
    {
      archivedAt: OLD_365_TS,
      code: 'RSK-KUF903',
      id: RETENTION_SEED.requirementSelectionQuestion.blockedHistory,
      isArchived: 1,
      text: 'RETENTION-SEED arkiverad kravurvalsfråga med historik',
      updatedAt: OLD_365_TS,
    },
    {
      archivedAt: null,
      code: 'RSK-KUF904',
      id: RETENTION_SEED.requirementSelectionQuestion.withArchivedAnswer,
      isArchived: 0,
      text: 'RETENTION-SEED aktiv kravurvalsfråga med arkiverade svar',
      updatedAt: OLD_365_TS,
    },
  ]) {
    addRow(seedData, 'requirement_selection_questions', {
      archived_at: question.archivedAt,
      area_id: RETENTION_SEED.requirementArea.used,
      created_at: OLD_365_TS,
      help_text:
        'RETENTION-SEED fixture för Admin > Arkivering av kravurvalscontent.',
      id: question.id,
      is_active: question.isArchived ? 0 : 1,
      is_archived: question.isArchived,
      question_code: question.code,
      question_text: question.text,
      selection_type: 'multiple',
      sort_order: 900,
      updated_at: question.updatedAt,
    })
  }

  for (const answer of [
    {
      archivedAt: OLD_365_TS,
      id: RETENTION_SEED.requirementSelectionAnswer.questionCandidateChild,
      isArchived: 1,
      questionId: RETENTION_SEED.requirementSelectionQuestion.unusedArchived,
      text: 'RETENTION-SEED arkiverat svar under frågekandidat',
      updatedAt: OLD_365_TS,
    },
    {
      archivedAt: OLD_365_TS,
      id: RETENTION_SEED.requirementSelectionAnswer.questionHistoryChild,
      isArchived: 1,
      questionId: RETENTION_SEED.requirementSelectionQuestion.blockedHistory,
      text: 'RETENTION-SEED svar med sparad kravunderlagshistorik',
      updatedAt: OLD_365_TS,
    },
    {
      archivedAt: OLD_365_TS,
      id: RETENTION_SEED.requirementSelectionAnswer.unusedArchived,
      isArchived: 1,
      questionId:
        RETENTION_SEED.requirementSelectionQuestion.withArchivedAnswer,
      text: 'RETENTION-SEED arkiverat kravurvalssvar utan historik',
      updatedAt: OLD_365_TS,
    },
    {
      archivedAt: NEW_TS,
      id: RETENTION_SEED.requirementSelectionAnswer.freshArchived,
      isArchived: 1,
      questionId:
        RETENTION_SEED.requirementSelectionQuestion.withArchivedAnswer,
      text: 'RETENTION-SEED nytt arkiverat kravurvalssvar',
      updatedAt: NEW_TS,
    },
    {
      archivedAt: OLD_365_TS,
      id: RETENTION_SEED.requirementSelectionAnswer.blockedHistory,
      isArchived: 1,
      questionId:
        RETENTION_SEED.requirementSelectionQuestion.withArchivedAnswer,
      text: 'RETENTION-SEED arkiverat kravurvalssvar med historik',
      updatedAt: OLD_365_TS,
    },
  ]) {
    addRow(seedData, 'requirement_selection_answers', {
      answer_text: answer.text,
      archived_at: answer.archivedAt,
      created_at: OLD_365_TS,
      description:
        'RETENTION-SEED fixture för Admin > Arkivering av kravurvalssvar.',
      id: answer.id,
      is_active: answer.isArchived ? 0 : 1,
      is_archived: answer.isArchived,
      is_no_requirement_selection: 1,
      question_id: answer.questionId,
      sort_order: 1,
      updated_at: answer.updatedAt,
    })
  }

  for (const saved of [
    {
      answerId: RETENTION_SEED.requirementSelectionAnswer.questionHistoryChild,
      questionId: RETENTION_SEED.requirementSelectionQuestion.blockedHistory,
    },
    {
      answerId: RETENTION_SEED.requirementSelectionAnswer.blockedHistory,
      questionId:
        RETENTION_SEED.requirementSelectionQuestion.withArchivedAnswer,
    },
  ]) {
    addRow(seedData, 'specification_requirement_selection_answers', {
      answer_id: saved.answerId,
      changed_at: OLD_365_TS,
      changed_by_display_name: 'Retention Linked',
      changed_by_hsa_id: 'SE5560000001-retentionlinked',
      is_historical: 1,
      question_id: saved.questionId,
      specification_id: RETENTION_SEED.specification.management,
    })
  }
}

function addRetentionRfi(seedData) {
  addRow(seedData, 'rfi_question_sequences', {
    area_id: RETENTION_SEED.requirementArea.used,
    next_sequence: 905,
  })

  for (const question of [
    {
      archivedAt: null,
      code: 'RSK-RFI901',
      id: RETENTION_SEED.rfiQuestion.historicalUnreferenced,
      isArchived: 0,
      sortOrder: 901,
      updatedAt: OLD_730_TS,
    },
    {
      archivedAt: null,
      code: 'RSK-RFI902',
      id: RETENTION_SEED.rfiQuestion.historicalFresh,
      isArchived: 0,
      sortOrder: 902,
      updatedAt: NEW_TS,
    },
    {
      archivedAt: null,
      code: 'RSK-RFI903',
      id: RETENTION_SEED.rfiQuestion.historicalBlockedList,
      isArchived: 0,
      sortOrder: 903,
      updatedAt: OLD_730_TS,
    },
    {
      archivedAt: OLD_730_TS,
      code: 'RSK-RFI911',
      id: RETENTION_SEED.rfiQuestion.archivedUnreferenced,
      isArchived: 1,
      sortOrder: 911,
      updatedAt: OLD_730_TS,
    },
    {
      archivedAt: NEW_TS,
      code: 'RSK-RFI912',
      id: RETENTION_SEED.rfiQuestion.archivedFresh,
      isArchived: 1,
      sortOrder: 912,
      updatedAt: NEW_TS,
    },
    {
      archivedAt: OLD_730_TS,
      code: 'RSK-RFI913',
      id: RETENTION_SEED.rfiQuestion.archivedBlockedList,
      isArchived: 1,
      sortOrder: 913,
      updatedAt: OLD_730_TS,
    },
    {
      archivedAt: OLD_730_TS,
      code: 'RSK-RFI914',
      id: RETENTION_SEED.rfiQuestion.archivedBlockedSuggestion,
      isArchived: 1,
      sortOrder: 914,
      updatedAt: OLD_730_TS,
    },
  ]) {
    addRow(seedData, 'rfi_questions', {
      archived_at: question.archivedAt,
      area_id: RETENTION_SEED.requirementArea.used,
      created_at: OLD_730_TS,
      id: question.id,
      is_archived: question.isArchived,
      question_code: question.code,
      sort_order: question.sortOrder,
      updated_at: question.updatedAt,
    })
  }

  for (const version of [
    {
      id: RETENTION_SEED.rfiQuestionVersion.historicalUnreferencedVersion,
      isActive: 0,
      questionId: RETENTION_SEED.rfiQuestion.historicalUnreferenced,
      text: 'RETENTION-SEED historisk RFI-frågeversion utan RFI-listreferens',
      updatedAt: OLD_730_TS,
      versionNumber: 1,
    },
    {
      id: RETENTION_SEED.rfiQuestionVersion.historicalUnreferencedActive,
      isActive: 1,
      questionId: RETENTION_SEED.rfiQuestion.historicalUnreferenced,
      text: 'RETENTION-SEED aktuell RFI-frågeversion för historisk kandidat',
      updatedAt: OLD_730_TS,
      versionNumber: 2,
    },
    {
      id: RETENTION_SEED.rfiQuestionVersion.historicalFreshVersion,
      isActive: 0,
      questionId: RETENTION_SEED.rfiQuestion.historicalFresh,
      text: 'RETENTION-SEED ny historisk RFI-frågeversion',
      updatedAt: NEW_TS,
      versionNumber: 1,
    },
    {
      id: RETENTION_SEED.rfiQuestionVersion.historicalFreshActive,
      isActive: 1,
      questionId: RETENTION_SEED.rfiQuestion.historicalFresh,
      text: 'RETENTION-SEED aktuell RFI-frågeversion för färsk historik',
      updatedAt: NEW_TS,
      versionNumber: 2,
    },
    {
      id: RETENTION_SEED.rfiQuestionVersion.historicalBlockedListVersion,
      isActive: 0,
      questionId: RETENTION_SEED.rfiQuestion.historicalBlockedList,
      text: 'RETENTION-SEED historisk RFI-frågeversion med RFI-listreferens',
      updatedAt: OLD_730_TS,
      versionNumber: 1,
    },
    {
      id: RETENTION_SEED.rfiQuestionVersion.historicalBlockedListActive,
      isActive: 1,
      questionId: RETENTION_SEED.rfiQuestion.historicalBlockedList,
      text: 'RETENTION-SEED aktuell RFI-frågeversion för blockerad historik',
      updatedAt: OLD_730_TS,
      versionNumber: 2,
    },
    {
      id: RETENTION_SEED.rfiQuestionVersion.archivedUnreferencedActive,
      isActive: 1,
      questionId: RETENTION_SEED.rfiQuestion.archivedUnreferenced,
      text: 'RETENTION-SEED arkiverad RFI-fråga utan RFI-listreferens',
      updatedAt: OLD_730_TS,
      versionNumber: 1,
    },
    {
      id: RETENTION_SEED.rfiQuestionVersion.archivedFreshActive,
      isActive: 1,
      questionId: RETENTION_SEED.rfiQuestion.archivedFresh,
      text: 'RETENTION-SEED ny arkiverad RFI-fråga',
      updatedAt: NEW_TS,
      versionNumber: 1,
    },
    {
      id: RETENTION_SEED.rfiQuestionVersion.archivedBlockedListActive,
      isActive: 1,
      questionId: RETENTION_SEED.rfiQuestion.archivedBlockedList,
      text: 'RETENTION-SEED arkiverad RFI-fråga med RFI-listreferens',
      updatedAt: OLD_730_TS,
      versionNumber: 1,
    },
    {
      id: RETENTION_SEED.rfiQuestionVersion.archivedBlockedSuggestionActive,
      isActive: 1,
      questionId: RETENTION_SEED.rfiQuestion.archivedBlockedSuggestion,
      text: 'RETENTION-SEED arkiverad RFI-fråga med hanterat förslag',
      updatedAt: OLD_730_TS,
      versionNumber: 1,
    },
  ]) {
    addRow(seedData, 'rfi_question_versions', {
      created_at: version.updatedAt,
      created_by_display_name: 'Retention Linked',
      created_by_hsa_id: 'SE5560000001-retentionlinked',
      expected_answer_format:
        'RETENTION-SEED svarsmall för Admin > Arkivering.',
      help_text:
        'RETENTION-SEED fixture för Admin > Arkivering av RFI-frågeversioner.',
      id: version.id,
      is_active: version.isActive,
      question_text: version.text,
      rfi_question_id: version.questionId,
      updated_at: version.updatedAt,
      version_number: version.versionNumber,
    })
  }

  addRow(seedData, 'rfi_question_version_requirement_packages', {
    requirement_package_id: RETENTION_SEED.requirementPackage.used,
    rfi_question_version_id:
      RETENTION_SEED.rfiQuestionVersion.historicalUnreferencedVersion,
  })
  addRow(seedData, 'rfi_question_version_requirement_selection_questions', {
    requirement_selection_question_id:
      RETENTION_SEED.requirementSelectionQuestion.withArchivedAnswer,
    rfi_question_version_id:
      RETENTION_SEED.rfiQuestionVersion.historicalUnreferencedVersion,
  })

  addRow(seedData, 'specification_rfi_lists', {
    created_at: OLD_730_TS,
    is_locked: 0,
    locked_at: null,
    locked_by_display_name: null,
    locked_by_hsa_id: null,
    specification_id: RETENTION_SEED.specification.management,
    updated_at: OLD_730_TS,
  })

  for (const item of [
    {
      questionId: RETENTION_SEED.rfiQuestion.historicalBlockedList,
      versionId: RETENTION_SEED.rfiQuestionVersion.historicalBlockedListVersion,
    },
    {
      questionId: RETENTION_SEED.rfiQuestion.archivedBlockedList,
      versionId: RETENTION_SEED.rfiQuestionVersion.archivedBlockedListActive,
    },
  ]) {
    addRow(seedData, 'specification_rfi_question_items', {
      changed_at: OLD_730_TS,
      changed_by_display_name: 'Retention Linked',
      changed_by_hsa_id: 'SE5560000001-retentionlinked',
      is_included: 1,
      relevance: null,
      rfi_question_id: item.questionId,
      rfi_question_version_id: item.versionId,
      specification_id: RETENTION_SEED.specification.management,
    })
  }

  addRow(seedData, 'rfi_question_suggestions', {
    area_id: RETENTION_SEED.requirementArea.used,
    content:
      'RETENTION-SEED hanterat RFI-frågeförslag blockerar gallring av arkiverad RFI-fråga.',
    created_at: OLD_730_TS,
    created_by_display_name: 'Retention Linked',
    created_by_hsa_id: 'SE5560000001-retentionlinked',
    id: RETENTION_SEED.rfiQuestionSuggestion.archivedBlockedSuggestion,
    is_review_requested: 1,
    resolution: 1,
    resolution_motivation:
      'RETENTION-SEED förslaget är hanterat men bevarar RFI-frågereferensen.',
    resolved_at: OLD_730_TS,
    resolved_by_display_name: 'Retention Linked',
    resolved_by_hsa_id: 'SE5560000001-retentionlinked',
    review_requested_at: OLD_730_TS,
    rfi_question_id: RETENTION_SEED.rfiQuestion.archivedBlockedSuggestion,
    source_specification_name: 'RETENTION-SEED kravunderlag i förvaltning',
    source_specification_unique_id: 'RETENTION-SEED-MANAGEMENT-SPEC',
    specification_id: RETENTION_SEED.specification.management,
    updated_at: OLD_730_TS,
  })
}

export function appendArchivingRetentionSeed(seedData) {
  addRetentionTaxonomy(seedData)
  addRetentionRequirements(seedData)
  addRetentionSpecifications(seedData)
  addRetentionRequirementSelection(seedData)
  addRetentionRfi(seedData)
  return {
    positiveSourceKeys: RETENTION_POSITIVE_SOURCE_KEYS.length,
  }
}
