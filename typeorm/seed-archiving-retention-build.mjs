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
  owner: {
    linked: 910002,
    orphan: 910001,
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
  requirementVersion: {
    archivedUnused: 910101,
    archiveReview: 910105,
    currentSpecificationLink: 910106,
    draftStale: 910103,
    historyOnly: 910104,
    reviewStale: 910102,
    specificationLibrary: 910201,
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
  'owners.identity',
  'requirement_areas.unused',
  'requirement_packages.unused',
  'norm_references.unused',
  'requirement_versions.archived_unused',
  'requirement_versions.review_stale',
  'requirement_versions.draft_stale',
  'requirements_specifications.obsolete',
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
    risk_level_id: 2,
    verification_method: 'Seed fixture inspected through Admin > Arkivering.',
    version_number: 1,
    ...values,
  }
}

function addRetentionOwners(seedData) {
  addRow(seedData, 'owners', {
    created_at: OLD_730_TS,
    email: 'retention.orphan@example.com',
    first_name: 'Retention',
    id: RETENTION_SEED.owner.orphan,
    last_name: 'Orphan',
    updated_at: OLD_730_TS,
  })
  addRow(seedData, 'owners', {
    created_at: OLD_730_TS,
    email: 'retention.linked@example.com',
    first_name: 'Retention',
    id: RETENTION_SEED.owner.linked,
    last_name: 'Linked',
    updated_at: OLD_730_TS,
  })
}

function addRetentionTaxonomy(seedData) {
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
      owner_id: RETENTION_SEED.owner.linked,
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
      description_en: `${pkg.name} for deterministic archiving retention tests.`,
      description_sv: `${pkg.name} för deterministiska arkiveringstester.`,
      id: pkg.id,
      name_en: pkg.name,
      name_sv: pkg.name,
      owner_id: RETENTION_SEED.owner.linked,
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
      specification_responsibility_area_id: 2,
      unique_id: spec.uniqueId,
      updated_at: spec.updatedAt,
    })
  }

  addRow(seedData, 'specification_needs_references', {
    created_at: OLD_730_TS,
    id: RETENTION_SEED.needsReference.obsoleteSpecificationLibrary,
    specification_id: RETENTION_SEED.specification.obsolete,
    text: 'RETENTION-SEED behovsreferens för export av kopplat katalogkrav.',
  })
  addRow(seedData, 'specification_needs_references', {
    created_at: OLD_730_TS,
    id: RETENTION_SEED.needsReference.obsoleteSpecificationLocal,
    specification_id: RETENTION_SEED.specification.obsolete,
    text: 'RETENTION-SEED behovsreferens för export av lokalt krav.',
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
      unused_1: null,
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
    risk_level_id: 2,
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

export function appendArchivingRetentionSeed(seedData) {
  addRetentionOwners(seedData)
  addRetentionTaxonomy(seedData)
  addRetentionRequirements(seedData)
  addRetentionSpecifications(seedData)
  return {
    positiveSourceKeys: RETENTION_POSITIVE_SOURCE_KEYS.length,
  }
}
