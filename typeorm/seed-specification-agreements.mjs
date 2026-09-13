/** Agreement examples extend existing demo specifications without changing their identities. */
export function applySpecificationAgreementSeed(data, order, now = new Date()) {
  function records(name) {
    const table = data[name]
    return table.rows.map(row =>
      Object.fromEntries(
        table.columns.map((column, index) => [column, row[index]]),
      ),
    )
  }
  function put(name, record) {
    const table = data[name]
    for (const column of Object.keys(record)) {
      if (!table.columns.includes(column)) {
        table.columns.push(column)
        for (const row of table.rows) row.push(null)
      }
    }
    const existing = table.rows.find(row =>
      table.pk.every(key => row[table.columns.indexOf(key)] === record[key]),
    )
    const row = table.columns.map(column => record[column] ?? null)
    if (existing) existing.splice(0, existing.length, ...row)
    else table.rows.push(row)
  }
  const specs = records('requirements_specifications')
  const versions = records('requirement_versions')
  const needs = records('specification_needs_references')
  for (const name of [
    'requirements_specification_items',
    'specification_local_requirements',
  ]) {
    for (const item of records(name))
      put(name, {
        ...item,
        valid_from: item.created_at,
        valid_until: null,
        is_reassessment_required: 0,
      })
  }
  data.specification_amendments = { columns: ['id'], pk: ['id'], rows: [] }
  order.splice(
    order.indexOf('specification_co_authors'),
    0,
    'specification_amendments',
  )
  const established = '2026-05-01T10:00:00.000Z'
  const changed = '2026-06-01T10:00:00.000Z'
  const futureDate = `${now.getUTCFullYear() + 1}-12-01`
  const future = `${now.getUTCFullYear() + 1}-11-30T23:00:00.000Z`
  for (const spec of specs) {
    const items = records('requirements_specification_items').filter(
      item => item.requirements_specification_id === spec.id,
    )
    const originalItems = items.map(item => {
      const version = versions.find(
        candidate => candidate.id === item.requirement_version_id,
      )
      return {
        itemRef: `lib:${item.id}`,
        description: version.description,
        requirementId: item.requirement_id,
        requirementVersionId: version.id,
        versionNumber: version.version_number,
        needsReference:
          needs.find(need => need.id === item.needs_reference_id)?.text ?? null,
        note: item.note,
        specificationItemStatusId: item.specification_item_status_id,
        reassessmentRequired: false,
        validFrom: item.valid_from,
        validUntil: null,
        amendmentId: null,
        acceptanceCriteria: version.acceptance_criteria,
        verificationMethod: version.verification_method,
        verifiable: Boolean(version.is_verifiable),
        requirementCategoryId: version.requirement_category_id,
        requirementTypeId: version.requirement_type_id,
        qualityCharacteristicId: version.quality_characteristic_id,
        priorityLevelId: version.priority_level_id,
      }
    })
    put('requirements_specifications', {
      ...spec,
      establishment_status: [3, 4, 5].includes(spec.id)
        ? 'established'
        : 'editable',
      ...([3, 4, 5].includes(spec.id)
        ? {
            agreement_reference: `AVTAL-${spec.specification_code}`,
            agreement_reason:
              'Registrerat leverantörsavtal med känt ursprungsinnehåll.',
            agreement_date: '2026-05-01',
            established_at: established,
            established_by_hsa_id: spec.responsible_hsa_id,
            original_content_json: JSON.stringify(originalItems),
            local_requirement_next_sequence: 2,
          }
        : {}),
    })
  }
  function amendment(id, specificationId, changes, overrides = {}) {
    const owner = specs.find(
      spec => spec.id === specificationId,
    ).responsible_hsa_id
    put('specification_amendments', {
      id,
      specification_id: specificationId,
      reason: 'Överenskommen anpassning av leveransen.',
      agreement_reference: `AVTAL-${specificationId}/T-${id}`,
      effective_date: '2026-06-01',
      effective_at: changed,
      created_at: '2026-05-25T10:00:00.000Z',
      created_by_hsa_id: owner,
      decided_at: changed,
      decided_by_hsa_id: owner,
      changes_json: JSON.stringify(changes),
      ...overrides,
    })
  }
  function local(id, specId, amendmentId, description, overrides = {}) {
    put('specification_local_requirements', {
      id,
      specification_id: specId,
      unique_id: 'KRAV0001',
      sequence_number: 1,
      description,
      is_verifiable: 0,
      specification_item_status_id: 1,
      created_at: changed,
      updated_at: changed,
      valid_from: changed,
      valid_until: null,
      is_reassessment_required: 0,
      binding_reason: 'Överenskommen leveransanpassning.',
      binding_created_by_hsa_id: specs.find(spec => spec.id === specId)
        .responsible_hsa_id,
      specification_amendment_id: amendmentId,
      ...overrides,
    })
  }
  amendment(132301, 4, [
    {
      kind: 'add_local',
      description:
        'Leverantören ska dokumentera tillgänglighetskontroller varje kvartal.',
    },
  ])
  local(
    132301,
    4,
    132301,
    'Leverantören ska dokumentera tillgänglighetskontroller varje kvartal.',
  )

  const old = records('requirements_specification_items').find(
    item => item.id === 20,
  )
  const oldVersion = versions.find(
    version => version.id === old.requirement_version_id,
  )
  const newVersionId = 132301
  const newVersionNumber =
    Math.max(
      ...versions
        .filter(version => version.requirement_id === old.requirement_id)
        .map(version => version.version_number),
    ) + 1
  put('requirement_versions', {
    ...oldVersion,
    requirement_status_id: 4,
    archived_at: changed,
  })
  put('requirement_versions', {
    ...oldVersion,
    id: newVersionId,
    version_number: newVersionNumber,
    description: `${oldVersion.description} Leveransen ska dessutom omfatta dokumenterad återställningsövning.`,
    requirement_status_id: 3,
    created_at: '2026-05-15T10:00:00.000Z',
    published_at: '2026-05-20T10:00:00.000Z',
    edited_at: '2026-05-18T10:00:00.000Z',
    archived_at: null,
    has_specification_item_history: 1,
  })
  amendment(132302, 5, [
    {
      kind: 'replace_library',
      itemRef: 'lib:20',
      targetVersionId: newVersionId,
    },
    { kind: 'remove', itemRef: 'lib:21' },
    {
      kind: 'add_local',
      description: 'Leverantören ska erbjuda dokumenterad beredskap.',
    },
  ])
  put('requirements_specification_items', {
    ...old,
    valid_until: changed,
    specification_item_status_id: 4,
  })
  const removed = records('requirements_specification_items').find(
    item => item.id === 21,
  )
  put('requirements_specification_items', { ...removed, valid_until: changed })
  put('requirements_specification_items', {
    ...old,
    id: 132301,
    requirement_version_id: newVersionId,
    created_at: changed,
    valid_from: changed,
    valid_until: null,
    specification_item_status_id: 1,
    is_reassessment_required: 1,
    specification_amendment_id: 132302,
    binding_reason: 'Ny version enligt T-132302.',
    binding_created_by_hsa_id: specs.find(spec => spec.id === 5)
      .responsible_hsa_id,
  })
  local(132302, 5, 132302, 'Leverantören ska erbjuda dokumenterad beredskap.', {
    valid_until: future,
  })
  amendment(
    132303,
    5,
    [
      {
        kind: 'change_local',
        itemRef: 'local:132302',
        description: 'Beredskap ska finnas dygnet runt.',
      },
    ],
    {
      effective_date: futureDate,
      effective_at: future,
      decided_at: '2026-06-02T10:00:00.000Z',
      cancelled_at: '2026-06-03T10:00:00.000Z',
      cancelled_by_hsa_id: specs.find(spec => spec.id === 5).responsible_hsa_id,
      cancellation_reason: 'Rättelse av omfattning före ikraftträdande.',
    },
  )
  local(132303, 5, 132303, 'Beredskap ska finnas dygnet runt.', {
    valid_from: future,
    valid_until: future,
    is_reassessment_required: 1,
  })
  amendment(
    132304,
    5,
    [
      {
        kind: 'change_local',
        itemRef: 'local:132302',
        description: 'Beredskap ska finnas under avtalad servicetid.',
      },
    ],
    {
      effective_date: futureDate,
      effective_at: future,
      created_at: '2026-06-04T10:00:00.000Z',
      decided_at: '2026-06-05T10:00:00.000Z',
      replaces_amendment_id: 132303,
    },
  )
  local(132304, 5, 132304, 'Beredskap ska finnas under avtalad servicetid.', {
    valid_from: future,
    is_reassessment_required: 1,
  })
  const owner = specs.find(spec => spec.id === 5).responsible_hsa_id
  for (const [id, itemId, decision, motivation] of [
    [
      132301,
      20,
      1,
      'Tidigare godkännande gäller endast den ursprungliga versionen.',
    ],
    [132302, 21, 3, 'Avbrutet före överenskommen borttagning.'],
  ]) {
    put('deviations', {
      id,
      specification_item_id: itemId,
      motivation,
      decision,
      decision_motivation: motivation,
      decided_by: 'Karl Persson',
      decided_by_hsa_id: owner,
      decided_at: '2026-05-29T10:00:00.000Z',
      created_by: 'Karl Persson',
      created_by_hsa_id: owner,
      created_at: '2026-05-20T10:00:00.000Z',
      updated_at: '2026-05-29T10:00:00.000Z',
      is_review_requested: decision === 1 ? 1 : 0,
    })
  }
}
