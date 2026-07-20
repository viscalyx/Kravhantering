// Deterministic fixtures for Playwright specs that cover manual test cases.
//
// Public entry point: appendPlaywrightManualCaseSeed(SEED_DATA)
//
// The rows use a dedicated 920000+ ID range and PWT-MANUAL labels so they are
// easy to identify and reset in integration tests.

const SEED_TS = '2026-04-24 09:00:00'
const OLD_TS = '2025-04-24 09:00:00'

export const PWT_MANUAL_SEED = Object.freeze({
  area: {
    manual: 920001,
  },
  package: {
    replacement: 920002,
    source: 920001,
  },
  requirement: {
    archivePackageHistory: 920003,
    editSource: 920004,
    packageSwap: 920002,
    restore: 920001,
    reportA: 920005,
    reportB: 920006,
    traceBase: 920100,
  },
  requirementVersion: {
    archivePackageHistory: 920004,
    editSource: 920005,
    packageSwapDraft: 920003,
    packageSwapPublished: 920002,
    restore: 920001,
    reportA: 920006,
    reportB: 920007,
    traceBase: 920100,
  },
  rfiQuestion: {
    areaScope: 920002,
    primary: 920001,
  },
  rfiQuestionSuggestion: {
    dismissed: 920004,
    openArea: 920002,
    openQuestion: 920001,
    resolved: 920003,
  },
  rfiQuestionVersion: {
    areaScope: 920002,
    primary: 920001,
  },
  specification: {
    edit: 920001,
    export205: 920008,
    reportForvaltning: 920004,
    reportInforande: 920002,
    reportUtveckling: 920003,
    rfiWorkflow: 920007,
    trace200: 920005,
    trace201: 920006,
  },
  specificationItem: {
    editSource: 920001,
    export205Base: 920800,
    reportBase: 920020,
    trace200Base: 920200,
    trace201Base: 920500,
  },
  specificationLocalRequirement: {
    edit: 920001,
  },
  specificationNeedsReference: {
    edit: 920001,
    replacement: 920002,
  },
})

const ACTOR = {
  areaCoauthor: {
    displayName: 'Cora CoAuthor',
    hsaId: 'SE5560000001-areaco1',
  },
  areaOwner: {
    displayName: 'Olle AreaOwner',
    hsaId: 'SE5560000001-areaowner1',
  },
  seed: {
    displayName: 'seed',
    hsaId: 'SE5560000001-seed',
  },
  specCoauthor: {
    displayName: 'Signe SpecCoAuthor',
    hsaId: 'SE5560000001-specco1',
  },
  specResponsible: {
    displayName: 'Petra specresp',
    hsaId: 'SE5560000001-specresp1',
  },
}

const TRACE_SPECIFICATION_FIXTURES = [
  {
    id: PWT_MANUAL_SEED.specification.trace200,
    itemCount: 200,
    itemIdBase: PWT_MANUAL_SEED.specificationItem.trace200Base,
    lifecycle: 3,
    name: 'PWT-MANUAL spårbarhet 200',
    note: 'PWT-MANUAL traceability 200 item.',
    specificationCode: 'PWT-SPEC-TRACE-200',
  },
  {
    id: PWT_MANUAL_SEED.specification.trace201,
    itemCount: 201,
    itemIdBase: PWT_MANUAL_SEED.specificationItem.trace201Base,
    lifecycle: 3,
    name: 'PWT-MANUAL spårbarhet 201',
    note: 'PWT-MANUAL traceability 201 item.',
    specificationCode: 'PWT-SPEC-TRACE-201',
  },
  {
    id: PWT_MANUAL_SEED.specification.export205,
    itemCount: 205,
    itemIdBase: PWT_MANUAL_SEED.specificationItem.export205Base,
    lifecycle: 1,
    name: 'PWT-MANUAL CSV-export 205',
    note: 'PWT-MANUAL bounded CSV export item.',
    specificationCode: 'PWT-SPEC-CSV-205',
  },
]

const TRACE_REQUIREMENT_COUNT = Math.max(
  ...TRACE_SPECIFICATION_FIXTURES.map(fixture => fixture.itemCount),
)

function tableSection(seedData, name) {
  const table = seedData[name]
  if (!table) {
    throw new Error(`Playwright manual seed: missing table '${name}'`)
  }
  return table
}

function ensureTable(seedData, name, columns, pk) {
  if (seedData[name]) return
  seedData[name] = {
    columns,
    pk,
    rows: [],
  }
}

