export function requirementPackageName(value: unknown): string {
  const record = value as { name?: string | null } | null | undefined
  return record?.name ?? ''
}
