/** Default editable fixtures for DAL tests; agreement invariants use real SQL Server tests. */
export function withEditableAgreementState(
  query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>,
) {
  return async (sql: string, parameters?: unknown[]) => {
    const statement = sql.replace(/\s+/g, ' ').trim()
    if (
      statement.startsWith('SELECT establishment_status AS establishmentStatus')
    )
      return [{ establishmentStatus: 'editable' }]
    if (
      /^SELECT (requirements_specification_id|specification_id) AS specificationId FROM \w+ WHERE id = @0$/.test(
        statement,
      )
    )
      return [{ specificationId: 1 }]
    if (
      statement ===
      'SELECT id FROM requirements_specifications WITH (UPDLOCK, HOLDLOCK) WHERE id = @0'
    )
      return [{ id: parameters?.[0] }]
    if (
      statement.startsWith(
        'SELECT is_reassessment_required AS requiresReassessment',
      )
    )
      return [{ requiresReassessment: false }]
    if (
      /^SELECT id FROM (requirements_specification_items|specification_local_requirements) WHERE id = @0 AND valid_from/.test(
        statement,
      )
    )
      return [{ id: parameters?.[0] }]
    if (
      /^SELECT id FROM (deviations|specification_local_requirement_deviations) WHERE \w+ = @0 AND decision IS NULL$/.test(
        statement,
      )
    )
      return []
    if (
      /^SELECT d.id FROM (deviations|specification_local_requirement_deviations) d INNER JOIN/.test(
        statement,
      )
    )
      return []
    return query(sql, parameters)
  }
}
