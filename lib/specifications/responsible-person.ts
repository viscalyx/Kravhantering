export interface SpecificationResponsiblePersonInput {
  canResponsibleGenerateAi?: boolean
  responsibleDisplayName?: string | null
  responsibleHsaId?: string | null
}

function hasOwn(input: object, key: keyof SpecificationResponsiblePersonInput) {
  return Object.hasOwn(input, key)
}

export function normalizeResponsibleHsaId(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeResponsibleDisplayName(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

export function hasIncompleteResponsiblePerson(
  input: SpecificationResponsiblePersonInput,
): boolean {
  const hsaId = normalizeResponsibleHsaId(input.responsibleHsaId)
  const displayName = normalizeResponsibleDisplayName(
    input.responsibleDisplayName,
  )
  return Boolean(hsaId) !== Boolean(displayName)
}

export function normalizeSpecificationResponsiblePersonInput<
  T extends SpecificationResponsiblePersonInput,
>(input: T, options: { preserveOmittedFields?: boolean } = {}): T {
  const preserveOmittedFields = options.preserveOmittedFields === true
  const hasHsaIdField = hasOwn(input, 'responsibleHsaId')
  const hasDisplayNameField = hasOwn(input, 'responsibleDisplayName')
  const hasGenerateAiField = hasOwn(input, 'canResponsibleGenerateAi')
  const hsaId = normalizeResponsibleHsaId(input.responsibleHsaId)
  const displayName = normalizeResponsibleDisplayName(
    input.responsibleDisplayName,
  )
  const hasResponsibleFields = hasHsaIdField || hasDisplayNameField
  const shouldIncludeResponsibleFields =
    !preserveOmittedFields || hasResponsibleFields
  const shouldIncludeGenerateAi =
    !preserveOmittedFields || hasResponsibleFields || hasGenerateAiField

  return {
    ...input,
    ...(shouldIncludeResponsibleFields
      ? {
          responsibleDisplayName: displayName,
          responsibleHsaId: hsaId,
        }
      : {}),
    ...(shouldIncludeGenerateAi
      ? {
          canResponsibleGenerateAi:
            hsaId != null &&
            displayName != null &&
            input.canResponsibleGenerateAi === true,
        }
      : {}),
  }
}
