import type { SqlServerDatabase } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import type { RequestContext } from '@/lib/requirements/auth'

type DatabaseProvider = () => Promise<SqlServerDatabase> | SqlServerDatabase

interface RefreshIdentity {
  email: string | null
  givenName: string
  hsaId: string
  surname: string | null
}

function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function refreshIdentityFromContext(
  context: RequestContext,
): RefreshIdentity | null {
  const actor = context.actor
  if (!actor.isAuthenticated || actor.source !== 'oidc') return null
  const hsaId = cleanString(actor.hsaId)
  if (!hsaId) return null

  const givenName = cleanString(actor.givenName)
  const surname = cleanString(actor.familyName)
  if (!givenName || !surname) return null

  return {
    email: cleanString(actor.email),
    givenName,
    hsaId,
    surname,
  }
}

export function canRefreshActorResponsibilityPerson(
  context: RequestContext,
): boolean {
  return refreshIdentityFromContext(context) !== null
}

export async function refreshActorResponsibilityPerson(
  db: Pick<SqlServerDatabase, 'query'>,
  context: RequestContext,
  refreshedAt = new Date(),
): Promise<number> {
  const identity = refreshIdentityFromContext(context)
  if (!identity) return 0

  const rows = (await db.query(
    `
      UPDATE person
      SET
        given_name = @1,
        middle_name = NULL,
        surname = @2,
        email = @3,
        updated_at = @4
      OUTPUT inserted.hsa_id AS hsaId
      FROM requirement_responsibility_people person
      WHERE person.hsa_id = @0
        AND (
          EXISTS (
            SELECT 1 FROM requirement_areas area
            WHERE area.owner_hsa_id = person.hsa_id
          )
          OR EXISTS (
            SELECT 1 FROM requirement_area_co_authors co_author
            WHERE co_author.hsa_id = person.hsa_id
          )
          OR EXISTS (
            SELECT 1 FROM requirements_specifications specification_record
            WHERE specification_record.responsible_hsa_id = person.hsa_id
          )
          OR EXISTS (
            SELECT 1 FROM specification_co_authors co_author
            WHERE co_author.hsa_id = person.hsa_id
          )
          OR EXISTS (
            SELECT 1 FROM requirement_packages requirement_package
            WHERE requirement_package.lead_hsa_id = person.hsa_id
          )
          OR EXISTS (
            SELECT 1 FROM requirement_package_co_authors co_author
            WHERE co_author.hsa_id = person.hsa_id
          )
        )
        AND (
          ISNULL(person.given_name, N'') <> ISNULL(@1, N'')
          OR ISNULL(person.middle_name, N'') <> N''
          OR ISNULL(person.surname, N'') <> ISNULL(@2, N'')
          OR ISNULL(person.email, N'') <> ISNULL(@3, N'')
        )
    `,
    [
      identity.hsaId,
      identity.givenName,
      identity.surname,
      identity.email,
      refreshedAt,
    ],
  )) as Array<Record<string, unknown>>

  return rows.length
}

export function scheduleActorResponsibilityPersonRefresh(
  dbOrProvider: SqlServerDatabase | DatabaseProvider,
  context: RequestContext,
): void {
  if (!canRefreshActorResponsibilityPerson(context)) return

  void Promise.resolve()
    .then(async () => {
      const db =
        typeof dbOrProvider === 'function' ? await dbOrProvider() : dbOrProvider
      await refreshActorResponsibilityPerson(db, context)
    })
    .catch(error => {
      logSanitizedError(
        'Failed to refresh live requirement responsibility person from session',
        error,
      )
    })
}
