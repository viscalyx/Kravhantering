/** Default editable fixtures for DAL tests; agreement invariants use real SQL Server tests. */
export function withEditableAgreementState(
  query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>,
) {
  return async (sql: string, parameters?: unknown[]) => {
    const statement = sql.replace(/\s+/g, ' ').trim()
    if (
      statement.startsWith(
        'SELECT item.specification_item_status_id AS specificationItemStatusId',
      )
    )
      return [{ specificationItemStatusId: 1 }]
    if (
      statement.startsWith('SELECT DISTINCT item.id FROM') &&
      statement.includes('specification_deviation_endings')
    )
      return []
    if (
      statement.startsWith(
        'SELECT upcoming.id FROM specification_agreements upcoming',
      )
    )
      return []
    if (
      /^SELECT item\.(requirements_specification_id|specification_id) AS specificationId, item.id AS itemId FROM/.test(
        statement,
      )
    )
      return [{ specificationId: 1, itemId: 1 }]
    if (
      /^SELECT id(?:, effective_at AS effectiveAt)? FROM specification_agreements/.test(
        statement,
      )
    )
      return []
    if (
      /^SELECT (requirements_specification_id|specification_id) AS specificationId FROM (requirements_specification_items|specification_local_requirements) WHERE id = @0$/.test(
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
      /^SELECT item.id FROM (requirements_specification_items|specification_local_requirements) item WHERE item.id = @0/.test(
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
