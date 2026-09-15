import type { SqlExecutor } from '@/lib/dal/requirements-specifications'

/** Record the exact row that created this content, independently of library provenance. */
export async function recordAgreementContentOrigin(
  db: SqlExecutor,
  kind: 'library' | 'local',
  itemId: number,
  agreementId: number,
): Promise<void> {
  const table =
    kind === 'library'
      ? 'requirements_specification_items'
      : 'specification_local_requirements'
  const column =
    kind === 'library'
      ? 'specification_item_id'
      : 'specification_local_requirement_id'
  await db.query(
    `UPDATE item SET origin_agreement_item_id = membership.id
     FROM ${table} item INNER JOIN specification_agreement_items membership ON membership.${column} = item.id
     WHERE item.id = @0 AND membership.specification_agreement_id = @1
       AND item.owning_agreement_id = @1 AND item.origin_agreement_item_id IS NULL`,
    [itemId, agreementId],
  )
}