function rowFromColumns(table, values) {
  return table.columns.map(column =>
    Object.hasOwn(values, column) ? values[column] : null,
  )
}

function ensureRow(table, row, pkColumns) {
  const indexes = pkColumns.map(column => table.columns.indexOf(column))
  if (indexes.some(index => index < 0)) {
    throw new Error(
      `Playwright manual seed: missing PK column for ${pkColumns.join(', ')}`,
    )
  }
  const matches = existing =>
    indexes.every(index => existing[index] === row[index])
  if (!table.rows.some(matches)) table.rows.push(row)
}

function addRow(seedData, tableName, values) {
  const table = tableSection(seedData, tableName)
  ensureRow(table, rowFromColumns(table, values), table.pk)
}

function ensureAssignmentTables(seedData) {
  ensureTable(
    seedData,
    'requirement_area_co_authors',
    [
      'area_id',
      'hsa_id',
      'created_at',
      'created_by_hsa_id',
      'created_by_display_name',
    ],
    ['area_id', 'hsa_id'],
  )
  ensureTable(
    seedData,
    'specification_co_authors',
    [
      'specification_id',
      'hsa_id',
      'created_at',
      'created_by_hsa_id',
      'created_by_display_name',
    ],
    ['specification_id', 'hsa_id'],
  )
}

function requirementVersion(values) {
  return {
    acceptance_criteria:
      'PWT-MANUAL fixture used by Playwright manual-case coverage.',
    archive_initiated_at: null,
    archived_at: null,
    created_at: SEED_TS,
    created_by: ACTOR.seed.displayName,
    description:
      'PWT-MANUAL deterministic requirement version for integration testing.',
    edited_at: SEED_TS,
    is_verifiable: 1,
    priority_level_id: 2,
    published_at: null,
    quality_characteristic_id: 1,
    requirement_category_id: 2,
    requirement_status_id: 3,
    requirement_type_id: 1,
    verification_method: 'Verified by Playwright.',
    version_number: 1,
    ...values,
  }
}

function addTaxonomy(seedData) {
  addRow(seedData, 'requirement_areas', {
    created_at: SEED_TS,
    description:
      'PWT-MANUAL kravomrade for deterministic Playwright manual cases.',
    id: PWT_MANUAL_SEED.area.manual,
    name: 'PWT-MANUAL Playwright manual cases',
    next_sequence: 400,
    owner_id: ACTOR.areaOwner.hsaId,
    owner_hsa_id: ACTOR.areaOwner.hsaId,
    prefix: 'PWM',
    updated_at: SEED_TS,
  })
  addRow(seedData, 'requirement_area_co_authors', {
    area_id: PWT_MANUAL_SEED.area.manual,
    created_at: SEED_TS,
    created_by_display_name: ACTOR.seed.displayName,
    created_by_hsa_id: ACTOR.seed.hsaId,
    hsa_id: ACTOR.areaCoauthor.hsaId,
  })

  for (const pkg of [
    {
      id: PWT_MANUAL_SEED.package.source,
      name: 'PWT-MANUAL källpaket',
      purpose:
        'Paket som används för att verifiera att publicering ersätter medlemskap.',
    },
    {
      id: PWT_MANUAL_SEED.package.replacement,
      name: 'PWT-MANUAL ersättningspaket',
      purpose:
        'Paket som används för att verifiera nytt publicerat medlemskap.',
    },
  ]) {
    addRow(seedData, 'requirement_packages', {
      created_at: SEED_TS,
      id: pkg.id,
      is_archived: 0,
      lead_hsa_id: ACTOR.areaOwner.hsaId,
      name: pkg.name,
      purpose_and_scope: pkg.purpose,
      updated_at: SEED_TS,
    })
  }
}

