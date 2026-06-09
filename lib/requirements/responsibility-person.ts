export interface RequirementResponsibilityPersonRecord {
  email: string | null
  givenName: string
  hsaId: string
  lastFetchedAt?: Date | string | null
  middleName: string | null
  surname: string | null
}

export const REQUIREMENT_RESPONSIBILITY_PERSON_MISSING_NAME =
  '(saknar namn, kräver nytt uppslag)'

function cleanNamePart(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function formatRequirementResponsibilityPersonName(
  person: Pick<
    RequirementResponsibilityPersonRecord,
    'givenName' | 'hsaId' | 'middleName' | 'surname'
  >,
): string {
  const parts = [
    cleanNamePart(person.givenName),
    cleanNamePart(person.middleName),
    cleanNamePart(person.surname),
  ].filter((part): part is string => part != null)

  return parts.length > 0 ? parts.join(' ') : person.hsaId
}
