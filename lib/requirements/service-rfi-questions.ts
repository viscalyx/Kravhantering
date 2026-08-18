import { listAreaIdsActorCanAuthor } from '@/lib/dal/requirement-areas'
import {
  listRfiQuestions,
  type RfiQuestionListOptions,
  type RfiQuestionRow,
} from '@/lib/dal/rfi-questions'
import type { SqlServerDatabase } from '@/lib/db'
import type {
  AuthorizationService,
  RequestContext,
} from '@/lib/requirements/auth'
import { authorize } from '@/lib/requirements/service-shared'

export interface RfiQuestionQueryService {
  listRfiQuestions(
    context: RequestContext,
    input: Omit<RfiQuestionListOptions, 'areaIds'>,
  ): Promise<RfiQuestionRow[]>
}

export function createRfiQuestionQueryService({
  authorization,
  db,
}: {
  authorization: AuthorizationService
  db: SqlServerDatabase
}): RfiQuestionQueryService {
  return {
    async listRfiQuestions(context, input) {
      if (input.areaId != null) {
        await authorize(
          authorization,
          {
            areaId: input.areaId,
            kind: 'manage_rfi_question',
            operation: 'read',
          },
          context,
        )
        return listRfiQuestions(db, input)
      }

      if (context.actor.roles.includes('Admin')) {
        return listRfiQuestions(db, input)
      }

      const areaIds = await listAreaIdsActorCanAuthor(db, context.actor.hsaId)
      if (areaIds.length === 0) return []

      return listRfiQuestions(db, {
        areaIds,
        includeArchived: input.includeArchived,
      })
    },
  }
}
