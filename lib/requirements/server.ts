import {
  createUiSettingsLoader,
  type UiSettingsLoader,
} from '@/lib/dal/ui-settings'
import { getRequestSqlServerDataSource, type SqlServerDatabase } from '@/lib/db'
import {
  type AuthorizationService,
  createDefaultAuthorizationService,
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
import {
  createRequirementsLogger,
  type RequirementsLogger,
} from '@/lib/requirements/logging'
import {
  createRequirementsService,
  type RequirementsService,
} from '@/lib/requirements/service'

export interface RequirementsRuntime {
  authorization: AuthorizationService
  db: SqlServerDatabase
  logger: RequirementsLogger
  service: RequirementsService
  uiSettings: UiSettingsLoader
}

export interface RequirementsRestRuntime extends RequirementsRuntime {
  context: RequestContext
}

export interface CreateRequirementsRestRuntimeOptions {
  context?: RequestContext
  db?: SqlServerDatabase
}

export function createRequirementsRuntime(
  db: SqlServerDatabase,
): RequirementsRuntime {
  const authorization = createDefaultAuthorizationService()
  const logger = createRequirementsLogger()
  const uiSettings = createUiSettingsLoader(db)
  const service = createRequirementsService(db, {
    authorization,
    logger,
    uiSettings,
  })

  return {
    authorization,
    db,
    logger,
    service,
    uiSettings,
  }
}

export async function createRequirementsRestRuntime(
  request: Request,
  options: CreateRequirementsRestRuntimeOptions = {},
): Promise<RequirementsRestRuntime> {
  const db = options.db ?? (await getRequestSqlServerDataSource())
  const context =
    options.context ?? (await createRequestContext(request, 'rest'))
  const runtime = createRequirementsRuntime(db)

  return {
    ...runtime,
    context,
  }
}