function addLifecycleRequirements(seedData) {
  for (const item of [
    {
      id: PWT_MANUAL_SEED.requirement.restore,
      isArchived: 1,
      sequence: 1,
      uniqueId: 'PWT-LIFE-RESTORE',
    },
    {
      id: PWT_MANUAL_SEED.requirement.packageSwap,
      isArchived: 0,
      sequence: 2,
      uniqueId: 'PWT-LIFE-PACKAGE-SWAP',
    },
    {
      id: PWT_MANUAL_SEED.requirement.archivePackageHistory,
      isArchived: 0,
      sequence: 3,
      uniqueId: 'PWT-LIFE-PACKAGE-ARCHIVE',
    },
    {
      id: PWT_MANUAL_SEED.requirement.editSource,
      isArchived: 0,
      sequence: 4,
      uniqueId: 'PWT-SPEC-EDIT-SOURCE',
    },
    {
      id: PWT_MANUAL_SEED.requirement.reportA,
      isArchived: 0,
      sequence: 5,
      uniqueId: 'PWT-REPORT-A',
    },
    {
      id: PWT_MANUAL_SEED.requirement.reportB,
      isArchived: 0,
      sequence: 6,
      uniqueId: 'PWT-REPORT-B',
    },
  ]) {
    addRow(seedData, 'requirements', {
      created_at: SEED_TS,
      id: item.id,
      is_archived: item.isArchived,
      requirement_area_id: PWT_MANUAL_SEED.area.manual,
      sequence_number: item.sequence,
      unique_id: item.uniqueId,
    })
  }

  for (const version of [
    requirementVersion({
      archived_at: OLD_TS,
      description:
        'PWT-MANUAL archived requirement version for restore coverage.',
      id: PWT_MANUAL_SEED.requirementVersion.restore,
      published_at: OLD_TS,
      requirement_id: PWT_MANUAL_SEED.requirement.restore,
      requirement_status_id: 4,
    }),
    requirementVersion({
      description:
        'PWT-MANUAL published predecessor with source package membership.',
      id: PWT_MANUAL_SEED.requirementVersion.packageSwapPublished,
      published_at: OLD_TS,
      requirement_id: PWT_MANUAL_SEED.requirement.packageSwap,
    }),
    requirementVersion({
      description:
        'PWT-MANUAL draft successor with replacement package membership.',
      id: PWT_MANUAL_SEED.requirementVersion.packageSwapDraft,
      published_at: null,
      requirement_id: PWT_MANUAL_SEED.requirement.packageSwap,
      requirement_status_id: 1,
      version_number: 2,
    }),
    requirementVersion({
      description:
        'PWT-MANUAL published requirement for package history after archive.',
      id: PWT_MANUAL_SEED.requirementVersion.archivePackageHistory,
      published_at: OLD_TS,
      requirement_id: PWT_MANUAL_SEED.requirement.archivePackageHistory,
    }),
    requirementVersion({
      description:
        'PWT-MANUAL requirement available for disposable specification edits.',
      id: PWT_MANUAL_SEED.requirementVersion.editSource,
      published_at: OLD_TS,
      requirement_id: PWT_MANUAL_SEED.requirement.editSource,
    }),
    requirementVersion({
      description: 'PWT-MANUAL report fixture requirement A.',
      id: PWT_MANUAL_SEED.requirementVersion.reportA,
      published_at: OLD_TS,
      requirement_id: PWT_MANUAL_SEED.requirement.reportA,
    }),
    requirementVersion({
      description: 'PWT-MANUAL report fixture requirement B.',
      id: PWT_MANUAL_SEED.requirementVersion.reportB,
      published_at: OLD_TS,
      requirement_id: PWT_MANUAL_SEED.requirement.reportB,
    }),
  ]) {
    addRow(seedData, 'requirement_versions', version)
  }

  for (const [versionId, packageId] of [
    [
      PWT_MANUAL_SEED.requirementVersion.restore,
      PWT_MANUAL_SEED.package.source,
    ],
    [
      PWT_MANUAL_SEED.requirementVersion.packageSwapPublished,
      PWT_MANUAL_SEED.package.source,
    ],
    [
      PWT_MANUAL_SEED.requirementVersion.packageSwapDraft,
      PWT_MANUAL_SEED.package.replacement,
    ],
    [
      PWT_MANUAL_SEED.requirementVersion.archivePackageHistory,
      PWT_MANUAL_SEED.package.source,
    ],
    [
      PWT_MANUAL_SEED.requirementVersion.editSource,
      PWT_MANUAL_SEED.package.source,
    ],
    [
      PWT_MANUAL_SEED.requirementVersion.reportA,
      PWT_MANUAL_SEED.package.source,
    ],
    [
      PWT_MANUAL_SEED.requirementVersion.reportB,
      PWT_MANUAL_SEED.package.replacement,
    ],
  ]) {
    addRow(seedData, 'requirement_version_requirement_packages', {
      requirement_package_id: packageId,
      requirement_version_id: versionId,
    })
  }
}

