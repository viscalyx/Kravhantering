import { NextResponse } from 'next/server'
import {
  countLinkedRequirements,
  listPriorityLevels,
} from '@/lib/dal/priority-levels'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [priorityLevels, counts] = await Promise.all([
    listPriorityLevels(db),
    countLinkedRequirements(db),
  ])
  return NextResponse.json({
    priorityLevels: priorityLevels.map(r => ({
      ...r,
      linkedRequirementCount: counts[r.id] ?? 0,
    })),
  })
}
