import type { SqlServerDatabase } from '@/lib/db'
import { resolveAgreementSelection } from '@/lib/specifications/agreement-selection'

export interface ReportAgreementContext {
  agreementReference: string
  effectiveDate: string
  id: number
  state: 'draft' | 'upcoming' | 'current' | 'previous' | 'cancelled' | 'ended'
}

export function resolveReportAgreementContext(
  db: SqlServerDatabase,
  specificationId: number,
  agreementId?: number,
): Promise<ReportAgreementContext | null> {
  return db.transaction(async manager => {
    const id = await resolveAgreementSelection(
      manager,
      specificationId,
      agreementId,
    )
    if (id === undefined) return null
    const rows = await manager.query<ReportAgreementContext[]>(
      `SELECT id, agreement_reference AS agreementReference, CONVERT(varchar(10), effective_date, 23) AS effectiveDate,
       CASE WHEN cancelled_at IS NOT NULL THEN 'cancelled' WHEN ended_at IS NOT NULL THEN 'ended'
         WHEN replaced_at IS NOT NULL THEN 'previous' WHEN activated_at IS NOT NULL THEN 'current'
         WHEN confirmed_at IS NOT NULL THEN 'upcoming' ELSE 'draft' END AS state
       FROM specification_agreements WHERE id = @0`,
      [id],
    )
    return rows[0] ?? null
  })
}