function addTraceRequirements(seedData) {
  for (let index = 0; index < TRACE_REQUIREMENT_COUNT; index += 1) {
    const requirementId = PWT_MANUAL_SEED.requirement.traceBase + index
    const versionId = PWT_MANUAL_SEED.requirementVersion.traceBase + index
    addRow(seedData, 'requirements', {
      created_at: SEED_TS,
      id: requirementId,
      is_archived: 0,
      requirement_area_id: PWT_MANUAL_SEED.area.manual,
      sequence_number: 100 + index,
      unique_id: `PWT-TRACE-${String(index + 1).padStart(3, '0')}`,
    })
    addRow(
      seedData,
      'requirement_versions',
      requirementVersion({
        description: `PWT-MANUAL traceability requirement ${index + 1}.`,
        id: versionId,
        published_at: OLD_TS,
        requirement_id: requirementId,
      }),
    )
    addRow(seedData, 'requirement_version_requirement_packages', {
      requirement_package_id: PWT_MANUAL_SEED.package.source,
      requirement_version_id: versionId,
    })
  }
}

function addSpecifications(seedData) {
  for (const spec of [
    {
      id: PWT_MANUAL_SEED.specification.edit,
      lifecycle: 3,
      name: 'PWT-MANUAL redigerbart kravunderlag',
      specificationCode: 'PWT-SPEC-EDIT-2026',
    },
    {
      id: PWT_MANUAL_SEED.specification.reportInforande,
      lifecycle: 2,
      name: 'PWT-MANUAL införanderapport',
      specificationCode: 'PWT-SPEC-REPORT-INFOR',
    },
    {
      id: PWT_MANUAL_SEED.specification.reportUtveckling,
      lifecycle: 3,
      name: 'PWT-MANUAL utvecklingsrapport',
      specificationCode: 'PWT-SPEC-REPORT-UTV',
    },
    {
      id: PWT_MANUAL_SEED.specification.reportForvaltning,
      lifecycle: 4,
      name: 'PWT-MANUAL förvaltningsrapport',
      specificationCode: 'PWT-SPEC-REPORT-FORV',
    },
    ...TRACE_SPECIFICATION_FIXTURES,
    {
      id: PWT_MANUAL_SEED.specification.rfiWorkflow,
      lifecycle: 1,
      name: 'PWT-MANUAL RFI-arbetsflöde',
      specificationCode: 'PWT-RFI-WORKFLOW-2026',
    },
  ]) {
    addRow(seedData, 'requirements_specifications', {
      business_needs_reference: `${spec.specificationCode}: deterministic Playwright fixture.`,
      created_at: SEED_TS,
      id: spec.id,
      local_requirement_next_sequence: 2,
      name: spec.name,
      specification_governance_object_type_id: 2,
      specification_implementation_type_id: 2,
      specification_lifecycle_status_id: spec.lifecycle,
      specification_code: spec.specificationCode,
      updated_at: SEED_TS,
    })
    addRow(seedData, 'specification_co_authors', {
      created_at: SEED_TS,
      created_by_display_name: ACTOR.seed.displayName,
      created_by_hsa_id: ACTOR.seed.hsaId,
      hsa_id: ACTOR.specCoauthor.hsaId,
      specification_id: spec.id,
    })
  }

  for (const needs of [
    {
      id: PWT_MANUAL_SEED.specificationNeedsReference.edit,
      specificationId: PWT_MANUAL_SEED.specification.edit,
      text: 'PWT-MANUAL ursprungligt behov',
    },
    {
      id: PWT_MANUAL_SEED.specificationNeedsReference.replacement,
      specificationId: PWT_MANUAL_SEED.specification.edit,
      text: 'PWT-MANUAL ersättningsbehov',
    },
  ]) {
    addRow(seedData, 'specification_needs_references', {
      created_at: SEED_TS,
      description: null,
      id: needs.id,
      specification_id: needs.specificationId,
      text: needs.text,
      updated_at: SEED_TS,
    })
  }

  addRow(seedData, 'requirements_specification_items', {
    created_at: SEED_TS,
    id: PWT_MANUAL_SEED.specificationItem.editSource,
    needs_reference_id: PWT_MANUAL_SEED.specificationNeedsReference.edit,
    note: 'PWT-MANUAL editable specification item.',
    requirement_id: PWT_MANUAL_SEED.requirement.editSource,
    requirement_version_id: PWT_MANUAL_SEED.requirementVersion.editSource,
    requirements_specification_id: PWT_MANUAL_SEED.specification.edit,
    specification_item_status_id: 1,
    status_updated_at: SEED_TS,
  })
  addRow(seedData, 'specification_local_requirements', {
    acceptance_criteria:
      'PWT-MANUAL lokalt krav kan redigeras och lyftas utan delad seeddata.',
    created_at: SEED_TS,
    description: 'PWT-MANUAL lokalt krav för kravunderlagsredigering.',
    id: PWT_MANUAL_SEED.specificationLocalRequirement.edit,
    is_verifiable: 1,
    needs_reference_id: PWT_MANUAL_SEED.specificationNeedsReference.edit,
    note: 'PWT-MANUAL lokal kravnotering.',
    priority_level_id: 2,
    quality_characteristic_id: 1,
    requirement_category_id: 2,
    requirement_type_id: 1,
    sequence_number: 1,
    specification_id: PWT_MANUAL_SEED.specification.edit,
    specification_item_status_id: 1,
    status_updated_at: SEED_TS,
    unique_id: 'KRAV0001',
    updated_at: SEED_TS,
    verification_method: 'Verified by Playwright.',
  })

  let reportItemId = PWT_MANUAL_SEED.specificationItem.reportBase
  for (const specificationId of [
    PWT_MANUAL_SEED.specification.reportInforande,
    PWT_MANUAL_SEED.specification.reportUtveckling,
    PWT_MANUAL_SEED.specification.reportForvaltning,
  ]) {
    for (const [requirementId, versionId] of [
      [
        PWT_MANUAL_SEED.requirement.reportA,
        PWT_MANUAL_SEED.requirementVersion.reportA,
      ],
      [
        PWT_MANUAL_SEED.requirement.reportB,
        PWT_MANUAL_SEED.requirementVersion.reportB,
      ],
    ]) {
      addRow(seedData, 'requirements_specification_items', {
        created_at: SEED_TS,
        id: reportItemId,
        needs_reference_id: null,
        note: 'PWT-MANUAL report item.',
        requirement_id: requirementId,
        requirement_version_id: versionId,
        requirements_specification_id: specificationId,
        specification_item_status_id: 1,
        status_updated_at: SEED_TS,
      })
      reportItemId += 1
    }
  }

  for (const fixture of TRACE_SPECIFICATION_FIXTURES) {
    for (let index = 0; index < fixture.itemCount; index += 1) {
      addRow(seedData, 'requirements_specification_items', {
        created_at: SEED_TS,
        id: fixture.itemIdBase + index,
        needs_reference_id: null,
        note: fixture.note,
        requirement_id: PWT_MANUAL_SEED.requirement.traceBase + index,
        requirement_version_id:
          PWT_MANUAL_SEED.requirementVersion.traceBase + index,
        requirements_specification_id: fixture.id,
        specification_item_status_id: 1,
        status_updated_at: SEED_TS,
      })
    }
  }
}

