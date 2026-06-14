import type { RequirementResponsibilityPersonRecord } from '@/lib/requirements/responsibility-person'

interface QueryExecutor {
  query(sql: string, parameters?: unknown[]): Promise<unknown>
}

function uniqueHsaIds(hsaIds: Array<string | null | undefined>): string[] {
  return [...new Set(hsaIds.filter((hsaId): hsaId is string => Boolean(hsaId)))]
}

export async function upsertRequirementResponsibilityPerson(
  db: QueryExecutor,
  person: RequirementResponsibilityPersonRecord,
  fetchedAt = new Date(),
): Promise<void> {
  await db.query(
    `
      MERGE INTO requirement_responsibility_people WITH (HOLDLOCK) AS target
      USING (
        SELECT
          @0 AS hsa_id,
          @1 AS given_name,
          @2 AS middle_name,
          @3 AS surname,
          @4 AS email,
          @5 AS has_protected_personal_data,
          @6 AS fetched_at
      ) AS source
        ON target.hsa_id = source.hsa_id
      WHEN MATCHED THEN
        UPDATE SET
          given_name = source.given_name,
          middle_name = source.middle_name,
          surname = source.surname,
          email = source.email,
          has_protected_personal_data = source.has_protected_personal_data,
          last_fetched_at = source.fetched_at,
          updated_at = source.fetched_at
      WHEN NOT MATCHED THEN
        INSERT (
          hsa_id,
          given_name,
          middle_name,
          surname,
          email,
          has_protected_personal_data,
          last_fetched_at,
          created_at,
          updated_at
        )
        VALUES (
          source.hsa_id,
          source.given_name,
          source.middle_name,
          source.surname,
          source.email,
          source.has_protected_personal_data,
          source.fetched_at,
          source.fetched_at,
          source.fetched_at
        );
    `,
    [
      person.hsaId,
      person.givenName,
      person.middleName,
      person.surname,
      person.email,
      person.hasProtectedPersonalData ?? false,
      fetchedAt,
    ],
  )
}

export async function cleanupUnassignedRequirementResponsibilityPeople(
  db: QueryExecutor,
  hsaIds: Array<string | null | undefined>,
): Promise<string[]> {
  const ids = uniqueHsaIds(hsaIds)
  if (ids.length === 0) return []

  const placeholders = ids.map((_, index) => `@${index}`).join(', ')
  const rows = (await db.query(
    `
      DELETE person
      OUTPUT deleted.hsa_id AS hsaId
      FROM requirement_responsibility_people person
      WHERE person.hsa_id IN (${placeholders})
        AND NOT EXISTS (
          SELECT 1 FROM requirement_areas area
          WHERE area.owner_hsa_id = person.hsa_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM requirement_area_co_authors co_author
          WHERE co_author.hsa_id = person.hsa_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM requirements_specifications specification_record
          WHERE specification_record.responsible_hsa_id = person.hsa_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM specification_co_authors co_author
          WHERE co_author.hsa_id = person.hsa_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM requirement_packages requirement_package
          WHERE requirement_package.lead_hsa_id = person.hsa_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM requirement_package_co_authors co_author
          WHERE co_author.hsa_id = person.hsa_id
        )
    `,
    ids,
  )) as Array<{ hsaId: string }>

  return rows.map(row => row.hsaId)
}

export async function getRequirementResponsibilityPerson(
  db: QueryExecutor,
  hsaId: string,
): Promise<RequirementResponsibilityPersonRecord | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        hsa_id AS hsaId,
        given_name AS givenName,
        middle_name AS middleName,
        surname AS surname,
        email AS email,
        has_protected_personal_data AS hasProtectedPersonalData,
        last_fetched_at AS lastFetchedAt
      FROM requirement_responsibility_people
      WHERE hsa_id = @0
    `,
    [hsaId],
  )) as RequirementResponsibilityPersonRecord[]

  return rows[0] ?? null
}
