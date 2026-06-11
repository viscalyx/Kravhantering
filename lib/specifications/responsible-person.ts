export interface SpecificationResponsiblePersonInput {
  responsibleDisplayName?: string | null
  responsibleHsaId?: string | null
}

function hasOwn(
  input: object,
  key: keyof SpecificationResponsiblePersonInput,
): boolean {
  return Object.hasOwn(input, key)
}

interface SpecificationResponsiblePersonNormalizeOptions {
  preserveOmittedFields?: boolean
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

export function normalizeSpecificationResponsiblePersonInput<
  T extends SpecificationResponsiblePersonInput,
>(input: T, options: SpecificationResponsiblePersonNormalizeOptions = {}): T {
  const preserveOmittedFields = options.preserveOmittedFields === true
  const hasHsaIdField = hasOwn(input, 'responsibleHsaId')
  const hasDisplayNameField = hasOwn(input, 'responsibleDisplayName')
  const hsaId = normalizeResponsibleHsaId(input.responsibleHsaId)
  const displayName = normalizeResponsibleDisplayName(
    input.responsibleDisplayName,
  )
  const shouldIncludeDisplayName = !preserveOmittedFields || hasDisplayNameField
  const shouldIncludeHsaId = !preserveOmittedFields || hasHsaIdField

  return {
    ...input,
    ...(shouldIncludeDisplayName
      ? { responsibleDisplayName: displayName }
      : {}),
    ...(shouldIncludeHsaId ? { responsibleHsaId: hsaId } : {}),
  }
}
