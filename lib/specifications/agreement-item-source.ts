/** Fixed identifiers only; callers bind the selected agreement as a parameter. */
export function agreementItemSource(
  kind: 'library' | 'local',
  agreementParameter?: string,
): string {
  const library = kind === 'library'
  const table = library
    ? 'requirements_specification_items'
    : 'specification_local_requirements'
  const column = library
    ? 'specification_item_id'
    : 'specification_local_requirement_id'
  const columns = library
    ? [
        'requirements_specification_id',
        'requirement_id',
        'requirement_version_id',
      ]
    : [
        'specification_id',
        'unique_id',
        'sequence_number',
        'description',
        'acceptance_criteria',
        'requirement_category_id',
        'requirement_type_id',
        'quality_characteristic_id',
        'priority_level_id',
        'is_verifiable',
        'verification_method',
        'source_requirement_version_id',
        'updated_at',
      ]
  const fixed = [
    'id',
    ...columns,
    'needs_reference_id',
    'created_at',
    'valid_from',
    'valid_until',
    'owning_agreement_id',
  ]
  const fields = ['specification_item_status_id', 'note', 'status_updated_at']
  if (agreementParameter === undefined)
    return `(SELECT item.*,
    needs.text AS agreement_needs_reference, CAST(NULL AS datetime2) AS followup_frozen_at, CAST(NULL AS varchar(10)) AS change_date,
    CAST(NULL AS varchar(10)) AS change_kind, CAST(0 AS bit) AS is_removed
    FROM ${table} item LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
    WHERE item.valid_until IS NULL)`
  return `(SELECT ${fixed.map(name => `item.${name}`).join(', ')},
    ${fields.map(name => `CASE WHEN membership.has_followup_snapshot = 1 THEN membership.${name} ELSE item.${name} END AS ${name}`).join(', ')},
    CASE WHEN membership.has_followup_snapshot = 1 THEN membership.needs_reference ELSE needs.text END AS agreement_needs_reference,
    CONVERT(varchar(10), changed.effective_date, 23) AS change_date,
    membership.change_kind, membership.is_removed,
    COALESCE(agreement.cancelled_at, agreement.ended_at, agreement.replaced_at) AS followup_frozen_at
    FROM ${table} item INNER JOIN specification_agreement_items membership ON membership.${column} = item.id
    INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
    LEFT JOIN specification_agreements changed ON changed.id = membership.changed_in_agreement_id
    LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
    WHERE agreement.id = ${agreementParameter} AND (membership.is_removed = 0 OR agreement.confirmed_at IS NULL))`
}
