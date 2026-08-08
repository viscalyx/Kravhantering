import { NextResponse } from 'next/server'
import {
  listAreaIdsActorCanAuthor,
  listRequirementAreaStewardshipRows,
} from '@/lib/dal/requirement-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'

export async function GET(request: Request) {
  const db = await getRequestSqlServerDataSource()
  const context = await createRequestContext(request, 'rest')
  const isAdmin = context.actor.roles.includes('Admin')
  const [areas, authoredAreaIds] = await Promise.all([
    listRequirementAreaStewardshipRows(db),
    isAdmin
      ? Promise.resolve(null)
      : listAreaIdsActorCanAuthor(db, context.actor.hsaId),
  ])
  const authoredAreaIdSet = authoredAreaIds ? new Set(authoredAreaIds) : null

  return NextResponse.json({
    areas: areas.map(area => ({
      ...area,
      permissions: {
        canAuthor: isAdmin || authoredAreaIdSet?.has(area.id) === true,
        canManageAssignments:
          isAdmin || context.actor.hsaId === area.ownerHsaId,
      },
    })),
  })
}
