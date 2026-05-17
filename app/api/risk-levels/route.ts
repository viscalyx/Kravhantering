import { NextResponse } from 'next/server'
import { countLinkedRequirements, listRiskLevels } from '@/lib/dal/risk-levels'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [riskLevels, counts] = await Promise.all([
    listRiskLevels(db),
    countLinkedRequirements(db),
  ])
  return NextResponse.json({
    riskLevels: riskLevels.map(r => ({
      ...r,
      linkedRequirementCount: counts[r.id] ?? 0,
    })),
  })
}
