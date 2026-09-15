import type { SqlExecutor } from '@/lib/dal/requirements-specifications'
import { notFoundError } from '@/lib/requirements/errors'
import { activateDueAgreements } from '@/lib/specifications/agreement-activation'

/** Resolve once inside the read transaction so pagination uses one agreement. */
export async function resolveAgreementSelection(
  db: SqlExecutor,
  specificationId: number,
  selectedId?: number,
): Promise<number | undefined> {
  const specifications = await db.query<Array<{ id: number }>>(
    'SELECT id FROM requirements_specifications WITH (UPDLOCK, HOLDLOCK) WHERE id = @0',
    [specificationId],
  )
  if (!specifications[0])
    throw notFoundError('Requirements specification not found')
  await activateDueAgreements(db, specificationId, new Date())
  const agreements = await db.query<Array<{ id: number }>>(
    `SELECT TOP (1) id FROM specification_agreements
    WHERE specification_id = @0 AND ${selectedId === undefined ? '(is_current = 1 OR is_pending = 1 OR ended_at IS NOT NULL)' : 'id = @1'}
    ORDER BY is_current DESC, is_pending DESC, id DESC`,
    selectedId === undefined
      ? [specificationId]
      : [specificationId, selectedId],
  )
  if (selectedId !== undefined && !agreements[0])
    throw notFoundError('Agreement not found in this specification')
  return agreements[0]?.id
}
