import { listAreaIdsActorCanAuthor } from '@/lib/dal/requirement-areas'
import type { ListRequirementsOptions } from '@/lib/dal/requirements'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'

export type RequirementListVisibilityOptions = Pick<
  ListRequirementsOptions,
  'publishedOnly' | 'publishedOrAreaIds'
>

export async function resolveRequirementListVisibility(
  db: SqlServerDatabase,
  context: RequestContext,
): Promise<RequirementListVisibilityOptions> {
  if (
    context.actor.roles.includes('Admin') ||
    context.actor.roles.includes('Reviewer')
  ) {
    return {}
  }

  const areaIds = await listAreaIdsActorCanAuthor(db, context.actor.hsaId)
  if (areaIds.length > 0) {
    return { publishedOrAreaIds: areaIds }
  }

  return { publishedOnly: true }
}
