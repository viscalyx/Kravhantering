export function requirementPackageName(value: unknown): string {
  const record = value as
    | { name?: string | null; nameEn?: string | null; nameSv?: string | null }
    | null
    | undefined
  return record?.name ?? record?.nameSv ?? record?.nameEn ?? ''
}
