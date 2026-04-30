export function getLocalizedName(
  locale: string,
  obj: { nameSv: string | null; nameEn: string | null } | null | undefined,
): string | null {
  return obj
    ? locale === 'sv'
      ? (obj.nameSv ?? obj.nameEn)
      : (obj.nameEn ?? obj.nameSv)
    : null
}