function addRfi(seedData) {
  addRow(seedData, 'rfi_question_sequences', {
    area_id: PWT_MANUAL_SEED.area.manual,
    next_sequence: 3,
  })

  for (const question of [
    {
      code: 'PWM-RFI001',
      id: PWT_MANUAL_SEED.rfiQuestion.primary,
      text: 'PWT-MANUAL vilken information ska leverantören lämna?',
      versionId: PWT_MANUAL_SEED.rfiQuestionVersion.primary,
    },
    {
      code: 'PWM-RFI002',
      id: PWT_MANUAL_SEED.rfiQuestion.areaScope,
      text: 'PWT-MANUAL hur ska området besvaras samlat?',
      versionId: PWT_MANUAL_SEED.rfiQuestionVersion.areaScope,
    },
  ]) {
    addRow(seedData, 'rfi_questions', {
      archived_at: null,
      area_id: PWT_MANUAL_SEED.area.manual,
      created_at: SEED_TS,
      id: question.id,
      is_archived: 0,
      question_code: question.code,
      sort_order: question.id - PWT_MANUAL_SEED.rfiQuestion.primary + 1,
      updated_at: SEED_TS,
    })
    addRow(seedData, 'rfi_question_versions', {
      created_at: SEED_TS,
      created_by_display_name: ACTOR.areaOwner.displayName,
      created_by_hsa_id: ACTOR.areaOwner.hsaId,
      expected_answer_format: 'PWT-MANUAL fritextsvar.',
      help_text: 'PWT-MANUAL RFI fixture for Playwright.',
      id: question.versionId,
      is_active: 1,
      question_text: question.text,
      rfi_question_id: question.id,
      updated_at: SEED_TS,
      version_number: 1,
    })
    addRow(seedData, 'rfi_question_version_requirement_packages', {
      requirement_package_id: PWT_MANUAL_SEED.package.source,
      rfi_question_version_id: question.versionId,
    })
    addRow(seedData, 'specification_rfi_question_items', {
      changed_at: SEED_TS,
      changed_by_display_name: ACTOR.specResponsible.displayName,
      changed_by_hsa_id: ACTOR.specResponsible.hsaId,
      is_included: 1,
      relevance: null,
      rfi_question_id: question.id,
      rfi_question_version_id: question.versionId,
      specification_id: PWT_MANUAL_SEED.specification.rfiWorkflow,
    })
  }

  addRow(seedData, 'specification_rfi_lists', {
    created_at: SEED_TS,
    is_locked: 0,
    locked_at: null,
    locked_by_display_name: null,
    locked_by_hsa_id: null,
    specification_id: PWT_MANUAL_SEED.specification.rfiWorkflow,
    updated_at: SEED_TS,
  })

  for (const suggestion of [
    {
      content: 'PWT-MANUAL öppet frågeförslag.',
      id: PWT_MANUAL_SEED.rfiQuestionSuggestion.openQuestion,
      isReviewRequested: 0,
      resolution: null,
      rfiQuestionId: PWT_MANUAL_SEED.rfiQuestion.primary,
    },
    {
      content: 'PWT-MANUAL öppet områdesförslag.',
      id: PWT_MANUAL_SEED.rfiQuestionSuggestion.openArea,
      isReviewRequested: 0,
      resolution: null,
      rfiQuestionId: null,
    },
    {
      content: 'PWT-MANUAL hanterat RFI-förslag.',
      id: PWT_MANUAL_SEED.rfiQuestionSuggestion.resolved,
      isReviewRequested: 1,
      resolution: 1,
      rfiQuestionId: PWT_MANUAL_SEED.rfiQuestion.primary,
    },
    {
      content: 'PWT-MANUAL avfärdat RFI-förslag.',
      id: PWT_MANUAL_SEED.rfiQuestionSuggestion.dismissed,
      isReviewRequested: 1,
      resolution: 2,
      rfiQuestionId: PWT_MANUAL_SEED.rfiQuestion.areaScope,
    },
  ]) {
    addRow(seedData, 'rfi_question_suggestions', {
      area_id: PWT_MANUAL_SEED.area.manual,
      content: suggestion.content,
      created_at: SEED_TS,
      created_by_display_name: ACTOR.specResponsible.displayName,
      created_by_hsa_id: ACTOR.specResponsible.hsaId,
      id: suggestion.id,
      is_review_requested: suggestion.isReviewRequested,
      resolution: suggestion.resolution,
      resolution_motivation:
        suggestion.resolution == null ? null : 'PWT-MANUAL seeded resolution.',
      resolved_at: suggestion.resolution == null ? null : SEED_TS,
      resolved_by_display_name:
        suggestion.resolution == null ? null : ACTOR.areaOwner.displayName,
      resolved_by_hsa_id:
        suggestion.resolution == null ? null : ACTOR.areaOwner.hsaId,
      review_requested_at: suggestion.isReviewRequested ? SEED_TS : null,
      rfi_question_id: suggestion.rfiQuestionId,
      source_specification_name: 'PWT-MANUAL RFI-arbetsflöde',
      source_specification_code: 'PWT-RFI-WORKFLOW-2026',
      specification_id: PWT_MANUAL_SEED.specification.rfiWorkflow,
      updated_at: SEED_TS,
    })
  }
}

function addPrivacy(seedData) {
  addRow(seedData, 'improvement_suggestions', {
    content: 'PWT-MANUAL privacy erasure target for action log verification.',
    created_at: SEED_TS,
    created_by: 'PWT Privacy Target',
    id: 920001,
    is_review_requested: 0,
    requirement_id: PWT_MANUAL_SEED.requirement.editSource,
    requirement_version_id: PWT_MANUAL_SEED.requirementVersion.editSource,
    updated_at: SEED_TS,
  })
}

export function appendPlaywrightManualCaseSeed(seedData) {
  ensureAssignmentTables(seedData)
  addTaxonomy(seedData)
  addLifecycleRequirements(seedData)
  addTraceRequirements(seedData)
  addSpecifications(seedData)
  addRfi(seedData)
  addPrivacy(seedData)
  return {
    requirementCount: 211,
    specificationCount: 8,
  }
}
