/** Whole-set agreement examples retain the existing demo specification identities. */
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
    return record
  }
  for (const name of [
    'specification_agreements',
    'specification_agreement_corrections',
    'specification_agreement_items',
    'specification_deviation_endings',
  ]) {
    data[name] = { columns: ['id'], pk: ['id'], rows: [] }
  }
  order.splice(
    order.indexOf('specification_local_requirements'),
    0,
    'specification_agreements',
  )
  // Local conversion provenance references an already-seeded library version.
  const localTables = [
    'specification_local_requirements',
    'specification_local_requirement_deviations',
    'specification_local_requirement_norm_references',
  ]
  for (const table of localTables) order.splice(order.indexOf(table), 1)
  order.splice(order.indexOf('requirement_versions') + 1, 0, ...localTables)
  order.push(
    'specification_agreement_corrections',
    'specification_agreement_items',
    'specification_deviation_endings',
  )
  const specifications = records('requirements_specifications')
  const needs = records('specification_needs_references')
  const registered = '2026-05-01T10:00:00.000Z'
  const changed = '2026-06-01T10:00:00.000Z'
  const futureDate = `${now.getUTCFullYear() + 1}-12-01`
  const future = `${now.getUTCFullYear() + 1}-11-30T23:00:00.000Z`
  const owner = id =>
    specifications.find(specification => specification.id === id)
      .responsible_hsa_id
  for (const table of [
    'requirements_specification_items',
    'specification_local_requirements',
  ]) {
    for (const item of records(table))
      put(table, { ...item, valid_from: item.created_at, valid_until: null })
  }
  function agreement(id, specificationId, reference, overrides = {}) {
    return put('specification_agreements', {
      id,
      specification_id: specificationId,
      agreement_reference: reference,
      effective_date: '2026-05-01',
      description: 'Överenskommet innehåll för hela kravunderlaget.',
      created_at: registered,
      created_by_hsa_id: owner(specificationId),
      confirmed_at: registered,
      confirmed_by_hsa_id: owner(specificationId),
      effective_at: registered,
      activated_at: registered,
      is_pending: 0,
      is_current: 1,
      ...overrides,
    })
  }
  let nextMembershipId = 132300
  function membership(agreementId, item, local, overrides = {}) {
    return put('specification_agreement_items', {
      id: ++nextMembershipId,
      specification_agreement_id: agreementId,
      [local ? 'specification_local_requirement_id' : 'specification_item_id']:
        item.id,
      is_removed: 0,
      has_followup_snapshot: 0,
      ...overrides,
    })
  }
  function copyMembers(sourceId, targetId, frozen = false) {
    for (const source of records('specification_agreement_items').filter(
      item => item.specification_agreement_id === sourceId && !item.is_removed,
    )) {
      put('specification_agreement_items', {
        ...source,
        id: ++nextMembershipId,
        specification_agreement_id: targetId,
        previous_item_id: source.id,
        has_followup_snapshot: frozen ? 1 : 0,
      })
    }
  }
  function local(
    id,
    specificationId,
    agreementId,
    description,
    pending = false,
  ) {
    const spec = specifications.find(item => item.id === specificationId)
    const next = Number(spec.local_requirement_next_sequence || 1)
    const row = {
      id,
      specification_id: specificationId,
      unique_id: `KRAV${String(next).padStart(4, '0')}`,
      sequence_number: next,
      description,
      is_verifiable: 0,
      specification_item_status_id: 1,
      created_at: changed,
      updated_at: changed,
      valid_from: changed,
      valid_until: pending ? changed : null,
      binding_created_by_hsa_id: owner(specificationId),
      owning_agreement_id: agreementId,
    }
    spec.local_requirement_next_sequence = next + 1
    put('requirements_specifications', spec)
    return put('specification_local_requirements', row)
  }
  for (const [id, specificationId] of [
    [132301, 3],
    [132302, 4],
    [132304, 5],
  ]) {
    agreement(
      id,
      specificationId,
      `AVTAL-${specificationId}-A`,
      specificationId === 5 ? { is_current: 0, replaced_at: changed } : {},
    )
    for (const [table, localItem] of [
      ['requirements_specification_items', false],
      ['specification_local_requirements', true],
    ]) {
      for (const item of records(table).filter(
        item =>
          (localItem
            ? item.specification_id
            : item.requirements_specification_id) === specificationId,
      )) {
        put(table, { ...item, valid_from: registered })
        membership(
          id,
          item,
          localItem,
          specificationId === 5
            ? {
                has_followup_snapshot: 1,
                specification_item_status_id: item.specification_item_status_id,
                note: item.note,
                needs_reference:
                  needs.find(need => need.id === item.needs_reference_id)
                    ?.text ?? null,
                status_updated_at: item.status_updated_at,
              }
            : {},
        )
      }
    }
  }
  put('specification_agreement_corrections', {
    id: 132301,
    agreement_id: 132301,
    old_agreement_reference: 'AVTAL-3',
    new_agreement_reference: 'AVTAL-3-A',
    old_effective_date: '2026-05-01',
    new_effective_date: '2026-05-01',
    old_description: null,
    new_description: 'Överenskommet innehåll för hela kravunderlaget.',
    corrected_at: '2026-05-02T10:00:00.000Z',
    corrected_by_hsa_id: owner(3),
  })
  agreement(132303, 4, 'AVTAL-4-B', {
    effective_date: futureDate,
    confirmed_at: null,
    confirmed_by_hsa_id: null,
    effective_at: null,
    activated_at: null,
    is_pending: 1,
    is_current: 0,
    previous_agreement_id: 132302,
  })
  copyMembers(132302, 132303)
  membership(
    132303,
    local(
      132301,
      4,
      132303,
      'Leverantören ska dokumentera planerade servicefönster.',
      true,
    ),
    true,
    { changed_in_agreement_id: 132303, change_kind: 'added' },
  )

  const convertedSource = records('requirements_specification_items').find(
    item => item.requirements_specification_id === 4,
  )
  const converted = local(
    132305,
    4,
    132303,
    'Lokalt avtalad lydelse för leverantörens dokumentation.',
    true,
  )
  put('specification_local_requirements', {
    ...converted,
    source_requirement_version_id: convertedSource.requirement_version_id,
  })
  const convertedMember = records('specification_agreement_items').find(
    item =>
      item.specification_agreement_id === 132303 &&
      item.specification_item_id === convertedSource.id,
  )
  put('specification_agreement_items', {
    ...convertedMember,
    specification_item_id: null,
    specification_local_requirement_id: converted.id,
    changed_in_agreement_id: 132303,
    change_kind: 'changed',
  })

  agreement(132305, 5, 'AVTAL-5-B', {
    effective_date: '2026-06-01',
    confirmed_at: changed,
    effective_at: changed,
    activated_at: changed,
    previous_agreement_id: 132304,
  })
  copyMembers(132304, 132305)
  const old = records('requirements_specification_items').find(
    item => item.id === 20,
  )
  const oldVersion = records('requirement_versions').find(
    version => version.id === old.requirement_version_id,
  )
  const newVersionNumber =
    Math.max(
      ...records('requirement_versions')
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
    id: 132301,
    version_number: newVersionNumber,
    description: `${oldVersion.description} Leveransen ska dessutom omfatta dokumenterad återställningsövning.`,
    requirement_status_id: 3,
    created_at: '2026-05-15T10:00:00.000Z',
    published_at: '2026-05-20T10:00:00.000Z',
    edited_at: '2026-05-18T10:00:00.000Z',
    archived_at: null,
    has_specification_item_history: 1,
  })
  put('requirements_specification_items', { ...old, valid_until: changed })
  put('requirements_specification_items', {
    ...old,
    id: 132301,
    requirement_version_id: 132301,
    valid_from: changed,
    valid_until: null,
    created_at: changed,
    specification_item_status_id: 1,
    owning_agreement_id: 132305,
    binding_created_by_hsa_id: owner(5),
  })
  const replaced = records('specification_agreement_items').find(
    item =>
      item.specification_agreement_id === 132305 &&
      item.specification_item_id === 20,
  )
  put('specification_agreement_items', {
    ...replaced,
    specification_item_id: 132301,
    changed_in_agreement_id: 132305,
    change_kind: 'changed',
  })
  const removed = records('requirements_specification_items').find(
    item => item.id === 21,
  )
  put('requirements_specification_items', { ...removed, valid_until: changed })
  const removedMembership = records('specification_agreement_items').find(
    item =>
      item.specification_agreement_id === 132305 &&
      item.specification_item_id === 21,
  )
  put('specification_agreement_items', {
    ...removedMembership,
    is_removed: 1,
    changed_in_agreement_id: 132305,
    change_kind: 'removed',
  })
  const currentLocal = local(
    132302,
    5,
    132305,
    'Leverantören ska erbjuda dokumenterad beredskap.',
  )
  membership(132305, currentLocal, true, {
    changed_in_agreement_id: 132305,
    change_kind: 'added',
  })

  for (const [agreementId, localId, reference, description, cancelled] of [
    [132306, 132303, 'AVTAL-5-C', 'Beredskap ska finnas dygnet runt.', true],
    [
      132307,
      132304,
      'AVTAL-5-D',
      'Beredskap ska finnas under avtalad servicetid.',
      false,
    ],
  ]) {
    agreement(agreementId, 5, reference, {
      effective_date: futureDate,
      effective_at: future,
      activated_at: null,
      is_pending: cancelled ? 0 : 1,
      is_current: 0,
      previous_agreement_id: 132305,
      cancelled_at: cancelled ? '2026-06-03T10:00:00.000Z' : null,
      cancelled_by_hsa_id: cancelled ? owner(5) : null,
      cancellation_reason: cancelled ? 'Omfattningen behöver ändras.' : null,
    })
    copyMembers(132305, agreementId, cancelled)
    put('specification_local_requirements', {
      ...currentLocal,
      id: localId,
      description,
      valid_until: changed,
      owning_agreement_id: agreementId,
    })
    const member = records('specification_agreement_items').find(
      item =>
        item.specification_agreement_id === agreementId &&
        item.specification_local_requirement_id === currentLocal.id,
    )
    put('specification_agreement_items', {
      ...member,
      specification_local_requirement_id: localId,
      changed_in_agreement_id: agreementId,
      change_kind: 'changed',
      specification_item_status_id: 1,
    })
  }
  put('deviations', {
    id: 132301,
    specification_item_id: 20,
    motivation: 'Undantag för ursprungligt avtalsinnehåll.',
    decision: 1,
    decision_motivation: 'Godkänt för det ursprungliga innehållet.',
    decided_by: 'Karl Persson',
    decided_by_hsa_id: owner(5),
    decided_at: '2026-05-20T10:00:00.000Z',
    created_by: 'Karl Persson',
    created_by_hsa_id: owner(5),
    created_at: '2026-05-15T10:00:00.000Z',
    updated_at: '2026-05-20T10:00:00.000Z',
    is_review_requested: 1,
  })
  put('specification_deviation_endings', {
    id: 132301,
    specification_id: 5,
    agreement_id: 132305,
    agreement_reference: 'AVTAL-5-B',
    agreement_item_id: replaced.id,
    deviation_id: 132301,
    planned_effective_date: '2026-06-01',
    recorded_at: '2026-05-25T10:00:00.000Z',
    recorded_by_hsa_id: owner(5),
    ended_at: changed,
  })
  for (const member of records('specification_agreement_items')) {
    const local = member.specification_local_requirement_id != null
    const binding = local
      ? 'specification_local_requirement_id'
      : 'specification_item_id'
    const cases = records(
      local ? 'specification_local_requirement_deviations' : 'deviations',
    )
    const agreement = records('specification_agreements').find(
      value => value.id === member.specification_agreement_id,
    )
    const cutoff =
      agreement.cancelled_at ?? agreement.ended_at ?? agreement.replaced_at
    put('specification_agreement_items', {
      ...member,
      deviation_state_json: member.has_followup_snapshot
        ? JSON.stringify(
            cases
              .filter(
                value =>
                  value[binding] === member[binding] &&
                  (!cutoff || new Date(value.created_at) <= new Date(cutoff)),
              )
              .map(value => ({
                id: value.id,
                motivation: value.motivation,
                isReviewRequested: value.is_review_requested ?? 0,
              })),
          )
        : null,
    })
  }
}
